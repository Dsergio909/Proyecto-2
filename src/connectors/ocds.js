/**
 * Open Contracting Data Standard (OCDS): the format many governments use to
 * publish their public purchases — among them several in Latin America
 * (Paraguay, Mexico, Colombia, Ecuador, Honduras, the Dominican Republic...).
 *
 * Every supplier that bid for or won a public contract is listed there with
 * its tax ID and address, website or not. That makes OCDS a good source of
 * formal suppliers that the web does not show.
 *
 * Accepts what publishers actually ship: a release package ({ releases }), a
 * record package ({ records: [{ compiledRelease | releases }] }), a plain
 * array of releases, or JSON Lines (one release or package per line).
 *
 * Privacy: only the business is imported (name, identifier, address, business
 * email, phone and website). The contact person's name is never copied.
 */
'use strict';

const fs = require('node:fs');
const Countries = require('../core/countries');
const Categories = require('../core/categories');
const Text = require('../core/text');
const { fetchJson, today } = require('./http');

const SUPPLIER_ROLES = ['supplier', 'tenderer'];
const MAX_RELEASES = 50000;
const MAX_SUPPLIERS = 2000; // the import limit of the app
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Text of a file or response -> list of releases, whatever the packaging. */
function releasesFrom(data) {
  const out = [];
  const add = (value) => {
    if (out.length >= MAX_RELEASES || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(add); return; }
    if (Array.isArray(value.releases) && !value.ocid) { value.releases.forEach(add); return; }
    if (Array.isArray(value.records)) {
      value.records.forEach((record) => {
        if (record && record.compiledRelease) add(record.compiledRelease);
        else if (record && Array.isArray(record.releases)) record.releases.forEach(add);
      });
      return;
    }
    if (value.ocid || Array.isArray(value.parties)) out.push(value);
  };
  add(data);
  return out;
}

function parseText(text) {
  const trimmed = String(text || '').replace(/^﻿/, '').trim();
  if (!trimmed) return [];
  try {
    return releasesFrom(JSON.parse(trimmed));
  } catch (err) {
    // JSON Lines: one release (or package) per line.
    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error(`Not valid OCDS JSON: ${err.message}`);
    return releasesFrom(lines.map((line, i) => {
      try { return JSON.parse(line); } catch (e) { throw new Error(`Line ${i + 1} is not valid JSON`); }
    }));
  }
}

/** "PY-RUC" / "MX-RFC" / "CO-RUES" -> "PY" / "MX" / "CO" when we have a profile for it. */
function countryFromScheme(scheme) {
  const code = /^([A-Z]{2})-/.exec(String(scheme || '').toUpperCase());
  return code && Countries.PROFILES[code[1]] && code[1] !== 'XX' ? code[1] : null;
}

