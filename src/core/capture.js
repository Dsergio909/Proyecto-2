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
  var URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|mx|pe|cl|ar|br|es|us|io|ec|uy|py|bo|ve|gt|hn|sv|ni|cr|pa|do|pr|pt|fr|gob|gov|info|biz|app|shop|store|site|online|tienda|example)(?:\.[a-z]{2})?(?:\/[^\s,;]*)?/gi;
  var SOCIAL_RE = /(?:\b(?:instagram|insta|ig|facebook|fb|tiktok)\b\s*[:\-]?\s*@?|(?:^|\s)@)([a-z0-9._]{3,30})/gi;
  var PHONE_RE = /(?:\+|\b00)?\d[\d\s().\-]{5,18}\d/g;

  // Tax ID labels used across Latin America, Spain, Portugal and France.
  var TAX_LABELS = 'N\\.?I\\.?T\\.?|RUT|RUC|CUIT|CUIL|RFC|CNPJ|EIN|NIF|NIPC|CIF|RIF|RTN|RNC|NRC|SIREN|SIRET|' +
    'C[EÉ]D(?:ULA)?\\.?\\s+JUR(?:[IÍ]DICA)?\\.?|TAX\\s?ID|VAT';
  var TAX_LABEL_RE = new RegExp('(?:^|[^A-Z])(?:' + TAX_LABELS + ')(?![A-Z])', 'i');
  var TAX_RE = new RegExp('(?:^|[^A-Z])(' + TAX_LABELS + ')(?![A-Z])\\s*(?:No\\.?|N[°º]|#|:|\\.)?\\s*:?\\s*(\\d{3}[ \\u00a0]\\d{3}[ \\u00a0]\\d{3}(?:[ \\u00a0]\\d{5}|[ \\u00a0]?-[ \\u00a0]?[\\dK])?(?!\\d)|[A-Z0-9Ñ&][A-Z0-9Ñ&.\\-\\/]{5,19})', 'i');

  // Currency markers -> ISO code. null means "the local currency of the selected country".
  var CURRENCY_WORDS = {
    '$': null, pesos: null, lucas: null, luca: null,
    'us$': 'USD', 'u$s': 'USD', usd: 'USD', dolares: 'USD', dollars: 'USD', 'b/.': 'USD', pab: 'USD',
    'rd$': 'DOP', dop: 'DOP', 'mx$': 'MXN', mxn: 'MXN', 'ar$': 'ARS', ars: 'ARS', 'cl$': 'CLP', clp: 'CLP',
    'col$': 'COP', 'co$': 'COP', cop: 'COP', 'r$': 'BRL', brl: 'BRL', reales: 'BRL', reais: 'BRL',
    'c$': 'NIO', nio: 'NIO', cordobas: 'NIO', '$u': 'UYU', uyu: 'UYU', 's/': 'PEN', 's/.': 'PEN', pen: 'PEN', soles: 'PEN',
    bolivares: 'VES', ves: 'VES', bolivianos: 'BOB', bob: 'BOB', gs: 'PYG', 'gs.': 'PYG', '₲': 'PYG', pyg: 'PYG', guaranies: 'PYG',
    '₡': 'CRC', crc: 'CRC', colones: 'CRC', q: 'GTQ', 'q.': 'GTQ', gtq: 'GTQ', quetzales: 'GTQ', hnl: 'HNL', lempiras: 'HNL',
    '€': 'EUR', eur: 'EUR', euros: 'EUR', '£': 'GBP', gbp: 'GBP'
  };
  var SYMBOLS = 'RD\\$|MX\\$|AR\\$|CL\\$|COL?\\$|US\\$|U\\$S|R\\$|C\\$|\\$U|S\\/\\.?|B\\/\\.|\\bBs\\.?(?=\\s?\\d)|\\bGs\\.?(?=\\s?\\d)|' +
    '\\bQ\\.?(?=\\s?\\d)|₲|₡|€|£|\\$|\\b(?:USD|COP|MXN|PEN|CLP|ARS|BRL|EUR|UYU|PYG|BOB|VES|CRC|GTQ|HNL|NIO|DOP|PAB)\\b';
  var MULT = 'millones|mill[oó]n|milh[õo]es|milh[ãa]o|millions?|mille|mil|mm|k|palos?|lucas?';
  var WORDS = 'pesos|soles|reales|reais|euros|d[oó]lares|dollars|bol[ií]vares|bolivianos|guaran[ií]es|colones|quetzales|' +
    'lempiras|c[oó]rdobas|lucas?|usd|cop|mxn|pen|clp|ars|brl|eur|uyu|pyg|bob|ves|crc|gtq|hnl|nio|dop';
  // Five shapes: "$18.500" / "RD$ 2,500" / "Q 150", "50 mil pesos" / "20 soles", a bare "150 mil" or "2 palos",
  // a bare number before a unit marker ("3.200 c/u", "4.500/kg"), and a symbol after the amount ("12,50 €", "150 Bs").
  var MONEY_RE = new RegExp([
    '(' + SYMBOLS + ')\\s?(\\d[\\d.,]*)\\s*(' + MULT + ')?\\b',
    '\\b(\\d[\\d.,]*)\\s*(' + MULT + ')?\\s*(' + WORDS + ')\\b',
    '\\b(\\d[\\d.,]*)\\s*(millones|mill[oó]n|milh[õo]es|milh[ãa]o|mil|palos?|lucas?)\\b',
    '\\b(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)\\s*(?=c\\/u\\b|cada\\s+un[oa]\\b|\\/\\s*(?:und|unidad|u|kg|kilo|m|metro|l|litro)\\b)',
    '\\b(\\d[\\d.,]*)\\s*(€|₲|₡|Bs\\.?|Gs\\.?)(?![A-Za-z])'
  ].join('|'), 'gi');

  // "caja x 100", "caja c/100", "paquete de 50 und", "caixa com 100", "boîte de 100", "x100", "por 12".
  var PACK_EXPLICIT_RE = /(?:\b(?:caja|paquete|bolsa|rollo|bulto|paca|saco|pack|box|caixa|pacote|bo[iî]te|paquet|sachet)\s*(?:x|de|por|con|c\/|com|of|avec)\s*|(?:^|\s)x\s*|\bc\/\s*(?=\d)|\bpor\s+)(\d+(?:[.,]\d+)?)\s*(unidades|unidade|unidad|und|uds|u|piezas|pzas|pe[çc]as|pi[eè]ces|unit[ée]s|kg|kilos|g|gr|gramos|m|metros|mts|l|litros|ml|hojas|units|pcs)?(?![A-Za-zÀ-ÿ])/i;
  var PACK_WORD_RE = /(?:\/\s*|(?:^|[^A-Za-zÀ-ÿ])(?:el|la|por|x|per|le|o|a|em|au)\s+|^|[^A-Za-zÀ-ÿ])(docena|d[uú]zia|douzaine|ciento|cento|centaine|millar|milheiro|par|resma|arroba|quintal|kilo|quilo|kg|libra|lb|yarda|yd|pie|pies|pulgada|metro|m[eè]tre|mt|litro|litre|gal[oó]n|gal[ãa]o|cu[ñn]ete|unidad|unidade|unit[ée]|pe[çc]a|pi[eè]ce|und|c\/u|cu|each|ea|unit)(?![A-Za-zÀ-ÿ])/i;

  // A street keyword with a number somewhere on the line ("Cra 68 # 13-45", "Av. Boyacá # 12-30", "12 rue de la Paix").
  var STREET_RE = /(?:^|[^A-Za-zÀ-ÿ])(calle|cl|cll|carrera|cra|kra|kr|avenida|av|ak|ac|diagonal|dg|transversal|tv|autopista|carretera|km|kil[oó]metro|manzana|mz|lote|lt|colonia|col|urb|urbanizaci[oó]n|jir[oó]n|jr|pasaje|psje|calzada|bulevar|boulevard|blvd|bd|street|avenue|ave|road|rua|travessa|rodovia|estrada|alameda|pra[çc]a|rue|chemin|route|all[ée]e|impasse|quai)(?![A-Za-zÀ-ÿ])\.?(?=[^\n]*\d)/i;
  // Number first, as in French and English: "12 rue des Lilas", "120 Main Street".
  var NUMBER_STREET_RE = /(?:^|[^\d\w])(\d{1,5}(?:\s?(?:bis|ter))?,?\s+(?:[A-Za-zÀ-ÿ'.]+\s+){0,3}?(?:rue|avenue|boulevard|bd|chemin|route|all[ée]e|impasse|quai|place|street|st|road|rd|drive|lane|way)(?![A-Za-zÀ-ÿ]))/i;
  // Central American addresses by landmark: "de la iglesia 200 metros al norte", "300 varas al sur".
  var LANDMARK_RE = /\b\d+\s*(?:m|mts|metros|varas|cuadras|km)\s+(?:al\s+)?(?:norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)\b/i;
  var ADDRESS_STOP_RE = /\s*(?:(?:^|[^A-Za-zÀ-ÿ])(?:tel|tels|tel[eé]fono|t[ée]l|fone|cel|celular|whatsapp|whats|wsp|wpp|zap|m[oó]vil|phone|correo|email|e-mail|nit|rut|ruc|rfc|cuit|cnpj|rif|rtn|rnc|nif|siren|siret|horario|hor[aá]rio)(?![A-Za-zÀ-ÿ])|\|).*$/i;
  var GREETING_RE = /^(hola|buenas|buenos|buen d[ií]a|saludos|cordial|estimad[oa]s?|qu[eé] tal|hi|hello|good (morning|afternoon)|oi|ol[aá]|bom dia|boa (tarde|noite)|bonjour|bonsoir|salut)(?![A-Za-zÀ-ÿ])/i;
  var COMPANY_SUFFIX_RE = /(?:^|[^A-Za-zÀ-ÿ])(s\.?a\.?s\.?|ltda\.?|s\.?a\.?|e\.?u\.?|& c[ií]a\.?|c[ií]a\.? ltda\.?|sa de cv|s\.?a\.? de c\.?v\.?|s\.? de r\.?l\.?|srl|s\.r\.l\.|spa|eirl|e\.i\.r\.l\.|s\.?a\.?c\.?|c\.a\.|llc|inc\.?|ltd\.?|me|epp|eireli|s\/a|sarl|eurl|sasu)\s*$/i;

  var CITIES = [
    // Colombia
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta',
    'Ibagué', 'Santa Marta', 'Villavicencio', 'Pasto', 'Montería', 'Neiva', 'Armenia', 'Soacha', 'Chía', 'Funza',
    'Mosquera', 'Cota', 'Tunja',
    // Mexico and Central America
    'Ciudad de México', 'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Querétaro', 'Tijuana', 'León', 'Mérida',
    'Ciudad de Guatemala', 'Quetzaltenango', 'San Salvador', 'Tegucigalpa', 'San Pedro Sula', 'Managua', 'León',
    'San José', 'Ciudad de Panamá', 'Colón', 'Santo Domingo', 'Santiago de los Caballeros', 'San Juan', 'La Habana',
    // South America
    'Caracas', 'Maracaibo', 'Valencia', 'Quito', 'Guayaquil', 'Cuenca', 'Lima', 'Arequipa', 'Trujillo', 'Cusco',
    'La Paz', 'El Alto', 'Santa Cruz de la Sierra', 'Cochabamba', 'Asunción', 'Ciudad del Este', 'Montevideo',
    'Santiago', 'Valparaíso', 'Concepción', 'Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza',
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Curitiba', 'Porto Alegre', 'Recife', 'Fortaleza', 'Salvador',
    // Europe and the US
    'Madrid', 'Barcelona', 'Sevilla', 'Bilbao', 'Lisboa', 'Porto', 'Paris', 'Lyon', 'Marseille', 'Miami', 'Houston', 'Los Angeles', 'New York'
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

  function trimEdges(text) {
    return text.replace(/[\s:;,.\-–—=*•·|]+$/g, '').replace(/^[\s:;,.\-–—=*•·|]+/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  // "vendemos tablas de pino a S/ 35": the product is "tablas de pino".
  var SELLING_VERB_RE = /^(?:vendemos|vendo|tenemos|tengo|ofrecemos|ofrezco|manejamos|fabricamos|distribuimos|hacemos|temos|vendemos|oferecemos|fazemos|nous\s+vendons|nous\s+proposons|we\s+(?:sell|have|offer|make))\s+/i;

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
      // The label may reveal a foreign supplier ("RUC" is used in PE, EC, PY, PA and NI).
      // Only a verified check digit is proof enough: a format-only match could fit anything.
      var fits = Countries.countriesForTaxLabel(label).filter(function (code) { return code !== selected.code; })
        .map(function (code) { return { code: code, result: Countries.getProfile(code).validateTaxId(value) }; })
        .filter(function (f) { return f.result.valid === true && f.result.checked === 'checksum'; });
      if (fits.length) {
        result = fits[0].result;
        usedCountry = fits[0].code;
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
      if (/hojas|units|pcs|pe[çc]as|pi[eè]ces|unit[ée]s|unidade/i.test(unitWord)) unitWord = 'unidad';
      if (isFinite(qty) && qty > 0 && Quotes.toBase(qty, unitWord, country)) {
        return { qty: qty, unit: Text.normalize(unitWord), text: explicit[0].trim(), confidence: 'high', container: /^[A-Za-zÀ-ÿ]{3}/.test(explicit[0]) };
      }
    }
    var word = PACK_WORD_RE.exec(line);
    if (word) {
      var unit = Text.normalize(word[1]).replace(/\s/g, '');
      if (unit === 'cu' || unit === 'c/u') unit = 'unidad';
      if (Quotes.toBase(1, unit, country)) return { qty: 1, unit: unit, text: word[0].trim(), confidence: 'high' };
    }
    return { qty: 1, unit: 'unidad', text: '', confidence: 'low' };
  }

  var TAX_NAMES = '(?:iva|igv|itbis|itbms|isv|ivu|impuestos?|impostos?|icms|tva|tax(?:es)?)';
  var TAX_IN_RE = new RegExp('\\b' + TAX_NAMES + '\\s+inclu[ií]d[oa]s?|\\binclu(?:ye|ido|i|so)s?\\s+' + TAX_NAMES + '|\\bcon\\s+' + TAX_NAMES + '\\b|\\bcom\\s+' + TAX_NAMES + '\\b|\\b' + TAX_NAMES + '\\s+inclusos?|\\bTTC\\b', 'i');
  var TAX_OUT_RE = new RegExp('(?:\\+|\\bm[aá]s|\\bplus|\\bmais)\\s*' + TAX_NAMES + '\\b|\\bsin\\s+' + TAX_NAMES + '\\b|\\bsem\\s+' + TAX_NAMES + '\\b|\\bantes\\s+de\\s+' + TAX_NAMES + '\\b|\\bHT\\b|\\bhors\\s+taxes?\\b', 'i');

  function taxFlag(text) {
    if (TAX_IN_RE.test(text)) return true;
    if (TAX_OUT_RE.test(text)) return false;
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

  var TAX_WORDS_RE = new RegExp(TAX_IN_RE.source + '|' + TAX_OUT_RE.source + '|c\\/u|cada\\s+un[oa]', 'gi');

  function extractPrices(lines, country) {
    var profile = Countries.getProfile(country);
    var prices = [];
    var shipping = null;
    var fragments = [];
    segmentsOf(lines).forEach(function (segment) {
      MONEY_RE.lastIndex = 0;
      var match;
      while ((match = MONEY_RE.exec(segment))) {
        var symbol = (match[1] || match[6] || match[11] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '');
        var multiplier = match[3] || match[5] || match[8] || (/^lucas?$/.test(symbol) ? 'lucas' : '');
        var amount = Quotes.parseAmount(match[2] || match[4] || match[7] || match[9] || match[10], multiplier);
        if (!isFinite(amount) || amount <= 0) continue;
        var currency = (Object.prototype.hasOwnProperty.call(CURRENCY_WORDS, symbol) && CURRENCY_WORDS[symbol]) || profile.currency;
        var currencyGuess = null;
        if (symbol === 'bs' || symbol === 'bs.') {
          // "Bs" is the bolívar (Venezuela) and the boliviano (Bolivia): local if it fits, otherwise ask a person.
          currency = profile.currency === 'BOB' || profile.currency === 'VES' ? profile.currency : 'VES';
          if (currency !== profile.currency) currencyGuess = { symbol: 'Bs', chosen: currency, options: 'VES / BOB' };
        }
        fragments.push(match[0]);
        if (/\b(env[ií]o|domicilio|flete|shipping|despacho|frete|livraison|frais de port)\b/i.test(segment) && !/gratis|gr[aá]tis|gratuit|free|sin costo/i.test(segment)) {
          shipping = { amount: amount, currency: currency, raw: segment };
          continue;
        }
        var withoutPrice = segment.slice(0, match.index) + ' ' + segment.slice(match.index + match[0].length);
        var pack = detectPack(withoutPrice, country);
        // The item is usually written before the price ("Caja x 100 tornillos $18.500"); otherwise after it.
        var before = segment.slice(0, match.index);
        var source = /[A-Za-zÀ-ÿ]{3}/.test(before.replace(pack.text, ' ')) ? before : segment.slice(match.index + match[0].length);
        var chunks = source.replace(pack.text, ' ').replace(TAX_WORDS_RE, ' ').split(/,|\s-\s/);
        if (source === before) chunks = chunks.filter(function (c) { return /[A-Za-zÀ-ÿ]{3}/.test(c); }).slice(-1);
        var item = cleanItem(cleanItem(chunks[0] || '').replace(SELLING_VERB_RE, ''));
        if (!item && pack.container) item = trimEdges(pack.text); // "Caja x 25 $18,50": the box is the item
        prices.push({
          item: item || null,
          price: amount,
          currency: currency,
          per: { qty: pack.qty, unit: pack.unit },
          taxIncluded: taxFlag(segment),
          currencyGuess: currencyGuess,
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
    var lead = /\b(?:entrega|entregamos|despacho|despachamos|delivery|prazo\s+de\s+entrega|livraison|livrons|d[ée]lai(?:\s+de\s+livraison)?)\b[^.\n]{0,25}?\b(\d{1,3})\s*(d[ií]as|dias|days|jours?|horas|hours|heures|h)\b/i.exec(text);
    if (lead) terms.leadDays = /hora|hour|heure|^h$/i.test(lead[2]) ? Math.max(1, Math.ceil(Number(lead[1]) / 24)) : Number(lead[1]);
    var credit = /\b(?:cr[eé]dito|pago|plazo|payment|prazo|pagamento|boleto|paiement)\b[^.\n]{0,20}?\b(\d{1,3})\s*(?:d[ií]as|dias|days|jours)|\b(\d{1,3})\s*(?:d[ií]as|dias)\s+de\s+(?:cr[eé]dito|plazo|prazo)/i.exec(text);
    if (credit) terms.paymentDays = Number(credit[1] || credit[2]);
    else if (/\b(de\s+)?contado\b|\bcash\b|\bpago\s+anticipado\b|(?:^|\s)[àa]\s+vista\b|\bcomptant\b/i.test(text)) terms.paymentDays = 0;
    var minimum = /\b(?:pedido\s+m[ií]nimo|compra\s+m[ií]nima|m[ií]nimo|minimum\s+order|minimum\s+de\s+commande|commande\s+minimum|moq)\b\s*(?:de\s*)?:?\s*(\d+(?:[.,]\d+)?)\s*([a-záéíóúñãõçêâèàü]+)?/i.exec(text);
    if (minimum) {
      // "mínimo 10 cajas" cannot be converted without the box size: kept as written for a person to resolve.
      var unitWord = minimum[2] || 'unidad';
      terms.minOrder = { qty: Quotes.parseNumber(minimum[1]), unit: Text.normalize(unitWord), resolved: !!Quotes.toBase(1, unitWord) };
    }
    if (/\b(env[ií]os?|despachos?)\s+(a\s+)?(todo\s+el\s+pa[ií]s|nacionales?|a\s+domicilio)|\bhacemos\s+(env[ií]os|domicilios)|\bdomicilios\b|\benviamos\b|\bentregamos\b|\bdespachamos\b|\ba\s+domicilio\b|\bfazemos\s+entregas?|\bwe\s+ship\b|\bdelivery\b|\bnous\s+livrons\b|\blivraison\s+(?:partout|dans\s+toute)/i.test(text)) {
      terms.ships = true;
    }
    if (/env[ií]o\s+(?:gratis|gratuito|sin\s+costo)|free\s+shipping|domicilio\s+gratis|frete\s+gr[aá]tis|entrega\s+gr[aá]tis|livraison\s+gratuite/i.test(text)) {
      terms.freeShipping = true;
      terms.ships = true; // free shipping means they deliver
    }
    return terms;
  }

  // ---------- name ----------

  function looksLikeData(line) {
    return HAS_EMAIL_RE.test(line) || STREET_RE.test(line) || NUMBER_STREET_RE.test(line) || LANDMARK_RE.test(line) || TAX_LABEL_RE.test(line) ||
      /\d[\d\s().\-]{6,}\d/.test(line) || /[$€£₲₡]|\b(usd|cop|mxn|brl|pen|clp|ars|uyu|pyg|bob|dop|gtq|hnl|nio|crc)\b/i.test(line) || /https?:|www\./i.test(line);
  }

  function extractName(lines, text) {
    // "Hola, somos Empaques La Sabana y ..." / "Le escribe Marta de Bordados Luna".
    var end = '(?=\\s*[,.;:\\n!]|\\s+(?:y|e|et|and|desde|en|em|con|com|avec|ubicad[oa]s?|localizad[oa]s?|fabricamos|vendemos|distribuimos|tenemos|hacemos|fazemos|somos|depuis)\\s|$)';
    var intro = new RegExp('(?:^|[^A-Za-zÀ-ÿ])(?:[Ss]omos(?:\\s+(?:a|o|la|el))?|[Ww]e\\s+are|[Nn]ous\\s+sommes)\\s+([A-ZÁÉÍÓÚÑÂÊÔÃÕÇ0-9][^,.;:\\n!]{2,60}?)' + end).exec(text);
    if (intro) return { value: cleanItem(intro[1]), confidence: 'medium', how: 'intro' };
    var person = new RegExp('(?:^|[^A-Za-zÀ-ÿ])(?:[Ll]e\\s+escribe|[Tt]e\\s+escribe|[Ll]e\\s+habla|[Tt]e\\s+habla|[Ss]oy|[Tt]his\\s+is|[Aa]qui\\s+(?:é|fala)|[Jj]e\\s+suis)\\s+' +
      '[A-ZÁÉÍÓÚÑÂÊÔÃÕÇ][a-záéíóúñâêôãõçèà]+\\s+(?:de|da|do|from|chez)\\s+([A-ZÁÉÍÓÚÑÂÊÔÃÕÇ0-9][^,.;:\\n!]{2,60}?)' + end).exec(text);
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
    work.split(/\n|,|;|\s[-\/|–]\s|\s+(?:y|o|or|and|ou|et|e)\s+/).forEach(function (chunk) {
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
      if (LANDMARK_RE.test(lines[i])) { // "De la iglesia 200 metros al norte": the whole line is the address
        address = trimEdges(lines[i].replace(ADDRESS_STOP_RE, ''));
        break;
      }
      var numbered = NUMBER_STREET_RE.exec(lines[i]);
      var street = STREET_RE.exec(lines[i]);
      if (numbered && (!street || numbered.index <= street.index)) {
        address = trimEdges(lines[i].slice(numbered.index + numbered[0].indexOf(numbered[1])).replace(ADDRESS_STOP_RE, ''));
        break;
      }
      if (street) {
        var from = street.index + street[0].indexOf(street[1]);
        var number = /(\d+\s*(?:bis|ter|[a-z])?,?\s*)$/i.exec(lines[i].slice(0, from)); // "12 rue de la Paix"
        if (number) from -= number[0].length;
        address = cleanItem(lines[i].slice(from).replace(ADDRESS_STOP_RE, ''));
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
      if (p.currencyGuess) warnings.push({ code: 'currency_ambiguous', item: p.item, symbol: p.currencyGuess.symbol, currency: p.currencyGuess.chosen, options: p.currencyGuess.options });
      delete p.currencyGuess;
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
