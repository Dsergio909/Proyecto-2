/**
 * Open-data portals on Socrata (SODA API): Colombia's datos.gov.co and many
 * city, state and national portals elsewhere.
 *
 * Preset "secop-co": SECOP II · Proveedores Registrados (dataset qmzu-gj57),
 * the suppliers registered to sell to the Colombian state. Many small
 * businesses with no website are there, with their tax ID.
 *
 * Column names are NOT hard-coded: the connector reads the dataset metadata
 * (/api/views/{id}.json) and recognises the columns by name, the same way the
 * CSV importer does. `describe` prints what it found, so a mismatch is visible
 * instead of silent.
 */
'use strict';

const Csv = require('../core/csv');
const Countries = require('../core/countries');
const Categories = require('../core/categories');
const { fetchJson, today } = require('./http');

const PRESETS = {
  'secop-co': {
    domain: 'https://www.datos.gov.co',
    dataset: 'qmzu-gj57',
    country: 'CO',
    label: 'SECOP II · Proveedores registrados',
    source: 'registry'
  }
};

const MAX_LIMIT = 200;

function resolve(target) {
  const preset = typeof target === 'string' ? PRESETS[target] : target;
  if (!preset || !/^https:\/\/[a-z0-9.-]+$/i.test(preset.domain || '') || !/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(preset.dataset || '')) {
    throw new Error('Unknown preset or invalid domain/dataset (expected https://host and a xxxx-xxxx id)');
  }
  return Object.assign({ country: 'XX', label: preset.dataset, source: 'registry' }, preset);
}

/** Metadata columns -> { name: fieldName, taxId: fieldName, ..., location: fieldName }. */
function mapFields(columns) {
  const usable = (columns || []).filter((c) => /^[a-z0-9_]+$/.test(c.fieldName || ''));
  const byName = Csv.mapColumns(usable.map((c) => c.name || c.fieldName)).mapping;
  const byField = Csv.mapColumns(usable.map((c) => String(c.fieldName).replace(/_/g, ' '))).mapping;
  const fields = {};
  Object.keys(Object.assign({}, byField, byName)).forEach((key) => {
    const index = byName[key] !== undefined ? byName[key] : byField[key];
    fields[key] = usable[index].fieldName;
  });
  const location = usable.find((c) => /^(point|location)$/i.test(c.dataTypeName || '')) ||
    usable.find((c) => /ubicaci|location|georef|geo/i.test(`${c.name} ${c.fieldName}`));
  if (location) fields.location = location.fieldName;
  return fields;
}

async function describe(target, options = {}) {
  const p = resolve(target);
  const meta = await fetchJson(`${p.domain}/api/views/${p.dataset}.json`, { fetchImpl: options.fetchImpl, headers: tokenHeader(options) });
  const columns = (meta.columns || []).map((c) => ({ name: c.name, fieldName: c.fieldName, dataTypeName: c.dataTypeName }));
  return { name: meta.name, updatedAt: meta.rowsUpdatedAt || null, columns, fields: mapFields(columns) };
}

/** SoQL string literal: single quotes doubled, control characters removed. */
function soqlString(text) {
  return String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/'/g, "''").slice(0, 100);
}

function buildUrl(target, fields, { keywords, city, limit } = {}) {
  const p = resolve(target);
  const params = new URLSearchParams();
  params.set('$limit', String(Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 50))));
  if (keywords) params.set('$q', String(keywords).replace(/[\u0000-\u001f]/g, ' ').slice(0, 100));
  if (city && fields.city) params.set('$where', `upper(${fields.city}) like upper('%${soqlString(city)}%')`);
  return `${p.domain}/resource/${p.dataset}.json?${params.toString()}`;
}

function readPoint(value) {
  if (!value) return null;
  if (Array.isArray(value.coordinates)) return { lat: Number(value.coordinates[1]), lng: Number(value.coordinates[0]) };
  if (value.latitude !== undefined) return { lat: Number(value.latitude), lng: Number(value.longitude) };
  const wkt = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(String(value));
  return wkt ? { lat: Number(wkt[2]), lng: Number(wkt[1]) } : null;
}

function text(row, field) {
  if (!field || row[field] == null) return '';
  const value = row[field];
  return typeof value === 'object' ? (value.url || '') : String(value).trim();
}

/** SODA rows -> supplier records. */
function normalizeRows(rows, fields, target, at) {
  const p = resolve(target);
  const profile = Countries.getProfile(p.country);
  return (rows || []).map((row, i) => {
    const name = text(row, fields.name);
    if (!name) return null;
    const rawTax = text(row, fields.taxId);
    const tax = rawTax ? profile.validateTaxId(rawTax) : null;
    const point = readPoint(row[fields.location]);
    const valid = point && isFinite(point.lat) && isFinite(point.lng) && !(point.lat === 0 && point.lng === 0);
    const phones = text(row, fields.phone).split(/[\/,;]| - /).map((x) => Countries.normalizePhone(x, profile.code)).filter(Boolean);
    return {
      id: `${p.dataset}-${tax ? tax.normalized : i + 1}`,
      name,
      categories: Categories.detect(`${text(row, fields.category)} ${name}`),
      taxId: tax ? { value: tax.normalized, label: profile.taxIdName, country: profile.code, valid: tax.valid, checked: tax.checked } : null,
      phones,
      emails: text(row, fields.email) ? [text(row, fields.email)] : [],
      websites: text(row, fields.website) ? [text(row, fields.website)] : [],
      address: text(row, fields.address) || null,
      city: text(row, fields.city) || null,
      region: text(row, fields.region) || null,
      country: profile.code === 'XX' ? null : profile.code,
      lat: valid ? point.lat : null,
      lng: valid ? point.lng : null,
      sources: [{ type: p.source, ref: p.label, at: at || today() }],
      // Found in an official registry with a tax ID whose check digit is correct.
      verification: p.source === 'registry' && tax && tax.valid === true ? 2 : 0
    };
  }).filter(Boolean);
}

function tokenHeader(options) {
  const token = options.appToken || process.env.SOCRATA_APP_TOKEN;
  return token ? { 'X-App-Token': token } : {};
}

async function searchSocrata(target, query, options = {}) {
  const info = await describe(target, options);
  if (!info.fields.name) {
    throw new Error(`Could not find a name column in ${info.name}. Columns: ${info.columns.map((c) => c.name).join(', ')}`);
  }
  const url = buildUrl(target, info.fields, query);
  const rows = await fetchJson(url, { fetchImpl: options.fetchImpl, headers: tokenHeader(options) });
  const suppliers = normalizeRows(rows, info.fields, target, options.at);
  return { suppliers, fields: info.fields, url, dataset: info.name };
}

module.exports = { PRESETS, resolve, mapFields, describe, buildUrl, soqlString, readPoint, normalizeRows, searchSocrata };
