/**
 * Supplier Scout — field capture.
 *
 * Many good suppliers are not on the web: a workshop with a hand-painted
 * sign, a distributor who sells only through WhatsApp, the person a
 * colleague recommended. What you *do* get from them is text: a business
 * card, a flyer, a WhatsApp message with prices.
 *
 * parseCapture() turns that text into a draft supplier record. It is
 * deliberately rule-based (no AI, no network): it runs offline in the
 * browser, it is predictable, and each field carries its evidence and a
 * confidence so a person can check it. Every capture goes to human review.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Text = isNode ? require('./text') : root.ScoutText;
  var Countries = isNode ? require('./countries') : root.ScoutCountries;
  var Categories = isNode ? require('./categories') : root.ScoutCategories;
  var Quotes = isNode ? require('./quotes') : root.ScoutQuotes;

  var MAX_INPUT = 5000;

  var EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
  var HAS_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
  var URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|mx|pe|cl|ar|br|es|us|io|shop|store|site|online|example)(?:\.[a-z]{2})?(?:\/[^\s,;]*)?/gi;
  var SOCIAL_RE = /(?:\b(?:instagram|insta|ig|facebook|fb|tiktok)\b\s*[:\-]?\s*@?|(?:^|\s)@)([a-z0-9._]{3,30})/gi;
  var PHONE_RE = /(?:\+|\b00)?\d[\d\s().\-]{5,18}\d/g;

  var TAX_LABELS = 'N\\.?I\\.?T\\.?|RUT|RUC|CUIT|CUIL|RFC|CNPJ|EIN|NIF|CIF|TAX\\s?ID|VAT';
  var TAX_LABEL_RE = new RegExp('(?:^|[^A-Z])(?:' + TAX_LABELS + ')(?![A-Z])', 'i');
  var TAX_RE = new RegExp('(?:^|[^A-Z])(' + TAX_LABELS + ')(?![A-Z])\\s*(?:No\\.?|N[°º]|#|:|\\.)?\\s*:?\\s*([A-Z0-9Ñ&][A-Z0-9Ñ&.\\-\\/]{5,19})', 'i');

  var CURRENCY_WORDS = {
    '$': null, 'us$': 'USD', usd: 'USD', dolares: 'USD', dollars: 'USD', cop: 'COP', mxn: 'MXN', pen: 'PEN',
    's/': 'PEN', 's/.': 'PEN', soles: 'PEN', clp: 'CLP', ars: 'ARS', 'r$': 'BRL', brl: 'BRL', reales: 'BRL',
    '€': 'EUR', eur: 'EUR', euros: 'EUR', pesos: null, lucas: null
  };
  // Four shapes: "$18.500" / "USD 2.10", "50 mil pesos" / "20 soles", a bare "150 mil",
  // and a bare number right before a unit marker: "3.200 c/u", "4.500/kg".
  var MONEY_RE = new RegExp([
    '(US\\$|R\\$|S\\/\\.?|\\$|€|\\b(?:USD|COP|MXN|PEN|CLP|ARS|BRL|EUR)\\b)\\s?(\\d[\\d.,]*)\\s*(mil|k|millones|mill[oó]n|mm)?\\b',
    '\\b(\\d[\\d.,]*)\\s*(mil|k|millones|mill[oó]n)?\\s*(pesos|soles|reales|euros|d[oó]lares|dollars|lucas|usd|cop|mxn|pen|clp|ars|brl|eur)\\b',
    '\\b(\\d[\\d.,]*)\\s*(mil|millones|mill[oó]n)\\b',
    '\\b(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)\\s*(?=c\\/u\\b|cada\\s+un[oa]\\b|\\/\\s*(?:und|unidad|u|kg|kilo|m|metro|l|litro)\\b)'
  ].join('|'), 'gi');

  // "caja x 100", "paquete de 50 und", "x100", "por 12".
  var PACK_EXPLICIT_RE = /(?:\b(?:caja|paquete|bolsa|rollo|bulto|paca|pack|box)\s*(?:x|de|por|con|of)\s*|(?:^|\s)x\s*|\bpor\s+)(\d+(?:[.,]\d+)?)\s*(unidades|unidad|und|uds|u|piezas|pzas|kg|kilos|g|gr|gramos|m|metros|mts|l|litros|ml|hojas|units|pcs)?\b/i;
  var PACK_WORD_RE = /(?:\/\s*|\b(?:el|la|por|x|per)\s+)?\b(docena|ciento|millar|par|resma|kilo|kg|libra|lb|metro|mt|litro|gal[oó]n|unidad|und|c\/u|cu|each|ea|unit)\b/i;

  // A street keyword with a number somewhere after it ("Cra 68 # 13-45", "Av. Boyacá # 12-30").
  var STREET_RE = /\b(calle|cl|cll|carrera|cra|kra|kr|avenida|av|ak|ac|diagonal|dg|transversal|tv|autopista|km|kil[oó]metro|manzana|mz|street|avenue|ave|road|rua|calzada|jir[oó]n|jr|pasaje|psje)\b\.?(?=[^\n]*\d)/i;
  var ADDRESS_STOP_RE = /\s*(?:\b(?:tel|tels|tel[eé]fono|cel|celular|whatsapp|wsp|wpp|m[oó]vil|phone|correo|email|e-mail|nit|rut|ruc|rfc|cuit|cnpj|horario)\b|\|).*$/i;
  var GREETING_RE = /^(hola|buenas|buenos|buen d[ií]a|saludos|cordial|hi|hello|good (morning|afternoon)|ol[aá]|bom dia)\b/i;
  var COMPANY_SUFFIX_RE = /\b(s\.?a\.?s\.?|ltda\.?|s\.?a\.?|e\.?u\.?|& c[ií]a\.?|sa de cv|s\.? de r\.?l\.?|srl|spa|eirl|s\.?a\.?c\.?|llc|inc\.?|ltd\.?|me|epp)\s*$/i;

  var CITIES = [
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta',
    'Ibagué', 'Santa Marta', 'Villavicencio', 'Pasto', 'Montería', 'Neiva', 'Armenia', 'Soacha', 'Chía', 'Funza',
    'Mosquera', 'Cota', 'Tunja', 'Ciudad de México', 'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Querétaro',
    'Lima', 'Arequipa', 'Trujillo', 'Santiago', 'Valparaíso', 'Concepción', 'Buenos Aires', 'Córdoba', 'Rosario',
    'Mendoza', 'São Paulo', 'Rio de Janeiro', 'Madrid', 'Barcelona', 'Valencia', 'Miami'
  ];

  function unique(list) {
    var seen = new Set();
    return list.filter(function (item) {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  function blank(text, fragment) {
    return text.split(fragment).join(' '.repeat(fragment.length));
  }

  /** Blank an amount only where it stands alone: "20" in "c/u 20" but never inside "999 000 1220". */
  function blankAmount(text, fragment) {
    var core = fragment.trim();
    if (!core) return text;
    var escaped = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('(^|[^\\d])' + escaped + '(?![\\d])', 'g'), function (match, before) {
      return before + ' '.repeat(match.length - before.length);
    });
  }

  function cleanItem(text) {
    return text
      .replace(/[\s:;,.\-–—=*•·|]+$/g, '')
      .replace(/^[\s:;,.\-–—=*•·|]+/g, '')
      .replace(/^(?:de|del|la|el|x|por|a|for|of)\s+/i, '')
      .replace(/\s+(?:a|de|por|x)$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ---------- tax ID ----------

  function extractTaxId(text, country) {
    var match = TAX_RE.exec(text);
    if (!match) return null;
    var label = match[1].toUpperCase().replace(/\s/g, ' ');
    var value = match[2].replace(/[.\-\/]+$/, '');
    var selected = Countries.getProfile(country);
    var result = selected.validateTaxId(value);
    var usedCountry = selected.code;
    if (result.valid === false) {
      var labelCountry = Countries.countryForTaxLabel(label.replace(/\s/g, ''));
      if (labelCountry && labelCountry !== selected.code) {
        var alt = Countries.getProfile(labelCountry).validateTaxId(value);
        if (alt.valid !== false) {
          result = alt;
          usedCountry = labelCountry;
        }
      }
    }
    return { label: label, raw: value, country: usedCountry, fragment: match[2], result: result };
  }

  // ---------- prices ----------

  function detectPack(line, country) {
    var explicit = PACK_EXPLICIT_RE.exec(line);
    if (explicit) {
      var qty = Quotes.parseNumber(explicit[1]);
      var unitWord = explicit[2] || 'unidad';
      if (/hojas|units|pcs/i.test(unitWord)) unitWord = 'unidad';
      if (isFinite(qty) && qty > 0 && Quotes.toBase(qty, unitWord, country)) {
        return { qty: qty, unit: Text.normalize(unitWord), text: explicit[0], confidence: 'high' };
      }
    }
    var word = PACK_WORD_RE.exec(line);
    if (word) {
      var unit = Text.normalize(word[1]).replace(/\s/g, '');
      if (unit === 'cu' || unit === 'c/u') unit = 'unidad';
      if (Quotes.toBase(1, unit, country)) return { qty: 1, unit: unit, text: word[0], confidence: 'high' };
    }
    return { qty: 1, unit: 'unidad', text: '', confidence: 'low' };
  }

  function taxFlag(text) {
    if (/\b(iva|igv|tax)\s+inclu[ií]d[oa]|\binclu(ye|ido)\s+(iva|igv|impuestos?)|\bcon\s+iva\b/i.test(text)) return true;
    if (/(\+|m[aá]s|plus)\s*(iva|igv|tax)|\bsin\s+(iva|igv)|\bantes\s+de\s+(iva|igv)/i.test(text)) return false;
    return null;
  }

  /** Sentences, so a one-paragraph WhatsApp message yields one price per sentence. */
  function segmentsOf(lines) {
    var out = [];
    lines.forEach(function (line) {
      line.split(/[!?;]\s+|\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).forEach(function (segment) {
        segment = segment.trim();
        if (segment) out.push(segment);
      });
    });
    return out;
  }

  var TAX_WORDS_RE = /\b(iva|igv)\s+inclu[ií]d[oa]|\+\s*(iva|igv|tax)|m[aá]s\s+(iva|igv)|c\/u|cada\s+un[oa]|\bplus\s+tax/gi;

  function extractPrices(lines, country) {
    var profile = Countries.getProfile(country);
    var prices = [];
    var shipping = null;
    var fragments = [];
    segmentsOf(lines).forEach(function (segment) {
      MONEY_RE.lastIndex = 0;
      var match;
      while ((match = MONEY_RE.exec(segment))) {
        var symbol = (match[1] || match[6] || '').toLowerCase().replace(/ó/g, 'o');
        var multiplier = match[3] || match[5] || match[8] || (symbol === 'lucas' ? 'lucas' : '');
        var amount = Quotes.parseAmount(match[2] || match[4] || match[7] || match[9], multiplier);
        if (!isFinite(amount) || amount <= 0) continue;
        var currency = (CURRENCY_WORDS.hasOwnProperty(symbol) && CURRENCY_WORDS[symbol]) || profile.currency;
        fragments.push(match[0]);
        if (/\b(env[ií]o|domicilio|flete|shipping|despacho)\b/i.test(segment) && !/gratis|free/i.test(segment)) {
          shipping = { amount: amount, currency: currency, raw: segment };
          continue;
        }
        var withoutPrice = segment.slice(0, match.index) + ' ' + segment.slice(match.index + match[0].length);
        var pack = detectPack(withoutPrice, country);
        // The item is usually written before the price ("Caja x 100 tornillos $18.500"); otherwise after it.
        var before = segment.slice(0, match.index);
        var source = /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(before.replace(pack.text, ' ')) ? before : segment.slice(match.index + match[0].length);
        var item = cleanItem(source.replace(pack.text, ' ').replace(TAX_WORDS_RE, ' ').split(/,|\s-\s/)[0]);
        prices.push({
          item: item || null,
          price: amount,
          currency: currency,
          per: { qty: pack.qty, unit: pack.unit },
          taxIncluded: taxFlag(segment),
          confidence: pack.confidence === 'high' && item ? 'high' : 'medium',
          raw: segment
        });
      }
    });
    return { prices: prices, shipping: shipping, fragments: fragments };
  }

  // ---------- phones ----------

  /** One regex hit -> E.164 numbers. Splits "300 000 0001 311 000 0002" written without a separator. */
  function extractPhones(candidate, country) {
    var digits = Countries.digitsOnly(candidate);
    if (digits.length < 7 || /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim())) return [];
    var single = digits.length <= 15 ? Countries.normalizePhone(candidate, country) : null;
    if (single) return [single];
    var len = Countries.getProfile(country).nationalLengths[0];
    if (len && digits.length % len === 0 && digits.length / len <= 3) {
      var parts = [];
      for (var i = 0; i < digits.length; i += len) parts.push(Countries.normalizePhone(digits.slice(i, i + len), country));
      if (parts.every(Boolean)) return parts;
    }
    return null;
  }

  // ---------- terms ----------

  function extractTerms(text) {
    var terms = {};
    var lead = /\b(?:entrega|despacho|despachamos|entregamos|delivery)\b[^.\n]{0,25}?\b(\d{1,3})\s*(d[ií]as|days|horas|hours|h)\b/i.exec(text);
    if (lead) terms.leadDays = /hora|hour|^h$/i.test(lead[2]) ? Math.max(1, Math.ceil(Number(lead[1]) / 24)) : Number(lead[1]);
    var credit = /\b(?:cr[eé]dito|pago|plazo|payment)\b[^.\n]{0,15}?\b(\d{1,3})\s*d[ií]as|\b(\d{1,3})\s*d[ií]as\s+de\s+(?:cr[eé]dito|plazo)/i.exec(text);
    if (credit) terms.paymentDays = Number(credit[1] || credit[2]);
    else if (/\b(de\s+)?contado\b|\bcash\b|\bpago\s+anticipado\b/i.test(text)) terms.paymentDays = 0;
    var minimum = /\b(?:pedido\s+m[ií]nimo|m[ií]nimo|minimum\s+order|moq)\b\s*(?:de\s*)?:?\s*(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)?/i.exec(text);
    if (minimum) {
      // "mínimo 10 cajas" cannot be converted without the box size: kept as written for a person to resolve.
      var unitWord = minimum[2] || 'unidad';
      terms.minOrder = { qty: Quotes.parseNumber(minimum[1]), unit: Text.normalize(unitWord), resolved: !!Quotes.toBase(1, unitWord) };
    }
    if (/\b(env[ií]os?|despachos?)\s+(a\s+)?(todo\s+el\s+pa[ií]s|nacionales?|a\s+domicilio)|\bhacemos\s+(env[ií]os|domicilios)|\bdomicilios\b|\bwe\s+ship\b|\bdelivery\b/i.test(text)) {
      terms.ships = true;
    }
    if (/env[ií]o\s+gratis|free\s+shipping|domicilio\s+gratis/i.test(text)) terms.freeShipping = true;
    return terms;
  }

  // ---------- name ----------

  function looksLikeData(line) {
    return HAS_EMAIL_RE.test(line) || STREET_RE.test(line) || TAX_LABEL_RE.test(line) ||
      /\d[\d\s().\-]{6,}\d/.test(line) || /[$€]|\b(usd|cop|mxn)\b/i.test(line) || /https?:|www\./i.test(line);
  }

  function extractName(lines, text) {
    // "Hola, somos Empaques La Sabana y ..." / "Le escribe Marta de Bordados Luna".
    var end = '(?=\\s*[,.;:\\n!]|\\s+(?:y|e|and|desde|en|con|ubicad[oa]s?|fabricamos|vendemos|distribuimos|tenemos|hacemos)\\s|$)';
    var intro = new RegExp('\\b(?:[Ss]omos|[Ww]e\\s+are)\\s+([A-ZÁÉÍÓÚÑ0-9][^,.;:\\n!]{2,60}?)' + end).exec(text);
    if (intro) return { value: cleanItem(intro[1]), confidence: 'medium', how: 'intro' };
    var person = new RegExp('\\b(?:[Ll]e\\s+escribe|[Tt]e\\s+escribe|[Ll]e\\s+habla|[Tt]e\\s+habla|[Ss]oy|[Tt]his\\s+is)\\s+' +
      '[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\\s+(?:de|from)\\s+([A-ZÁÉÍÓÚÑ0-9][^,.;:\\n!]{2,60}?)' + end).exec(text);
    if (person) return { value: cleanItem(person[1]), confidence: 'medium', how: 'intro' };

    var candidates = lines.filter(function (line) {
      var letters = line.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
      return letters.length >= 3 && line.length <= 70 && !GREETING_RE.test(line) && !looksLikeData(line);
    });
    if (!candidates.length) return null;
    for (var i = 0; i < candidates.length; i++) {
      var line = candidates[i];
      var letters = line.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
      if (COMPANY_SUFFIX_RE.test(line) || (letters.length >= 4 && letters === letters.toUpperCase())) {
        return { value: cleanItem(line), confidence: 'high', how: 'heading' };
      }
    }
    return { value: cleanItem(candidates[0]), confidence: 'medium', how: 'first_line' };
  }

  function extractCity(text) {
    var hay = ' ' + Text.normalize(text) + ' ';
    for (var i = 0; i < CITIES.length; i++) {
      if (hay.indexOf(' ' + Text.normalize(CITIES[i]) + ' ') !== -1) {
        return CITIES[i] === 'CDMX' ? 'Ciudad de México' : CITIES[i];
      }
    }
    return null;
  }

  // ---------- main ----------

  /**
   * text: free text (card, flyer, WhatsApp message). options: { country: 'CO' }.
   * Returns { draft, confidence, evidence, warnings, needsReview: true }.
   */
  function parseCapture(text, options) {
    var country = (options && options.country) || 'CO';
    var input = String(text == null ? '' : text).slice(0, MAX_INPUT);
    var lines = input.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var work = input;
    var evidence = [];
    var warnings = [];
    var confidence = {};

    var emails = unique((input.match(EMAIL_RE) || []).map(function (e) { return e.toLowerCase(); }));
    (input.match(EMAIL_RE) || []).forEach(function (e) { work = blank(work, e); });

    var websites = unique((work.match(URL_RE) || []).map(function (url) {
      var clean = url.replace(/[).,;]+$/, '').toLowerCase();
      return /^https?:\/\//.test(clean) ? clean : 'https://' + clean;
    }));
    (work.match(URL_RE) || []).forEach(function (u) { work = blank(work, u); });

    var socials = [];
    SOCIAL_RE.lastIndex = 0;
    var social;
    while ((social = SOCIAL_RE.exec(work))) socials.push('@' + social[1].toLowerCase().replace(/\.$/, ''));
    socials = unique(socials);

    var tax = extractTaxId(work, country);
    var taxId = null;
    if (tax) {
      work = blank(work, tax.fragment);
      taxId = { value: tax.result.normalized, label: tax.label, country: tax.country, valid: tax.result.valid, checked: tax.result.checked };
      confidence.taxId = tax.result.valid === true ? 'high' : tax.result.valid === null ? 'medium' : 'low';
      evidence.push({ code: 'tax_id', label: tax.label, valid: tax.result.valid, checked: tax.result.checked });
      if (tax.result.valid === false) {
        warnings.push({ code: 'tax_id_invalid', value: tax.raw, expected: tax.result.expectedCheckDigit });
      }
    }

    // Blank only the amounts, not their sentences: "Caja a 2.000 c/u, llama al 999 000 0101"
    // keeps the phone. Amounts are removed so "1.250.000" is never read as a phone number.
    var priceInfo = extractPrices(lines, country);
    priceInfo.fragments.forEach(function (fragment) { work = blankAmount(work, fragment); });

    var phones = [];
    var unparsed = [];
    work.split(/\n|,|;|\s[-\/|–]\s|\s+(?:y|o|or|and)\s+/).forEach(function (chunk) {
      (chunk.match(PHONE_RE) || []).forEach(function (candidate) {
        var found = extractPhones(candidate, country);
        if (found) phones = phones.concat(found);
        else if (Countries.digitsOnly(candidate).length >= 7) unparsed.push(candidate.trim());
      });
    });
    phones = unique(phones);
    unparsed.forEach(function (raw) { warnings.push({ code: 'phone_unparsed', raw: raw }); });

    var priceLines = priceInfo.prices.map(function (p) { return p.raw; });
    var address = null;
    for (var i = 0; i < lines.length; i++) {
      if (priceLines.indexOf(lines[i]) !== -1) continue;
      var street = STREET_RE.exec(lines[i]);
      if (street) {
        address = cleanItem(lines[i].slice(street.index).replace(ADDRESS_STOP_RE, ''));
        break;
      }
    }
    var city = extractCity(input);
    var name = extractName(lines, input);
    var categories = Categories.detect(input);
    var terms = extractTerms(input);

    if (name) {
      confidence.name = name.confidence;
      evidence.push({ code: 'name', how: name.how });
    } else {
      warnings.push({ code: 'name_missing' });
    }
    if (phones.length) confidence.phones = 'high';
    if (emails.length) confidence.emails = 'high';
    if (address) confidence.address = 'medium';
    if (categories.length) confidence.categories = 'medium';
    else warnings.push({ code: 'category_missing' });
    if (!phones.length && !emails.length && !websites.length && !socials.length) warnings.push({ code: 'no_contact' });
    priceInfo.prices.forEach(function (p) {
      if (p.taxIncluded === null) warnings.push({ code: 'tax_unknown', item: p.item });
    });
    if (terms.minOrder && !terms.minOrder.resolved) warnings.push({ code: 'moq_unresolved', qty: terms.minOrder.qty, unit: terms.minOrder.unit });

    var draft = {
      name: name ? name.value : null,
      taxId: taxId,
      phones: phones,
      emails: emails,
      websites: websites,
      socials: socials,
      address: address,
      city: city,
      categories: categories,
      prices: priceInfo.prices,
      shipping: priceInfo.shipping ? priceInfo.shipping.amount : terms.freeShipping ? 0 : null,
      leadDays: terms.leadDays != null ? terms.leadDays : null,
      paymentDays: terms.paymentDays != null ? terms.paymentDays : null,
      minOrder: terms.minOrder || null,
      ships: !!terms.ships,
      country: country
    };
    var keyFields = ['name', 'phones', 'categories', 'address', 'taxId'];
    var found = keyFields.filter(function (k) {
      var v = draft[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    }).length;

    return {
      draft: draft,
      confidence: confidence,
      evidence: evidence,
      warnings: warnings,
      completeness: found / keyFields.length,
      needsReview: true
    };
  }

  var api = { parseCapture: parseCapture, extractTaxId: extractTaxId, detectPack: detectPack, MAX_INPUT: MAX_INPUT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutCapture = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
