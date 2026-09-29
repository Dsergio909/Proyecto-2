/**
 * Supplier Scout — distances.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var EARTH_RADIUS_KM = 6371;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function hasCoords(point) {
    return !!point && isFinite(point.lat) && isFinite(point.lng) && point.lat !== null && point.lng !== null;
  }

  /** Great-circle distance in km, or null when either point has no coordinates. */
  function distanceKm(a, b) {
    if (!hasCoords(a) || !hasCoords(b)) return null;
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Local flat projection in km (east, north) around an origin. Good enough for a city map. */
  function offsetKm(origin, point) {
    if (!hasCoords(origin) || !hasCoords(point)) return null;
    return {
      x: (point.lng - origin.lng) * 111.32 * Math.cos(toRad(origin.lat)),
      y: (point.lat - origin.lat) * 110.57
    };
  }

  var api = { distanceKm: distanceKm, offsetKm: offsetKm, hasCoords: hasCoords };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutGeo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
