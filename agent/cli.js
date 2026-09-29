#!/usr/bin/env node
/**
 * Supplier Scout agent.
 *
 *   npm run agent -- "Necesito 500 cajas de cartón corrugado cerca de Fontibón, Bogotá, en 7 días" \
 *        --db mis-proveedores.json --out resultado.json
 *
 *   npm run agent -- --dry-run --db mis-proveedores.json --category packaging --qty 500 \
 *        --lat 4.6782 --lng -74.1411 --days 7 --offline
 *
 * Needs ANTHROPIC_API_KEY (environment variable) unless --dry-run, which runs
 * a fixed plan with the same tools and no AI. Optional: GOOGLE_PLACES_API_KEY,
 * SOCRATA_APP_TOKEN.
 *
 * Flags: --db file.json · --out file.json · --country CO · --lang es|en ·
 *        --lat/--lng · --model · --effort low|medium|high · --max-steps 12 ·
 *        --usd 3900 (exchange rate) · --rate 0.015 (monthly opportunity rate) ·
 *        dry run only: --category --qty --unit --days --radius --offline
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../src/core/schema');
const { createToolbox } = require('./tools');
const { runAgent, DEFAULT_MODEL } = require('./loop');
const { parseArgs } = require('../cli/scout');

const HELP = 'Usage: npm run agent -- "what you need and where" [--db my-suppliers.json] [--out result.json]\n' +
  '       npm run agent -- --dry-run --category packaging --qty 500 --lat 4.6782 --lng -74.1411 [--offline]\n' +
  'See the header of agent/cli.js for every flag.';

function loadDb(file, country) {
  if (!file) return Schema.sanitizeDatabase({ country, suppliers: [], quotes: [], referrals: [] });
  return Schema.sanitizeDatabase(JSON.parse(fs.readFileSync(String(file), 'utf8')));
}

/** The same tools in a fixed order, no AI: useful offline, in CI and to compare with the agent. */
async function dryRun(toolbox, args, io) {
  if (!args.category) throw new Error('--dry-run needs --category (and usually --qty, --lat, --lng)');
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  const hasPoint = args.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
  const common = { category: String(args.category), unit: args.unit || 'unidad' };
  await toolbox.run('search_my_database', { category: common.category, text: '' });
  if (hasPoint && !args.offline) {
    try {
      await toolbox.run('search_map', { category: common.category, lat, lng, radius_m: Number(args.radius || 5) * 1000, name_hint: '' });
    } catch (err) {
      io.err(`Map search skipped: ${err.message}`);
    }
  }
  const ranked = await toolbox.run('rank_candidates', Object.assign({}, common, {
    quantity: Number(args.qty) || 1, lat: hasPoint ? lat : NaN, lng: hasPoint ? lng : NaN,
    radius_km: Number(args.radius) || 10, needed_in_days: Number(args.days) || 0, budget: Number(args.budget) || 0,
    priority: args.priority || 'balanced'
  }));
  const top = ranked.ranked.slice(0, 3);
  await toolbox.run('draft_messages', Object.assign({}, common, {
    kind: 'quote_request', supplier_ids: top.map((r) => r.id), item: args.item || '', quantity: Number(args.qty) || 0, needed_in_days: Number(args.days) || 0
  }));
  if (top.length < 3 || top.filter((r) => r.verification === 'unverified').length >= 2) {
    await toolbox.run('draft_messages', Object.assign({}, common, { kind: 'referral_request', supplier_ids: [], item: '', quantity: 0, needed_in_days: 0 }));
  }
  const answer = top.map((r, i) => `${i + 1}. ${r.name} [${r.score}]${r.order_total ? ' · ' + r.order_total : ''}\n   ${r.why.join('\n   ')}`).join('\n');
  return { status: 'done', answer, steps: 0, usage: null, trace: [] };
}

function buildOutput(toolbox, run, context) {
  const ranking = toolbox.lastRanking();
  const base = ranking ? ranking.db : Schema.sanitizeDatabase({
    country: context.country, suppliers: context.db.suppliers.concat(Array.from(toolbox.found.values())),
    quotes: context.db.quotes, referrals: context.db.referrals
  });
  return Object.assign({}, base, {
    generatedAt: new Date().toISOString().slice(0, 10),
    agent: {
      request: context.request,
      mode: context.mode,
      model: context.mode === 'claude' ? context.model : null,
      status: run.status,
      answer: run.answer,
      drafts: toolbox.drafts,
      ranking: ranking ? ranking.result.ranked.slice(0, 10).map((r) => ({ id: r.supplier.id, name: r.supplier.name, score: r.score, total: r.cost ? r.cost.total : null })) : [],
      duplicatesForReview: ranking ? ranking.review : [],
      steps: run.steps,
      usage: run.usage
    }
  });
}

