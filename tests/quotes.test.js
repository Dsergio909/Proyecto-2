const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/core/quotes');

const CO = { country: 'CO' };

test('numbers in both separator conventions', () => {
  assert.equal(Q.parseNumber('18.500'), 18500);
  assert.equal(Q.parseNumber('18,5'), 18.5);
  assert.equal(Q.parseNumber('1.250,50'), 1250.5);
  assert.equal(Q.parseNumber('1,250.50'), 1250.5);
  assert.equal(Q.parseNumber('1.234.567'), 1234567);
  assert.ok(Number.isNaN(Q.parseNumber('abc')));
  assert.equal(Q.parseAmount('50', 'mil'), 50000);
  assert.equal(Q.parseAmount('1,2', 'millones'), 1200000);
});

test('units convert to base units; a Colombian "libra" is 500 g', () => {
  assert.deepEqual(Q.toBase(1, 'docena'), { qty: 12, unit: 'unit' });
  assert.deepEqual(Q.toBase(500, 'g'), { qty: 0.5, unit: 'kg' });
  assert.deepEqual(Q.toBase(1, 'libra', 'CO'), { qty: 0.5, unit: 'kg', regional: true });
  assert.equal(Q.toBase(1, 'libra', 'US').qty, 0.453592);
  assert.equal(Q.toBase(1, 'furlong'), null);
});

test('landed cost: whole packs, tax when excluded, shipping', () => {
  const quote = { price: 62000, per: { qty: 25, unit: 'unidad' }, taxIncluded: false, shipping: 25000 };
  const c = Q.landedCost(quote, { quantity: 500, unit: 'unidad' }, CO);
  assert.equal(c.packs, 20);
  assert.equal(c.subtotal, 1240000);
  assert.equal(c.tax, 235600);
  assert.equal(c.total, 1500600);
  assert.equal(c.unitCost, 3001.2);
});

test('pack rounding: you cannot buy half a box', () => {
  const c = Q.landedCost({ price: 100, per: { qty: 12, unit: 'unidad' }, taxIncluded: true }, { quantity: 30, unit: 'unidad' }, CO);
  assert.equal(c.packs, 3);
  assert.equal(c.purchased, 36);
  assert.ok(c.warnings.some((w) => w.code === 'overbuy' && w.extra === 6));
});

test('minimum order raises the purchase and warns', () => {
  const quote = { price: 2100, per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 60000, minOrder: { qty: 1000, unit: 'unidad' } };
  const c = Q.landedCost(quote, { quantity: 500, unit: 'unidad' }, CO);
  assert.equal(c.purchased, 1000);
  assert.equal(c.total, 2559000);
  assert.ok(c.warnings.some((w) => w.code === 'below_moq'));
});

test('foreign currency needs a rate you provide', () => {
  const quote = { price: 14.5, currency: 'USD', per: { qty: 1, unit: 'kg' }, taxIncluded: true, shipping: 45 };
  const need = { quantity: 20, unit: 'kg' };
  assert.equal(Q.landedCost(quote, need, CO).warnings[0].code, 'fx_missing');
  const c = Q.landedCost(quote, need, { country: 'CO', fx: { USD: 4000 } });
  assert.equal(c.total, 14.5 * 20 * 4000 + 45 * 4000);
  assert.ok(c.warnings.some((w) => w.code === 'fx_manual'));
});

test('payment terms: paying in 30 days is worth something', () => {
  const quote = { price: 1000, per: { qty: 1, unit: 'unidad' }, taxIncluded: true, paymentDays: 30 };
  const c = Q.landedCost(quote, { quantity: 1, unit: 'unidad' }, { country: 'CO', monthlyRate: 0.02 });
  assert.equal(c.presentValue, 980.39);
  assert.equal(c.paymentSaving, 19.61);
});

test('incompatible units are rejected, not guessed', () => {
  const c = Q.landedCost({ price: 1, per: { qty: 1, unit: 'kg' } }, { quantity: 5, unit: 'unidad' }, CO);
  assert.equal(c.ok, false);
  assert.equal(c.warnings[0].code, 'unit_mismatch');
});

test('the cheapest list price is often not the cheapest order', () => {
  const need = { quantity: 500, unit: 'unidad' };
  const quotes = [
    { id: 'cheap-list', price: 2100, per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 60000, minOrder: { qty: 1000, unit: 'unidad' } },
    { id: 'real-deal', price: 2600, per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 15000 }
  ];
  const result = Q.compareQuotes(quotes, need, CO);
  assert.equal(result.ranked[0].quote.id, 'real-deal');
  assert.equal(result.ranked[0].cheapestTotal, true);
  assert.equal(result.ranked[1].cheapestListPrice, true);
  assert.equal(result.listPriceMisleads, true);
});

test('regional weights depend on the country and always ask for confirmation', () => {
  assert.equal(Q.toBase(1, 'arroba', 'BR').qty, 15);
  assert.equal(Q.toBase(1, 'arroba', 'CO').qty, 12.5);
  assert.equal(Q.toBase(1, 'quintal', 'CO').qty, 50);
  const c = Q.landedCost({ price: 25000, per: { qty: 1, unit: 'arroba' }, taxIncluded: true }, { quantity: 50, unit: 'kg' }, CO);
  assert.equal(c.packs, 4);
  assert.ok(c.warnings.some((w) => w.code === 'regional_unit' && w.unit === 'arroba' && w.kg === 12.5));
});

test('slang and foreign words for amounts and units', () => {
  assert.equal(Q.parseAmount('2', 'palos'), 2000000);
  assert.equal(Q.parseAmount('20', 'lucas'), 20000);
  assert.equal(Q.parseAmount('1,5', 'milhões'), 1500000);
  assert.equal(Q.parseAmount('3', 'mille'), 3000);
  assert.deepEqual(Q.toBase(2, 'dúzia'), { qty: 24, unit: 'unit' });
  assert.deepEqual(Q.toBase(1, 'douzaine'), { qty: 12, unit: 'unit' });
  assert.deepEqual(Q.toBase(1, 'milheiro'), { qty: 1000, unit: 'unit' });
  assert.equal(Q.toBase(1, 'cuñete').unit, 'l');
});
