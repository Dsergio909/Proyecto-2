// The agent loop with a scripted stand-in for the Claude API: no network, no key, no cost.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runAgent, DEFAULT_MODEL, FALLBACK_BETA } = require('../agent/loop');
const { createToolbox } = require('../agent/tools');
const { main } = require('../agent/cli');
const Schema = require('../src/core/schema');
const { DATASETS } = require('../src/data/sample');
const { fakeFetch, fixture } = require('./helpers/fake-fetch');

const FONTIBON = { lat: 4.6782, lng: -74.1411 };

function scriptedClient(responses) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params) {
          calls.push(JSON.parse(JSON.stringify(params)));
          const next = responses[calls.length - 1];
          if (!next) throw new Error('script exhausted');
          return Object.assign({ model: DEFAULT_MODEL, usage: { input_tokens: 100, output_tokens: 20 } }, next);
        }
      }
    }
  };
}

function use(id, name, input) {
  return { type: 'tool_use', id, name, input };
}

function toolbox(extra) {
  return createToolbox(Object.assign({
    db: Schema.sanitizeDatabase(DATASETS.bogota), country: 'CO', lang: 'es', env: {},
    fetchImpl: fakeFetch([['overpass', fixture('overpass.json')]]), today: '2026-09-29'
  }, extra || {}));
}

const HAPPY_PATH = [
  { stop_reason: 'tool_use', content: [
    { type: 'text', text: 'Busco primero en tu base y en el mapa.' },
    use('t1', 'search_my_database', { category: 'packaging', text: '' }),
    use('t2', 'search_map', Object.assign({ category: 'packaging', radius_m: 3000, name_hint: '' }, FONTIBON))
  ] },
  { stop_reason: 'tool_use', content: [
    use('t3', 'rank_candidates', Object.assign({ category: 'packaging', quantity: 500, unit: 'unidad', radius_km: 12, needed_in_days: 7, budget: 0, priority: 'balanced' }, FONTIBON))
  ] },
  { stop_reason: 'tool_use', content: [
    use('t4', 'draft_messages', { kind: 'quote_request', supplier_ids: ['bog-empaques-dona-rosa', 'osm-node-9001', 'invented-id'], category: 'packaging', item: 'cajas 40x30x30', quantity: 500, unit: 'unidad', needed_in_days: 7 })
  ] },
  { stop_reason: 'end_turn', content: [{ type: 'text', text: '1. Empaques Doña Rosa… También te recomiendo "Proveedor Inventado SAS".' }] }
];

test('happy path: tools run, results return in one message, answer comes back', async () => {
  const client = scriptedClient(HAPPY_PATH);
  const tb = toolbox();
  const run = await runAgent({ client, toolbox: tb, request: 'Necesito 500 cajas en Fontibón' });
  assert.equal(run.status, 'done');
  assert.equal(run.steps, 4);
  assert.match(run.answer, /Doña Rosa/);
  assert.deepEqual(run.trace.map((t) => t.tools), [['search_my_database', 'search_map'], ['rank_candidates'], ['draft_messages'], []]);

  // Both parallel tool results go back together, in order, in a single user message.
  const second = client.calls[1].messages;
  const results = second[second.length - 1];
  assert.equal(results.role, 'user');
  assert.deepEqual(results.content.map((r) => r.tool_use_id), ['t1', 't2']);
  assert.ok(results.content.every((r) => !r.is_error));
  assert.equal(run.usage.input_tokens, 400);
});

test('request shape: default model, fallback opt-in, effort, strict tools, constant system prompt', async () => {
  const client = scriptedClient(HAPPY_PATH);
  await runAgent({ client, toolbox: toolbox(), request: 'x' });
  const first = client.calls[0];
  assert.equal(first.model, 'claude-opus-5-5');
  assert.deepEqual(first.betas, [FALLBACK_BETA]);
  assert.equal(first.fallbacks, 'default');
  assert.deepEqual(first.output_config, { effort: 'medium' });
  assert.equal(first.tool_choice, undefined, 'no forced tool choice');
  first.tools.forEach((t) => {
    assert.equal(t.strict, true);
    assert.equal(t.input_schema.additionalProperties, false);
    assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort());
  });
  client.calls.forEach((c) => {
    assert.equal(c.system, first.system);
    assert.deepEqual(c.tools, first.tools, 'tools stay identical across steps (cache-friendly)');
  });
});

test('history is append-only: each request extends the previous one unchanged', async () => {
  const client = scriptedClient(HAPPY_PATH);
  await runAgent({ client, toolbox: toolbox(), request: 'x' });
  for (let i = 1; i < client.calls.length; i++) {
    const prev = client.calls[i - 1].messages;
    assert.deepEqual(client.calls[i].messages.slice(0, prev.length), prev);
  }
});

