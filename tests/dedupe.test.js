const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core/dedupe');
const Schema = require('../src/core/schema');
const { DATASETS } = require('../src/data/sample');

function s(id, extra) {
  return Object.assign({ id, name: id, phones: [], emails: [], websites: [], sources: [], verification: 0 }, extra);
}

test('tiers: tax ID > phone/email > corporate domain > similar name', () => {
  assert.equal(D.compare(s('a', { taxId: { value: '999000101-0' } }), s('b', { taxId: { value: '999.000.101-0' } })).tier, 'exact');
  assert.equal(D.compare(s('a', { phones: ['+579990000101'] }), s('b', { phones: ['+579990000101'] })).tier, 'high');
  assert.equal(D.compare(s('a', { emails: ['x@corp.example'] }), s('b', { websites: ['https://www.corp.example/'] })).tier, 'medium');
  const low = D.compare(s('Cajas El Porvenir', { lat: 4.67, lng: -74.13 }), s('Cajas Porvenir SAS', { lat: 4.6703, lng: -74.1296 }));
  assert.equal(low.tier, 'low');
});

test('free email providers never count as a shared domain', () => {
  assert.equal(D.compare(s('a', { emails: ['scout-demo-a@gmail.com'] }), s('b', { emails: ['scout-demo-b@gmail.com'] })), null);
});

test('similar names far apart are not duplicates (branches, homonyms)', () => {
  const a = s('Ferretería Central', { lat: 4.60, lng: -74.08 });
  const b = s('Ferretería Central', { lat: 4.75, lng: -74.05 });
  assert.equal(D.compare(a, b), null);
});

test('same phone but different valid tax IDs goes to a person', () => {
  const a = s('a', { phones: ['+579990000101'], taxId: { value: '999000101-0', valid: true } });
  const b = s('b', { phones: ['+579990000101'], taxId: { value: '999000102-8', valid: true } });
  const pairs = D.findDuplicates([a, b]);
  assert.equal(pairs[0].decision, 'review');
  assert.ok(pairs[0].evidence.some((e) => e.code === 'tax_conflict'));
});

test('a record matching two others automatically is ambiguous', () => {
  const pairs = D.findDuplicates([
    s('a', { phones: ['+579990000101'] }),
    s('b', { phones: ['+579990000101'] }),
    s('c', { phones: ['+579990000101'] })
  ]);
  assert.ok(pairs.every((p) => p.decision === 'review'));
  assert.ok(pairs.every((p) => p.evidence.some((e) => e.code === 'ambiguous')));
});

test('merging keeps the more verified data and rewires quotes and referrals', () => {
  const db = {
    version: 1,
    suppliers: [
      s('a', { name: 'Taller', verification: 3, phones: ['+579990000101'], lat: 4.6, lng: -74.1 }),
      s('b', { name: 'TALLER', verification: 0, phones: ['+579990000101', '+579990000199'], emails: ['t@taller.example'] })
    ],
    quotes: [{ id: 'q', supplierId: 'b' }],
    referrals: [{ from: 'person:x', to: 'b' }, { from: 'a', to: 'b' }]
  };
  const out = D.applyMerge(db, 'a', 'b');
  assert.equal(out.suppliers.length, 1);
  const m = out.suppliers[0];
  assert.equal(m.name, 'Taller');
  assert.deepEqual(m.phones, ['+579990000101', '+579990000199']);
  assert.deepEqual(m.emails, ['t@taller.example']);
  assert.deepEqual(m.mergedFrom, ['b']);
  assert.equal(out.quotes[0].supplierId, 'a');
  assert.deepEqual(out.referrals, [{ from: 'person:x', to: 'a' }], 'a self-loop created by the merge is dropped');
});

test('demo data: one automatic merge (same phone) and one case for review (similar name)', () => {
  const db = Schema.sanitizeDatabase(DATASETS.bogota);
  const result = D.autoMerge(db);
  assert.deepEqual(result.merged.map((p) => [p.a, p.b, p.tier]), [['bog-empaques-dona-rosa', 'bog-dona-rosa-tarjeta', 'high']]);
  assert.deepEqual(result.review.map((p) => [p.a, p.b, p.tier]), [['bog-cajas-el-porvenir', 'bog-cajas-porvenir-dir', 'low']]);
  assert.equal(result.db.suppliers.length, db.suppliers.length - 1);
});
