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
  const r = parseCapture('Proveedor Andino\nRUC 20999000101', { country: 'CO' });
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

// ---------- Latin America, Brazil and France: how suppliers actually write ----------
// All names, IDs and numbers are fictional (valid check digits, zero-filled phones, .example domains).

const REGIONAL = {
  MX: ['Tlapalería El Tornillo Feliz', 'RFC TTF990101AB1', 'Pijas c/100 $85 más IVA', 'Cel 044 55 0000 0301',
    'ventas@tornillofeliz.example', 'Entrega en 2 días, Guadalajara'].join('\n'),
  DO: ['Colmado y Ferretería Don Chepe', 'RNC 199900014', 'Del colmado 200 metros al norte, Santiago',
    'Saco de cemento RD$ 450 con ITBIS', 'Quintal de arroz RD$ 2.800', 'Tel 809-555-0123'].join('\n'),
  BR: ['Ferragens Boa Vista Ltda', 'CNPJ 12.ABC.999/0001-01', 'Parafusos caixa c/ 100 R$ 45,90', 'Entrega em 2 dias, frete grátis',
    'WhatsApp (11) 90000-0401', 'contato@boavista.example', 'Rua das Flores, 120 - São Paulo'].join('\n'),
  EC: ['Distribuidora Andina de Empaques', 'RUC 1799900013001', 'Caja x 25 $ 18,50 incluye IVA', 'Cel 099 000 0601', 'Quito'].join('\n'),
  CL: ['Gasfitería Don Lucho', 'RUT 12.345.678-5', 'Arroba de clavos $ 25.000', 'Despacho en 3 días', 'Fono +56 9 0000 0501', 'Santiago'].join('\n'),
  FR: ['Quincaillerie Martin', 'SIRET 999 000 128 00010', 'Vis à bois, boîte de 100 : 12,50 € HT', 'Livraison sous 3 jours',
    'Tél. 06 39 98 00 01', 'contact@quincaillerie-martin.example', '12 rue des Lilas, Lyon'].join('\n'),
  CR: ['Taller de Soldadura Los Ticos', 'Cédula jurídica 3-101-999000', 'De la iglesia 100 varas al sur, San José', '₡ 25.000 por metro', 'Tel 2000-0601'].join('\n')
};

test('Mexico: "tlapalería", "pijas c/100", the old 044 mobile prefix, "más IVA"', () => {
  const d = parseCapture(REGIONAL.MX, { country: 'MX' }).draft;
  assert.deepEqual(d.categories, ['hardware']);
  assert.deepEqual(d.phones, ['+525500000301']);
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].per], ['Pijas', 85, 'MXN', { qty: 100, unit: 'unidad' }]);
  assert.equal(d.prices[0].taxIncluded, false);
  assert.equal(d.leadDays, 2);
});

test('Dominican Republic: RNC, RD$, ITBIS, a quintal and an address given by landmark', () => {
  const r = parseCapture(REGIONAL.DO, { country: 'DO' });
  const d = r.draft;
  assert.deepEqual([d.taxId.label, d.taxId.valid], ['RNC', true]);
  assert.equal(d.address, 'Del colmado 200 metros al norte, Santiago');
  assert.deepEqual(d.phones, ['+18095550123']);
  assert.deepEqual(d.prices.map((p) => [p.price, p.currency, p.per.unit, p.taxIncluded]), [[450, 'DOP', 'unidad', true], [2800, 'DOP', 'quintal', null]]);
});

test('Brazil: alphanumeric CNPJ, R$ with decimal comma, "frete grátis" means free delivery', () => {
  const d = parseCapture(REGIONAL.BR, { country: 'BR' }).draft;
  assert.deepEqual([d.taxId.value, d.taxId.valid], ['12ABC999000101', true]);
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].per.qty], ['Parafusos', 45.9, 'BRL', 100]);
  assert.deepEqual([d.shipping, d.ships, d.leadDays], [0, true, 2]);
  assert.deepEqual(d.phones, ['+5511900000401']);
  assert.equal(d.address, 'Rua das Flores, 120 - São Paulo');
  assert.deepEqual(d.categories, ['hardware']);
});

test('Ecuador: a dollarised price and a company RUC with its check digit', () => {
  const d = parseCapture(REGIONAL.EC, { country: 'EC' }).draft;
  assert.deepEqual([d.taxId.country, d.taxId.valid], ['EC', true]);
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].taxIncluded], ['Caja x 25', 18.5, 'USD', true]);
  assert.deepEqual(d.phones, ['+593990000601']);
});

