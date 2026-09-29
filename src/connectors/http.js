/**
 * Small fetch wrapper shared by the connectors: timeout, size limit, a
 * descriptive User-Agent (OpenStreetMap's usage policy asks for one) and an
 * injectable fetch so tests never touch the network.
 */
'use strict';

const USER_AGENT = 'supplier-scout/1.0 (+https://github.com/Dsergio909/supplier-scout)';
const MAX_BYTES = 5 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${String(body || '').slice(0, 200)}`);
    this.status = status;
  }
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available (Node 18+ required)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  try {
    const res = await fetchImpl(url, {
      method: options.method || 'GET',
      headers: Object.assign({ 'User-Agent': USER_AGENT, Accept: 'application/json' }, options.headers || {}),
      body: options.body,
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text);
    if (text.length > MAX_BYTES) throw new Error('Response too large');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { fetchJson, HttpError, USER_AGENT, today };
