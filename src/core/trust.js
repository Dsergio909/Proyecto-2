/**
 * Supplier Scout — trust from verification and referrals.
 *
 * For a supplier with no website and no reviews, trust has to come from
 * somewhere else: what you have checked yourself (verification level) and
 * who vouches for them (referrals). This is how purchasing works offline:
 * "a colleague and one of our current suppliers both recommended them".
 *
 * Referrals are counted carefully:
 *  - a supplier recommending itself counts for nothing;
 *  - a company recommending another company with the same tax ID (same group) counts for nothing;
 *  - two suppliers that only recommend each other count half ("mutual").
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var LEVEL_BASE = [0.2, 0.4, 0.6, 0.8, 1.0];
  var PER_REFERRER = 0.1;
  var MAX_REFERRAL_BONUS = 0.2;

  /**
   * Comparable form of a tax ID. Only Colombia's NIT drops its trailing check
   * digit (the same company is written with or without it); other IDs keep
   * every character (an Argentine CUIT "20-12345678-6" must not become "20").
   */
  function taxKey(supplier) {
    var tax = supplier && supplier.taxId;
    if (!tax || !tax.value) return null;
    var value = String(tax.value);
    var isNit = tax.country === 'CO' || /^N\.?I\.?T/i.test(tax.label || '');
    if (isNit || (!tax.country && /^[\d.\s]+-\d$/.test(value))) value = value.replace(/\s*-\s*\d$/, '');
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
  }

  /** Referrals indexed once, so ranking many suppliers stays linear. */
  function buildReferralIndex(referrals) {
    var incoming = new Map();
    var pairs = new Set();
    (referrals || []).forEach(function (ref) {
      if (!incoming.has(ref.to)) incoming.set(ref.to, []);
      incoming.get(ref.to).push(ref);
      pairs.add(ref.from + '\u0000' + ref.to);
    });
    return { incoming: incoming, pairs: pairs };
  }

  /**
   * Independent recommendations received by one supplier.
   * `referrals` is an array or an index from buildReferralIndex().
   */
  function referralStats(supplierId, referrals, suppliersById) {
    var index = referrals && referrals.incoming ? referrals : buildReferralIndex(referrals);
    var target = suppliersById[supplierId];
    var targetTax = taxKey(target);
    var seen = new Set();
    var stats = { count: 0, weight: 0, mutual: 0, ignored: 0, from: [] };
    (index.incoming.get(supplierId) || []).forEach(function (ref) {
      if (seen.has(ref.from)) return;
      seen.add(ref.from);
      var referrer = suppliersById[ref.from];
      if (ref.from === supplierId || (referrer && targetTax && taxKey(referrer) === targetTax)) {
        stats.ignored++;
        return;
      }
      var mutual = !!referrer && index.pairs.has(supplierId + '\u0000' + ref.from);
      stats.count++;
      stats.weight += mutual ? 0.5 : 1;
      if (mutual) stats.mutual++;
      stats.from.push(ref.fromLabel || (referrer && referrer.name) || ref.from);
    });
    return stats;
  }

  /** { value: 0..1, level, referrals } */
  function trustScore(supplier, referrals, suppliersById) {
    var level = Math.max(0, Math.min(LEVEL_BASE.length - 1, supplier.verification || 0));
    var stats = referralStats(supplier.id, referrals, suppliersById);
    var bonus = Math.min(MAX_REFERRAL_BONUS, stats.weight * PER_REFERRER);
    return {
      value: Math.min(1, Math.round((LEVEL_BASE[level] + bonus) * 100) / 100),
      level: level,
      referrals: stats
    };
  }

  /** id -> supplier, on an object with no prototype (ids like "constructor" are safe). */
  function indexById(suppliers) {
    var map = Object.create(null);
    (suppliers || []).forEach(function (s) { map[s.id] = s; });
    return map;
  }

  var api = {
    LEVEL_BASE: LEVEL_BASE,
    referralStats: referralStats,
    buildReferralIndex: buildReferralIndex,
    trustScore: trustScore,
    indexById: indexById,
    taxKey: taxKey
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutTrust = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
