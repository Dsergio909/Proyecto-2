/**
 * Supplier Scout — the shared record format.
 *
 * Every source (web search, map, public registry, a referral, a business
 * card captured in the field, the AI agent, a CSV) produces the same
 * supplier shape. sanitizeDatabase() is the single gate for anything that
 * comes from outside (an imported file, a connector): unknown fields are
 * dropped, strings are trimmed and length-limited, links must be http(s).
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Categories = isNode ? require('./categories') : root.ScoutCategories;

  var SOURCE_TYPES = ['web', 'map', 'registry', 'referral', 'field', 'import', 'agent'];
  // 0 unverified · 1 contacted · 2 formal (tax ID checked in a registry) · 3 visited / sample · 4 bought from
  var VERIFICATION = ['unverified', 'contacted', 'formal', 'visited', 'purchased'];
  var RELATIONS = ['colleague', 'supplier', 'client', 'other'];

  var LIMITS = { suppliers: 2000, quotes: 5000, referrals: 5000, list: 10, reviews: 50 };

  function str(value, max) {
    if (value == null) return null;
    var text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text ? text.slice(0, max) : null;
  }

  function num(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return isFinite(n) && n >= min && n <= max ? n : null;
  }

  function list(value, clean, max) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length && out.length < (max || LIMITS.list); i++) {
      var item = clean(value[i]);
      if (item !== null && out.indexOf(item) === -1) out.push(item);
    }
    return out;
  }

  function safeId(value, fallback) {
    var text = String(value == null ? '' : value).replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 60);
    return text || fallback;
  }

  function cleanUrl(value) {
    var text = str(value, 300);
    if (!text) return null;
    if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
    try {
      var url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (err) {
      return null;
    }
  }

  function cleanEmail(value) {
    var text = str(value, 120);
    return text && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(text) ? text.toLowerCase() : null;
  }

  function cleanPhone(value) {
    var text = str(value, 20);
    return text && /^\+\d{8,15}$/.test(text) ? text : null;
  }

  function cleanSocial(value) {
    var text = str(value, 40);
    return text && /^@[a-z0-9._]{2,30}$/i.test(text) ? text.toLowerCase() : null;
  }

  function cleanDate(value) {
    var text = str(value, 10);
    return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function cleanCategory(value) {
    return Categories.byId(value) ? value : null;
  }

  function cleanTaxId(value) {
    if (!value || typeof value !== 'object') return null;
    var text = str(value.value, 30);
    if (!text) return null;
    return {
      value: text,
      label: str(value.label, 12),
      country: str(value.country, 2),
      valid: value.valid === true ? true : value.valid === false ? false : null,
      checked: ['checksum', 'format', 'none'].indexOf(value.checked) !== -1 ? value.checked : 'none'
    };
  }

  function cleanSource(value) {
    if (!value || SOURCE_TYPES.indexOf(value.type) === -1) return null;
    return JSON.stringify({ type: value.type, ref: str(value.ref, 200), at: cleanDate(value.at) });
  }

  function cleanReview(value) {
    if (!value) return null;
    var stars = num(value.stars, 1, 5);
    if (stars === null) return null;
    return JSON.stringify({ by: str(value.by, 40), stars: stars, note: str(value.note, 200), at: cleanDate(value.at) });
  }

  /** One supplier record, or null when there is not even a name. */
  function sanitizeSupplier(value, index) {
    if (!value || typeof value !== 'object') return null;
    var name = str(value.name, 120);
    if (!name) return null;
    var lat = num(value.lat, -90, 90);
    var lng = num(value.lng, -180, 180);
    if (lat === null || lng === null) { lat = null; lng = null; }
    var rating = value.rating && num(value.rating.avg, 1, 5) !== null ? {
      avg: num(value.rating.avg, 1, 5),
      count: Math.round(num(value.rating.count, 0, 1e6) || 0),
      source: str(value.rating.source, 40)
    } : null;
    return {
      id: safeId(value.id, 'S' + (index + 1)),
      name: name,
      categories: list(value.categories, cleanCategory),
      taxId: cleanTaxId(value.taxId),
      phones: list(value.phones, cleanPhone, 5),
      emails: list(value.emails, cleanEmail, 5),
      websites: list(value.websites, cleanUrl, 3),
      socials: list(value.socials, cleanSocial, 3),
      address: str(value.address, 200),
      city: str(value.city, 80),
      region: str(value.region, 80),
      country: str(value.country, 2),
      lat: lat,
      lng: lng,
      ships: value.ships === true,
      leadDays: num(value.leadDays, 0, 365),
      sources: list(value.sources, cleanSource, 10).map(function (s) { return JSON.parse(s); }),
      verification: Math.round(num(value.verification, 0, VERIFICATION.length - 1) || 0),
      rating: rating,
      internalReviews: list(value.internalReviews, cleanReview, LIMITS.reviews).map(function (r) { return JSON.parse(r); }),
      consent: value.consent === true ? true : value.consent === false ? false : null,
      notes: str(value.notes, 500),
      mergedFrom: list(value.mergedFrom, function (id) { return safeId(id, null); })
    };
  }

  function sanitizeQuote(value, index) {
    if (!value || typeof value !== 'object') return null;
    var price = num(value.price, 0, 1e12);
    if (price === null || !value.supplierId) return null;
    var per = value.per || {};
    var minOrder = value.minOrder && num(value.minOrder.qty, 0, 1e9) !== null ? {
      qty: num(value.minOrder.qty, 0, 1e9), unit: str(value.minOrder.unit, 20) || 'unidad'
    } : null;
    return {
      id: safeId(value.id, 'Q' + (index + 1)),
      supplierId: safeId(value.supplierId, null),
      category: cleanCategory(value.category),
      item: str(value.item, 120),
      price: price,
      currency: (str(value.currency, 3) || '').toUpperCase() || null,
      per: { qty: num(per.qty, 0.000001, 1e9) || 1, unit: str(per.unit, 20) || 'unidad' },
      taxIncluded: value.taxIncluded === true,
      shipping: num(value.shipping, 0, 1e12) || 0,
      minOrder: minOrder,
      leadDays: num(value.leadDays, 0, 365),
      paymentDays: num(value.paymentDays, 0, 365) || 0,
      at: cleanDate(value.at)
    };
  }

  function sanitizeReferral(value, index) {
    if (!value || typeof value !== 'object' || !value.from || !value.to) return null;
    return {
      id: safeId(value.id, 'R' + (index + 1)),
      from: safeId(value.from, null),
      fromLabel: str(value.fromLabel, 80),
      to: safeId(value.to, null),
      relation: RELATIONS.indexOf(value.relation) !== -1 ? value.relation : 'other',
      note: str(value.note, 200),
      at: cleanDate(value.at)
    };
  }

  function collect(values, clean, max) {
    if (!Array.isArray(values)) return [];
    var out = [];
    for (var i = 0; i < values.length && out.length < max; i++) {
      var item = clean(values[i], i);
      if (item) out.push(item);
    }
    return out;
  }

  /** The single gate for data from outside: an imported JSON file, a connector, the agent. */
  function sanitizeDatabase(value) {
    var db = value && typeof value === 'object' ? value : {};
    var suppliers = collect(db.suppliers, sanitizeSupplier, LIMITS.suppliers);
    var ids = {};
    suppliers.forEach(function (s) {
      while (ids[s.id]) s.id = s.id + '_';
      ids[s.id] = true;
    });
    return {
      version: 1,
      country: str(db.country, 2) || null,
      suppliers: suppliers,
      quotes: collect(db.quotes, sanitizeQuote, LIMITS.quotes).filter(function (q) { return ids[q.supplierId]; }),
      referrals: collect(db.referrals, sanitizeReferral, LIMITS.referrals)
    };
  }

  /** True when the supplier has no website: found through the map, a registry, a referral or in the field. */
  function isOffline(supplier) {
    return !supplier.websites || supplier.websites.length === 0;
  }

  var api = {
    SOURCE_TYPES: SOURCE_TYPES,
    VERIFICATION: VERIFICATION,
    RELATIONS: RELATIONS,
    LIMITS: LIMITS,
    sanitizeSupplier: sanitizeSupplier,
    sanitizeQuote: sanitizeQuote,
    sanitizeReferral: sanitizeReferral,
    sanitizeDatabase: sanitizeDatabase,
    cleanUrl: cleanUrl,
    isOffline: isOffline
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutSchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
