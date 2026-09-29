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

  /**
   * Precomputable form of a name for similarity: its meaningful letters and
   * their character-bigram counts. Build it once per record, compare many times.
   */
  function nameProfile(text) {
    var key = nameTokens(text).join('');
    var counts = new Map();
    for (var i = 0; i < key.length - 1; i++) {
      var gram = key.slice(i, i + 2);
      counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    return { key: key, counts: counts, total: Math.max(0, key.length - 1) };
  }

  /** Dice coefficient between two name profiles, 0..1. */
  function profileSimilarity(p, q) {
    if (!p.key || !q.key) return 0;
    if (p.key === q.key) return 1;
    if (!p.total || !q.total) return 0;
    var small = p.counts.size <= q.counts.size ? p : q;
    var big = small === p ? q : p;
    var shared = 0;
    small.counts.forEach(function (n, gram) {
      var m = big.counts.get(gram);
      if (m) shared += Math.min(n, m);
    });
    return (2 * shared) / (p.total + q.total);
  }

  /**
   * Dice coefficient on character bigrams of the meaningful words, 0..1.
   * "Ferretería El Tornillo SAS" vs "FERRETERIA TORNILLO" -> 1.
   */
  function nameSimilarity(a, b) {
    return profileSimilarity(nameProfile(a), nameProfile(b));
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
    nameProfile: nameProfile,
    profileSimilarity: profileSimilarity,
    clamp: clamp
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutText = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
