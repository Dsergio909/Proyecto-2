const test = require('node:test');
const assert = require('node:assert/strict');
const Score = require('../src/core/score');
const Schema = require('../src/core/schema');
const D = require('../src/core/dedupe');
const { DATASETS } = require('../src/data/sample');

function demo(datasetId, needId) {
  const ds = DATASETS[datasetId];
  const db = D.autoMerge(Schema.sanitizeDatabase(ds)).db;
  const needDef = ds.needs.find((n) => n.id === needId);
  const need = Object.assign({}, needDef, { origin: ds.origins.find((o) => o.id === needDef.originId) });
  return { db, need, settings: { country: ds.country, fx: ds.fx, monthlyRate: 0.015 } };
}

test('boxes in Bogotá: an offline, referred and visited workshop wins', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const { ranked, excluded } = Score.rankSuppliers(db, need, settings);
  assert.equal(ranked[0].supplier.name, 'Empaques Doña Rosa');
  assert.ok(ranked[0].evidence.some((e) => e.code === 'offline'));
  assert.equal(ranked[0].trust.referrals.count, 3);
  assert.deepEqual(excluded.map((e) => [e.supplier.name, e.reason.code]), [['Cartonajes del Norte', 'out_of_radius']]);
});

test('the cheapest list price does not win when minimum order and lead time are counted', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const { ranked } = Score.rankSuppliers(db, need, settings);
  const marketplace = ranked.find((r) => r.supplier.id === 'bog-cartonexpress');
  const codes = marketplace.warnings.map((w) => w.code);
  assert.ok(codes.includes('below_moq') && codes.includes('too_slow'));
  assert.ok(marketplace.rank > 4);
});

test('no quote and no reviews score neutral with a warning, never zero', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const kraft = Score.rankSuppliers(db, need, settings).ranked.find((r) => r.supplier.id === 'bog-bolsas-cajas-kraft');
  assert.equal(kraft.factors.price, Score.NEUTRAL);
  assert.ok(kraft.warnings.some((w) => w.code === 'no_quote'));
  assert.ok(kraft.score > 0);
});

test('weights change the winner: "cheapest" picks the lowest real total', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const cheapest = Score.rankSuppliers(db, Object.assign({}, need, { weights: Score.PRESETS.cheapest }), settings);
  assert.equal(cheapest.ranked[0].supplier.name, 'Cajas El Porvenir');
  assert.equal(cheapest.ranked[0].cost.total, 1315000);
});

test('suppliers that deliver are kept outside the radius, others are excluded', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const tiny = Score.rankSuppliers(db, Object.assign({}, need, { radiusKm: 1 }), settings);
  assert.ok(tiny.ranked.every((r) => r.supplier.ships || (r.km !== null && r.km <= 1) || r.km === null));
  assert.ok(tiny.excluded.length > 1);
});

test('foreign-currency quotes are converted and explained', () => {
  const { db, need, settings } = demo('bogota', 'pla');
  const importer = Score.rankSuppliers(db, need, settings).ranked.find((r) => r.supplier.id === 'bog-importfil');
  assert.ok(importer.evidence.some((e) => e.code === 'fx_manual' && e.currency === 'USD'));
  assert.ok(importer.warnings.some((w) => w.code === 'unknown_location'));
});

test('budget and consent warnings', () => {
  const { db, need, settings } = demo('bogota', 'boxes');
  const r = Score.rankSuppliers(db, Object.assign({}, need, { budget: 1400000 }), settings).ranked;
  assert.ok(r.find((x) => x.supplier.id === 'bog-empaques-andinos').warnings.some((w) => w.code === 'over_budget'));
  const textiles = demo('bogota', 'boxes');
  textiles.need = Object.assign({}, textiles.need, { category: 'textiles' });
  const luna = Score.rankSuppliers(textiles.db, textiles.need, textiles.settings).ranked.find((x) => x.supplier.id === 'bog-bordados-luna');
  assert.ok(luna.warnings.some((w) => w.code === 'no_consent'));
});

test('the same logic works for another country and currency', () => {
  const { db, need, settings } = demo('cdmx', 'boxes');
  const { ranked } = Score.rankSuppliers(db, need, settings);
  assert.equal(ranked[0].supplier.name, 'Cajas Doña Lupe');
  assert.equal(ranked[0].cost.currency, 'MXN');
});

test('every factor is between 0 and 1 and scores are sorted', () => {
  for (const [datasetId, ds] of Object.entries(DATASETS)) {
    for (const needDef of ds.needs) {
      const { db, need, settings } = demo(datasetId, needDef.id);
      const { ranked } = Score.rankSuppliers(db, need, settings);
      ranked.forEach((r, i) => {
        Object.values(r.factors).forEach((f) => assert.ok(f >= 0 && f <= 1));
        if (i) assert.ok(ranked[i - 1].score >= r.score);
      });
    }
  }
});
