/**
 * Supplier Scout — text helpers.
 *
 * Accent-insensitive normalisation and a name similarity measure used by the
 * capture parser, the duplicate detector and the CSV column mapper.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  // Legal-form suffixes and filler words that should not make two names look different.
  var STOP_WORDS = [
    'sas', 's.a.s', 'sa', 's.a', 'ltda', 'limitada', 'eu', 'e.u', 'cia', 'y', 'e', 'de', 'del', 'la', 'el',
    'los', 'las', 'the', 'and', 'inc', 'llc', 'ltd', 'co', 'cv', 'srl', 'sac', 'eirl', 'spa', 'me', 'epp',
    'grupo', 'comercializadora', 'distribuidora', 'hermanos', 'hnos'
  ];

  /** Lowercase, strip accents and collapse whitespace. Keeps letters, digits and spaces. */
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Normalised words without legal suffixes or filler words. */
  function nameTokens(text) {
    return normalize(text).split(' ').filter(function (word) {
      return word && STOP_WORDS.indexOf(word) === -1;
    });
  }

  function bigrams(text) {
    var grams = [];
    for (var i = 0; i < text.length - 1; i++) grams.push(text.slice(i, i + 2));
    return grams;
  }

  /**
   * Dice coefficient on character bigrams of the meaningful words, 0..1.
   * "Ferretería El Tornillo SAS" vs "FERRETERIA TORNILLO" -> 1.
   */
  function nameSimilarity(a, b) {
    var x = nameTokens(a).join('');
    var y = nameTokens(b).join('');
    if (!x || !y) return 0;
    if (x === y) return 1;
    var gx = bigrams(x);
    var gy = bigrams(y);
    if (!gx.length || !gy.length) return 0;
    var pool = {};
    gx.forEach(function (g) { pool[g] = (pool[g] || 0) + 1; });
    var shared = 0;
    gy.forEach(function (g) {
      if (pool[g]) { shared++; pool[g]--; }
    });
    return (2 * shared) / (gx.length + gy.length);
  }

  /** Clamp a number into [min, max]. */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  var api = {
    STOP_WORDS: STOP_WORDS,
    normalize: normalize,
    nameTokens: nameTokens,
    nameSimilarity: nameSimilarity,
    clamp: clamp
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutText = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
