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

  function taxKey(supplier) {
    if (!supplier || !supplier.taxId || !supplier.taxId.value) return null;
    return String(supplier.taxId.value).split('-')[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  /** Independent recommendations received by one supplier. */
  function referralStats(supplierId, referrals, suppliersById) {
    var target = suppliersById[supplierId];
    var targetTax = taxKey(target);
    var seen = {};
    var stats = { count: 0, weight: 0, mutual: 0, ignored: 0, from: [] };
    (referrals || []).forEach(function (ref) {
      if (ref.to !== supplierId || seen[ref.from]) return;
      seen[ref.from] = true;
      var referrer = suppliersById[ref.from];
      if (ref.from === supplierId || (referrer && targetTax && taxKey(referrer) === targetTax)) {
        stats.ignored++;
        return;
      }
      var mutual = !!referrer && (referrals || []).some(function (back) {
        return back.from === supplierId && back.to === ref.from;
      });
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

  function indexById(suppliers) {
    var map = {};
    (suppliers || []).forEach(function (s) { map[s.id] = s; });
    return map;
  }

  var api = {
    LEVEL_BASE: LEVEL_BASE,
    referralStats: referralStats,
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
