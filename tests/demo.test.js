// Static guards for the demo page: it must deploy as-is to GitHub Pages and stay locked down.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'demo', 'app.js'), 'utf8');

test('every script the page loads exists and is one Pages deploys (demo/, src/core, src/data)', () => {
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 10);
  for (const src of srcs) {
    const file = path.join(root, 'demo', src);
    assert.ok(fs.existsSync(file), src);
    assert.match(path.relative(root, file), /^(demo|src[\\/](core|data))[\\/]/, src);
  }
});

test('strict Content-Security-Policy: own scripts only, no network calls, no inline code', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)|<script(?![^>]*src=)[^>]*>/, 'no inline scripts');
  assert.doesNotMatch(html, /\son[a-z]+="/i, 'no inline event handlers');
});

test('the app never renders untrusted text as HTML', () => {
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test('the core modules the page uses do not touch the network', () => {
  for (const file of fs.readdirSync(path.join(root, 'src', 'core'))) {
    const code = fs.readFileSync(path.join(root, 'src', 'core', file), 'utf8');
    assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon/, file);
  }
});