test('candidates come only from tools; invented suppliers never reach the output', async () => {
  const tb = toolbox();
  await runAgent({ client: scriptedClient(HAPPY_PATH), toolbox: tb, request: 'x' });
  const names = Array.from(tb.found.values()).map((s) => s.name);
  assert.ok(names.includes('Cajas Demo El Porvenir'));
  assert.ok(!names.some((n) => /Inventado/.test(n)));
  const quoteDrafts = tb.drafts.filter((d) => d.kind === 'quote_request');
  assert.deepEqual(quoteDrafts.map((d) => d.supplierId), ['bog-empaques-dona-rosa', 'osm-node-9001']);
  assert.match(quoteDrafts[0].whatsapp, /^https:\/\/wa\.me\/579990000105\?text=/);
  assert.ok(Array.from(tb.found.values()).every((s) => s.sources.some((src) => src.type === 'agent')));
});

test('the model never sees phone numbers or emails', async () => {
  const client = scriptedClient(HAPPY_PATH);
  await runAgent({ client, toolbox: toolbox(), request: 'x' });
  const sent = JSON.stringify(client.calls.map((c) => c.messages));
  assert.doesNotMatch(sent, /\+57999|579990000|@[a-z0-9-]+\.example/);
});

test('a failing tool is reported as an error result and the loop continues', async () => {
  const client = scriptedClient([
    { stop_reason: 'tool_use', content: [use('a', 'search_map', { category: 'packaging', lat: 999, lng: 0, radius_m: 1000, name_hint: '' }), use('b', 'send_whatsapp', { to: 'x' })] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'No pude buscar en el mapa.' }] }
  ]);
  const run = await runAgent({ client, toolbox: toolbox(), request: 'x' });
  assert.equal(run.status, 'done');
  const results = client.calls[1].messages.at(-1).content;
  assert.deepEqual(results.map((r) => r.is_error), [true, true]);
  assert.match(results[0].content, /coordinates/);
  assert.match(results[1].content, /Unknown tool/);
});

test('refusal and truncation stop before any tool runs', async () => {
  for (const stop of ['refusal', 'max_tokens']) {
    const tb = toolbox();
    const client = scriptedClient([{ stop_reason: stop, stop_details: stop === 'refusal' ? { type: 'refusal', category: null } : null, content: [use('x', 'search_map', Object.assign({ category: 'packaging', radius_m: 1000, name_hint: '' }, FONTIBON))] }]);
    const run = await runAgent({ client, toolbox: tb, request: 'x' });
    assert.equal(run.status, stop === 'refusal' ? 'refused' : 'truncated');
    assert.equal(tb.found.size, 0);
  }
});

test('pause_turn continues and the step limit caps cost', async () => {
  const paused = { stop_reason: 'pause_turn', content: [{ type: 'text', text: '…' }] };
  const run = await runAgent({ client: scriptedClient([paused, paused, paused]), toolbox: toolbox(), request: 'x', maxSteps: 3 });
  assert.equal(run.status, 'step_limit');
  assert.equal(run.steps, 3);
});

test('optional tools appear only when they can work', () => {
  assert.ok(!toolbox().names.includes('search_google_places'));
  assert.ok(toolbox({ env: { GOOGLE_PLACES_API_KEY: 'demo' } }).names.includes('search_google_places'));
  assert.ok(toolbox().names.includes('search_public_registry'), 'Colombia has SECOP');
  assert.ok(!toolbox({ country: 'MX', db: Schema.sanitizeDatabase(DATASETS.cdmx) }).names.includes('search_public_registry'));
});

test('agent CLI: dry run works offline and writes an importable file', async () => {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-')), 'db.json');
  fs.writeFileSync(dbFile, JSON.stringify(DATASETS.bogota));
  const outFile = dbFile.replace('db.json', 'out.json');
  const out = [];
  const err = [];
  const code = await main(['--dry-run', '--db', dbFile, '--category', 'packaging', '--qty', '500', '--lat', '4.6782', '--lng', '-74.1411', '--days', '7', '--radius', '12', '--offline', '--out', outFile],
    { out: (s) => out.push(s), err: (s) => err.push(s) }, { env: {} });
  assert.equal(code, 0, err.join('\n'));
  assert.match(out.join('\n'), /^1\. Empaques Doña Rosa/);
  const saved = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(saved.agent.mode, 'dry-run');
  assert.equal(saved.agent.drafts.filter((d) => d.kind === 'quote_request').length, 3);
  assert.equal(Schema.sanitizeDatabase(saved).suppliers.length, saved.suppliers.length);
});

test('agent CLI: with a scripted client, the answer and drafts are printed', async () => {
  const out = [];
  const code = await main(['Necesito', '500', 'cajas', '--lat', '4.6782', '--lng', '-74.1411'],
    { out: (s) => out.push(s), err: () => {} },
    { env: {}, client: scriptedClient(HAPPY_PATH), sdk: {}, fetchImpl: fakeFetch([['overpass', fixture('overpass.json')]]) });
  assert.equal(code, 0);
  assert.match(out.join('\n'), /draft message\(s\) for you to review and send/);
});

test('agent CLI: without a request it prints help', async () => {
  const err = [];
  assert.equal(await main([], { out: () => {}, err: (s) => err.push(s) }), 1);
  assert.match(err.join(''), /Usage/);
});
