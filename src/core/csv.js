/**
 * Supplier Scout — CSV in and out.
 *
 * In: any supplier list — a chamber of commerce export, a trade-fair
 * exhibitor list, an old purchasing spreadsheet, a public registry in any
 * country. Columns are recognised by name in Spanish, English or Portuguese
 * ("Razón social", "Company", "Nome"...), so no fixed template is needed.
 *
 * Out: a file that opens cleanly in Google Sheets or Excel, with formula
 * injection neutralised (a cell like "=IMPORTXML(...)" is exported as text).
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Text = isNode ? require('./text') : root.ScoutText;
  var Countries = isNode ? require('./countries') : root.ScoutCountries;
  var Categories = isNode ? require('./categories') : root.ScoutCategories;

  var MAX_ROWS = 5000;

  var SYNONYMS = {
    name: ['nombre', 'razon social', 'nombre o razon social', 'nombre comercial', 'name', 'company', 'company name', 'business name',
      'empresa', 'proveedor', 'nome', 'razao social', 'nome fantasia', 'fornecedor', 'raison sociale', 'nom', 'entreprise', 'fournisseur', 'display name'],
    taxId: ['nit', 'rut', 'ruc', 'cuit', 'rfc', 'rif', 'rtn', 'rnc', 'nrc', 'cnpj', 'nif', 'nipc', 'cif', 'siren', 'siret', 'ein', 'tax id', 'vat',
      'cedula juridica', 'identificacion', 'identificacion tributaria', 'numero de identificacion', 'documento', 'numero documento', 'nro documento'],
    phone: ['telefono', 'telefonos', 'celular', 'movil', 'whatsapp', 'phone', 'tel', 'telefone', 'fone', 'telephone', 'portable',
      'telefono de contacto', 'contact phone'],
    email: ['correo', 'correo electronico', 'email', 'e mail', 'mail', 'correo de contacto', 'courriel'],
    website: ['web', 'sitio web', 'pagina web', 'website', 'url', 'site', 'pagina', 'site web'],
    address: ['direccion', 'address', 'endereco', 'domicilio', 'direccion comercial', 'logradouro', 'adresse'],
    city: ['ciudad', 'municipio', 'city', 'cidade', 'localidad', 'comuna', 'distrito', 'canton', 'ville', 'commune'],
    region: ['departamento', 'estado', 'provincia', 'region', 'state', 'uf'],
    category: ['categoria', 'categorias', 'actividad', 'actividad economica', 'giro', 'giro comercial', 'sector', 'rubro', 'category',
      'descripcion actividad', 'codigo categoria principal', 'ciiu', 'cnae', 'atividade', 'atividade economica', 'activite', 'code naf', 'naf'],
    lat: ['lat', 'latitud', 'latitude'],
    lng: ['lng', 'lon', 'long', 'longitud', 'longitude'],
    notes: ['notas', 'observaciones', 'notes', 'comentarios']
  };

  /** RFC 4180 parser. Detects ';' (Excel in Spanish locales) or ',' from the header line. */
  function parseCsv(text, delimiter) {
    var input = String(text || '').replace(/^﻿/, '');
    var firstLine = input.split(/\r?\n/)[0] || '';
    var sep = delimiter || ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',');
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    for (var i = 0; i < input.length; i++) {
      var ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === sep) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
        row = [];
        if (rows.length > MAX_ROWS) break;
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
    return rows.slice(0, MAX_ROWS + 1);
  }

  function neutralize(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    var text = String(value);
    return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  }

  /** Rows -> CSV text. Strings that would run as spreadsheet formulas are prefixed with '. */
  function toCsv(rows, delimiter) {
    var sep = delimiter || ',';
    return rows.map(function (row) {
      return row.map(function (value) {
        var text = neutralize(value);
        return /["\n\r]/.test(text) || text.indexOf(sep) !== -1 ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(sep);
    }).join('\r\n') + '\r\n';
  }

  /** Header names -> { field: columnIndex }, plus the headers nobody recognised. */
  function mapColumns(headers) {
    var mapping = {};
    var used = {};
    var normalized = headers.map(function (h) { return Text.normalize(h); });
    // exact matches first, then "header contains synonym"
    [true, false].forEach(function (exact) {
      Object.keys(SYNONYMS).forEach(function (field) {
        if (mapping[field] !== undefined) return;
        for (var i = 0; i < normalized.length; i++) {
          if (used[i] || !normalized[i]) continue;
          var hit = SYNONYMS[field].some(function (syn) {
            return exact ? normalized[i] === syn : (' ' + normalized[i] + ' ').indexOf(' ' + syn + ' ') !== -1;
          });
          if (hit) { mapping[field] = i; used[i] = true; return; }
        }
      });
    });
    return {
      mapping: mapping,
      unmapped: headers.filter(function (h, i) { return !used[i]; })
    };
  }

  function cell(row, index) {
    return index === undefined ? '' : String(row[index] == null ? '' : row[index]).trim();
  }

  /**
   * CSV text -> draft suppliers (not yet sanitised; pass through Schema.sanitizeDatabase).
   * options: { country, source: 'import' | 'registry', ref, today, idPrefix }
   */
  function importSuppliers(text, options) {
    var o = options || {};
    var rows = parseCsv(text);
    if (!rows.length) return { suppliers: [], mapping: {}, unmapped: [], skipped: 0 };
    var columns = mapColumns(rows[0]);
    var m = columns.mapping;
    var profile = Countries.getProfile(o.country);
    var suppliers = [];
    var skipped = 0;
    rows.slice(1).forEach(function (row, i) {
      var name = cell(row, m.name);
      if (!name) { skipped++; return; }
      var rawTax = cell(row, m.taxId);
      var tax = rawTax ? profile.validateTaxId(rawTax) : null;
      var categoryText = cell(row, m.category) + ' ' + name;
      var phones = cell(row, m.phone).split(/[\/,;]| - /).map(function (p) {
        return Countries.normalizePhone(p, profile.code);
      }).filter(Boolean);
      var lat = Number(cell(row, m.lat).replace(',', '.'));
      var lng = Number(cell(row, m.lng).replace(',', '.'));
      var hasCoords = cell(row, m.lat) !== '' && cell(row, m.lng) !== '' && isFinite(lat) && isFinite(lng);
      suppliers.push({
        id: (o.idPrefix || 'CSV') + '-' + (i + 1),
        name: name,
        categories: Categories.detect(categoryText),
        taxId: tax ? { value: tax.normalized, label: profile.taxIdName, country: profile.code, valid: tax.valid, checked: tax.checked } : null,
        phones: phones,
        emails: cell(row, m.email) ? [cell(row, m.email)] : [],
        websites: cell(row, m.website) ? [cell(row, m.website)] : [],
        address: cell(row, m.address) || null,
        city: cell(row, m.city) || null,
        region: cell(row, m.region) || null,
        country: profile.code === 'XX' ? null : profile.code,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        sources: [{ type: o.source || 'import', ref: o.ref || 'csv', at: o.today || null }],
        verification: o.source === 'registry' && tax && tax.valid === true ? 2 : 0,
        notes: cell(row, m.notes) || null
      });
    });
    return { suppliers: suppliers, mapping: m, unmapped: columns.unmapped, skipped: skipped };
  }

  var EXPORT_HEADERS = ['id', 'nombre', 'categorias', 'nit_o_tax_id', 'telefonos', 'correos', 'web', 'redes', 'direccion', 'ciudad', 'pais', 'lat', 'lng', 'envia', 'verificacion', 'fuentes', 'notas'];

  /** Suppliers -> rows ready for toCsv (Google Sheets friendly). */
  function exportRows(suppliers) {
    return [EXPORT_HEADERS].concat(suppliers.map(function (s) {
      return [
        s.id, s.name, (s.categories || []).join(' | '), s.taxId ? s.taxId.value : '',
        (s.phones || []).join(' | '), (s.emails || []).join(' | '), (s.websites || []).join(' | '),
        (s.socials || []).join(' | '), s.address || '', s.city || '', s.country || '',
        s.lat == null ? '' : s.lat, s.lng == null ? '' : s.lng, s.ships ? 'si' : 'no', s.verification || 0,
        (s.sources || []).map(function (src) { return src.type; }).join(' | '), s.notes || ''
      ];
    }));
  }

  var api = {
    SYNONYMS: SYNONYMS,
    parseCsv: parseCsv,
    toCsv: toCsv,
    mapColumns: mapColumns,
    importSuppliers: importSuppliers,
    exportRows: exportRows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutCsv = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
