/**
 * The agent's tools. Each one is a thin wrapper over the same core logic and
 * connectors the CLI and the web app use.
 *
 * Design rules:
 *  - Read-only: tools search and compute. Nothing is sent to any supplier.
 *  - Candidates come from tool results only. Whatever the model writes, the
 *    output file contains only suppliers that a tool actually returned.
 *  - Data minimisation: phone numbers and emails never go to the model. The
 *    drafts it asks for get WhatsApp links filled in locally.
 */
'use strict';

const Schema = require('../src/core/schema');
const Score = require('../src/core/score');
const Dedupe = require('../src/core/dedupe');
const Messages = require('../src/core/messages');
const Outreach = require('../src/core/outreach');
const Categories = require('../src/core/categories');
const Countries = require('../src/core/countries');
const Geo = require('../src/core/geo');
const osm = require('../src/connectors/osm');
const socrata = require('../src/connectors/socrata');
const places = require('../src/connectors/places');
const { geocode } = require('../src/connectors/geocode');

const CATEGORY_IDS = Categories.CATEGORIES.map((c) => c.id);
const UNITS = ['unidad', 'kg', 'm', 'l', 'docena'];
const PRIORITIES = Object.keys(Score.PRESETS);
const MAX_LISTED = 25;

function tool(name, description, properties) {
  return {
    name,
    description,
    strict: true,
    input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
  };
}

const P = {
  category: { type: 'string', enum: CATEGORY_IDS, description: 'Purchase category id.' },
  lat: { type: 'number', description: 'Latitude of the buyer or delivery point.' },
  lng: { type: 'number', description: 'Longitude of the buyer or delivery point.' },
  unit: { type: 'string', enum: UNITS, description: 'Unit of the quantity.' }
};

