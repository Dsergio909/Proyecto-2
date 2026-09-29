const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCapture } = require('../src/core/capture');
const { CAPTURE_EXAMPLES } = require('../src/data/sample');

test('business card: every field, with evidence, and always to review', () => {
  const r = parseCapture(CAPTURE_EXAMPLES.card, { country: 'CO' });
  const d = r.draft;
  assert.equal(d.name, 'FERRETERÍA LA LLAVE DORADA');
  assert.equal(r.confidence.name, 'high');
  assert.deepEqual(d.taxId && [d.taxId.value, d.taxId.valid], ['999000121-8', true]);
  assert.deepEqual(d.phones, ['+579990000121']);
  assert.deepEqual(d.emails, ['ventas@llavedorada.example']);
  assert.equal(d.address, 'Cra 68 # 13-80 Local 5, Bogotá');
  assert.equal(d.city, 'Bogotá');
  assert.deepEqual(d.categories, ['hardware']);
  assert.equal(d.prices.length, 1);
  assert.deepEqual(
    [d.prices[0].item, d.prices[0].price, d.prices[0].per.qty, d.prices[0].taxIncluded],
    ['tornillos drywall', 17900, 100, true]
  );
  assert.equal(d.leadDays, 2);
  assert.equal(d.paymentDays, 30);
  assert.equal(r.needsReview, true);
  assert.equal(r.completeness, 1);
});

test('one-paragraph WhatsApp message: sentence by sentence', () => {
  const r = parseCapture(CAPTURE_EXAMPLES.whatsapp, { country: 'CO' });
  const d = r.draft;
  assert.equal(d.name, 'Empaques La Pradera');
  assert.deepEqual(d.phones, ['+579990000122']);
  assert.deepEqual(d.socials, ['@empaqueslapradera.demo']);
  assert.deepEqual(d.categories, ['packaging']);
  assert.equal(d.prices[0].price, 2380);
  assert.equal(d.prices[0].taxIncluded, false, '"+ IVA" means tax is extra');
  assert.deepEqual(d.minOrder, { qty: 300, unit: 'unidades', resolved: true });
  assert.equal(d.leadDays, 3);
  assert.equal(d.ships, true);
});

test('another country: Mexican flyer with RFC and shipping line', () => {
  const r = parseCapture(CAPTURE_EXAMPLES.flyer, { country: 'MX' });
  const d = r.draft;
  assert.equal(d.taxId.label, 'RFC');
  assert.equal(d.taxId.valid, true);
  assert.deepEqual(d.phones, ['+525500000207']);
  assert.equal(d.city, 'Ciudad de México');
  assert.equal(d.prices[0].currency, 'MXN');
  assert.equal(d.prices[0].price, 395);
  assert.equal(d.shipping, 120, 'the "Envío" line is shipping, not a product');
  assert.deepEqual(d.categories, ['3dprint']);
});

test('prices in every common shape', () => {
  const text = [
    'Docena de camisetas bordadas 150 mil',
    'Rollo stretch a 45 lucas',
    'Pintura galón $85.000 + IVA',
    'Arena 4.500/kg',
    'USD 2.10 each, plus tax'
  ].join('\n');
  const prices = parseCapture(text, { country: 'CO' }).draft.prices;
  assert.deepEqual(prices.map((p) => p.price), [150000, 45000, 85000, 4500, 2.1]);
  assert.deepEqual(prices.map((p) => p.per.unit), ['docena', 'unidad', 'galon', 'kg', 'each']);
  assert.equal(prices[4].currency, 'USD');
  assert.equal(prices[4].taxIncluded, false);
});

test('an invalid check digit is flagged, not silently accepted', () => {
  const r = parseCapture('Taller Demo\nNIT 999.000.121-3\nTel 999 000 0121', { country: 'CO' });
  assert.equal(r.draft.taxId.valid, false);
  assert.equal(r.confidence.taxId, 'low');
  assert.ok(r.warnings.some((w) => w.code === 'tax_id_invalid' && w.expected === 8));
});

test('the tax ID label can reveal a foreign supplier', () => {
  const r = parseCapture('Proveedor Andino\nRUC 20131312955', { country: 'CO' });
  assert.equal(r.draft.taxId.country, 'PE');
  assert.equal(r.draft.taxId.valid, true);
});

test('two phones on one line, dates and addresses are not phones', () => {
  const r = parseCapture('Tels 999 000 0101 - 999 000 0102\nFecha 2026-09-29\nCalle 13 # 68-45', { country: 'CO' });
  assert.deepEqual(r.draft.phones, ['+579990000101', '+579990000102']);
});

test('empty or garbage input never throws and asks for the essentials', () => {
  for (const input of ['', null, '!!!', 'x'.repeat(20000)]) {
    const r = parseCapture(input, { country: 'CO' });
    assert.equal(r.needsReview, true);
    assert.ok(Array.isArray(r.warnings));
  }
  const codes = parseCapture('', { country: 'CO' }).warnings.map((w) => w.code);
  assert.ok(codes.includes('name_missing') && codes.includes('no_contact'));
});

test('an unresolved minimum order ("10 cajas") is left for a person', () => {
  const r = parseCapture('Cajas Demo\nPedido mínimo 10 cajas\nCaja x 25 $60.000', { country: 'CO' });
  assert.equal(r.draft.minOrder.resolved, false);
  assert.ok(r.warnings.some((w) => w.code === 'moq_unresolved'));
});

test('a phone in the same sentence as a price is kept', () => {
  const r = parseCapture('Cajas a 2.000 c/u, llama al 999 000 0101', { country: 'CO' });
  assert.deepEqual(r.draft.phones, ['+579990000101']);
  assert.equal(r.draft.prices[0].price, 2000);
});

test('large amounts are never read as phone numbers', () => {
  const r = parseCapture('Caja x 100 tornillos $1.250.000\nTel 999 000 0102', { country: 'CO' });
  assert.deepEqual(r.draft.phones, ['+579990000102']);
  assert.ok(!r.warnings.some((w) => w.code === 'phone_unparsed'));
});

test('tax labels count only as whole words ("UNITARIA" is not a NIT)', () => {
  assert.equal(parseCapture('TORNILLERÍA UNITARIA\nTel 999 000 0101', { country: 'CO' }).draft.name, 'TORNILLERÍA UNITARIA');
});

test('hostile or huge input is processed quickly (no catastrophic regex backtracking)', () => {
  const inputs = ['a'.repeat(5000), 'a.'.repeat(2500), '1.'.repeat(2500), '@'.repeat(5000), 'x@' + 'a.'.repeat(2400),
    '$' + '1.'.repeat(2400), '1 '.repeat(2500), 'somos ' + 'A'.repeat(4990), 'Cra 1 ' + '#1-'.repeat(1600), '999 '.repeat(1250)];
  const start = Date.now();
  inputs.forEach((text) => parseCapture(text, { country: 'CO' }));
  const ms = Date.now() - start;
  assert.ok(ms < 3000, `took ${ms} ms`);
});

test('removing an amount never cuts a phone that contains the same digits', () => {
  assert.deepEqual(parseCapture('Tornillo a 20 c/u, llama al 999 000 1220 hoy', { country: 'CO' }).draft.phones, ['+579990001220']);
});
