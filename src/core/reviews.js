/**
 * Supplier Scout — fair ratings.
 *
 * Two problems with raw star averages:
 *  1. A 5.0 from 2 reviews beats a 4.7 from 300 reviews. It should not.
 *  2. A supplier with no online reviews (typical for offline suppliers)
 *     would score zero. It should score "unknown", not "bad".
 *
 * blendRating() uses a Bayesian average: every supplier starts at a neutral
 * prior worth a few imaginary reviews, and real reviews pull it away from
 * there. Reviews from your own team weigh more than anonymous online ones,
 * because they describe your use case.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    prior: 3.5,          // neutral starting point, in stars
    priorWeight: 5,      // worth 5 imaginary reviews
    internalWeight: 3,   // one teammate's review counts as 3 online reviews
    externalCap: 100     // after 100 online reviews, more of them add little information
  };

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * supplier.rating = { avg, count, source } (online, e.g. a maps listing)
   * supplier.internalReviews = [{ stars, by, note, at }] (your team)
   * Returns { value: 1..5, basis, externalCount, internalCount, internalAvg }.
   */
  function blendRating(supplier, options) {
    var o = Object.assign({}, DEFAULTS, options || {});
    var external = supplier.rating && supplier.rating.count > 0 ? supplier.rating : null;
    var internal = (supplier.internalReviews || []).map(function (r) { return Number(r.stars); })
      .filter(function (s) { return s >= 1 && s <= 5; });

    var sum = o.prior * o.priorWeight;
    var weight = o.priorWeight;
    var externalCount = 0;
    if (external) {
      externalCount = Math.min(external.count, o.externalCap);
      sum += external.avg * externalCount;
      weight += externalCount;
    }
    var internalSum = internal.reduce(function (a, b) { return a + b; }, 0);
    sum += internalSum * o.internalWeight;
    weight += internal.length * o.internalWeight;

    var basis = external && internal.length ? 'both' : external ? 'external' : internal.length ? 'internal' : 'none';
    return {
      value: round2(sum / weight),
      basis: basis,
      externalAvg: external ? external.avg : null,
      externalCount: external ? external.count : 0,
      internalCount: internal.length,
      internalAvg: internal.length ? round2(internalSum / internal.length) : null
    };
  }

  var api = { DEFAULTS: DEFAULTS, blendRating: blendRating };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutReviews = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
