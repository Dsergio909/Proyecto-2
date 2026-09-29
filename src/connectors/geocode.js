/**
 * Place name -> coordinates with OpenStreetMap Nominatim (free, no key).
 * Usage policy: at most one request per second and an identifying User-Agent,
 * both respected here (the agent calls it once per search).
 *
 * Data © OpenStreetMap contributors (ODbL).
 */
'use strict';

const { fetchJson } = require('./http');

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function buildUrl(place, countryCode) {
  const q = String(place || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!q) throw new Error('A place name is required, e.g. "Fontibón, Bogotá"');
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '1' });
  if (/^[A-Z]{2}$/.test(countryCode || '') && countryCode !== 'XX') params.set('countrycodes', countryCode.toLowerCase());
  return `${ENDPOINT}?${params.toString()}`;
}

async function geocode(place, countryCode, options = {}) {
  const results = await fetchJson(buildUrl(place, countryCode), { fetchImpl: options.fetchImpl });
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: String(hit.display_name || place).slice(0, 160) };
}

module.exports = { ENDPOINT, buildUrl, geocode };
