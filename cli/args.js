/**
 * Minimal command-line parser shared by cli/scout.js and agent/cli.js:
 * "--key value" pairs, "--flag" booleans and positional arguments. No dependency.
 */
'use strict';

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

module.exports = { parseArgs };
