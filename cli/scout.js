#!/usr/bin/env node
/**
 * Supplier Scout CLI (no AI). Every command writes the same JSON database
 * format the web app imports.
 *
 *   node cli/scout.js osm      --category packaging --lat 4.6782 --lng -74.1411 [--radius 3000] [--country CO]
 *   node cli/scout.js registry --preset secop-co --q "carton corrugado" [--city Bogota] [--limit 50]
 *   node cli/scout.js registry --preset secop-co --describe
 *   node cli/scout.js registry --domain https://data.example.gov --dataset abcd-1234 --country XX --q "..."   (any Socrata portal)
 *   node cli/scout.js places   --q "cajas de carton" --lat 4.6782 --lng -74.1411 [--radius 5000]   (needs GOOGLE_PLACES_API_KEY)
 *   node cli/scout.js csv      --file expositores.csv --country CO [--source import|registry]
 *   node cli/scout.js merge    a.json b.json
 *   node cli/scout.js rank     --db all.json --category packaging --qty 500 [--unit unidad] [--lat .. --lng ..] [--radius 12] [--preset cheapest] [--lang en]
 *
 * Common flags: --out file.json (default: stdout), --country CO.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Schema = require('../src/core/schema');
const Dedupe = require('../src/core/dedupe');
const Score = require('../src/core/score');
const Messages = require('../src/core/messages');
const Csv = require('../src/core/csv');
const Countries = require('../src/core/countries');
const osm = require('../src/connectors/osm');
const socrata = require('../src/connectors/socrata');
const places = require('../src/connectors/places');
const { today } = require('../src/connectors/http');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function database(country, suppliers, extra) {
  return Object.assign(
    Schema.sanitizeDatabase({ country, suppliers, quotes: [], referrals: [] }),
    { generatedAt: today() },
    extra || {}
  );
}

function readDb(file) {
  return Schema.sanitizeDatabase(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function emit(args, data, io) {
  const json = JSON.stringify(data, null, 2) + '\n';
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(String(args.out))), { recursive: true });
    fs.writeFileSync(path.resolve(String(args.out)), json);
    io.err(`Saved ${path.resolve(String(args.out))}`);
  } else {
    io.out(json);
  }
}

function summary(db, io) {
  const offline = db.suppliers.filter(Schema.isOffline).length;
  io.err(`${db.suppliers.length} suppliers · ${offline} without a website`);
}

const commands = {
  async osm(args, io, deps) {
    const country = args.country || 'CO';
    const result = await osm.searchOsm(
      { category: args.category, lat: args.lat, lng: args.lng, radiusM: args.radius, nameHint: args.name, country, at: today() },
      { fetchImpl: deps.fetchImpl }
    );
    const db = database(country, result.suppliers, { attribution: result.attribution });
    summary(db, io);
    emit(args, db, io);
  },

  async registry(args, io, deps) {
    const target = args.dataset
      ? { domain: String(args.domain || ''), dataset: String(args.dataset), country: String(args.country || 'XX').toUpperCase(), label: String(args.dataset), source: 'registry' }
      : args.preset || 'secop-co';
    if (args.describe) {
      const info = await socrata.describe(target, { fetchImpl: deps.fetchImpl });
      io.err(`${info.name}`);
      emit(args, info, io);
      return;
    }
    const preset = socrata.resolve(target);
    const result = await socrata.searchSocrata(target, { keywords: args.q, city: args.city, limit: args.limit }, { fetchImpl: deps.fetchImpl });
    const db = database(preset.country, result.suppliers, { dataset: result.dataset });
    summary(db, io);
    emit(args, db, io);
  },

  async places(args, io, deps) {
    const country = args.country || 'CO';
    const result = await places.searchPlaces(
      { query: args.q, lat: args.lat, lng: args.lng, radiusM: args.radius, category: args.category, country, regionCode: country, languageCode: args.lang || 'es' },
      { fetchImpl: deps.fetchImpl }
    );
    const db = database(country, result.suppliers);
    summary(db, io);
    emit(args, db, io);
  },

  async csv(args, io) {
    if (!args.file) throw new Error('--file is required');
    const country = args.country || 'CO';
    const out = Csv.importSuppliers(fs.readFileSync(String(args.file), 'utf8'), {
      country, source: args.source === 'registry' ? 'registry' : 'import', ref: path.basename(String(args.file)), today: today()
    });
    io.err(`Columns recognised: ${Object.keys(out.mapping).join(', ') || 'none'}` +
      (out.unmapped.length ? ` · ignored: ${out.unmapped.join(', ')}` : '') + (out.skipped ? ` · ${out.skipped} rows without a name` : ''));
    const db = database(country, out.suppliers);
    summary(db, io);
    emit(args, db, io);
  },

  async merge(args, io) {
    if (!args._.length) throw new Error('Pass one or more JSON files to merge');
    const dbs = args._.map(readDb);
    let combined = { version: 1, country: dbs[0].country, suppliers: [], quotes: [], referrals: [] };
    dbs.forEach((db, n) => {
      const prefix = `f${n + 1}-`;
      const rename = (id) => (id && !id.startsWith('person:') ? prefix + id : id);
      combined.suppliers.push(...db.suppliers.map((s) => Object.assign({}, s, { id: rename(s.id) })));
      combined.quotes.push(...db.quotes.map((q) => Object.assign({}, q, { id: rename(q.id), supplierId: rename(q.supplierId) })));
      combined.referrals.push(...db.referrals.map((r) => Object.assign({}, r, { id: rename(r.id), from: rename(r.from), to: rename(r.to) })));
    });
    const result = Dedupe.autoMerge(Schema.sanitizeDatabase(combined));
    io.err(`${result.merged.length} merged automatically · ${result.review.length} possible duplicates for a person to review`);
    result.review.forEach((p) => io.err(`  review: ${p.a} ~ ${p.b} (${p.tier})`));
    emit(args, Object.assign(result.db, { review: result.review }), io);
  },

  async rank(args, io) {
    if (!args.db) throw new Error('--db is required');
    const db = readDb(String(args.db));
    const country = args.country || db.country || 'CO';
    const lang = args.lang === 'en' ? 'en' : 'es';
    const need = {
      category: args.category || null,
      quantity: Number(args.qty) || 1,
      unit: args.unit || 'unidad',
      radiusKm: Number(args.radius) || 10,
      neededInDays: Number(args.days) || null,
      budget: Number(args.budget) || null,
      origin: args.lat !== undefined ? { lat: Number(args.lat), lng: Number(args.lng) } : null,
      weights: Score.PRESETS[args.preset] || Score.PRESETS.balanced
    };
    const fx = args.usd ? { USD: Number(args.usd) } : {};
    const result = Score.rankSuppliers(db, need, { country, fx, monthlyRate: Number(args.rate) || 0 });
    result.ranked.forEach((r) => {
      io.out(`${String(r.rank).padStart(2)}. [${String(r.score).padStart(3)}] ${r.supplier.name}` +
        (r.cost ? ` · ${Countries.formatMoney(r.cost.total, country)}` : ''));
      r.evidence.concat(r.warnings).forEach((e) => io.out(`      - ${Messages.explain(e, lang, { country })}`));
    });
    result.excluded.forEach((x) => io.out(`   ✗ ${x.supplier.name}: ${Messages.explain(x.reason, lang, { country })}`));
  }
};

async function main(argv, io, deps) {
  const args = parseArgs(argv);
  const name = args._.shift();
  if (!name || !commands[name]) {
    io.err('Usage: node cli/scout.js <osm|registry|places|csv|merge|rank> [options]  (see the header of cli/scout.js)');
    return 1;
  }
  try {
    await commands[name](args, io, deps || {});
    return 0;
  } catch (err) {
    io.err(`Error: ${err.message}`);
    return 1;
  }
}

if (require.main === module) {
  const io = { out: (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n'), err: (s) => process.stderr.write(s + '\n') };
  main(process.argv.slice(2), io).then((code) => { process.exitCode = code; });
}

module.exports = { main, parseArgs };
