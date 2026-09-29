/**
 * Supplier Scout — purchase categories.
 *
 * One list drives three things: detecting categories in captured text
 * (keywords in Spanish, English and Portuguese), building OpenStreetMap
 * queries (tags), and labelling the UI.
 *
 * Runs unchanged in Node and the browser.
 */
(function (root) {
  'use strict';

  var Text = typeof module !== 'undefined' && module.exports ? require('./text') : root.ScoutText;

  var CATEGORIES = [
    {
      id: 'packaging', label: { es: 'Empaques y cajas', en: 'Packaging' },
      keywords: ['empaque', 'empaques', 'carton', 'corrugado', 'embalaje', 'cajas de carton', 'bolsas plasticas', 'kraft', 'stretch', 'packaging', 'cardboard', 'embalagem'],
      osm: [['shop', 'packaging'], ['craft', 'packaging']], nameHint: 'empaque|carton|caja|embalaje|packaging'
    },
    {
      id: 'hardware', label: { es: 'Ferretería', en: 'Hardware' },
      keywords: ['ferreteria', 'tornillo', 'tornillos', 'tornilleria', 'herraje', 'herrajes', 'herramienta', 'herramientas', 'pintura', 'pinturas', 'hardware', 'tools', 'ferragens'],
      osm: [['shop', 'hardware'], ['shop', 'doityourself'], ['shop', 'trade']], nameHint: 'ferreter|tornill|herraj'
    },
    {
      id: 'printing', label: { es: 'Impresión y litografía', en: 'Printing' },
      keywords: ['impresion', 'impresiones', 'litografia', 'tipografia', 'imprenta', 'pendon', 'pendones', 'sticker', 'stickers', 'volantes', 'gran formato', 'printing', 'print shop', 'grafica'],
      osm: [['shop', 'copyshop'], ['craft', 'printer'], ['shop', 'printing']], nameHint: 'litograf|impres|tipograf|imprenta'
    },
    {
      id: 'textiles', label: { es: 'Textiles y confección', en: 'Textiles & sewing' },
      keywords: ['tela', 'telas', 'textil', 'textiles', 'confeccion', 'bordado', 'bordados', 'uniforme', 'uniformes', 'dotacion', 'costura', 'fabric', 'tecidos'],
      osm: [['shop', 'fabric'], ['craft', 'tailor'], ['craft', 'dressmaker'], ['shop', 'sewing']], nameHint: 'textil|confecci|bordad|telas|dotaci'
    },
    {
      id: 'electronics', label: { es: 'Electrónica y eléctricos', en: 'Electronics & electrical' },
      keywords: ['electronica', 'electronicos', 'componentes', 'cable', 'cables', 'electricos', 'led', 'iluminacion', 'electronics', 'electrical', 'eletronicos'],
      osm: [['shop', 'electronics'], ['shop', 'electrical'], ['shop', 'lighting']], nameHint: 'electr|ilumina'
    },
    {
      id: 'food', label: { es: 'Alimentos y cafetería', en: 'Food & catering' },
      keywords: ['alimentos', 'viveres', 'abarrotes', 'frutas', 'verduras', 'cafe', 'refrigerios', 'catering', 'panaderia', 'food', 'groceries', 'alimentos'],
      osm: [['shop', 'wholesale'], ['shop', 'greengrocer'], ['shop', 'bakery'], ['amenity', 'marketplace']], nameHint: 'alimento|viveres|abarrote|frut|catering'
    },
    {
      id: 'cleaning', label: { es: 'Aseo y limpieza', en: 'Cleaning supplies' },
      keywords: ['aseo', 'limpieza', 'desinfectante', 'detergente', 'quimicos', 'jabon', 'cleaning', 'janitorial', 'limpeza'],
      osm: [['shop', 'chemist'], ['shop', 'household'], ['shop', 'cleaning']], nameHint: 'aseo|limpieza|quimic'
    },
    {
      id: 'transport', label: { es: 'Transporte y mensajería', en: 'Transport & courier' },
      keywords: ['transporte', 'mensajeria', 'logistica', 'flete', 'fletes', 'acarreo', 'acarreos', 'trasteo', 'trasteos', 'domicilios', 'courier', 'delivery', 'freight', 'frete'],
      osm: [['office', 'courier'], ['amenity', 'post_office'], ['office', 'logistics']], nameHint: 'transport|mensajer|logistic|acarreo|trasteo'
    },
    {
      id: 'maintenance', label: { es: 'Mantenimiento y reparaciones', en: 'Maintenance & repairs' },
      keywords: ['mantenimiento', 'plomeria', 'plomero', 'electricista', 'reparacion', 'reparaciones', 'soldadura', 'tecnico', 'cerrajeria', 'maintenance', 'repair', 'manutencao'],
      osm: [['craft', 'plumber'], ['craft', 'electrician'], ['craft', 'metal_construction'], ['shop', 'locksmith'], ['craft', 'locksmith']], nameHint: 'mantenim|plomer|electricist|soldad|cerrajer'
    },
    {
      id: 'office', label: { es: 'Papelería y oficina', en: 'Office supplies' },
      keywords: ['papeleria', 'utiles', 'oficina', 'resma', 'resmas', 'toner', 'cartucho', 'stationery', 'office supplies', 'papelaria'],
      osm: [['shop', 'stationery'], ['shop', 'office_supplies']], nameHint: 'papeler|utiles|oficina'
    },
    {
      id: 'furniture', label: { es: 'Carpintería y muebles', en: 'Carpentry & furniture' },
      keywords: ['carpinteria', 'mueble', 'muebles', 'madera', 'ebanisteria', 'mdf', 'furniture', 'carpentry', 'moveis', 'marcenaria'],
      osm: [['craft', 'carpenter'], ['shop', 'furniture'], ['craft', 'cabinet_maker']], nameHint: 'carpinter|mueble|madera|ebanist'
    },
    {
      id: '3dprint', label: { es: 'Impresión 3D y filamento', en: '3D printing & filament' },
      keywords: ['impresion 3d', 'filamento', 'filamentos', 'pla', 'petg', 'resina', '3d printing', 'filament', 'impressao 3d'],
      osm: [['shop', 'electronics'], ['craft', '3d_printing']], nameHint: '3d|filament'
    }
  ];

  function byId(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  /** Category ids whose keywords appear in the text (accent-insensitive, whole words). */
  function detect(text) {
    var hay = ' ' + Text.normalize(text) + ' ';
    return CATEGORIES.filter(function (cat) {
      return cat.keywords.some(function (kw) {
        return hay.indexOf(' ' + Text.normalize(kw) + ' ') !== -1;
      });
    }).map(function (cat) { return cat.id; });
  }

  var api = { CATEGORIES: CATEGORIES, byId: byId, detect: detect };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutCategories = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
