const test = require('node:test');
const assert = require('node:assert/strict');
const { blendRating } = require('../src/core/reviews');
const { trustScore, indexById } = require('../src/core/trust');

test('no reviews means neutral, not bad', () => {
  const r = blendRating({});
  assert.equal(r.value, 3.5);
  assert.equal(r.basis, 'none');
});

test('a perfect score from a handful of reviews does not beat a strong track record', () => {
  const few = blendRating({ rating: { avg: 5, count: 2 } });
  const many = blendRating({ rating: { avg: 4.7, count: 300 } });
  assert.ok(many.value > few.value, `${many.value} should beat ${few.value}`);
});

test("your team's reviews weigh more than anonymous ones", () => {
  const online = blendRating({ rating: { avg: 2, count: 3 } });
  const team = blendRating({ internalReviews: [{ stars: 2 }] });
  assert.equal(online.value, team.value, 'one team review = three online reviews');
  const onlineOnly = blendRating({ rating: { avg: 4.9, count: 40 } });
  const both = blendRating({ rating: { avg: 4.9, count: 40 }, internalReviews: [{ stars: 2 }, { stars: 1 }] });
  assert.equal(both.basis, 'both');
  assert.ok(onlineOnly.value - both.value > 0.3, `two bad team experiences pull ${onlineOnly.value} down to ${both.value}`);
});

test('huge review counts are capped so team experience still matters', () => {
  const r = blendRating({ rating: { avg: 5, count: 100000 }, internalReviews: [{ stars: 1 }] });
  assert.ok(r.value < 4.9);
  assert.equal(r.externalCount, 100000, 'the real count is still reported');
});

test('invalid stars are ignored', () => {
  assert.equal(blendRating({ internalReviews: [{ stars: 9 }, { stars: 0 }] }).basis, 'none');
});

const suppliers = [
  { id: 'a', name: 'A', verification: 1 },
  { id: 'b', name: 'B', verification: 1 },
  { id: 'c', name: 'C', verification: 0, taxId: { value: '999000101-0' } },
  { id: 'c2', name: 'C group', verification: 0, taxId: { value: '999000101-0' } }
];
const byId = indexById(suppliers);

test('trust starts at the verification level', () => {
  assert.equal(trustScore({ id: 'x', verification: 0 }, [], byId).value, 0.2);
  assert.equal(trustScore({ id: 'x', verification: 4 }, [], byId).value, 1);
});

test('independent referrals add trust, up to a cap', () => {
  const refs = [
    { from: 'person:ana', to: 'a' },
    { from: 'person:ana', to: 'a' }, // same person twice counts once
    { from: 'b', to: 'a' },
    { from: 'person:luis', to: 'a' }
  ];
  const t = trustScore(suppliers[0], refs, byId);
  assert.equal(t.referrals.count, 3);
  assert.equal(t.value, 0.6, '0.4 + capped bonus 0.2');
});

test('self-referrals and same-group referrals count for nothing', () => {
  const refs = [{ from: 'c', to: 'c' }, { from: 'c2', to: 'c' }];
  const t = trustScore(suppliers[2], refs, byId);
  assert.equal(t.referrals.count, 0);
  assert.equal(t.referrals.ignored, 2);
  assert.equal(t.value, 0.2);
});

test('suppliers that only recommend each other count half', () => {
  const refs = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
  const t = trustScore(suppliers[1], refs, byId);
  assert.equal(t.referrals.mutual, 1);
  assert.equal(t.value, 0.45);
});

test('ids that collide with JavaScript object keys are handled like any other id', () => {
  const list = [
    { id: '__proto__', name: 'P', verification: 1 },
    { id: 'constructor', name: 'C', verification: 1 },
    { id: 'toString', name: 'T', verification: 0 }
  ];
  const map = indexById(list);
  const refs = [{ from: 'constructor', to: '__proto__' }, { from: 'toString', to: '__proto__' }];
  const t = trustScore(list[0], refs, map);
  assert.equal(t.referrals.count, 2);
  assert.equal(t.value, 0.6);
  assert.equal(trustScore(list[2], refs, map).referrals.count, 0);
});

test('a prebuilt referral index gives the same result as the raw list', () => {
  const { buildReferralIndex } = require('../src/core/trust');
  const refs = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'person:x', to: 'b' }];
  assert.deepEqual(trustScore(suppliers[1], buildReferralIndex(refs), byId), trustScore(suppliers[1], refs, byId));
});