function explainApiError(err, sdk) {
  if (sdk && err instanceof sdk.AuthenticationError) return 'Claude API key missing or invalid. Set ANTHROPIC_API_KEY (or run `ant auth login`), or use --dry-run.';
  if (sdk && err instanceof sdk.PermissionDeniedError) return 'This API key has no access to that model. Try --model with another one.';
  if (sdk && err instanceof sdk.RateLimitError) return 'Rate limited by the Claude API. Wait a minute and retry.';
  if (sdk && err instanceof sdk.BadRequestError) return `The Claude API rejected the request: ${err.message}`;
  if (sdk && err instanceof sdk.APIConnectionError) return 'Could not reach the Claude API (network).';
  if (sdk && err instanceof sdk.APIError) return `Claude API error ${err.status}: ${err.message}`;
  if (/authentication method|api[_ ]?key/i.test(err.message)) {
    return 'No Claude credentials found. Set ANTHROPIC_API_KEY (or run `ant auth login`), or use --dry-run to try it without AI.';
  }
  return err.message;
}

async function main(argv, io, deps = {}) {
  const args = parseArgs(argv);
  const request = args._.join(' ').trim();
  if (args.help || (!request && !args['dry-run'])) {
    io.err(HELP);
    return args.help ? 0 : 1;
  }
  const country = String(args.country || 'CO').toUpperCase();
  const lang = args.lang === 'en' ? 'en' : 'es';
  let sdk = null;
  try {
    const db = loadDb(args.db, country);
    const toolbox = createToolbox({
      db, country, lang, env: deps.env || process.env, fetchImpl: deps.fetchImpl,
      fx: args.usd ? { USD: Number(args.usd) } : {}, monthlyRate: Number(args.rate) || 0
    });
    const hints = [];
    if (args.lat !== undefined) hints.push(`Buyer location: lat ${Number(args.lat)}, lng ${Number(args.lng)}.`);
    const fullRequest = hints.length ? `${request}\n\n(${hints.join(' ')})` : request;
    const mode = args['dry-run'] ? 'dry-run' : 'claude';
    const model = String(args.model || DEFAULT_MODEL);

    let run;
    if (mode === 'dry-run') {
      run = await dryRun(toolbox, args, io);
    } else {
      sdk = deps.sdk || require('@anthropic-ai/sdk');
      const client = deps.client || new sdk.Anthropic(); // credentials from ANTHROPIC_API_KEY or an `ant auth login` profile
      io.err(`Agent running with ${model}. Tools: ${toolbox.names.join(', ')}`);
      run = await runAgent({
        client, toolbox, request: fullRequest, model,
        effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(args.effort) ? args.effort : 'medium',
        maxSteps: Math.min(30, Number(args['max-steps']) || 12),
        onStep: (e) => io.err(`  step ${e.step}: ${e.tools.length ? e.tools.join(', ') : e.stop_reason}`)
      });
    }

    io.out(run.answer || `(no answer: ${run.status})`);
    if (toolbox.drafts.length) {
      io.out(`\n${toolbox.drafts.length} draft message(s) for you to review and send:`);
      toolbox.drafts.forEach((d) => io.out(`\n--- ${d.kind === 'quote_request' ? d.supplierName : 'referral request'}${d.whatsapp ? ' (WhatsApp link in the output file)' : ''}\n${d.text}`));
    }
    if (run.usage) io.err(`\nTokens: ${run.usage.input_tokens} in · ${run.usage.output_tokens} out · ${run.usage.cache_read_input_tokens} from cache`);

    const output = buildOutput(toolbox, run, { country, db, request, mode, model });
    if (args.out) {
      fs.mkdirSync(path.dirname(path.resolve(String(args.out))), { recursive: true });
      fs.writeFileSync(path.resolve(String(args.out)), JSON.stringify(output, null, 2) + '\n');
      io.err(`Saved ${path.resolve(String(args.out))} — import it in the web app to review the new suppliers.`);
    }
    return run.status === 'done' ? 0 : 2;
  } catch (err) {
    io.err(`Error: ${explainApiError(err, sdk)}`);
    return 1;
  }
}

if (require.main === module) {
  const io = { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n') };
  main(process.argv.slice(2), io).then((code) => { process.exitCode = code; });
}

module.exports = { main, dryRun, buildOutput };
