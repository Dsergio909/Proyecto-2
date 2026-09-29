// A fetch stand-in: routes by URL, records every call, never touches the network.
const fs = require('node:fs');
const path = require('node:path');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

function fakeFetch(routes) {
  const calls = [];
  async function fetch(url, init) {
    calls.push({ url, init: init || {} });
    const route = routes.find(([match]) => (match instanceof RegExp ? match.test(url) : url.includes(match)));
    if (!route) return { ok: false, status: 404, text: async () => 'no route for ' + url };
    const [, body, status] = route;
    return { ok: (status || 200) < 400, status: status || 200, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  }
  fetch.calls = calls;
  return fetch;
}

module.exports = { fakeFetch, fixture };
