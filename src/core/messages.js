/**
 * Supplier Scout — human-readable explanations (ES / EN).
 *
 * The core returns evidence and warnings as codes ({ code, ...params }).
 * This file turns them into sentences for the web app, the CLI and the agent.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Countries = isNode ? require('./countries') : root.ScoutCountries;

  function km(value) {
    return value < 1 ? Math.round(value * 1000) + ' m' : (Math.round(value * 10) / 10) + ' km';
  }

  var LEVELS = {
    es: ['Sin verificar', 'Contactado', 'Formal (ID tributario verificado)', 'Visitado / muestra recibida', 'Ya le compramos'],
    en: ['Unverified', 'Contacted', 'Formal (tax ID checked)', 'Visited / sample received', 'Bought from before']
  };

  var SOURCES = {
    es: { web: 'En línea', map: 'Mapa', registry: 'Registro público', referral: 'Referido', field: 'Campo', import: 'Importado', agent: 'Agente IA' },
    en: { web: 'Online', map: 'Map', registry: 'Public registry', referral: 'Referral', field: 'Field', import: 'Imported', agent: 'AI agent' }
  };

  var BASIS = {
    es: { none: 'sin reseñas: valor neutro', external: 'reseñas en línea', internal: 'reseñas de tu equipo', both: 'reseñas en línea y de tu equipo' },
    en: { none: 'no reviews: neutral value', external: 'online reviews', internal: 'your team\'s reviews', both: 'online and team reviews' }
  };

  var TEXT = {
    es: {
      price: function (p, c) { return 'Tu pedido cuesta ' + c.money(p.total) + ' en total (' + c.money(p.unitCost) + ' por unidad, con impuestos y envío)' + (p.paymentDays ? '; paga a ' + p.paymentDays + ' días' : '') + '.'; },
      rating: function (p) {
        var parts = [p.external ? p.external + ' en línea' : null, p.internal ? p.internal + ' de tu equipo' : null].filter(Boolean);
        return 'Calificación ajustada ' + p.value.toFixed(1) + '/5 (' + (parts.length ? 'reseñas: ' + parts.join(' + ') : BASIS.es.none) + ').';
      },
      distance: function (p) { return 'A ' + km(p.km) + ' de tu punto de búsqueda.'; },
      ships: function () { return 'Hace envíos: la distancia pesa menos.'; },
      trust: function (p) { return 'Confianza: ' + LEVELS.es[p.level] + (p.referrers ? ', recomendado por ' + p.referrers + (p.referrers === 1 ? ' fuente independiente' : ' fuentes independientes') + (p.mutual ? ' (' + p.mutual + ' mutua)' : '') : '') + '.'; },
      speed: function (p) { return 'Entrega en ' + p.days + (p.days === 1 ? ' día.' : ' días.'); },
      offline: function () { return 'Sin página web: encontrado fuera de internet (mapa, registro, referido o campo).'; },
      no_quote: function () { return 'Aún no hay cotización: el precio cuenta como neutro. Pide una.'; },
      too_slow: function (p) { return 'Tarda ' + p.days + ' días y lo necesitas en ' + p.needed + '.'; },
      over_budget: function (p, c) { return 'Supera tu presupuesto (' + c.money(p.total) + ' > ' + c.money(p.budget) + ').'; },
      below_moq: function (p) { return 'Compra mínima: ' + p.minOrder + ' ' + p.unit + '; el total ya la incluye.'; },
      overbuy: function (p) { return 'Por el tamaño del paquete compras ' + p.extra + ' ' + p.unit + ' de más.'; },
      fx_manual: function (p) { return 'Precio en ' + p.currency + ' convertido con tu tasa manual (' + p.rate + ').'; },
      fx_missing: function (p) { return 'Falta la tasa de cambio para ' + p.currency + '.'; },
      unit_mismatch: function (p) { return 'La cotización está en ' + p.quoteUnit + ' y pediste ' + p.needUnit + '.'; },
      unit_unknown: function () { return 'Unidad de la cotización no reconocida.'; },
      unverified: function () { return 'Nadie lo ha verificado todavía.'; },
      unknown_location: function () { return 'Sin ubicación exacta: la distancia cuenta como neutra.'; },
      no_consent: function () { return 'Sin autorización para tratar sus datos personales.'; },
      out_of_radius: function (p) { return 'Fuera de tu radio (' + km(p.km) + ') y no hace envíos.'; },
      tax_id_invalid: function (p) { return 'El ID tributario ' + p.value + ' no pasa la verificación' + (p.expected != null ? ' (dígito esperado: ' + p.expected + ')' : '') + '.'; },
      phone_unparsed: function (p) { return 'No pude interpretar el teléfono "' + p.raw + '".'; },
      name_missing: function () { return 'No encontré el nombre del proveedor.'; },
      category_missing: function () { return 'No reconocí qué vende: elige la categoría.'; },
      no_contact: function () { return 'No hay forma de contacto (teléfono, correo, web o redes).'; },
      tax_unknown: function (p) { return 'No dice si "' + (p.item || 'el precio') + '" incluye impuestos.'; },
      moq_unresolved: function (p) { return 'Pedido mínimo "' + p.qty + ' ' + p.unit + '": confirma cuántas unidades son.'; },
      tax_id: function (p) { return p.label + (p.valid === true ? ' válido' : p.valid === false ? ' inválido' : ' sin dígito de verificación') + '.'; },
      name: function (p) { return { heading: 'Nombre tomado del encabezado.', intro: 'Nombre tomado de la presentación ("somos...").', first_line: 'Nombre tomado de la primera línea.' }[p.how]; },
      same_tax_id: function () { return 'Mismo ID tributario.'; },
      same_phone: function () { return 'Mismo teléfono.'; },
      same_email: function () { return 'Mismo correo.'; },
      same_domain: function (p) { return 'Mismo dominio corporativo (' + p.domain + ').'; },
      similar_name: function (p) { return 'Nombre parecido (' + Math.round(p.similarity * 100) + '%)' + (p.km != null ? ' a ' + km(p.km) : '') + '.'; },
      tax_conflict: function () { return 'Pero tienen IDs tributarios distintos: podrían ser dos empresas.'; },
      ambiguous: function () { return 'Coincide con más de un registro: decide tú.'; }
    },
    en: {
      price: function (p, c) { return 'Your order costs ' + c.money(p.total) + ' in total (' + c.money(p.unitCost) + ' per unit, tax and shipping included)' + (p.paymentDays ? '; pay in ' + p.paymentDays + ' days' : '') + '.'; },
      rating: function (p) {
        var parts = [p.external ? p.external + ' online' : null, p.internal ? p.internal + ' from your team' : null].filter(Boolean);
        return 'Adjusted rating ' + p.value.toFixed(1) + '/5 (' + (parts.length ? 'reviews: ' + parts.join(' + ') : BASIS.en.none) + ').';
      },
      distance: function (p) { return km(p.km) + ' from your search point.'; },
      ships: function () { return 'Delivers: distance matters less.'; },
      trust: function (p) { return 'Trust: ' + LEVELS.en[p.level] + (p.referrers ? ', recommended by ' + p.referrers + ' independent source' + (p.referrers === 1 ? '' : 's') + (p.mutual ? ' (' + p.mutual + ' mutual)' : '') : '') + '.'; },
      speed: function (p) { return 'Delivers in ' + p.days + (p.days === 1 ? ' day.' : ' days.'); },
      offline: function () { return 'No website: found offline (map, registry, referral or field).'; },
      no_quote: function () { return 'No quote yet: price counts as neutral. Ask for one.'; },
      too_slow: function (p) { return 'Takes ' + p.days + ' days and you need it in ' + p.needed + '.'; },
      over_budget: function (p, c) { return 'Over your budget (' + c.money(p.total) + ' > ' + c.money(p.budget) + ').'; },
      below_moq: function (p) { return 'Minimum order: ' + p.minOrder + ' ' + p.unit + '; the total already includes it.'; },
      overbuy: function (p) { return 'Pack size makes you buy ' + p.extra + ' ' + p.unit + ' extra.'; },
      fx_manual: function (p) { return 'Price in ' + p.currency + ' converted at your manual rate (' + p.rate + ').'; },
      fx_missing: function (p) { return 'Missing exchange rate for ' + p.currency + '.'; },
      unit_mismatch: function (p) { return 'Quote is per ' + p.quoteUnit + ' and you asked for ' + p.needUnit + '.'; },
      unit_unknown: function () { return 'Quote unit not recognised.'; },
      unverified: function () { return 'Nobody has verified it yet.'; },
      unknown_location: function () { return 'No exact location: distance counts as neutral.'; },
      no_consent: function () { return 'No consent to process their personal data.'; },
      out_of_radius: function (p) { return 'Outside your radius (' + km(p.km) + ') and does not deliver.'; },
      tax_id_invalid: function (p) { return 'Tax ID ' + p.value + ' fails its check' + (p.expected != null ? ' (expected check digit: ' + p.expected + ')' : '') + '.'; },
      phone_unparsed: function (p) { return 'Could not read the phone "' + p.raw + '".'; },
      name_missing: function () { return 'Could not find the supplier name.'; },
      category_missing: function () { return 'Could not tell what they sell: pick the category.'; },
      no_contact: function () { return 'No way to contact them (phone, email, web or social).'; },
      tax_unknown: function (p) { return 'Does not say whether "' + (p.item || 'the price') + '" includes tax.'; },
      moq_unresolved: function (p) { return 'Minimum order "' + p.qty + ' ' + p.unit + '": confirm how many units that is.'; },
      tax_id: function (p) { return p.label + (p.valid === true ? ' valid' : p.valid === false ? ' invalid' : ' without check digit') + '.'; },
      name: function (p) { return { heading: 'Name taken from the heading.', intro: 'Name taken from the introduction ("we are...").', first_line: 'Name taken from the first line.' }[p.how]; },
      same_tax_id: function () { return 'Same tax ID.'; },
      same_phone: function () { return 'Same phone.'; },
      same_email: function () { return 'Same email.'; },
      same_domain: function (p) { return 'Same corporate domain (' + p.domain + ').'; },
      similar_name: function (p) { return 'Similar name (' + Math.round(p.similarity * 100) + '%)' + (p.km != null ? ' ' + km(p.km) + ' apart' : '') + '.'; },
      tax_conflict: function () { return 'But their tax IDs differ: they may be two companies.'; },
      ambiguous: function () { return 'Matches more than one record: you decide.'; }
    }
  };

  /** item: { code, ...params }. ctx: { country, currency } for money formatting. */
  function explain(item, lang, ctx) {
    var table = TEXT[lang] || TEXT.es;
    var fn = table[item.code];
    if (!fn) return item.code;
    var c = ctx || {};
    var helpers = {
      money: function (amount) { return Countries.formatMoney(amount, c.country, c.currency); }
    };
    return fn(item, helpers);
  }

  var api = { explain: explain, LEVELS: LEVELS, SOURCES: SOURCES, formatKm: km };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutMessages = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
