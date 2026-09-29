/**
 * Supplier Scout — country profiles.
 *
 * Everything that changes from one country to another lives here: currency,
 * default sales tax, the name and check-digit rules of the business tax ID,
 * the phone calling code and small market conventions. Adding a country means
 * adding one object; nothing else in the code is country-specific.
 *
 * Tax rates are defaults for comparing quotes, editable in the app. They are
 * not tax advice.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  function digitsOnly(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  // ---------- tax ID validators ----------
  // Each returns { valid: true | false | null, checked: 'checksum' | 'format' | 'none', normalized }.
  // valid === null means "cannot tell" (no check digit given, or no rule for this country).

  /** Colombia, NIT: DIAN weights 3,7,13,...,71 applied right to left; mod 11. */
  function nitCheckDigit(base) {
    var weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    var digits = base.split('').reverse();
    var sum = 0;
    for (var i = 0; i < digits.length; i++) sum += Number(digits[i]) * weights[i];
    var rest = sum % 11;
    return rest > 1 ? 11 - rest : rest;
  }

  function validateNit(raw) {
    var text = String(raw || '').trim();
    var match = /^([\d.\s]{6,15})(?:\s*-\s*(\d))?$/.exec(text);
    if (!match) return { valid: false, checked: 'format', normalized: digitsOnly(text) };
    var base = digitsOnly(match[1]);
    if (base.length < 6 || base.length > 10) return { valid: false, checked: 'format', normalized: base };
    var expected = nitCheckDigit(base);
    if (match[2] === undefined) {
      return { valid: null, checked: 'checksum', normalized: base, expectedCheckDigit: expected };
    }
    return {
      valid: Number(match[2]) === expected,
      checked: 'checksum',
      normalized: base + '-' + match[2],
      expectedCheckDigit: expected
    };
  }

  /** Chile, RUT: weights 2..7 cycling from the right; 11 -> 0, 10 -> K. */
  function validateRut(raw) {
    var text = String(raw || '').toUpperCase().replace(/[.\s]/g, '');
    var match = /^(\d{7,8})-?([\dK])$/.exec(text);
    if (!match) return { valid: false, checked: 'format', normalized: text };
    var sum = 0;
    var factor = 2;
    match[1].split('').reverse().forEach(function (d) {
      sum += Number(d) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    });
    var rest = 11 - (sum % 11);
    var expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
    return { valid: expected === match[2], checked: 'checksum', normalized: match[1] + '-' + match[2] };
  }

  function weightedMod11(digits, weights) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += Number(digits[i]) * weights[i];
    return sum % 11;
  }

  /** Argentina, CUIT/CUIL: 11 digits, weights 5432765432. */
  function validateCuit(raw) {
    var digits = digitsOnly(raw);
    if (digits.length !== 11) return { valid: false, checked: 'format', normalized: digits };
    var rest = 11 - weightedMod11(digits, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    var expected = rest === 11 ? 0 : rest; // 10 never appears in a valid CUIT
    return {
      valid: rest !== 10 && expected === Number(digits[10]),
      checked: 'checksum',
      normalized: digits.slice(0, 2) + '-' + digits.slice(2, 10) + '-' + digits[10]
    };
  }

  /** Peru, RUC: 11 digits, same weights as CUIT; 10 -> 0, 11 -> 1. */
  function validateRuc(raw) {
    var digits = digitsOnly(raw);
    if (digits.length !== 11 || !/^(10|15|16|17|20)/.test(digits)) {
      return { valid: false, checked: 'format', normalized: digits };
    }
    var rest = 11 - weightedMod11(digits, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    var expected = rest === 10 ? 0 : rest === 11 ? 1 : rest;
    return { valid: expected === Number(digits[10]), checked: 'checksum', normalized: digits };
  }

  /** Brazil, CNPJ: two check digits, mod 11. */
  function validateCnpj(raw) {
    var digits = digitsOnly(raw);
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) {
      return { valid: false, checked: 'format', normalized: digits };
    }
    function dv(slice, weights) {
      var rest = weightedMod11(slice, weights);
      return rest < 2 ? 0 : 11 - rest;
    }
    var first = dv(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    var second = dv(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return {
      valid: first === Number(digits[12]) && second === Number(digits[13]),
      checked: 'checksum',
      normalized: digits
    };
  }

  function formatValidator(pattern, clean) {
    return function (raw) {
      var text = clean(String(raw || ''));
      return { valid: pattern.test(text), checked: 'format', normalized: text };
    };
  }

  var upperNoSpaces = function (text) { return text.toUpperCase().replace(/[\s-]/g, ''); };

  /** Mexico, RFC (format only; the homoclave check digit is not verified). */
  var validateRfc = formatValidator(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, upperNoSpaces);
  /** United States, EIN (format only). */
  var validateEin = formatValidator(/^\d{9}$/, function (t) { return digitsOnly(t); });
  /** Spain, NIF/CIF (format only). */
  var validateNif = formatValidator(/^[A-Z0-9]\d{7}[A-Z0-9]$/, upperNoSpaces);

  function noValidator(raw) {
    return { valid: null, checked: 'none', normalized: String(raw || '').trim() };
  }

  // ---------- profiles ----------

  var PROFILES = {
    CO: {
      code: 'CO', name: { es: 'Colombia', en: 'Colombia' }, currency: 'COP', locale: 'es-CO',
      vatRate: 0.19, vatName: 'IVA', taxIdName: 'NIT', taxIdLabels: ['NIT', 'N.I.T'], validateTaxId: validateNit,
      callingCode: '57', nationalLengths: [10], poundKg: 0.5, // "una libra" in Colombian markets is 500 g
      registries: ['secop-co', 'rues'], sampleCity: 'Bogotá'
    },
    MX: {
      code: 'MX', name: { es: 'México', en: 'Mexico' }, currency: 'MXN', locale: 'es-MX',
      vatRate: 0.16, vatName: 'IVA', taxIdName: 'RFC', taxIdLabels: ['RFC'], validateTaxId: validateRfc,
      callingCode: '52', nationalLengths: [10], poundKg: 0.453592, registries: [], sampleCity: 'Ciudad de México'
    },
    PE: {
      code: 'PE', name: { es: 'Perú', en: 'Peru' }, currency: 'PEN', locale: 'es-PE',
      vatRate: 0.18, vatName: 'IGV', taxIdName: 'RUC', taxIdLabels: ['RUC'], validateTaxId: validateRuc,
      callingCode: '51', nationalLengths: [9, 8], poundKg: 0.453592, registries: [], sampleCity: 'Lima'
    },
    CL: {
      code: 'CL', name: { es: 'Chile', en: 'Chile' }, currency: 'CLP', locale: 'es-CL',
      vatRate: 0.19, vatName: 'IVA', taxIdName: 'RUT', taxIdLabels: ['RUT'], validateTaxId: validateRut,
      callingCode: '56', nationalLengths: [9], poundKg: 0.453592, registries: [], sampleCity: 'Santiago'
    },
    AR: {
      code: 'AR', name: { es: 'Argentina', en: 'Argentina' }, currency: 'ARS', locale: 'es-AR',
      vatRate: 0.21, vatName: 'IVA', taxIdName: 'CUIT', taxIdLabels: ['CUIT', 'CUIL'], validateTaxId: validateCuit,
      callingCode: '54', nationalLengths: [10], poundKg: 0.453592, registries: [], sampleCity: 'Buenos Aires'
    },
    BR: {
      code: 'BR', name: { es: 'Brasil', en: 'Brazil' }, currency: 'BRL', locale: 'pt-BR',
      vatRate: 0, vatName: 'Impostos', taxIdName: 'CNPJ', taxIdLabels: ['CNPJ'], validateTaxId: validateCnpj,
      callingCode: '55', nationalLengths: [10, 11], poundKg: 0.453592, registries: [], sampleCity: 'São Paulo'
    },
    US: {
      code: 'US', name: { es: 'Estados Unidos', en: 'United States' }, currency: 'USD', locale: 'en-US',
      vatRate: 0, vatName: 'Sales tax', taxIdName: 'EIN', taxIdLabels: ['EIN'], validateTaxId: validateEin,
      callingCode: '1', nationalLengths: [10], poundKg: 0.453592, registries: [], sampleCity: 'Miami'
    },
    ES: {
      code: 'ES', name: { es: 'España', en: 'Spain' }, currency: 'EUR', locale: 'es-ES',
      vatRate: 0.21, vatName: 'IVA', taxIdName: 'NIF', taxIdLabels: ['NIF', 'CIF'], validateTaxId: validateNif,
      callingCode: '34', nationalLengths: [9], poundKg: 0.453592, registries: [], sampleCity: 'Madrid'
    },
    XX: {
      code: 'XX', name: { es: 'Otro país', en: 'Other country' }, currency: 'USD', locale: 'en-US',
      vatRate: 0, vatName: 'Tax', taxIdName: 'Tax ID', taxIdLabels: ['TAX ID', 'VAT'], validateTaxId: noValidator,
      callingCode: '', nationalLengths: [], poundKg: 0.453592, registries: [], sampleCity: ''
    }
  };

  function getProfile(code) {
    return PROFILES[String(code || '').toUpperCase()] || PROFILES.XX;
  }

  /** Which country a tax ID label belongs to ("RFC" -> MX). Null when unknown. */
  function countryForTaxLabel(label) {
    var clean = String(label || '').toUpperCase().replace(/\./g, '').trim();
    for (var code in PROFILES) {
      var labels = PROFILES[code].taxIdLabels.map(function (l) { return l.replace(/\./g, ''); });
      if (labels.indexOf(clean) !== -1) return code;
    }
    return null;
  }

  /**
   * Best-effort E.164 phone number ("+573000000001"), or null when the digits
   * cannot be a phone number for this country.
   */
  function normalizePhone(raw, countryCode) {
    var text = String(raw || '').trim();
    var profile = getProfile(countryCode);
    var digits = digitsOnly(text);
    if (/^\s*(\+|00)/.test(text)) {
      if (text.trim().indexOf('00') === 0) digits = digits.slice(2);
      return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
    }
    if (!profile.callingCode) return null;
    var cc = profile.callingCode;
    for (var i = 0; i < profile.nationalLengths.length; i++) {
      var len = profile.nationalLengths[i];
      if (digits.length === cc.length + len && digits.indexOf(cc) === 0) return '+' + digits;
    }
    var national = digits.replace(/^0+/, ''); // trunk prefix
    if (profile.nationalLengths.indexOf(national.length) !== -1) return '+' + cc + national;
    return null;
  }

  /** Money in the profile's currency, e.g. "$ 18.500" for COP. */
  function formatMoney(amount, countryCode, currencyOverride) {
    var profile = getProfile(countryCode);
    var currency = currencyOverride || profile.currency;
    var noCents = ['COP', 'CLP', 'ARS'].indexOf(currency) !== -1;
    try {
      return new Intl.NumberFormat(profile.locale, {
        style: 'currency', currency: currency,
        maximumFractionDigits: noCents ? 0 : 2, minimumFractionDigits: noCents ? 0 : 2
      }).format(amount);
    } catch (err) {
      return currency + ' ' + Number(amount).toFixed(noCents ? 0 : 2);
    }
  }

  var api = {
    PROFILES: PROFILES,
    getProfile: getProfile,
    countryForTaxLabel: countryForTaxLabel,
    normalizePhone: normalizePhone,
    formatMoney: formatMoney,
    digitsOnly: digitsOnly,
    validators: {
      nit: validateNit, rut: validateRut, cuit: validateCuit, ruc: validateRuc,
      cnpj: validateCnpj, rfc: validateRfc, ein: validateEin, nif: validateNif
    },
    nitCheckDigit: nitCheckDigit
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutCountries = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
