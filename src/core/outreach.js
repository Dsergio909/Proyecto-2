/**
 * Supplier Scout — outreach messages.
 *
 * Two messages do most of the work of finding offline suppliers:
 *  1. a quote request (RFQ) that asks for everything needed to compare
 *     fairly: unit, tax, shipping, minimum order, lead time and payment terms;
 *  2. a referral request ("who do you buy X from?"), sent to current
 *     suppliers and colleagues. This is how suppliers with no web presence
 *     are found: through people who already buy from them.
 *
 * The app and the agent only DRAFT these messages. A person sends them.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Categories = isNode ? require('./categories') : root.ScoutCategories;

  var UNIT_LABEL = {
    es: { unidad: 'unidades', unit: 'unidades', kg: 'kg', m: 'metros', l: 'litros', docena: 'docenas' },
    en: { unidad: 'units', unit: 'units', kg: 'kg', m: 'metres', l: 'litres', docena: 'dozen' }
  };

  function categoryLabel(id, lang) {
    var cat = Categories.byId(id);
    return cat ? cat.label[lang] || cat.label.es : id;
  }

  /** need: { category, item, quantity, unit, neededInDays, deliveryZone }. */
  function rfqMessage(need, supplierName, lang) {
    var l = lang === 'en' ? 'en' : 'es';
    var what = need.item || categoryLabel(need.category, l).toLowerCase();
    var unit = UNIT_LABEL[l][need.unit] || need.unit || '';
    var qty = need.quantity ? need.quantity + ' ' + unit + ' ' : '';
    if (l === 'en') {
      return [
        'Hello' + (supplierName ? ' ' + supplierName : '') + ', this is [your name] from [your company].',
        'We are requesting quotes for ' + qty + 'of ' + what + (need.deliveryZone ? ', delivered to ' + need.deliveryZone : '') +
          (need.neededInDays ? ', needed within ' + need.neededInDays + ' days' : '') + '.',
        'Could you send us: unit price and pack size, whether tax is included, shipping cost, minimum order, lead time and payment terms?',
        'Thank you!'
      ].join('\n');
    }
    return [
      'Hola' + (supplierName ? ' ' + supplierName : '') + ', le escribe [tu nombre] de [tu empresa].',
      'Estamos cotizando ' + qty + 'de ' + what + (need.deliveryZone ? ', con entrega en ' + need.deliveryZone : '') +
        (need.neededInDays ? ', para dentro de ' + need.neededInDays + ' días' : '') + '.',
      '¿Nos podría enviar: precio unitario y presentación (caja, paquete...), si incluye IVA, costo de envío, pedido mínimo, tiempo de entrega y forma de pago?',
      '¡Muchas gracias!'
    ].join('\n');
  }

  /** "Who do you buy X from?" for current suppliers and colleagues. */
  function referralRequest(category, lang) {
    var l = lang === 'en' ? 'en' : 'es';
    var what = categoryLabel(category, l).toLowerCase();
    if (l === 'en') {
      return [
        'Hi! Quick question: we are looking for a reliable supplier of ' + what + '.',
        'Is there anyone you buy from, or would recommend, even if they have no website or only sell by phone or WhatsApp?',
        'A name and a phone number would be great. Thanks!'
      ].join('\n');
    }
    return [
      '¡Hola! Una consulta rápida: estamos buscando un proveedor confiable de ' + what + '.',
      '¿Hay alguien a quien le compres o que nos recomiendes, aunque no tenga página web o solo venda por teléfono o WhatsApp?',
      'Con un nombre y un número nos sirve muchísimo. ¡Gracias!'
    ].join('\n');
  }

  /** wa.me link with the message pre-filled, or null without a phone. Opens WhatsApp; nothing is sent automatically. */
  function whatsappLink(e164, message) {
    var digits = String(e164 || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '');
  }

  var api = { rfqMessage: rfqMessage, referralRequest: referralRequest, whatsappLink: whatsappLink };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutOutreach = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