test('Chile: "gasfitería", "arroba", "despacho" and "fono"', () => {
  const d = parseCapture(REGIONAL.CL, { country: 'CL' }).draft;
  assert.ok(d.categories.includes('maintenance'));
  assert.deepEqual([d.prices[0].item, d.prices[0].per.unit], ['clavos', 'arroba']);
  assert.equal(d.leadDays, 3);
  assert.deepEqual(d.phones, ['+56900000501']);
});

test('France: SIRET written in groups, "12 rue...", prices "HT"', () => {
  const r = parseCapture(REGIONAL.FR, { country: 'FR' });
  const d = r.draft;
  assert.deepEqual([d.taxId.label, d.taxId.value, d.taxId.valid], ['SIRET', '99900012800010', true]);
  assert.equal(d.address, '12 rue des Lilas, Lyon');
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].taxIncluded], ['Vis à bois', 12.5, 'EUR', false]);
  assert.deepEqual(d.phones, ['+33639980001']);
  assert.equal(d.leadDays, 3);
  assert.ok(!r.warnings.some((w) => w.code === 'phone_unparsed'), 'the SIRET digits are not a phone');
});

test('Costa Rica: cédula jurídica, colones and "100 varas al sur"', () => {
  const d = parseCapture(REGIONAL.CR, { country: 'CR' }).draft;
  assert.deepEqual([d.taxId.country, d.taxId.checked], ['CR', 'format']);
  assert.equal(d.address, 'De la iglesia 100 varas al sur, San José');
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].per.unit], [null, 25000, 'CRC', 'metro']);
});

test('a WhatsApp paragraph from Peru: soles, "+ IGV", the product after "vendemos"', () => {
  const text = 'Hola, somos Maderas San Martín, vendemos tablas de pino a S/ 35 la unidad + IGV, pedido mínimo 20 unidades. Llámanos al (01) 000 0601. Entregamos en Lima en 2 días.';
  const d = parseCapture(text, { country: 'PE' }).draft;
  assert.equal(d.name, 'Maderas San Martín');
  assert.deepEqual(d.phones, ['+5110000601'], 'Lima landline written with its old trunk prefix');
  assert.deepEqual([d.prices[0].item, d.prices[0].price, d.prices[0].currency, d.prices[0].taxIncluded], ['tablas de pino', 35, 'PEN', false]);
  assert.deepEqual(d.minOrder, { qty: 20, unit: 'unidades', resolved: true });
  assert.deepEqual([d.ships, d.leadDays], [true, 2]);
  assert.deepEqual(d.categories, ['furniture']);
});

test('currency symbols across the region', () => {
  const text = ['Cemento RD$ 450', 'Block Q 5.50 c/u', 'Varilla ₡ 3.500', 'Yerba Gs. 25.000', 'Pintura S/ 45', 'Tornillos $U 250',
    'Café 12,50 €', 'Pão 3,50 reais', 'Arena 2 palos', 'Tela 15 lucas el metro'].join('\n');
  const prices = parseCapture(text, { country: 'CO' }).draft.prices;
  assert.deepEqual(prices.map((p) => [p.item, p.price, p.currency]), [
    ['Cemento', 450, 'DOP'], ['Block', 5.5, 'GTQ'], ['Varilla', 3500, 'CRC'], ['Yerba', 25000, 'PYG'], ['Pintura', 45, 'PEN'],
    ['Tornillos', 250, 'UYU'], ['Café', 12.5, 'EUR'], ['Pão', 3.5, 'BRL'], ['Arena', 2000000, 'COP'], ['Tela', 15000, 'COP']
  ]);
});

test('"Bs" is local in Bolivia and Venezuela, and flagged anywhere else', () => {
  assert.equal(parseCapture('Harina Bs. 120', { country: 'BO' }).draft.prices[0].currency, 'BOB');
  assert.equal(parseCapture('Harina Bs. 120', { country: 'VE' }).draft.prices[0].currency, 'VES');
  const r = parseCapture('Harina Bs. 120', { country: 'CO' });
  assert.ok(r.warnings.some((w) => w.code === 'currency_ambiguous' && w.options === 'VES / BOB'));
  assert.equal(r.draft.prices[0].currencyGuess, undefined, 'internal field is not leaked into the draft');
});

test('Brazilian business card from the demo: CNPJ, (11) phone, "com impostos", "boleto 28 dias"', () => {
  const r = parseCapture(CAPTURE_EXAMPLES.cartao, { country: 'BR' });
  const d = r.draft;
  assert.deepEqual([d.name, d.taxId.valid, d.phones[0], d.city], ['EMBALAGENS VILA MARIA', true, '+551100000309', 'São Paulo']);
  assert.deepEqual([d.prices[0].price, d.prices[0].per.qty, d.prices[0].taxIncluded], [89.9, 25, true]);
  assert.deepEqual([d.leadDays, d.paymentDays], [3, 28]);
  assert.equal(r.completeness, 1);
});
