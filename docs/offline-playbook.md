# Playbook: finding suppliers that are not online

> 🇪🇸 **Resumen:** muchos buenos proveedores no tienen página web. Están en mapas comunitarios, registros públicos, ferias, zonas comerciales y, sobre todo, en la cabeza de la gente que ya les compra. Esta guía explica cada canal, qué parte cubre Supplier Scout y qué sigue siendo trabajo de campo.

A web search only finds suppliers that invested in a website and in being found. In many markets (small workshops, family businesses, informal traders, B2B distributors who sell by phone) that is a minority. The channels below are how purchasing teams find the rest. Each one lists what Supplier Scout does for it and what remains manual.

| # | Channel | What Supplier Scout does | What stays manual |
|---|---|---|---|
| 1 | **Referrals** from current suppliers, colleagues and clients | Drafts the "who do you buy this from?" message; records who recommended whom; counts only *independent* referrals toward trust | Sending the message and calling back |
| 2 | **Public registries** (procurement portals, chambers of commerce) | SECOP II connector (Colombia); works with any Socrata open-data portal; CSV import for any other registry export | Downloading exports from portals without an API |
| 3 | **Community maps** (OpenStreetMap) | Connector for any country, with accent-insensitive name search; reports how many results have no website | Adding missing businesses to OSM (you can!) |
| 4 | **Trade districts and fairs** | CSV import with automatic column recognition (Spanish, English, Portuguese); duplicate detection against what you already have | Walking the district, collecting exhibitor lists |
| 5 | **Business cards, flyers, WhatsApp messages** | Rule-based parser (offline, no AI): name, tax ID with check digit, phones, emails, social handles, address, prices, pack sizes, minimum order, lead time, payment terms | Photographing or typing the text |
| 6 | **Verification** | Tax-ID check digits (CO, CL, AR, PE, BR), verification levels, human review queue | Visiting, requesting a sample, checking the registry |

## 1. Ask the people who already buy

The single most effective channel. Your current suppliers buy from other suppliers; your colleagues in other companies buy the same things you do. Ask a specific question ("who do you buy corrugated boxes from?") and explicitly invite suppliers without a website. The app drafts this message for you (tab *Offline → Ask for referrals*).

How trust works with referrals:

- Each **independent** recommendation adds trust, up to a cap.
- A supplier recommending itself counts for nothing.
- Two companies with the same tax ID (same group) recommending each other count for nothing.
- Two suppliers that only recommend each other count half ("mutual").

## 2. Public registries

Businesses that sell to the state register in public procurement systems, usually with their tax ID, city and activity, whether or not they have a website.

| Country | Registry | In this project |
|---|---|---|
| Colombia | SECOP II · Proveedores registrados (datos.gov.co) | `npm run scout -- registry --preset secop-co` |
| Colombia | RUES (chambers of commerce) | Manual search; import results as CSV |
| Mexico, Peru, Chile, others | Public procurement portals and business registries | Export to CSV and import |
| Any country | Open-data portals on Socrata | `registry` connector with your own domain and dataset id |

Suppliers found in an official registry with a valid tax-ID check digit start at verification level **formal**.

## 3. Community maps

OpenStreetMap is mapped by volunteers walking the streets, so it includes many small shops and workshops with no web presence. `npm run scout -- osm --category packaging --lat … --lng …` returns them with phone numbers and opening hours when mapped, and tells you how many have no website. Data © OpenStreetMap contributors (ODbL).

## 4. Trade districts and fairs

Most cities have streets or districts where one trade concentrates. In Bogotá, for example, San Victorino (textiles and wholesale), Ricaurte (electrical supplies and hardware) and El Restrepo (footwear and leather). Trade fairs publish exhibitor lists. Both end up as a spreadsheet: import it as CSV and the app recognises columns such as "Razón social", "NIT", "Celular" or "Company name" automatically.

## 5. Cards, flyers and WhatsApp

Paste the text in *Offline → Field capture*. The parser runs in your browser, without AI and without internet, and shows every field with a confidence level. Everything captured goes to the review queue; nothing is trusted automatically.

Personal data: a sole trader's mobile number is personal data. In Colombia, Law 1581 of 2012 (Habeas Data) requires authorisation to store and use it. The capture form has a consent checkbox, the ranking warns when consent was refused, and all data stays in your browser unless you export it.

## 6. Verify before you buy

| Level | Meaning |
|---|---|
| 0 · Unverified | Only captured or imported data |
| 1 · Contacted | They answered and confirmed their details |
| 2 · Formal | Tax ID checked in an official registry |
| 3 · Visited / sample | You visited or received a sample |
| 4 · Bought from | You bought and they delivered as promised |

A supplier with no reviews is scored **neutral**, not bad. Verification and independent referrals are how an offline supplier earns trust.
