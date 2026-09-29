/**
 * Synthetic demo data. Every company, person, tax ID, phone and address is fictional.
 *
 * - Websites and emails use the reserved .example domain.
 * - Colombian phones use the 999 prefix, which is not assigned to any line in
 *   Colombia, so no demo WhatsApp link can reach a real person. Mexican phones
 *   use 55 0000 xxxx and Brazilian ones (11) 0000-0xxx, likewise not real
 *   subscriber ranges.
 * - Tax IDs are generated (999 series) with a correct check digit so the
 *   validation logic can be shown; they are not meant to belong to anyone.
 * - Neighbourhood coordinates are approximate and public geography only.
 */
(function (root) {
  'use strict';

  var TODAY = '2026-09-29';

  function src(type, ref, at) {
    return { type: type, ref: ref, at: at || '2026-09-15' };
  }

  function nit(value) {
    return { value: value, label: 'NIT', country: 'CO', valid: true, checked: 'checksum' };
  }

  function rfc(value) {
    return { value: value, label: 'RFC', country: 'MX', valid: true, checked: 'format' };
  }

  function cnpj(value) {
    return { value: value, label: 'CNPJ', country: 'BR', valid: true, checked: 'checksum' };
  }

  var bogota = {
    id: 'bogota',
    country: 'CO',
    label: { es: 'Bogotá (Colombia)', en: 'Bogotá (Colombia)', pt: 'Bogotá (Colômbia)', fr: 'Bogotá (Colombie)' },
    clusters: 'San Victorino, Ricaurte, El Restrepo',
    fx: { USD: 3900 },
    origins: [
      { id: 'fontibon', label: 'Fontibón', lat: 4.6782, lng: -74.1411 },
      { id: 'chapinero', label: 'Chapinero', lat: 4.6486, lng: -74.0628 },
      { id: 'centro', label: 'Centro', lat: 4.5981, lng: -74.0760 }
    ],
    needs: [
      { id: 'boxes', category: 'packaging', item: 'cajas de cartón corrugado', quantity: 500, unit: 'unidad', originId: 'fontibon', radiusKm: 12, neededInDays: 7 },
      { id: 'flyers', category: 'printing', item: 'volantes a color', quantity: 2000, unit: 'unidad', originId: 'centro', radiusKm: 8, neededInDays: 5 },
      { id: 'screws', category: 'hardware', item: 'tornillos drywall', quantity: 1000, unit: 'unidad', originId: 'fontibon', radiusKm: 10, neededInDays: 3 },
      { id: 'pla', category: '3dprint', item: 'filamento PLA', quantity: 20, unit: 'kg', originId: 'chapinero', radiusKm: 10, neededInDays: 15 }
    ],
    suppliers: [
      // ---- packaging ----
      { id: 'bog-empaques-andinos', name: 'Empaques Andinos SAS', categories: ['packaging'], taxId: nit('999000101-0'),
        phones: ['+579990000101'], emails: ['ventas@empaquesandinos.example'], websites: ['https://empaquesandinos.example/'],
        address: 'Zona industrial Montevideo', city: 'Bogotá', country: 'CO', lat: 4.6490, lng: -74.1130, ships: true,
        sources: [src('web', 'empaquesandinos.example', '2026-09-20')], verification: 1,
        rating: { avg: 4.6, count: 212, source: 'maps' } },
      { id: 'bog-cartonexpress', name: 'CartonExpress Marketplace', categories: ['packaging'],
        phones: ['+579990000102'], emails: ['pedidos@cartonexpress.example'], websites: ['https://cartonexpress.example/'],
        city: 'Soacha', country: 'CO', lat: 4.5790, lng: -74.2170, ships: true,
        sources: [src('web', 'cartonexpress.example', '2026-09-21')], verification: 0,
        rating: { avg: 4.9, count: 8, source: 'marketplace' } },
      { id: 'bog-cajas-el-porvenir', name: 'Cajas El Porvenir', categories: ['packaging'],
        phones: ['+579990000103'], address: 'Barrio El Porvenir, Fontibón', city: 'Bogotá', country: 'CO', lat: 4.6700, lng: -74.1300,
        sources: [src('map', 'osm:node/demo-103', '2026-09-22')], verification: 1, consent: true,
        notes: 'Taller familiar. Solo vende por WhatsApp; sin página web.' },
      { id: 'bog-corrugados-sabana', name: 'Corrugados La Sabana SAS', categories: ['packaging'], taxId: nit('999000104-2'),
        phones: ['+579990000104'], emails: ['comercial@corrugadossabana.example'],
        address: 'Km 2 vía Funza', city: 'Funza', country: 'CO', lat: 4.7160, lng: -74.2110, ships: true,
        sources: [src('registry', 'SECOP II · proveedores registrados', '2026-09-22')], verification: 2 },
      { id: 'bog-empaques-dona-rosa', name: 'Empaques Doña Rosa', categories: ['packaging'], taxId: nit('999000105-1'),
        phones: ['+579990000105'], address: 'Kennedy Central', city: 'Bogotá', country: 'CO', lat: 4.6280, lng: -74.1510, ships: true,
        sources: [src('referral', 'Laura · compras', '2026-09-08')], verification: 3, consent: true,
        internalReviews: [
          { by: 'Compras', stars: 5, note: 'Muestra impecable, corrugado de buena calidad.', at: '2026-09-10' },
          { by: 'Bodega', stars: 4, note: 'Pedido de prueba llegó un día tarde.', at: '2026-09-18' }
        ],
        notes: 'Recomendada por Laura y por Papelería Andina. Visitamos el taller.' },
      { id: 'bog-dona-rosa-tarjeta', name: 'EMPAQUES DOÑA ROSA', categories: ['packaging'],
        phones: ['+579990000105'], address: 'Cl 38 Sur # 78-20', city: 'Bogotá', country: 'CO',
        sources: [src('field', 'Tarjeta de presentación · feria', '2026-09-25')], verification: 0 },
      { id: 'bog-cajas-porvenir-dir', name: 'Cajas Porvenir', categories: ['packaging'],
        address: 'Fontibón', city: 'Bogotá', country: 'CO', lat: 4.6703, lng: -74.1296,
        sources: [src('web', 'directorio en línea', '2026-09-23')], verification: 0,
        rating: { avg: 4.2, count: 15, source: 'directory' } },
      { id: 'bog-bolsas-cajas-kraft', name: 'Bolsas y Cajas Kraft', categories: ['packaging'],
        phones: ['+579990000106'], socials: ['@cajaskraft.demo'], address: 'Puente Aranda', city: 'Bogotá', country: 'CO',
        lat: 4.6246, lng: -74.1100, sources: [src('field', 'Tarjeta de presentación · feria', '2026-09-25')], verification: 0 },
      { id: 'bog-cartonajes-norte', name: 'Cartonajes del Norte', categories: ['packaging'],
        phones: ['+579990000107'], city: 'Bogotá', country: 'CO', lat: 4.7300, lng: -74.0250,
        sources: [src('map', 'osm:node/demo-107', '2026-09-22')], verification: 0 },
      // ---- an existing, trusted supplier (it refers others) ----
      { id: 'bog-papeleria-andina', name: 'Papelería Andina SAS', categories: ['office'], taxId: nit('999000108-1'),
        phones: ['+579990000108'], emails: ['compras@papeleriaandina.example'], websites: ['https://papeleriaandina.example/'],
        city: 'Bogotá', country: 'CO', lat: 4.6090, lng: -74.0820, ships: true,
        sources: [src('import', 'proveedores actuales', '2026-01-10')], verification: 4,
        internalReviews: [{ by: 'Compras', stars: 5, note: 'Proveedor de hace dos años, siempre cumple.', at: '2026-06-01' }] },
      // ---- printing ----
      { id: 'bog-litografia-central', name: 'Litografía Central', categories: ['printing'],
        phones: ['+579990000109'], emails: ['cotizaciones@litocentral.example'], websites: ['https://litocentral.example/'],
        city: 'Bogotá', country: 'CO', lat: 4.6400, lng: -74.0650, ships: true,
        sources: [src('web', 'litocentral.example')], verification: 1, rating: { avg: 4.4, count: 96, source: 'maps' } },
      { id: 'bog-impresos-ricaurte', name: 'Impresos Ricaurte', categories: ['printing'], taxId: nit('999000110-7'),
        phones: ['+579990000110'], address: 'Barrio Ricaurte', city: 'Bogotá', country: 'CO', lat: 4.6090, lng: -74.0930,
        sources: [src('field', 'Visita de campo', '2026-08-30')], verification: 3, consent: true,
        internalReviews: [{ by: 'Mercadeo', stars: 5, note: 'Colores fieles, entregó antes de lo prometido.', at: '2026-09-05' }] },
      { id: 'bog-tipografia-sv', name: 'Tipografía San Victorino', categories: ['printing'],
        phones: ['+579990000111'], address: 'San Victorino', city: 'Bogotá', country: 'CO', lat: 4.6010, lng: -74.0800,
        sources: [src('referral', 'Laura · compras', '2026-09-12')], verification: 1, consent: true },
      // ---- hardware ----
      { id: 'bog-ferremax', name: 'FerreMax Online', categories: ['hardware'],
        phones: ['+579990000112'], emails: ['servicio@ferremax.example'], websites: ['https://ferremax.example/'],
        city: 'Bogotá', country: 'CO', lat: 4.6520, lng: -74.1080, ships: true,
        sources: [src('web', 'ferremax.example')], verification: 1, rating: { avg: 4.3, count: 540, source: 'maps' } },
      { id: 'bog-tornillo-feliz', name: 'Ferretería El Tornillo Feliz', categories: ['hardware'], taxId: nit('999000113-9'),
        phones: ['+579990000113'], emails: ['ventas@tornillofeliz.example'], address: 'Cra 68 # 13-45 Local 2', city: 'Bogotá',
        country: 'CO', lat: 4.6320, lng: -74.1150, sources: [src('field', 'Tarjeta de presentación', '2026-09-19')],
        verification: 1, consent: true },
      { id: 'bog-herrajes-7-agosto', name: 'Herrajes Siete de Agosto', categories: ['hardware'],
        phones: ['+579990000114'], city: 'Bogotá', country: 'CO', lat: 4.6600, lng: -74.0700,
        sources: [src('map', 'osm:node/demo-114')], verification: 0 },
      // ---- 3D printing ----
      { id: 'bog-filamentos-3d', name: 'Filamentos Bogotá 3D', categories: ['3dprint'],
        phones: ['+579990000115'], emails: ['hola@filamentos3d.example'], websites: ['https://filamentos3d.example/'],
        city: 'Bogotá', country: 'CO', lat: 4.6486, lng: -74.0628, ships: true,
        sources: [src('web', 'filamentos3d.example')], verification: 1, rating: { avg: 4.8, count: 61, source: 'maps' } },
      { id: 'bog-maker-chapinero', name: 'Taller Maker Chapinero', categories: ['3dprint'],
        phones: ['+579990000116'], socials: ['@makerchapinero.demo'], city: 'Bogotá', country: 'CO', lat: 4.6530, lng: -74.0610,
        sources: [src('referral', 'Andrés · producción', '2026-09-02')], verification: 3, consent: true,
        internalReviews: [{ by: 'Producción', stars: 5, note: 'Filamento seco y bien embobinado.', at: '2026-09-12' }] },
      { id: 'bog-importfil', name: 'ImportFil Direct', categories: ['3dprint'],
        emails: ['sales@importfil.example'], websites: ['https://importfil.example/'], country: 'US', ships: true,
        sources: [src('web', 'importfil.example')], verification: 0, rating: { avg: 4.5, count: 1200, source: 'marketplace' } },
      // ---- textiles ----
      { id: 'bog-confecciones-sv', name: 'Confecciones San Victorino', categories: ['textiles'],
        phones: ['+579990000117'], city: 'Bogotá', country: 'CO', lat: 4.6010, lng: -74.0810,
        sources: [src('map', 'osm:node/demo-117')], verification: 0 },
      { id: 'bog-bordados-luna', name: 'Bordados Luna', categories: ['textiles'],
        phones: ['+579990000118'], address: 'El Restrepo', city: 'Bogotá', country: 'CO', lat: 4.5870, lng: -74.1030,
        sources: [src('field', 'Mensaje de WhatsApp', '2026-09-26')], verification: 1, consent: false,
        notes: 'No autorizó guardar sus datos personales: pedir autorización o borrar.' }
    ],
    quotes: [
      { id: 'q-andinos', supplierId: 'bog-empaques-andinos', category: 'packaging', item: 'Caja corrugada 40x30x30',
        price: 62000, currency: 'COP', per: { qty: 25, unit: 'unidad' }, taxIncluded: false, shipping: 25000, leadDays: 3, paymentDays: 0, at: '2026-09-20' },
      { id: 'q-cartonexpress', supplierId: 'bog-cartonexpress', category: 'packaging', item: 'Caja corrugada 40x30x30',
        price: 2100, currency: 'COP', per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 60000,
        minOrder: { qty: 1000, unit: 'unidad' }, leadDays: 10, paymentDays: 0, at: '2026-09-21' },
      { id: 'q-porvenir', supplierId: 'bog-cajas-el-porvenir', category: 'packaging', item: 'Caja 40x30x30 (WhatsApp)',
        price: 2600, currency: 'COP', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 15000, leadDays: 2, paymentDays: 0, at: '2026-09-23' },
      { id: 'q-sabana', supplierId: 'bog-corrugados-sabana', category: 'packaging', item: 'Caja corrugada 40x30x30',
        price: 135000, currency: 'COP', per: { qty: 50, unit: 'unidad' }, taxIncluded: false, shipping: 0, leadDays: 5, paymentDays: 30, at: '2026-09-24' },
      { id: 'q-dona-rosa', supplierId: 'bog-empaques-dona-rosa', category: 'packaging', item: 'Caja corrugada 40x30x30',
        price: 2450, currency: 'COP', per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 0, leadDays: 4, paymentDays: 15, at: '2026-09-18' },
      { id: 'q-litocentral', supplierId: 'bog-litografia-central', category: 'printing', item: 'Volantes media carta 4x0',
        price: 180000, currency: 'COP', per: { qty: 1000, unit: 'unidad' }, taxIncluded: false, shipping: 12000, leadDays: 3, paymentDays: 0 },
      { id: 'q-ricaurte', supplierId: 'bog-impresos-ricaurte', category: 'printing', item: 'Volantes media carta 4x0',
        price: 150000, currency: 'COP', per: { qty: 1000, unit: 'unidad' }, taxIncluded: true, shipping: 0, leadDays: 2, paymentDays: 0 },
      { id: 'q-tipografia', supplierId: 'bog-tipografia-sv', category: 'printing', item: 'Volantes media carta 4x0',
        price: 95, currency: 'COP', per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 0,
        minOrder: { qty: 3000, unit: 'unidad' }, leadDays: 6, paymentDays: 0 },
      { id: 'q-ferremax', supplierId: 'bog-ferremax', category: 'hardware', item: 'Tornillo drywall 6x1',
        price: 21000, currency: 'COP', per: { qty: 100, unit: 'unidad' }, taxIncluded: true, shipping: 9900, leadDays: 1, paymentDays: 0 },
      { id: 'q-tornillo', supplierId: 'bog-tornillo-feliz', category: 'hardware', item: 'Tornillo drywall 6x1',
        price: 18500, currency: 'COP', per: { qty: 100, unit: 'unidad' }, taxIncluded: true, shipping: 0, leadDays: 2, paymentDays: 30 },
      { id: 'q-fil3d', supplierId: 'bog-filamentos-3d', category: '3dprint', item: 'PLA 1.75 mm',
        price: 89000, currency: 'COP', per: { qty: 1, unit: 'kg' }, taxIncluded: true, shipping: 15000, leadDays: 2, paymentDays: 0 },
      { id: 'q-maker', supplierId: 'bog-maker-chapinero', category: '3dprint', item: 'PLA 1.75 mm',
        price: 76000, currency: 'COP', per: { qty: 1, unit: 'kg' }, taxIncluded: false, shipping: 0, leadDays: 3, paymentDays: 0 },
      { id: 'q-importfil', supplierId: 'bog-importfil', category: '3dprint', item: 'PLA 1.75 mm (import)',
        price: 14.5, currency: 'USD', per: { qty: 1, unit: 'kg' }, taxIncluded: false, shipping: 45, leadDays: 12, paymentDays: 0 }
    ],
    referrals: [
      { id: 'r1', from: 'person:laura', fromLabel: 'Laura · compras', to: 'bog-empaques-dona-rosa', relation: 'colleague', at: '2026-09-08' },
      { id: 'r2', from: 'bog-papeleria-andina', to: 'bog-empaques-dona-rosa', relation: 'supplier', at: '2026-09-09',
        note: 'Les compran las cajas para despachar resmas.' },
      { id: 'r3', from: 'bog-empaques-dona-rosa', to: 'bog-cajas-el-porvenir', relation: 'supplier', at: '2026-09-18' },
      { id: 'r4', from: 'bog-cajas-el-porvenir', to: 'bog-empaques-dona-rosa', relation: 'supplier', at: '2026-09-23' },
      { id: 'r5', from: 'person:andres', fromLabel: 'Andrés · producción', to: 'bog-maker-chapinero', relation: 'colleague', at: '2026-09-02' },
      { id: 'r6', from: 'person:laura', fromLabel: 'Laura · compras', to: 'bog-tipografia-sv', relation: 'colleague', at: '2026-09-12' },
      { id: 'r7', from: 'bog-impresos-ricaurte', to: 'bog-tipografia-sv', relation: 'supplier', at: '2026-09-13' }
    ]
  };

  var cdmx = {
    id: 'cdmx',
    country: 'MX',
    label: { es: 'Ciudad de México (México)', en: 'Mexico City (Mexico)', pt: 'Cidade do México (México)', fr: 'Mexico (Mexique)' },
    clusters: 'La Merced, Centro Histórico, Azcapotzalco',
    fx: { USD: 18.5 },
    origins: [
      { id: 'azcapotzalco', label: 'Azcapotzalco', lat: 19.4869, lng: -99.1844 },
      { id: 'roma', label: 'Roma Norte', lat: 19.4190, lng: -99.1600 }
    ],
    needs: [
      { id: 'boxes', category: 'packaging', item: 'cajas de cartón corrugado', quantity: 300, unit: 'unidad', originId: 'azcapotzalco', radiusKm: 12, neededInDays: 7 },
      { id: 'pla', category: '3dprint', item: 'filamento PLA', quantity: 10, unit: 'kg', originId: 'roma', radiusKm: 10, neededInDays: 10 }
    ],
    suppliers: [
      { id: 'mx-empaques-anahuac', name: 'Empaques Anáhuac SA de CV', categories: ['packaging'], taxId: rfc('EAN990101AB1'),
        phones: ['+525500000201'], emails: ['ventas@empaquesanahuac.example'], websites: ['https://empaquesanahuac.example/'],
        city: 'Ciudad de México', country: 'MX', lat: 19.4900, lng: -99.1800, ships: true,
        sources: [src('web', 'empaquesanahuac.example')], verification: 1, rating: { avg: 4.5, count: 130, source: 'maps' } },
      { id: 'mx-cajas-dona-lupe', name: 'Cajas Doña Lupe', categories: ['packaging'],
        phones: ['+525500000202'], address: 'Tacuba', city: 'Ciudad de México', country: 'MX', lat: 19.4590, lng: -99.1880,
        sources: [src('referral', 'Sofía · almacén')], verification: 3, consent: true,
        internalReviews: [{ by: 'Almacén', stars: 5, note: 'Cajas firmes, entrega puntual.', at: '2026-09-11' }] },
      { id: 'mx-carton-del-valle', name: 'Cartón del Valle', categories: ['packaging'],
        phones: ['+525500000203'], city: 'Ciudad de México', country: 'MX', lat: 19.4750, lng: -99.1650,
        sources: [src('map', 'osm:node/demo-203')], verification: 0 },
      { id: 'mx-corrugados-tlalne', name: 'Corrugados Tlalnepantla', categories: ['packaging'], taxId: rfc('CTL990101CD2'),
        phones: ['+525500000204'], emails: ['contacto@corrugadostlalne.example'], city: 'Tlalnepantla', country: 'MX',
        lat: 19.5400, lng: -99.1950, ships: true, sources: [src('import', 'Lista de expositores · feria')], verification: 1 },
      { id: 'mx-filamentos-valle', name: 'Filamentos del Valle', categories: ['3dprint'], taxId: rfc('FDV990101AB1'),
        phones: ['+525500000205'], address: 'Av. Insurgentes Sur 1234', city: 'Ciudad de México', country: 'MX',
        lat: 19.3900, lng: -99.1700, sources: [src('field', 'Volante')], verification: 1, consent: true },
      { id: 'mx-maker-roma', name: 'Maker Space Roma', categories: ['3dprint'],
        phones: ['+525500000206'], city: 'Ciudad de México', country: 'MX', lat: 19.4150, lng: -99.1620,
        sources: [src('referral', 'Diego · diseño')], verification: 2 }
    ],
    quotes: [
      { id: 'mq-anahuac', supplierId: 'mx-empaques-anahuac', category: 'packaging', item: 'Caja 40x30x30',
        price: 18.5, currency: 'MXN', per: { qty: 1, unit: 'unidad' }, taxIncluded: false, shipping: 350, leadDays: 3, paymentDays: 0 },
      { id: 'mq-lupe', supplierId: 'mx-cajas-dona-lupe', category: 'packaging', item: 'Caja 40x30x30',
        price: 16, currency: 'MXN', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 0, leadDays: 2, paymentDays: 15 },
      { id: 'mq-tlalne', supplierId: 'mx-corrugados-tlalne', category: 'packaging', item: 'Caja 40x30x30',
        price: 1500, currency: 'MXN', per: { qty: 100, unit: 'unidad' }, taxIncluded: false, shipping: 0,
        minOrder: { qty: 500, unit: 'unidad' }, leadDays: 6, paymentDays: 30 },
      { id: 'mq-filvalle', supplierId: 'mx-filamentos-valle', category: '3dprint', item: 'PLA 1.75 mm',
        price: 420, currency: 'MXN', per: { qty: 1, unit: 'kg' }, taxIncluded: true, shipping: 150, leadDays: 2, paymentDays: 0 },
      { id: 'mq-maker', supplierId: 'mx-maker-roma', category: '3dprint', item: 'PLA 1.75 mm',
        price: 22, currency: 'USD', per: { qty: 1, unit: 'kg' }, taxIncluded: true, shipping: 0, leadDays: 4, paymentDays: 0 }
    ],
    referrals: [
      { id: 'mr1', from: 'person:sofia', fromLabel: 'Sofía · almacén', to: 'mx-cajas-dona-lupe', relation: 'colleague' },
      { id: 'mr2', from: 'mx-empaques-anahuac', to: 'mx-cajas-dona-lupe', relation: 'supplier' },
      { id: 'mr3', from: 'person:diego', fromLabel: 'Diego · diseño', to: 'mx-maker-roma', relation: 'colleague' }
    ]
  };

  var saoPaulo = {
    id: 'sao-paulo',
    country: 'BR',
    label: { es: 'São Paulo (Brasil)', en: 'São Paulo (Brazil)', pt: 'São Paulo (Brasil)', fr: 'São Paulo (Brésil)' },
    clusters: 'Brás, Rua 25 de Março, Santa Ifigênia',
    fx: { USD: 5.4 },
    origins: [
      { id: 'mooca', label: 'Mooca', lat: -23.5600, lng: -46.5990 },
      { id: 'se', label: 'Sé (Centro)', lat: -23.5503, lng: -46.6340 }
    ],
    needs: [
      { id: 'boxes', category: 'packaging', item: 'caixas de papelão ondulado', quantity: 500, unit: 'unidad', originId: 'mooca', radiusKm: 15, neededInDays: 7 },
      { id: 'cables', category: 'electronics', item: 'cabos de rede', quantity: 100, unit: 'unidad', originId: 'se', radiusKm: 5, neededInDays: 5 }
    ],
    suppliers: [
      { id: 'sp-embalagens-paulista', name: 'Embalagens Paulista Ltda', categories: ['packaging'], taxId: cnpj('99.900.301/0001-39'),
        phones: ['+551100000301'], emails: ['vendas@embalagenspaulista.example'], websites: ['https://embalagenspaulista.example/'],
        address: 'Rua da Mooca, 1200', city: 'São Paulo', country: 'BR', lat: -23.5570, lng: -46.6010, ships: true,
        sources: [src('web', 'embalagenspaulista.example', '2026-09-20')], verification: 1,
        rating: { avg: 4.5, count: 180, source: 'maps' } },
      { id: 'sp-caixas-dona-cida', name: 'Caixas Dona Cida', categories: ['packaging'],
        phones: ['+551100000302'], address: 'Brás', city: 'São Paulo', country: 'BR', lat: -23.5440, lng: -46.6160, ships: true,
        sources: [src('referral', 'Marcos · compras', '2026-09-06')], verification: 3, consent: true,
        internalReviews: [
          { by: 'Compras', stars: 5, note: 'Papelão firme, amostra aprovada.', at: '2026-09-12' },
          { by: 'Expedição', stars: 4, note: 'Entregou no prazo.', at: '2026-09-20' }
        ],
        notes: 'Oficina familiar. Vende só por WhatsApp; sem site.' },
      { id: 'sp-cida-cartao', name: 'CAIXAS DONA CIDA', categories: ['packaging'],
        phones: ['+551100000302'], address: 'Rua do Gasômetro, Brás', city: 'São Paulo', country: 'BR',
        sources: [src('field', 'Cartão de visita · feira', '2026-09-24')], verification: 0 },
      { id: 'sp-papelao-ipiranga', name: 'Papelão Ipiranga', categories: ['packaging'],
        phones: ['+551100000303'], city: 'São Paulo', country: 'BR', lat: -23.5870, lng: -46.6100,
        sources: [src('map', 'osm:node/demo-303', '2026-09-22')], verification: 0 },
      { id: 'sp-ondulados-guarulhos', name: 'Ondulados Guarulhos Ltda', categories: ['packaging'], taxId: cnpj('99.900.304/0001-72'),
        phones: ['+551100000304'], emails: ['comercial@onduladosguarulhos.example'], city: 'Guarulhos', country: 'BR',
        lat: -23.4540, lng: -46.5330, ships: true, sources: [src('registry', 'PNCP · fornecedores', '2026-09-22')], verification: 2 },
      { id: 'sp-caixaja', name: 'CaixaJá Marketplace', categories: ['packaging'],
        emails: ['pedidos@caixaja.example'], websites: ['https://caixaja.example/'], city: 'Barueri', country: 'BR',
        lat: -23.5110, lng: -46.8760, ships: true, sources: [src('web', 'caixaja.example', '2026-09-21')], verification: 0,
        rating: { avg: 4.9, count: 6, source: 'marketplace' } },
      { id: 'sp-eletro-ifigenia', name: 'Eletrônica Santa Ifigênia', categories: ['electronics'],
        phones: ['+551100000305'], address: 'Rua Santa Ifigênia', city: 'São Paulo', country: 'BR', lat: -23.5395, lng: -46.6385,
        sources: [src('field', 'Cartão de visita', '2026-09-18')], verification: 1, consent: true },
      { id: 'sp-cabos-centro', name: 'Cabos & Conectores Centro Ltda', categories: ['electronics'], taxId: cnpj('99.900.306/0001-61'),
        phones: ['+551100000306'], emails: ['vendas@caboscentro.example'], websites: ['https://caboscentro.example/'],
        city: 'São Paulo', country: 'BR', lat: -23.5450, lng: -46.6330, ships: true,
        sources: [src('web', 'caboscentro.example', '2026-09-19')], verification: 1, rating: { avg: 4.3, count: 95, source: 'maps' } },
      { id: 'sp-rede-25', name: 'Rede 25 Distribuidora', categories: ['electronics'],
        phones: ['+551100000307'], address: 'Rua 25 de Março', city: 'São Paulo', country: 'BR', lat: -23.5435, lng: -46.6320,
        sources: [src('referral', 'Eletrônica Santa Ifigênia', '2026-09-19')], verification: 1 }
    ],
    quotes: [
      { id: 'sq-paulista', supplierId: 'sp-embalagens-paulista', category: 'packaging', item: 'Caixa 40x30x30',
        price: 2.9, currency: 'BRL', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 45, leadDays: 3, paymentDays: 0 },
      { id: 'sq-cida', supplierId: 'sp-caixas-dona-cida', category: 'packaging', item: 'Caixa 40x30x30',
        price: 3.1, currency: 'BRL', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 0, leadDays: 2, paymentDays: 15 },
      { id: 'sq-guarulhos', supplierId: 'sp-ondulados-guarulhos', category: 'packaging', item: 'Caixa 40x30x30',
        price: 250, currency: 'BRL', per: { qty: 100, unit: 'unidad' }, taxIncluded: true, shipping: 0,
        minOrder: { qty: 1000, unit: 'unidad' }, leadDays: 6, paymentDays: 30 },
      { id: 'sq-caixaja', supplierId: 'sp-caixaja', category: 'packaging', item: 'Caixa 40x30x30',
        price: 2.4, currency: 'BRL', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 90,
        minOrder: { qty: 1000, unit: 'unidad' }, leadDays: 10, paymentDays: 0 },
      { id: 'sq-ifigenia', supplierId: 'sp-eletro-ifigenia', category: 'electronics', item: 'Cabo de rede Cat6 2 m',
        price: 8.5, currency: 'BRL', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 0, leadDays: 1, paymentDays: 0 },
      { id: 'sq-cabos', supplierId: 'sp-cabos-centro', category: 'electronics', item: 'Cabo de rede Cat6 2 m',
        price: 79.9, currency: 'BRL', per: { qty: 10, unit: 'unidad' }, taxIncluded: true, shipping: 25, leadDays: 2, paymentDays: 0 },
      { id: 'sq-rede25', supplierId: 'sp-rede-25', category: 'electronics', item: 'Cabo de rede Cat6 2 m',
        price: 6.9, currency: 'BRL', per: { qty: 1, unit: 'unidad' }, taxIncluded: true, shipping: 0,
        minOrder: { qty: 200, unit: 'unidad' }, leadDays: 3, paymentDays: 30 }
    ],
    referrals: [
      { id: 'sr1', from: 'person:marcos', fromLabel: 'Marcos · compras', to: 'sp-caixas-dona-cida', relation: 'colleague', at: '2026-09-06' },
      { id: 'sr2', from: 'person:ana', fromLabel: 'Ana · logística', to: 'sp-caixas-dona-cida', relation: 'colleague', at: '2026-09-10' },
      { id: 'sr3', from: 'sp-embalagens-paulista', to: 'sp-caixas-dona-cida', relation: 'supplier', at: '2026-09-15',
        note: 'Indica a oficina para pedidos pequenos.' },
      { id: 'sr4', from: 'sp-eletro-ifigenia', to: 'sp-rede-25', relation: 'supplier', at: '2026-09-19' }
    ]
  };

  // Texts to try the field-capture parser. Fictional.
  var CAPTURE_EXAMPLES = {
    card: [
      'FERRETERÍA LA LLAVE DORADA',
      'Tornillería, herrajes y pinturas',
      'NIT 999.000.121-8',
      'Cra 68 # 13-80 Local 5, Bogotá',
      'Cel/WhatsApp 999 000 0121',
      'ventas@llavedorada.example',
      'Caja x 100 tornillos drywall $17.900 IVA incluido',
      'Entrega en 2 días hábiles. Crédito a 30 días.'
    ].join('\n'),
    whatsapp: 'Hola, somos Empaques La Pradera y fabricamos cajas de cartón corrugado. Caja 40x30x30 a 2.380 c/u + IVA, pedido mínimo 300 unidades. Entregamos en 3 días. Hacemos envíos a todo Bogotá. Escríbenos al 999 000 0122 o IG @empaqueslapradera.demo',
    flyer: [
      'Filamentos Coyoacán S.A. de C.V.',
      'RFC FCO990101XY9',
      'Av. Universidad 1500, CDMX',
      'Tel. 55 0000 0207',
      'PLA 1 kg $395 MXN IVA incluido',
      'Envío $120'
    ].join('\n'),
    cartao: [
      'EMBALAGENS VILA MARIA',
      'Caixas de papelão e fitas adesivas',
      'CNPJ 99.900.308/0001-50',
      'Rua das Embalagens, 450 - Vila Maria, São Paulo',
      'Tel/WhatsApp (11) 0000-0309',
      'vendas@vilamaria.example',
      'Caixa 40x30x30 c/ 25 R$ 89,90 com impostos',
      'Entrega em 3 dias. Boleto 28 dias.'
    ].join('\n')
  };

  var api = { TODAY: TODAY, DATASETS: { bogota: bogota, cdmx: cdmx, 'sao-paulo': saoPaulo }, CAPTURE_EXAMPLES: CAPTURE_EXAMPLES };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ScoutSample = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
