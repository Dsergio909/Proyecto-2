/**
 * Google Places API (New) — Text Search. Optional and paid: needs your own
 * key in the GOOGLE_PLACES_API_KEY environment variable. Never in code.
 *
 * It adds what the free sources lack: star ratings and review counts for
 * businesses listed on Google Maps, many of which have no website.
 *
 * Terms: Google restricts storing Places content. Records from this
 * connector are marked in `notes` so you refresh or delete them; keep the
 * place id (allowed) rather than copies of the content.
 */
'use strict';

const Categories = require('../core/categories');
const Countries = require('../core/countries');
const { fetchJson, today } = require('./http');

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.rating',
  'places.userRatingCount', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.businessStatus'
].join(',');

function buildRequest({ query, lat, lng, radiusM, languageCode, regionCode, pageSize }, apiKey) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set. Places is optional: OSM and CSV work without a key.');
  if (!query || !String(query).trim()) throw new Error('A text query is required, e.g. "cajas de cartón corrugado"');
  const body = {
    textQuery: String(query).slice(0, 200),
    pageSize: Math.min(20, Math.max(1, Number(pageSize) || 20))
  };
  if (languageCode) body.languageCode = languageCode;
  if (regionCode) body.regionCode = regionCode;
  if (isFinite(Number(lat)) && isFinite(Number(lng)) && lat !== undefined && lng !== undefined) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: Math.min(50000, Math.max(100, Number(radiusM) || 5000))
      }
    };
  }
  return {
    url: ENDPOINT,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify(body)
    }
  };
}

function normalize(json, { country, category, at } = {}) {
  return ((json && json.places) || [])
    .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY' && p.displayName && p.displayName.text)
    .map((p) => {
      const phone = Countries.normalizePhone(p.internationalPhoneNumber || p.nationalPhoneNumber, country);
      const name = p.displayName.text;
      return {
        id: `gp-${String(p.id).slice(0, 40)}`,
        name,
        categories: Array.from(new Set((category ? [category] : []).concat(Categories.detect(name)))),
        phones: phone ? [phone] : [],
        websites: p.websiteUri ? [p.websiteUri] : [],
        address: p.formattedAddress || null,
        country: country || null,
        lat: p.location ? p.location.latitude : null,
        lng: p.location ? p.location.longitude : null,
        rating: p.rating ? { avg: p.rating, count: p.userRatingCount || 0, source: 'google' } : null,
        sources: [{ type: 'map', ref: `google:${String(p.id).slice(0, 60)}`, at: at || today() }],
        verification: 0,
        notes: 'Google Places: refresh or delete per Google terms.'
      };
    });
}

async function searchPlaces(params, options = {}) {
  const apiKey = options.apiKey || process.env.GOOGLE_PLACES_API_KEY;
  const request = buildRequest(params, apiKey);
  const json = await fetchJson(request.url, Object.assign({ fetchImpl: options.fetchImpl }, request.init));
  return { suppliers: normalize(json, params) };
}

module.exports = { ENDPOINT, FIELD_MASK, buildRequest, normalize, searchPlaces };