function str(value, max) {
  return value == null ? '' : String(value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

function httpsUrl(value) {
  const text = str(value, 300);
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch (err) {
    return null;
  }
}

/** What each party sold or bid for: item descriptions and classifications from awards and tenders. */
function itemsByParty(release) {
  const map = new Map();
  const push = (id, items) => {
    if (!id) return;
    const text = (items || []).map((it) => `${str(it && it.description)} ${str(it && it.classification && it.classification.description)}`).join(' ');
    map.set(id, `${map.get(id) || ''} ${text}`);
  };
  const tenderItems = (release.tender && release.tender.items) || [];
  (release.awards || []).forEach((award) => {
    (award.suppliers || []).forEach((s) => push(s && s.id, (award.items && award.items.length ? award.items : tenderItems)));
  });
  ((release.tender && release.tender.tenderers) || []).forEach((t) => push(t && t.id, tenderItems));
  (release.bids && release.bids.details || []).forEach((bid) => (bid.tenderers || []).forEach((t) => push(t && t.id, tenderItems)));
  return map;
}

function awardedIds(release) {
  const ids = new Set();
  (release.awards || []).forEach((award) => {
    if (award && award.status && award.status !== 'active' && award.status !== 'pending') return;
    (award.suppliers || []).forEach((s) => { if (s && s.id) ids.add(s.id); });
  });
  return ids;
}

/**
 * Releases -> supplier records (merged across releases by identifier, else by name).
 * options: { country, label, keywords, category, at }
 */
function normalizeReleases(releases, options = {}) {
  const fallback = Countries.getProfile(options.country);
  const label = str(options.label, 80) || 'OCDS';
  const keywords = options.keywords ? Text.normalize(options.keywords).split(' ').filter(Boolean) : [];
  const byKey = new Map();

  releases.forEach((release) => {
    const parties = Array.isArray(release.parties) ? release.parties : [];
    const items = itemsByParty(release);
    const awarded = awardedIds(release);
    parties.forEach((party) => {
      if (!party || typeof party !== 'object') return;
      const roles = Array.isArray(party.roles) ? party.roles : [];
      const isSupplier = roles.some((r) => SUPPLIER_ROLES.includes(r)) || awarded.has(party.id);
      if (!isSupplier) return;
      const identifier = party.identifier || {};
      const name = str(party.name || identifier.legalName, 120);
      if (!name) return;
      const profile = Countries.getProfile(countryFromScheme(identifier.scheme) || fallback.code);
      const rawId = str(identifier.id, 40);
      const key = rawId ? `${str(identifier.scheme, 20)}|${rawId.replace(/[\s.\-\/]/g, '').toUpperCase()}` : `name|${Text.normalize(name)}`;
      let entry = byKey.get(key);
      if (!entry) {
        const tax = rawId && profile.code !== 'XX' ? profile.validateTaxId(rawId) : null;
        const address = party.address || {};
        const contact = party.contactPoint || {};
        entry = {
          key,
          supplier: {
            id: `ocds-${(rawId || Text.normalize(name)).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}`,
            name,
            taxId: tax ? { value: tax.normalized, label: profile.taxIdName, country: profile.code, valid: tax.valid, checked: tax.checked } : null,
            phones: [contact.telephone].map((p) => Countries.normalizePhone(str(p, 40), profile.code)).filter(Boolean),
            emails: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(contact.email, 120)) ? [str(contact.email, 120)] : [],
            websites: [httpsUrl(contact.url)].filter(Boolean),
            address: str(address.streetAddress, 200) || null,
            city: str(address.locality, 80) || null,
            region: str(address.region, 80) || null,
            country: profile.code === 'XX' ? null : profile.code,
            lat: null,
            lng: null
          },
          text: '',
          awards: 0,
          bids: 0
        };
        byKey.set(key, entry);
      }
      entry.text += ` ${items.get(party.id) || ''}`;
      if (awarded.has(party.id) || roles.includes('supplier')) entry.awards++;
      else entry.bids++;
    });
  });

  const at = options.at || today();
  let list = [...byKey.values()].map((entry) => {
    const s = entry.supplier;
    s.categories = Categories.detect(`${entry.text} ${s.name}`);
    const counts = [entry.awards ? `${entry.awards} award${entry.awards === 1 ? '' : 's'}` : null, entry.bids ? `${entry.bids} bid${entry.bids === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
    s.sources = [{ type: 'registry', ref: `${label} · ${counts}`, at }];
    // Bidding for or winning a public contract under a tax ID whose check passes: a formal business.
    s.verification = s.taxId && s.taxId.valid === true ? 2 : 0;
    return { s, entry };
  });
  if (options.category) list = list.filter(({ s }) => s.categories.includes(options.category));
  if (keywords.length) {
    list = list.filter(({ s, entry }) => {
      const hay = ` ${Text.normalize(`${s.name} ${entry.text}`)} `;
      return keywords.every((k) => hay.includes(k));
    });
  }
  list.sort((a, b) => b.entry.awards - a.entry.awards || b.entry.bids - a.entry.bids || a.s.name.localeCompare(b.s.name));
  return list.slice(0, MAX_SUPPLIERS).map(({ s }) => s);
}

async function loadOcds(source, options = {}) {
  if (source.file) {
    const size = fs.statSync(String(source.file)).size;
    if (size > MAX_FILE_BYTES) throw new Error(`File too large (${Math.round(size / 1048576)} MB; limit 50 MB). Filter it first.`);
    return parseText(fs.readFileSync(String(source.file), 'utf8'));
  }
  if (source.url) {
    if (!/^https:\/\//i.test(String(source.url))) throw new Error('--url must start with https://');
    return releasesFrom(await fetchJson(String(source.url), { fetchImpl: options.fetchImpl, maxBytes: 20 * 1024 * 1024 }));
  }
  throw new Error('Pass --file (release/record package or JSON Lines) or --url (https)');
}

async function searchOcds(source, query = {}, options = {}) {
  const releases = await loadOcds(source, options);
  const suppliers = normalizeReleases(releases, Object.assign({}, query, { at: options.at }));
  return { suppliers, releases: releases.length };
}

module.exports = { releasesFrom, parseText, countryFromScheme, normalizeReleases, loadOcds, searchOcds, MAX_SUPPLIERS };
