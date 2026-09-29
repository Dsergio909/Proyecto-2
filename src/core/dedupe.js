/**
 * Supplier Scout — duplicate detection with confidence tiers.
 *
 * The same workshop shows up three times: once from the map, once from the
 * public registry and once from a business card. Merging them is useful;
 * merging two different companies is harmful (their quotes and history mix).
 * So, like Supplier Radar, only strong and unambiguous evidence is automatic:
 *
 *   exact   same tax ID                                    -> merge
 *   high    same phone or same email                       -> merge
 *   medium  same corporate domain (never gmail/hotmail...) -> merge
 *   low     similar name nearby                            -> a person decides
 *
 * Two records with different valid tax IDs are never merged automatically,
 * even if they share a phone (e.g. two companies of the same owner).
 * If one record matches two others automatically, all of it goes to review.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Text = isNode ? require('./text') : root.ScoutText;
  var Geo = isNode ? require('./geo') : root.ScoutGeo;
  var Trust = isNode ? require('./trust') : root.ScoutTrust;

  var RANK = { exact: 4, high: 3, medium: 2, low: 1 };
  var NAME_THRESHOLD = 0.8;
  var NEARBY_KM = 0.5;
  var FREE_DOMAINS = [
    'gmail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'yahoo.com', 'yahoo.es',
    'yahoo.com.mx', 'live.com', 'msn.com', 'icloud.com', 'protonmail.com', 'proton.me', 'aol.com', 'gmx.com',
    'uol.com.br', 'bol.com.br', 'terra.com.br'
  ];

  function intersect(a, b) {
    return (a || []).filter(function (x) { return (b || []).indexOf(x) !== -1; });
  }

  function domains(supplier) {
    var out = [];
    (supplier.emails || []).forEach(function (e) { out.push(e.split('@')[1]); });
    (supplier.websites || []).forEach(function (w) {
      try { out.push(new URL(w).hostname.replace(/^www\./, '')); } catch (err) { /* ignore */ }
    });
    return out.filter(function (d) { return d && FREE_DOMAINS.indexOf(d) === -1; });
  }

  /** Evidence that two records are the same supplier, or null. */
  function compare(a, b) {
    var taxA = Trust.taxKey(a);
    var taxB = Trust.taxKey(b);
    var validA = a.taxId && a.taxId.valid !== false;
    var validB = b.taxId && b.taxId.valid !== false;
    if (taxA && taxB && taxA === taxB) return { tier: 'exact', evidence: [{ code: 'same_tax_id' }] };
    var conflict = !!(taxA && taxB && validA && validB && taxA !== taxB);

    var evidence = [];
    var tier = null;
    if (intersect(a.phones, b.phones).length) { tier = 'high'; evidence.push({ code: 'same_phone' }); }
    if (intersect(a.emails, b.emails).length) { tier = 'high'; evidence.push({ code: 'same_email' }); }
    var sharedDomain = intersect(domains(a), domains(b))[0];
    if (!tier && sharedDomain) { tier = 'medium'; evidence.push({ code: 'same_domain', domain: sharedDomain }); }

    var similarity = Text.nameSimilarity(a.name, b.name);
    var km = Geo.distanceKm(a, b);
    var sameCity = a.city && b.city && Text.normalize(a.city) === Text.normalize(b.city);
    var near = km !== null ? km <= NEARBY_KM : sameCity || similarity >= 0.95;
    if (similarity >= NAME_THRESHOLD && near) {
      evidence.push({ code: 'similar_name', similarity: Math.round(similarity * 100) / 100, km: km === null ? null : Math.round(km * 100) / 100 });
      if (!tier) tier = 'low';
    }
    if (!tier) return null;
    if (conflict) {
      evidence.push({ code: 'tax_conflict' });
      return { tier: tier, evidence: evidence, conflict: true };
    }
    return { tier: tier, evidence: evidence, conflict: false };
  }

  /**
   * All candidate pairs, strongest first.
   * Each: { a, b, tier, evidence, decision: 'merge' | 'review' }.
   */
  function findDuplicates(suppliers) {
    var pairs = [];
    for (var i = 0; i < suppliers.length; i++) {
      for (var j = i + 1; j < suppliers.length; j++) {
        var match = compare(suppliers[i], suppliers[j]);
        if (!match) continue;
        var auto = RANK[match.tier] >= RANK.medium && !match.conflict;
        pairs.push({
          a: suppliers[i].id, b: suppliers[j].id, tier: match.tier, evidence: match.evidence,
          decision: auto ? 'merge' : 'review'
        });
      }
    }
    // Ambiguity: a record with two or more automatic partners goes to review.
    var autoCount = {};
    pairs.forEach(function (p) {
      if (p.decision !== 'merge') return;
      autoCount[p.a] = (autoCount[p.a] || 0) + 1;
      autoCount[p.b] = (autoCount[p.b] || 0) + 1;
    });
    pairs.forEach(function (p) {
      if (p.decision === 'merge' && (autoCount[p.a] > 1 || autoCount[p.b] > 1)) {
        p.decision = 'review';
        p.evidence = p.evidence.concat([{ code: 'ambiguous' }]);
      }
    });
    pairs.sort(function (x, y) { return RANK[y.tier] - RANK[x.tier]; });
    return pairs;
  }

  function union(a, b) {
    var out = (a || []).slice();
    (b || []).forEach(function (x) {
      var key = typeof x === 'object' ? JSON.stringify(x) : x;
      var exists = out.some(function (y) { return (typeof y === 'object' ? JSON.stringify(y) : y) === key; });
      if (!exists) out.push(x);
    });
    return out;
  }

  /** Merge b into a. The more verified record wins on single-value fields. */
  function mergeSuppliers(a, b) {
    var primary = (b.verification || 0) > (a.verification || 0) ? b : a;
    var secondary = primary === a ? b : a;
    function pick(field) {
      return primary[field] != null ? primary[field] : secondary[field];
    }
    var ratingA = a.rating && a.rating.count ? a.rating : null;
    var ratingB = b.rating && b.rating.count ? b.rating : null;
    return {
      id: a.id,
      name: pick('name'),
      categories: union(a.categories, b.categories),
      taxId: primary.taxId && primary.taxId.valid !== false ? primary.taxId : secondary.taxId || primary.taxId,
      phones: union(a.phones, b.phones).slice(0, 5),
      emails: union(a.emails, b.emails).slice(0, 5),
      websites: union(a.websites, b.websites).slice(0, 3),
      socials: union(a.socials, b.socials).slice(0, 3),
      address: pick('address'),
      city: pick('city'),
      region: pick('region'),
      country: pick('country'),
      lat: primary.lat != null ? primary.lat : secondary.lat,
      lng: primary.lat != null ? primary.lng : secondary.lng,
      ships: !!(a.ships || b.ships),
      leadDays: pick('leadDays'),
      sources: union(a.sources, b.sources),
      verification: Math.max(a.verification || 0, b.verification || 0),
      rating: ratingA && ratingB ? (ratingA.count >= ratingB.count ? ratingA : ratingB) : ratingA || ratingB,
      internalReviews: union(a.internalReviews, b.internalReviews),
      consent: a.consent === true || b.consent === true ? true : a.consent === false || b.consent === false ? false : null,
      notes: [a.notes, b.notes].filter(Boolean).join(' · ') || null,
      mergedFrom: union(union(a.mergedFrom, b.mergedFrom), [b.id])
    };
  }

  /** Apply one merge to a database: b disappears, its quotes and referrals now point to a. */
  function applyMerge(db, aId, bId) {
    var a = null;
    var b = null;
    db.suppliers.forEach(function (s) {
      if (s.id === aId) a = s;
      if (s.id === bId) b = s;
    });
    if (!a || !b || a === b) return db;
    var merged = mergeSuppliers(a, b);
    return {
      version: db.version,
      country: db.country,
      suppliers: db.suppliers.filter(function (s) { return s.id !== bId; })
        .map(function (s) { return s.id === aId ? merged : s; }),
      quotes: db.quotes.map(function (q) {
        return q.supplierId === bId ? Object.assign({}, q, { supplierId: aId }) : q;
      }),
      referrals: db.referrals.map(function (r) {
        var copy = Object.assign({}, r);
        if (copy.from === bId) copy.from = aId;
        if (copy.to === bId) copy.to = aId;
        return copy;
      }).filter(function (r) { return r.from !== r.to; })
    };
  }

  /** Apply every automatic merge. Returns { db, merged: [pairs], review: [pairs] }. */
  function autoMerge(db) {
    var pairs = findDuplicates(db.suppliers);
    var current = db;
    var merged = [];
    var gone = {};
    pairs.forEach(function (p) {
      if (p.decision !== 'merge' || gone[p.a] || gone[p.b]) return;
      current = applyMerge(current, p.a, p.b);
      gone[p.b] = true;
      merged.push(p);
    });
    var review = findDuplicates(current.suppliers).filter(function (p) { return p.decision === 'review'; });
    return { db: current, merged: merged, review: review };
  }

  var api = {
    FREE_DOMAINS: FREE_DOMAINS,
    compare: compare,
    findDuplicates: findDuplicates,
    mergeSuppliers: mergeSuppliers,
    applyMerge: applyMerge,
    autoMerge: autoMerge
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutDedupe = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
