/**
 * Supplier Scout — quote normalisation and landed cost.
 *
 * Suppliers quote in whatever unit is convenient for them: "caja x 100",
 * "la docena", "el kilo", "USD 2.10 each, shipping not included". To compare
 * them fairly this module converts every quote into the cost of YOUR order:
 *
 *   packs you must buy (whole packs, minimum order respected)
 *   + sales tax if the price excluded it
 *   + shipping
 *   converted to your currency with a rate YOU provide
 *   and, optionally, discounted for the payment term (paying in 60 days is cheaper
 *   than paying today, at your monthly opportunity rate).
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Countries = isNode ? require('./countries') : root.ScoutCountries;
  var Text = isNode ? require('./text') : root.ScoutText;

  // Unit aliases -> [base unit, factor]. Base units: unit, kg, m, l.
  var UNITS = {
    unit: ['unit', 1], unidad: ['unit', 1], unidades: ['unit', 1], und: ['unit', 1], un: ['unit', 1], u: ['unit', 1],
    cu: ['unit', 1], pieza: ['unit', 1], piezas: ['unit', 1], pza: ['unit', 1], each: ['unit', 1], ea: ['unit', 1], pc: ['unit', 1],
    par: ['unit', 2], pares: ['unit', 2], pair: ['unit', 2],
    docena: ['unit', 12], docenas: ['unit', 12], dozen: ['unit', 12],
    ciento: ['unit', 100], cientos: ['unit', 100],
    millar: ['unit', 1000], millares: ['unit', 1000],
    resma: ['unit', 500], resmas: ['unit', 500],
    kg: ['kg', 1], kilo: ['kg', 1], kilos: ['kg', 1], kilogramo: ['kg', 1], kilogramos: ['kg', 1],
    g: ['kg', 0.001], gr: ['kg', 0.001], gramo: ['kg', 0.001], gramos: ['kg', 0.001],
    t: ['kg', 1000], ton: ['kg', 1000], tonelada: ['kg', 1000], toneladas: ['kg', 1000],
    m: ['m', 1], metro: ['m', 1], metros: ['m', 1], mt: ['m', 1], mts: ['m', 1], cm: ['m', 0.01],
    l: ['l', 1], lt: ['l', 1], litro: ['l', 1], litros: ['l', 1], ml: ['l', 0.001],
    galon: ['l', 3.785], galones: ['l', 3.785], gal: ['l', 3.785]
  };
  var POUND_ALIASES = ['lb', 'lbs', 'libra', 'libras', 'pound', 'pounds'];

  /** '100 und' / 'docena' / 'libra' -> { qty, unit } in base units, or null. */
  function toBase(qty, unitWord, countryCode) {
    var word = Text.normalize(unitWord).replace(/\s+/g, '');
    var amount = qty == null ? 1 : Number(qty);
    if (!isFinite(amount) || amount <= 0) return null;
    if (POUND_ALIASES.indexOf(word) !== -1) {
      return { qty: amount * Countries.getProfile(countryCode).poundKg, unit: 'kg' };
    }
    var entry = UNITS[word];
    if (!entry) return null;
    return { qty: amount * entry[1], unit: entry[0] };
  }

  /**
   * Parse a human number written with either separator convention.
   * "18.500" -> 18500, "18,5" -> 18.5, "1.250,50" -> 1250.5, "1,250.50" -> 1250.5.
   * A single separator followed by exactly three digits is read as thousands.
   */
  function parseNumber(raw) {
    var text = String(raw == null ? '' : raw).trim().replace(/\s/g, '');
    if (!/^\d[\d.,]*$/.test(text)) return NaN;
    var lastDot = text.lastIndexOf('.');
    var lastComma = text.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
      var decimal = lastDot > lastComma ? '.' : ',';
      var thousands = decimal === '.' ? ',' : '.';
      return Number(text.split(thousands).join('').replace(decimal, '.'));
    }
    var sep = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null;
    if (!sep) return Number(text);
    var parts = text.split(sep);
    if (parts.length > 2) return Number(parts.join(''));
    if (parts[1].length === 3) return Number(parts.join(''));
    return Number(parts[0] + '.' + parts[1]);
  }

  var MULTIPLIERS = { mil: 1e3, k: 1e3, lucas: 1e3, millon: 1e6, millones: 1e6, mm: 1e6 };

  /** "18.500" / "50 mil" / "18.5k" / "1,2 millones" -> number, or NaN. */
  function parseAmount(numberText, multiplierWord) {
    var value = parseNumber(numberText);
    if (!isFinite(value)) return NaN;
    var mult = MULTIPLIERS[Text.normalize(multiplierWord || '')] || 1;
    return value * mult;
  }

  function roundMoney(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Cost of buying `need.quantity` of `need.unit` from one quote.
   *
   * quote: { price, currency, per: { qty, unit }, taxIncluded, shipping, minOrder, leadDays, paymentDays }
   * need:  { quantity, unit }
   * settings: { country, baseCurrency, vatRate, fx: { USD: 3900 }, monthlyRate }
   */
  function landedCost(quote, need, settings) {
    var profile = Countries.getProfile(settings.country);
    var baseCurrency = settings.baseCurrency || profile.currency;
    var vatRate = settings.vatRate != null ? settings.vatRate : profile.vatRate;
    var warnings = [];

    var pack = toBase(quote.per && quote.per.qty, quote.per && quote.per.unit, settings.country);
    var wanted = toBase(need.quantity, need.unit, settings.country);
    if (!pack || !wanted) return { ok: false, warnings: [{ code: 'unit_unknown' }] };
    if (pack.unit !== wanted.unit) {
      return { ok: false, warnings: [{ code: 'unit_mismatch', quoteUnit: pack.unit, needUnit: wanted.unit }] };
    }

    var rate = 1;
    var currency = quote.currency || baseCurrency;
    if (currency !== baseCurrency) {
      rate = settings.fx && Number(settings.fx[currency]);
      if (!rate || !isFinite(rate)) {
        return { ok: false, warnings: [{ code: 'fx_missing', currency: currency }] };
      }
    }

    var target = wanted.qty;
    var minOrder = quote.minOrder ? toBase(quote.minOrder.qty, quote.minOrder.unit, settings.country) : null;
    if (minOrder && minOrder.unit === pack.unit && minOrder.qty > target) {
      warnings.push({ code: 'below_moq', minOrder: minOrder.qty, unit: pack.unit });
      target = minOrder.qty;
    }

    var packs = Math.ceil(target / pack.qty - 1e-9);
    var purchased = packs * pack.qty;
    var subtotal = packs * Number(quote.price) * rate;
    var tax = quote.taxIncluded ? 0 : subtotal * vatRate;
    var shipping = (Number(quote.shipping) || 0) * rate; // shipping is quoted in the same currency
    var total = subtotal + tax + shipping;
    var overbuy = purchased - wanted.qty;
    if (overbuy > 1e-9) warnings.push({ code: 'overbuy', extra: roundMoney(overbuy), unit: pack.unit });
    if (currency !== baseCurrency) warnings.push({ code: 'fx_manual', currency: currency, rate: rate });

    var months = (Number(quote.paymentDays) || 0) / 30;
    var monthlyRate = Number(settings.monthlyRate) || 0;
    var presentValue = total / Math.pow(1 + monthlyRate, months);

    return {
      ok: true,
      packs: packs,
      purchased: purchased,
      unit: pack.unit,
      subtotal: roundMoney(subtotal),
      tax: roundMoney(tax),
      shipping: roundMoney(shipping),
      total: roundMoney(total),
      unitCost: roundMoney(total / wanted.qty),
      listUnitPrice: roundMoney((Number(quote.price) * rate) / pack.qty),
      presentValue: roundMoney(presentValue),
      paymentSaving: roundMoney(total - presentValue),
      currency: baseCurrency,
      warnings: warnings
    };
  }

  /**
   * Rank quotes for one need by effective cost (present value).
   * Flags the cheapest list price and the cheapest real total: they are often
   * different suppliers, which is the point of this module.
   */
  function compareQuotes(quotes, need, settings) {
    var rows = quotes.map(function (quote) {
      return { quote: quote, cost: landedCost(quote, need, settings) };
    });
    var valid = rows.filter(function (row) { return row.cost.ok; });
    valid.sort(function (a, b) { return a.cost.presentValue - b.cost.presentValue; });
    var cheapestList = null;
    valid.forEach(function (row) {
      if (!cheapestList || row.cost.listUnitPrice < cheapestList.cost.listUnitPrice) cheapestList = row;
    });
    valid.forEach(function (row, index) {
      row.rank = index + 1;
      row.cheapestTotal = index === 0;
      row.cheapestListPrice = row === cheapestList;
    });
    return {
      ranked: valid,
      invalid: rows.filter(function (row) { return !row.cost.ok; }),
      listPriceMisleads: !!(cheapestList && valid.length && cheapestList !== valid[0])
    };
  }

  var api = {
    UNITS: UNITS,
    toBase: toBase,
    parseNumber: parseNumber,
    parseAmount: parseAmount,
    landedCost: landedCost,
    compareQuotes: compareQuotes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutQuotes = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
