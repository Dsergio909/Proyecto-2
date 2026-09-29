const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, parseArgs } = require('../cli/scout');
const { DATASETS } = require('../src/data/sample');
const { fakeFetch, fixture } = require('./helpers/fake-fetch');

function io() {
  const out = [];
  const err = [];
  return { out: (s) => out.push(s), err: (s) => err.push(s), stdout: () => out.join('\n'), stderr: () => err.join('\n') };
}

function tmp(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

test('flags and positional arguments', () => {
  assert.deepEqual(parseArgs(['merge', 'a.json', '--out', 'x.json', '--describe']), { _: ['merge', 'a.json'], out: 'x.json', describe: true });
});

test('osm command prints an importable database and a summary', async () => {
  const o = io();
  const code = await main(['osm', '--category', 'packaging', '--lat', '4.6782', '--lng', '-74.1411'], o, {
    fetchImpl: fakeFetch([['overpass', fixture('overpass.json')]])
  });
  assert.equal(code, 0, o.stderr());
  const db = JSON.parse(o.stdout());
  assert.equal(db.version, 1);
  assert.equal(db.suppliers.length, 3);
  assert.match(db.attribution, /OpenStreetMap/);
  assert.match(o.stderr(), /3 suppliers · 2 without a website/);
});

test('registry command works with any Socrata portal, not only SECOP', async () => {
  const fetch = fakeFetch([
    ['https://data.example.gov/api/views/abcd-1234.json', fixture('socrata-meta.json')],
    ['https://data.example.gov/resource/abcd-1234.json', fixture('socrata-rows.json')]
  ]);
  const o = io();
  const code = await main(['registry', '--domain', 'https://data.example.gov', '--dataset', 'abcd-1234', '--country', 'CO', '--q', 'cajas'], o, { fetchImpl: fetch });
  assert.equal(code, 0, o.stderr());
  assert.equal(JSON.parse(o.stdout()).suppliers.length, 2);
  assert.equal(await main(['registry', '--domain', 'http://insecure.example', '--dataset', 'abcd-1234'], io(), { fetchImpl: fetch }), 1);
});

test('csv command recognises columns and reports what it ignored', async () => {
  const file = tmp('lista.csv', 'Razón social;NIT;Celular;Stand\nEmpaques Demo;999000101-0;999 000 0101;B12\n');
  const o = io();
  assert.equal(await main(['csv', '--file', file, '--country', 'CO'], o), 0);
  assert.match(o.stderr(), /Columns recognised: name, taxId, phone · ignored: Stand/);
  assert.equal(JSON.parse(o.stdout()).suppliers[0].taxId.valid, true);
});

test('merge command de-duplicates across files and lists what needs review', async () => {
  const a = tmp('a.json', JSON.stringify({ suppliers: [{ id: 'x', name: 'Taller Uno', phones: ['+579990000101'] }] }));
  const b = tmp('b.json', JSON.stringify({ suppliers: [{ id: 'x', name: 'TALLER UNO', phones: ['+579990000101'] }, { id: 'y', name: 'Otro' }] }));
  const o = io();
  assert.equal(await main(['merge', a, b], o), 0);
  const db = JSON.parse(o.stdout());
  assert.equal(db.suppliers.length, 2);
  assert.match(o.stderr(), /1 merged automatically/);
});

test('rank command explains every position', async () => {
  const file = tmp('bogota.json', JSON.stringify(DATASETS.bogota));
  const o = io();
  const code = await main(['rank', '--db', file, '--category', 'packaging', '--qty', '500', '--lat', '4.6782', '--lng', '-74.1411', '--radius', '12', '--days', '7'], o);
  assert.equal(code, 0, o.stderr());
  assert.match(o.stdout(), /^ 1\. \[\s*\d+\] Empaques Doña Rosa · \$\s1\.457\.750/);
  assert.match(o.stdout(), /Cartonajes del Norte: Fuera de tu radio/);
});

test('errors are reported without a stack trace and exit non-zero', async () => {
  const o = io();
  assert.equal(await main(['places', '--q', 'cajas'], o, { fetchImpl: fakeFetch([]) }), 1);
  assert.match(o.stderr(), /^Error: /);
  assert.equal(await main(['nope'], io()), 1);
});

test('ocds command reads a release package file', async () => {
  const file = tmp('releases.json', fixture('ocds-release-package.json'));
  const o = io();
  assert.equal(await main(['ocds', '--file', file, '--country', 'PY', '--category', 'packaging', '--label', 'DNCP'], o), 0);
  assert.match(o.stderr(), /2 releases read · 2 suppliers/);
  const db = JSON.parse(o.stdout());
  assert.equal(db.country, 'PY');
  assert.deepEqual(db.suppliers.map((s) => s.name), ['Cartonera Guaraní S.A.', 'Embalajes del Este']);
});
