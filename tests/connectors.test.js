// Connectors against recorded-shape fixtures. No network: see helpers/fake-fetch.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const osm = require('../src/connectors/osm');
const socrata = require('../src/connectors/socrata');
const places = require('../src/connectors/places');
const { fetchJson, HttpError, USER_AGENT } = require('../src/connectors/http');
const Schema = require('../src/core/schema');
const { fakeFetch, fixture } = require('./helpers/fake-fetch');

// ---------- OpenStreetMap ----------

test('OSM query: category tags plus an accent-insensitive name search', () => {
  const q = osm.buildQuery({ category: 'packaging', lat: 4.6782, lng: -74.1411, radiusM: 3000 });
  assert.match(q, /nwr\["shop"="packaging"\]\(around:3000,4\.6782,-74\.1411\);/);
  assert.match(q, /nwr\["name"~"[^"]*\[cç\]\[aáàâã\]rt\[oóôõ\]\[nñ\][^"]*",i\]/, 'matches "cartón" and "carton"');
  assert.match(q, /out center tags 60;$/);
});

test('OSM query: radius is clamped and user text cannot break out of the query', () => {
  assert.match(osm.buildQuery({ category: 'hardware', lat: 1, lng: 1, radiusM: 999999 }), /around:10000,/);
  const q = osm.buildQuery({ lat: 1, lng: 1, nameHint: 'x"](around:1,0,0);out;node(1);//' });
  assert.equal((q.match(/"/g) || []).length % 2, 0);
  assert.doesNotMatch(q, /\);out;node/);
  assert.throws(() => osm.buildQuery({ category: 'packaging', lat: 'abc', lng: 1 }), /coordinates/);
  assert.throws(() => osm.buildQuery({ lat: 1, lng: 1, nameHint: '!!!' }), /nothing to search/);
});

test('OSM search: POST with a User-Agent, normalised records and offline stats', async () => {
  const fetch = fakeFetch([['overpass', fixture('overpass.json')]]);
  const out = await osm.searchOsm({ category: 'packaging', lat: 4.6782, lng: -74.1411, radiusM: 2000, country: 'CO', at: '2026-09-29' }, { fetchImpl: fetch });
  const call = fetch.calls[0];
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['User-Agent'], USER_AGENT);
  assert.match(call.init.body, /^data=%5Bout%3Ajson%5D/);

  assert.deepEqual(out.stats, { total: 3, withWebsite: 1, withoutWebsite: 2, withPhone: 2 });
  const [porvenir, industrial, whatsapp] = out.suppliers;
  assert.deepEqual(porvenir.phones, ['+579990000301', '+579990000302']);
  assert.equal(porvenir.id, 'osm-node-9001');
  assert.match(porvenir.notes, /Mo-Sa/);
  assert.deepEqual([industrial.lat, industrial.lng, industrial.address], [4.665, -74.135, 'Calle 17 96-40']);
  assert.deepEqual(whatsapp.phones, ['+579990000303']);
  assert.deepEqual(porvenir.sources, [{ type: 'map', ref: 'osm:node/9001', at: '2026-09-29' }]);
  assert.match(out.attribution, /OpenStreetMap contributors/);
  assert.equal(Schema.sanitizeDatabase({ suppliers: out.suppliers }).suppliers.length, 3);
});

// ---------- Socrata / SECOP ----------

function socrataFetch() {
  return fakeFetch([
    ['/api/views/qmzu-gj57.json', fixture('socrata-meta.json')],
    ['/resource/qmzu-gj57.json', fixture('socrata-rows.json')]
  ]);
}

test('Socrata: columns are recognised from the metadata, not hard-coded', () => {
  const meta = JSON.parse(fixture('socrata-meta.json'));
  assert.deepEqual(socrata.mapFields(meta.columns), {
    name: 'nombre', taxId: 'nit', phone: 'telefono', email: 'correo', city: 'municipio',
    region: 'departamento', category: 'descripcion_categoria_principal', location: 'ubicacion'
  });
});

test('Socrata: query URL escapes quotes in SoQL and caps the limit', () => {
  const url = socrata.buildUrl('secop-co', { city: 'municipio' }, { keywords: 'cartón', city: "Bogotá' OR '1'='1", limit: 5000 });
  const params = new URL(url).searchParams;
  assert.ok(url.startsWith('https://www.datos.gov.co/resource/qmzu-gj57.json?'));
  assert.equal(params.get('$limit'), '200');
  assert.equal(params.get('$q'), 'cartón');
  assert.equal(params.get('$where'), "upper(municipio) like upper('%Bogotá'' OR ''1''=''1%')");
  assert.throws(() => socrata.resolve({ domain: 'http://evil', dataset: 'abcd-1234' }), /invalid/);
});

test('SECOP search: registry records with a valid NIT are "formal"', async () => {
  const fetch = socrataFetch();
  const out = await socrata.searchSocrata('secop-co', { keywords: 'cajas', city: 'Funza' }, { fetchImpl: fetch, appToken: 'demo-token', at: '2026-09-29' });
  assert.equal(fetch.calls.length, 2);
  assert.equal(fetch.calls[1].init.headers['X-App-Token'], 'demo-token');
  assert.equal(out.suppliers.length, 2, 'rows without a name are skipped');
  const [sabana, impresos] = out.suppliers;
  assert.deepEqual(sabana.categories, ['packaging']);
  assert.equal(sabana.taxId.valid, true);
  assert.equal(sabana.verification, 2);
  assert.deepEqual([sabana.lat, sabana.lng], [4.716, -74.211]);
  assert.deepEqual(sabana.phones, ['+579990000104']);
  assert.equal(impresos.taxId.valid, false, 'wrong check digit');
  assert.equal(impresos.verification, 0);
  assert.equal(impresos.lat, null, '(0,0) is treated as missing');
  assert.deepEqual(impresos.categories, ['printing']);
});

test('Socrata: a dataset without a recognisable name column fails loudly', async () => {
  const fetch = fakeFetch([
    ['/api/views/', { name: 'Other', columns: [{ name: 'Foo', fieldName: 'foo' }] }],
    ['/resource/', []]
  ]);
  await assert.rejects(socrata.searchSocrata('secop-co', {}, { fetchImpl: fetch }), /Could not find a name column.*Foo/);
});

test('Socrata: WKT and GeoJSON points', () => {
  assert.deepEqual(socrata.readPoint('POINT (-74.1 4.6)'), { lat: 4.6, lng: -74.1 });
  assert.deepEqual(socrata.readPoint({ type: 'Point', coordinates: [-99.1, 19.4] }), { lat: 19.4, lng: -99.1 });
  assert.equal(socrata.readPoint(null), null);
});

// ---------- Google Places ----------

test('Places: no key, no request', async () => {
  const fetch = fakeFetch([]);
  await assert.rejects(places.searchPlaces({ query: 'cajas' }, { fetchImpl: fetch, apiKey: '' }), /GOOGLE_PLACES_API_KEY/);
  assert.equal(fetch.calls.length, 0);
});

test('Places: key and field mask go in headers, location bias in the body', () => {
  const req = places.buildRequest({ query: 'cajas de cartón', lat: 4.67, lng: -74.14, radiusM: 3000, regionCode: 'CO', languageCode: 'es' }, 'demo-key');
  assert.equal(req.init.headers['X-Goog-Api-Key'], 'demo-key');
  assert.match(req.init.headers['X-Goog-FieldMask'], /places\.rating,places\.userRatingCount/);
  const body = JSON.parse(req.init.body);
  assert.deepEqual(body.locationBias.circle, { center: { latitude: 4.67, longitude: -74.14 }, radius: 3000 });
  assert.equal(body.regionCode, 'CO');
  assert.ok(!req.url.includes('demo-key'), 'the key never goes in the URL');
});

test('Places: ratings kept, closed businesses dropped, records flagged for refresh', async () => {
  const fetch = fakeFetch([['places.googleapis.com', fixture('places.json')]]);
  const out = await places.searchPlaces({ query: 'cajas', country: 'CO', category: 'packaging', at: '2026-09-29' }, { fetchImpl: fetch, apiKey: 'demo-key' });
  assert.equal(out.suppliers.length, 2);
  const [maps, web] = out.suppliers;
  assert.deepEqual(maps.rating, { avg: 4.4, count: 37, source: 'google' });
  assert.deepEqual(maps.phones, ['+579990000401']);
  assert.deepEqual(web.phones, ['+579990000402']);
  assert.ok(maps.categories.includes('packaging'));
  assert.match(maps.notes, /Google/);
});

// ---------- http ----------

test('HTTP errors carry the status and a short body', async () => {
  const fetch = fakeFetch([['x', 'rate limited', 429]]);
  await assert.rejects(fetchJson('https://x.example/', { fetchImpl: fetch }), (err) => err instanceof HttpError && err.status === 429);
});
