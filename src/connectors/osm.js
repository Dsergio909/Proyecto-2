/**
 * OpenStreetMap (Overpass API) connector. Works in any country, free, no key.
 *
 * Why it matters for offline suppliers: OSM volunteers map shops and
 * workshops by walking the street, so many businesses that have no website
 * are on the map. stats.withoutWebsite shows how many.
 *
 * Data © OpenStreetMap contributors, available under the ODbL.
 */
'use strict';

const Categories = require('../core/categories');
const Countries = require('../core/countries');
const { fetchJson, today } = require('./http');

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MAX_RADIUS_M = 10000;
const MIN_RADIUS_M = 100;
const ATTRIBUTION = 'Data © OpenStreetMap contributors (ODbL)';

// Accent-insensitive matching: OSM names are written "Cartón", "Ferretería", "Papelaria".
const ACCENTS = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', n: '[nñ]', c: '[cç]' };

/**
 * User text -> a safe Overpass regex. Only letters, digits, spaces and "|" survive,
 * so nothing can break out of the quoted string; accent classes are added by us.
 */
function safeRegex(text) {
  const plain = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9| ]/g, '').replace(/\|{2,}/g, '|').replace(/^\||\|$/g, '').trim().slice(0, 80);
  return plain.replace(/[aeiounc]/g, (ch) => ACCENTS[ch]);
}

function checkCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!isFinite(la) || !isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new Error('lat/lng are required and must be valid coordinates');
  }
  return [la, ln];
}

/** Overpass QL for one category around a point. */
function buildQuery({ category, lat, lng, radiusM, nameHint, limit }) {
  const [la, ln] = checkCoords(lat, lng);
  const r = Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Number(radiusM) || 3000)));
  const cat = Categories.byId(category);
  const around = `(around:${r},${la},${ln})`;
  const lines = (cat ? cat.osm : [])
    .filter(([k, v]) => /^[a-z0-9_:]+$/.test(k) && /^[a-z0-9_]+$/.test(v))
    .map(([k, v]) => `  nwr["${k}"="${v}"]${around};`);
  const hint = safeRegex(nameHint != null ? nameHint : cat && cat.nameHint);
  if (hint) lines.push(`  nwr["name"~"${hint}",i]${around};`);
  if (!lines.length) throw new Error('Unknown category and no name hint: nothing to search for');
  const max = Math.min(200, Math.max(1, Number(limit) || 60));
  return `[out:json][timeout:25];\n(\n${lines.join('\n')}\n);\nout center tags ${max};`;
}

function splitList(value) {
  return String(value || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
}

/** Overpass JSON -> supplier records. */
function normalize(json, { country, category, at } = {}) {
  const seen = new Set();
  const suppliers = [];
  for (const el of (json && json.elements) || []) {
    const tags = el.tags || {};
    if (!tags.name || seen.has(`${el.type}/${el.id}`)) continue;
    seen.add(`${el.type}/${el.id}`);
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    const phones = splitList(tags.phone || tags['contact:phone'])
      .concat(splitList(tags['contact:mobile']), splitList(tags['contact:whatsapp']))
      .map((p) => Countries.normalizePhone(p, country)).filter(Boolean);
    const website = tags.website || tags['contact:website'] || tags.url;
    const email = tags.email || tags['contact:email'];
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const detected = Categories.detect([tags.name, tags.shop, tags.craft, tags.description].filter(Boolean).join(' '));
    const categories = Array.from(new Set((category ? [category] : []).concat(detected)));
    suppliers.push({
      id: `osm-${el.type}-${el.id}`,
      name: tags.name,
      categories,
      phones: Array.from(new Set(phones)),
      emails: email ? [email] : [],
      websites: website ? [website] : [],
      address: street || tags['addr:full'] || null,
      city: tags['addr:city'] || null,
      country: country || null,
      lat: lat != null ? lat : null,
      lng: lng != null ? lng : null,
      sources: [{ type: 'map', ref: `osm:${el.type}/${el.id}`, at: at || today() }],
      verification: 0,
      notes: tags.opening_hours ? `Horario (OSM): ${String(tags.opening_hours).slice(0, 120)}` : null
    });
  }
  const withWebsite = suppliers.filter((s) => s.websites.length).length;
  return {
    suppliers,
    stats: {
      total: suppliers.length,
      withWebsite,
      withoutWebsite: suppliers.length - withWebsite,
      withPhone: suppliers.filter((s) => s.phones.length).length
    },
    attribution: ATTRIBUTION
  };
}

async function searchOsm(params, options = {}) {
  const query = buildQuery(params);
  const json = await fetchJson(options.endpoint || ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    fetchImpl: options.fetchImpl
  });
  return Object.assign(normalize(json, params), { query });
}

module.exports = { ENDPOINT, ATTRIBUTION, MAX_RADIUS_M, buildQuery, normalize, searchOsm, safeRegex };
