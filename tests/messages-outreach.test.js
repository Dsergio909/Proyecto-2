const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../src/core/messages');
const O = require('../src/core/outreach');

test('every code the core can emit has a sentence in every language', () => {
  const src = ['capture', 'quotes', 'score', 'dedupe']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'core', f + '.js'), 'utf8'))
    .join('\n');
  const codes = new Set([...src.matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(codes.size > 20, 'found the codes');
  for (const code of codes) {
    for (const lang of M.LANGUAGES) {
      const text = M.explain({ code, symbol: 'Bs', options: 'VES / BOB', km: 1.2, value: 4, basis: 'none', level: 1, days: 2, total: 1, unitCost: 1, budget: 1, similarity: 0.9, minOrder: 1, unit: 'unit', extra: 1, currency: 'USD', rate: 1, needed: 1, how: 'heading', label: 'NIT' }, lang, { country: 'CO' });
      assert.notEqual(text, code, `${code} is missing in ${lang}`);
    }
  }
});

test('explanations format money and distance', () => {
  assert.match(M.explain({ code: 'price', total: 1457750, unitCost: 2916, paymentDays: 15 }, 'es', { country: 'CO' }), /1\.457\.750.*15 días/);
  assert.equal(M.explain({ code: 'distance', km: 0.35 }, 'en'), '350 m from your search point.');
});

test('the quote request asks for everything needed to compare fairly', () => {
  const text = O.rfqMessage({ category: 'packaging', item: 'cajas de cartón', quantity: 500, unit: 'unidad', neededInDays: 7 }, 'Doña Rosa', 'es', 'CO');
  for (const word of ['500 unidades', 'cajas de cartón', 'IVA', 'envío', 'pedido mínimo', 'tiempo de entrega', 'forma de pago', '7 días']) {
    assert.ok(text.includes(word), word);
  }
  assert.ok(O.rfqMessage({ category: 'packaging', quantity: 10, unit: 'kg' }, null, 'en').includes('10 kg of packaging'));
});

test('labels exist in every language, and unknown languages fall back to English', () => {
  assert.deepEqual(M.LANGUAGES, ['es', 'en', 'pt', 'fr']);
  for (const lang of M.LANGUAGES) {
    assert.equal(M.LEVELS[lang].length, 5, lang);
    assert.deepEqual(Object.keys(M.SOURCES[lang]).sort(), Object.keys(M.SOURCES.es).sort(), lang);
    assert.deepEqual(Object.keys(M.BASIS[lang]).sort(), Object.keys(M.BASIS.es).sort(), lang);
  }
  assert.equal(M.pickLanguage('pt-BR'), 'pt');
  assert.equal(M.pickLanguage('fr_CA'), 'fr');
  assert.equal(M.pickLanguage('de-DE'), 'en');
  assert.equal(M.explain({ code: 'distance', km: 2 }, 'de'), '2 km from your search point.');
  assert.equal(M.explain({ code: 'distance', km: 2 }, 'pt'), 'A 2 km do seu ponto de busca.');
});

test('the quote request names the local sales tax and speaks Portuguese and French', () => {
  const need = { category: 'packaging', quantity: 100, unit: 'unidad' };
  assert.match(O.rfqMessage(need, null, 'es', 'PE'), /si incluye IGV/);
  assert.match(O.rfqMessage(need, null, 'es', 'DO'), /si incluye ITBIS/);
  assert.match(O.rfqMessage(need, null, 'es', 'PA'), /si incluye ITBMS/);
  assert.match(O.rfqMessage(need, null, 'es'), /si incluye impuestos/);
  const pt = O.rfqMessage(need, 'Ferragens Demo', 'pt', 'BR');
  assert.match(pt, /^Olá Ferragens Demo/);
  assert.match(pt, /100 unidades de embalagens/);
  assert.match(pt, /frete/);
  const fr = O.rfqMessage(need, null, 'fr', 'FR');
  assert.match(fr, /100 unités d?e emballages/);
  assert.match(fr, /si la TVA est comprise/);
  assert.match(O.referralRequest('hardware', 'pt'), /sem site|não tenha site/);
  assert.match(O.referralRequest('hardware', 'fr'), /sans site web/);
  assert.match(O.referralRequest('hardware', 'es'), /usted/, 'Spanish uses "usted": it works in every country');
  assert.match(O.referralRequest('hardware', 'de'), /no website/, 'unknown languages fall back to English');
});

test('the referral request asks about suppliers without a website', () => {
  assert.match(O.referralRequest('packaging', 'es'), /sin|aunque no tenga página web/);
  assert.match(O.referralRequest('printing', 'en'), /no website/);
});

test('WhatsApp links only prefill; invalid numbers give no link', () => {
  assert.equal(O.whatsappLink('+579990000105', 'Hola & gracias'), 'https://wa.me/579990000105?text=Hola%20%26%20gracias');
  assert.equal(O.whatsappLink('123', 'x'), null);
});
