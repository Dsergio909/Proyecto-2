const test = require('node:test');
const assert = require('node:assert/strict');
const Csv = require('../src/core/csv');
const Schema = require('../src/core/schema');

test('RFC 4180: quotes, escaped quotes, newlines inside cells, CRLF', () => {
  const rows = Csv.parseCsv('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'he said "hi"', 'line1\nline2']]);
});

test('semicolon files from Excel in Spanish are detected', () => {
  assert.deepEqual(Csv.parseCsv('Nombre;Teléfono\nTaller;999 000 0101'), [['Nombre', 'Teléfono'], ['Taller', '999 000 0101']]);
});

test('columns are recognised by name in Spanish, English and Portuguese', () => {
  const { mapping, unmapped } = Csv.mapColumns(['Razón Social', 'NIT', 'Teléfono', 'Correo electrónico', 'Municipio', 'Código Categoría Principal', 'Color favorito']);
  assert.deepEqual(mapping, { name: 0, taxId: 1, phone: 2, email: 3, city: 4, category: 5 });
  assert.deepEqual(unmapped, ['Color favorito']);
  assert.deepEqual(Csv.mapColumns(['Company name', 'Phone', 'Latitude', 'Longitude']).mapping, { name: 0, phone: 1, lat: 2, lng: 3 });
  assert.equal(Csv.mapColumns(['Nome', 'Cidade']).mapping.name, 0);
});

test('importing a registry export validates tax IDs and detects categories', () => {
  const csv = [
    'Nombre,NIT,Telefono,Municipio,Actividad',
    'Corrugados Demo SAS,999000104-2,999 000 0104,Funza,Fabricación de cajas de cartón corrugado',
    'Sin nombre valido,,,,',
    ',999000101-0,,,',
    'Taller Demo,999000104-9,999 000 0105 / 999 000 0106,Bogotá,Ferretería'
  ].join('\n');
  const out = Csv.importSuppliers(csv, { country: 'CO', source: 'registry', ref: 'demo' });
  assert.equal(out.suppliers.length, 3);
  assert.equal(out.skipped, 1);
  const [first, , third] = out.suppliers;
  assert.deepEqual(first.categories, ['packaging']);
  assert.equal(first.taxId.valid, true);
  assert.equal(first.verification, 2, 'valid tax ID from an official registry = formal');
  assert.equal(third.taxId.valid, false);
  assert.equal(third.verification, 0);
  assert.deepEqual(third.phones, ['+579990000105', '+579990000106']);
});

test('export neutralises spreadsheet formulas', () => {
  const text = Csv.toCsv([['name', 'n'], ['=IMPORTXML("http://x")', -5], ['+57 999', 3], ['@SUM(A1)', 'ok']]);
  assert.equal(text, 'name,n\r\n"\'=IMPORTXML(""http://x"")",-5\r\n\'+57 999,3\r\n\'@SUM(A1),ok\r\n');
});

test('sanitizeDatabase drops unknown fields, bad links and oversized input', () => {
  const db = Schema.sanitizeDatabase({
    suppliers: [
      {
        id: 'x<script>', name: '  Taller  ', evil: 'drop me', websites: ['javascript:alert(1)', 'taller.example'],
        emails: ['bad', 'ok@taller.example'], phones: ['9990000001', '+579990000101'], lat: 999, lng: 5,
        categories: ['packaging', 'weapons'], verification: 99, notes: 'x'.repeat(2000),
        sources: [{ type: 'field', ref: 'card' }, { type: 'hack' }]
      },
      { name: '' },
      null
    ],
    quotes: [{ supplierId: 'nobody', price: 5 }, { supplierId: 'xscript', price: -1 }, { supplierId: 'xscript', price: 10, per: { qty: 5 } }],
    referrals: [{ from: 'person:a', to: 'xscript', relation: 'enemy' }]
  });
  assert.equal(db.suppliers.length, 1);
  const s = db.suppliers[0];
  assert.equal(s.id, 'xscript');
  assert.equal(s.name, 'Taller');
  assert.equal(s.evil, undefined);
  assert.deepEqual(s.websites, ['https://taller.example/']);
  assert.deepEqual(s.emails, ['ok@taller.example']);
  assert.deepEqual(s.phones, ['+579990000101'], 'only E.164 phones are accepted from files');
  assert.equal(s.lat, null);
  assert.deepEqual(s.categories, ['packaging']);
  assert.equal(s.verification, 0, 'out-of-range levels fall back to unverified');
  assert.equal(s.notes.length, 500);
  assert.deepEqual(s.sources, [{ type: 'field', ref: 'card', at: null }]);
  assert.equal(db.quotes.length, 1, 'quotes for unknown suppliers or negative prices are dropped');
  assert.equal(db.referrals[0].relation, 'other');
});

test('duplicate ids in an import are made unique', () => {
  const db = Schema.sanitizeDatabase({ suppliers: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] });
  assert.deepEqual(db.suppliers.map((x) => x.id), ['a', 'a_']);
});

test('currency and country codes must look like codes', () => {
  const db = Schema.sanitizeDatabase({
    country: 'co',
    suppliers: [{ id: 'a', name: 'A', country: '<s', taxId: { value: '1', country: 'mx' } }],
    quotes: [{ supplierId: 'a', price: 1, currency: 'usd' }, { supplierId: 'a', price: 1, currency: '<i>' }]
  });
  assert.equal(db.country, 'CO');
  assert.equal(db.suppliers[0].country, null);
  assert.equal(db.suppliers[0].taxId.country, 'MX');
  assert.deepEqual(db.quotes.map((q) => q.currency), ['USD', null]);
});

test('ids that match JavaScript object keys are kept as they are', () => {
  const db = Schema.sanitizeDatabase({ suppliers: [{ id: 'constructor', name: 'A' }, { id: 'toString', name: 'B' }], quotes: [{ supplierId: 'valueOf', price: 1 }] });
  assert.deepEqual(db.suppliers.map((x) => x.id), ['constructor', 'toString']);
  assert.equal(db.quotes.length, 0, 'a quote for a supplier that does not exist is dropped');
});

test('column names are recognised in Portuguese, French and regional Spanish', () => {
  const Csv = require('../src/core/csv');
  const pt = Csv.mapColumns(['Nome Fantasia', 'CNPJ', 'Fone', 'Logradouro', 'Cidade', 'UF', 'CNAE']).mapping;
  assert.deepEqual(pt, { name: 0, taxId: 1, phone: 2, address: 3, city: 4, region: 5, category: 6 });
  const fr = Csv.mapColumns(['Raison sociale', 'SIRET', 'Téléphone', 'Courriel', 'Adresse', 'Ville', 'Code NAF']).mapping;
  assert.deepEqual(fr, { name: 0, taxId: 1, phone: 2, email: 3, address: 4, city: 5, category: 6 });
  const doCsv = 'Nombre comercial;RNC;Teléfono;Giro\nColmado Demo;199900014;809-555-0123;colmado\n';
  const s = Csv.importSuppliers(doCsv, { country: 'DO' }).suppliers[0];
  assert.deepEqual([s.name, s.taxId.valid, s.phones[0], s.categories[0]], ['Colmado Demo', true, '+18095550123', 'food']);
});
