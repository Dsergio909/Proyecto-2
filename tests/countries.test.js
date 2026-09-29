const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core/countries');

test('Colombia NIT: check digit is computed and verified', () => {
  const base = '999000123';
  const dv = C.nitCheckDigit(base);
  assert.equal(C.validators.nit(`999.000.123-${dv}`).valid, true);
  assert.equal(C.validators.nit(`999.000.123-${(dv + 1) % 10}`).valid, false);
  const noDv = C.validators.nit('999000123');
  assert.equal(noDv.valid, null, 'without a check digit we cannot tell');
  assert.equal(noDv.expectedCheckDigit, dv);
  assert.equal(C.validators.nit('12-34').valid, false);
});

test('Chile RUT, Argentina CUIT, Peru RUC and Brazil CNPJ checksums', () => {
  assert.equal(C.validators.rut('12.345.678-5').valid, true);
  assert.equal(C.validators.rut('12.345.678-4').valid, false);
  assert.equal(C.validators.cuit('20-12345678-6').valid, true);
  assert.equal(C.validators.cuit('20-12345678-5').valid, false);
  assert.equal(C.validators.ruc('20999000101').valid, true); // 5·2+4·0+3·9+2·9+7·9+6·0+5·0+4·0+3·1+2·0 = 121 -> 11 - 0 -> 1
  assert.equal(C.validators.ruc('20999000102').valid, false);
  assert.equal(C.validators.ruc('30999000105').valid, false, 'RUC must start with 10, 15, 16, 17 or 20');
  assert.equal(C.validators.cnpj('11.222.333/0001-81').valid, true);
  assert.equal(C.validators.cnpj('11.222.333/0001-82').valid, false);
  assert.equal(C.validators.cnpj('11.111.111/1111-11').valid, false, 'repeated digits are rejected');
});

test('format-only validators say so', () => {
  const rfc = C.validators.rfc('EAN990101AB1');
  assert.deepEqual([rfc.valid, rfc.checked], [true, 'format']);
  assert.equal(C.validators.rfc('EAN-9901').valid, false);
  assert.equal(C.getProfile('XX').validateTaxId('anything').valid, null);
});

test('unknown country codes fall back to the generic profile', () => {
  assert.equal(C.getProfile('ZZ').code, 'XX');
  assert.equal(C.getProfile('co').code, 'CO');
});

test('tax ID labels map to countries', () => {
  assert.equal(C.countryForTaxLabel('RFC'), 'MX');
  assert.equal(C.countryForTaxLabel('N.I.T'), 'CO');
  assert.equal(C.countryForTaxLabel('CUIL'), 'AR');
  assert.equal(C.countryForTaxLabel('XYZ'), null);
});

test('phones are normalised to E.164 per country', () => {
  assert.equal(C.normalizePhone('999 000 0001', 'CO'), '+579990000001');
  assert.equal(C.normalizePhone('(999) 000 0102', 'CO'), '+579990000102');
  assert.equal(C.normalizePhone('57 999 000 0001', 'CO'), '+579990000001');
  assert.equal(C.normalizePhone('+1 305 555 0142', 'CO'), '+13055550142', 'an explicit + wins over the country');
  assert.equal(C.normalizePhone('0034 912 000 000', 'CO'), '+34912000000');
  assert.equal(C.normalizePhone('55 0000 0201', 'MX'), '+525500000201');
  assert.equal(C.normalizePhone('12345', 'CO'), null);
  assert.equal(C.normalizePhone('9990000001', 'XX'), null, 'no calling code, no guess');
});

test('money is formatted with the local convention', () => {
  assert.match(C.formatMoney(1457750, 'CO'), /1\.457\.750/);
  assert.match(C.formatMoney(18.5, 'MX'), /18\.50/);
  assert.match(C.formatMoney(10, 'CO', 'USD'), /10,00/);
});