function finite(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** A coordinate, or NaN when missing or out of range (never clamped: a wrong point is worse than none). */
function coord(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : NaN;
}

function short(text, max) {
  return String(text == null ? '' : text).slice(0, max);
}

/**
 * options: { db (sanitised), country, lang, env, fetchImpl, today }
 * Returns { definitions, run(name, input), found, drafts, lastRanking() }.
 */
function createToolbox(options) {
  const db = options.db;
  const country = options.country || db.country || 'CO';
  const lang = options.lang === 'en' ? 'en' : 'es';
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl;
  const today = options.today || new Date().toISOString().slice(0, 10);
  const profile = Countries.getProfile(country);
  const found = new Map();
  const drafts = [];
  let ranking = null;

  function remember(suppliers) {
    suppliers.forEach((s) => {
      const clean = Schema.sanitizeSupplier(s, found.size);
      if (!clean) return;
      clean.sources.push({ type: 'agent', ref: 'agent run', at: today });
      found.set(clean.id, clean);
    });
  }

  function everyone() {
    return db.suppliers.concat(Array.from(found.values()));
  }

  // What the model sees about a supplier: no phones, no emails.
  function summary(s, origin) {
    const km = origin ? Geo.distanceKm(origin, s) : null;
    return {
      id: s.id,
      name: short(s.name, 80),
      categories: s.categories,
      found_via: Array.from(new Set((s.sources || []).map((x) => x.type))),
      has_website: (s.websites || []).length > 0,
      verification: Schema.VERIFICATION[s.verification || 0],
      city: s.city || null,
      km: km === null ? null : Math.round(km * 10) / 10,
      online_rating: s.rating ? `${s.rating.avg} (${s.rating.count})` : null,
      team_reviews: (s.internalReviews || []).length
    };
  }

  // Suppliers who refused consent for their personal data (Colombia: Law 1581 of 2012)
  // are ranked locally but never described to the model, which is a third-party service.
  function shareable(s) {
    return s.consent !== false;
  }

  function listResult(suppliers, origin, extra) {
    const visible = suppliers.filter(shareable);
    return Object.assign({
      count: visible.length,
      without_website: visible.filter(Schema.isOffline).length,
      hidden_without_consent: suppliers.length - visible.length,
      suppliers: visible.slice(0, MAX_LISTED).map((s) => summary(s, origin))
    }, extra || {});
  }

  const all = {
    find_coordinates: {
      def: tool('find_coordinates', 'Turn a place name (neighbourhood, city) into coordinates with OpenStreetMap. Use it when the buyer gives a place but no coordinates.', {
        place: { type: 'string', description: 'For example "Fontibón, Bogotá".' }
      }),
      async run(input) {
        const hit = await geocode(short(input.place, 120), country, { fetchImpl });
        return hit || { error: 'Place not found. Try a broader name (city).' };
      }
    },

    search_my_database: {
      def: tool('search_my_database', "Search the buyer's own supplier list: current suppliers, business cards captured in the field, referrals and quotes. Start here.", {
        category: P.category,
        text: { type: 'string', description: 'Words to match in names or notes. Empty string for none.' }
      }),
      async run(input) {
        const words = String(input.text || '').toLowerCase().split(/\s+/).filter(Boolean);
        const hits = db.suppliers.filter((s) => (s.categories || []).includes(input.category))
          .filter((s) => !words.length || words.some((w) => `${s.name} ${s.notes || ''}`.toLowerCase().includes(w)));
        return listResult(hits, null, {
          with_quotes: hits.filter((s) => db.quotes.some((q) => q.supplierId === s.id)).length,
          with_referrals: hits.filter((s) => db.referrals.some((r) => r.to === s.id)).length
        });
      }
    },

    search_map: {
      def: tool('search_map', 'Search OpenStreetMap for shops and workshops of a category around a point. Works in any country and finds many businesses without a website.', {
        category: P.category, lat: P.lat, lng: P.lng,
        radius_m: { type: 'integer', description: 'Search radius in metres (100 to 10000).' },
        name_hint: { type: 'string', description: 'Extra words to find in business names, separated by |. Empty string to use the defaults.' }
      }),
      async run(input) {
        const origin = { lat: coord(input.lat, 90), lng: coord(input.lng, 180) };
        const result = await osm.searchOsm({
          category: input.category, lat: origin.lat, lng: origin.lng, radiusM: finite(input.radius_m, 3000, 100, 10000),
          nameHint: input.name_hint ? short(input.name_hint, 80) : undefined, country, at: today
        }, { fetchImpl });
        remember(result.suppliers);
        return listResult(result.suppliers, origin, { attribution: result.attribution });
      }
    },

    search_public_registry: {
      available: profile.registries.includes('secop-co'),
      def: tool('search_public_registry', "Search Colombia's public procurement registry (SECOP II registered suppliers). Returns formal businesses with a tax ID, often without a website.", {
        keywords: { type: 'string', description: 'What they sell, in Spanish, e.g. "cajas carton corrugado".' },
        city: { type: 'string', description: 'City or municipality, or empty string for the whole country.' }
      }),
      async run(input) {
        const result = await socrata.searchSocrata('secop-co', { keywords: short(input.keywords, 100), city: short(input.city, 60), limit: 50 }, { fetchImpl, at: today });
        remember(result.suppliers);
        return listResult(result.suppliers, null, { dataset: result.dataset });
      }
    },

    search_google_places: {
      available: !!env.GOOGLE_PLACES_API_KEY,
      def: tool('search_google_places', 'Search Google Maps listings (with star ratings) by text near a point.', {
        query: { type: 'string', description: 'For example "cajas de cartón corrugado".' },
        category: P.category, lat: P.lat, lng: P.lng,
        radius_m: { type: 'integer', description: 'Search radius in metres.' }
      }),
      async run(input) {
        const origin = { lat: coord(input.lat, 90), lng: coord(input.lng, 180) };
        const result = await places.searchPlaces({
          query: short(input.query, 120), category: input.category, lat: origin.lat, lng: origin.lng,
          radiusM: finite(input.radius_m, 5000, 100, 50000), country, regionCode: country === 'XX' ? undefined : country,
          languageCode: lang, at: today
        }, { fetchImpl, apiKey: env.GOOGLE_PLACES_API_KEY });
        remember(result.suppliers);
        return listResult(result.suppliers, origin);
      }
    },

    rank_candidates: {
      def: tool('rank_candidates', 'Rank every supplier found so far (and the buyer\'s own) for this order. Merges duplicates, computes the real order cost and explains each position.', {
        category: P.category,
        quantity: { type: 'number', description: 'How much the buyer needs.' },
        unit: P.unit,
        lat: P.lat, lng: P.lng,
        radius_km: { type: 'number', description: 'Search radius in km.' },
        needed_in_days: { type: 'integer', description: 'Deadline in days. 0 for no deadline.' },
        budget: { type: 'number', description: 'Maximum total budget in local currency. 0 for none.' },
        priority: { type: 'string', enum: PRIORITIES, description: 'balanced by default; cheapest, reliable, nearest or urgent if the buyer says so.' }
      }),
      async run(input) {
        const merged = Dedupe.autoMerge(Schema.sanitizeDatabase({
          country, suppliers: everyone(), quotes: db.quotes, referrals: db.referrals
        }));
        const need = {
          category: input.category,
          quantity: finite(input.quantity, 1, 0.001, 1e9),
          unit: UNITS.includes(input.unit) ? input.unit : 'unidad',
          origin: { lat: coord(input.lat, 90), lng: coord(input.lng, 180) },
          radiusKm: finite(input.radius_km, 10, 0.1, 500),
          neededInDays: finite(input.needed_in_days, 0, 0, 365) || null,
          budget: finite(input.budget, 0, 0, 1e13) || null,
          weights: Score.PRESETS[input.priority] || Score.PRESETS.balanced
        };
        const settings = { country, fx: options.fx || {}, monthlyRate: options.monthlyRate || 0 };
        const result = Score.rankSuppliers(merged.db, need, settings);
        ranking = { need, result, review: merged.review, db: merged.db };
        const ctx = { country };
        return {
          hidden_without_consent: result.ranked.filter((r) => !shareable(r.supplier)).length,
          ranked: result.ranked.filter((r) => shareable(r.supplier)).slice(0, 10).map((r) => ({
            id: r.supplier.id,
            name: short(r.supplier.name, 80),
            score: r.score,
            order_total: r.cost ? Countries.formatMoney(r.cost.total, country) : null,
            offline: Schema.isOffline(r.supplier),
            verification: Schema.VERIFICATION[r.trust.level],
            why: r.evidence.concat(r.warnings).map((e) => Messages.explain(e, lang, ctx))
          })),
          excluded: result.excluded.length,
          possible_duplicates_for_review: merged.review.length
        };
      }
    },

    draft_messages: {
      def: tool('draft_messages', 'Draft messages for the buyer to review and send: quote requests to chosen suppliers, or a referral request ("who do you buy this from?") to current suppliers and colleagues. Nothing is sent.', {
        kind: { type: 'string', enum: ['quote_request', 'referral_request'] },
        supplier_ids: { type: 'array', items: { type: 'string' }, description: 'Suppliers for quote requests. Empty array for a referral request.' },
        category: P.category,
        item: { type: 'string', description: 'What exactly is needed, e.g. "cajas de cartón corrugado 40x30x30".' },
        quantity: { type: 'number', description: 'Quantity (0 if unknown).' },
        unit: P.unit,
        needed_in_days: { type: 'integer', description: 'Deadline in days, 0 for none.' }
      }),
      async run(input) {
        const need = {
          category: input.category, item: short(input.item, 120) || null,
          quantity: finite(input.quantity, 0, 0, 1e9) || null, unit: input.unit,
          neededInDays: finite(input.needed_in_days, 0, 0, 365) || null
        };
        if (input.kind === 'referral_request') {
          const text = Outreach.referralRequest(input.category, lang);
          drafts.push({ kind: 'referral_request', category: input.category, text });
          return { drafted: 1, preview: text };
        }
        const byId = new Map(everyone().map((s) => [s.id, s]));
        const unknown = [];
        let drafted = 0;
        (input.supplier_ids || []).slice(0, 10).forEach((id) => {
          const s = byId.get(id);
          if (!s || !shareable(s)) { unknown.push(short(id, 60)); return; }
          const text = Outreach.rfqMessage(need, s.name, lang);
          drafts.push({
            kind: 'quote_request', supplierId: s.id, supplierName: s.name, text,
            whatsapp: s.phones && s.phones[0] ? Outreach.whatsappLink(s.phones[0], text) : null,
            email: s.emails && s.emails[0] ? s.emails[0] : null
          });
          drafted++;
        });
        return { drafted, unknown_ids: unknown, preview: drafted ? drafts[drafts.length - 1].text : null };
      }
    }
  };

  const active = Object.keys(all).filter((name) => all[name].available !== false);

  return {
    definitions: active.map((name) => all[name].def),
    names: active,
    async run(name, input) {
      if (!active.includes(name)) throw new Error(`Unknown tool: ${name}`);
      if (!input || typeof input !== 'object') throw new Error('Tool input must be an object');
      return all[name].run(input);
    },
    found,
    drafts,
    lastRanking: () => ranking
  };
}

module.exports = { createToolbox, CATEGORY_IDS, UNITS, PRIORITIES };
