// Guards for the public repository: the demo data must stay fictional.
const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../src/core/schema');
const { DATASETS, CAPTURE_EXAMPLES } = require('../src/data/sample');

const all = Object.values(DATASETS);

test('every email and website uses the reserved .example domain', () => {
  for (const ds of all) {
    for (const s of ds.suppliers) {
      (s.emails || []).forEach((e) => assert.match(e, /@[a-z0-9.-]+\.example$/, e));
      (s.websites || []).forEach((w) => assert.match(new URL(w).hostname, /\.example$/, w));
    }
  }
  const emails = Object.values(CAPTURE_EXAMPLES).join('\n').match(/[^\s@]+@[^\s@]+/g) || [];
  emails.forEach((e) => assert.match(e, /\.example$/, e));
});

test('phones are in ranges that cannot reach a real person', () => {
  for (const ds of all) {
    for (const s of ds.suppliers) {
      (s.phones || []).forEach((p) => assert.match(p, /^\+57999\d{7}$|^\+5255000\d{5}$|^\+551100000\d{3}$/, p));
    }
  }
});

test('the sample data passes the import gate unchanged in size', () => {
  for (const ds of all) {
    const db = Schema.sanitizeDatabase(ds);
    assert.equal(db.suppliers.length, ds.suppliers.length, ds.id);
    assert.equal(db.quotes.length, ds.quotes.length, ds.id);
    assert.equal(db.referrals.length, ds.referrals.length, ds.id);
  }
});

test('ids are unique and every quote and referral points to a known supplier or person', () => {
  for (const ds of all) {
    const ids = new Set(ds.suppliers.map((s) => s.id));
    assert.equal(ids.size, ds.suppliers.length);
    ds.quotes.forEach((q) => assert.ok(ids.has(q.supplierId), q.id));
    ds.referrals.forEach((r) => {
      assert.ok(ids.has(r.to), r.id);
      assert.ok(ids.has(r.from) || r.from.startsWith('person:'), r.id);
    });
  }
});
