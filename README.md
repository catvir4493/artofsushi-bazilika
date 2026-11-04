# Art of Sushi Bazilika – weboldal

Statikus weboldal (HTML + CSS + JS) az új üzlethez: **Sas u. 4, 1051 Budapest**. A szerkeszthető tartalom a `content/` mappában van (Pages CMS), a `node scripts/build.mjs` írja be a HTML-be a `dist/` mappába. Élesítés, tárhely, háttér: **DEPLOY.md**.
Tervezett domain: **artofsushibp.hu**

## Megnyitás
Dupla klikk az `index.html`-re – böngészőben azonnal működik.

## Fájlok
- `index.html` – kezdőlap: üzletválasztó (Bazilika / Liszt Ferenc tér), `css/entry.css`, `js/entry.js`
- `bazilika.html` – a Bazilika üzlet oldala (magyar / angol)
- `js/i18n.js` – nyelvváltás (HU / EN): a magyar szöveg mellé itt kell felvenni az angol párját. A választás megmarad; első látogatáskor nem magyar nyelvű böngészőben angolul nyílik. `?lang=en` / `?lang=hu` a linkben is működik.
- `css/style.css` – stílus (színek a fájl elején, `:root`)
- `js/main.js` – animációk, nyitvatartás-jelző, galéria, foglalási űrlap
- `images/` – fotók helye
- `download-images.ps1` – letölti a fotókat a régi oldalról ide

## Animációk
Minden animáció saját JavaScript (`js/main.js`), külső könyvtár nélkül: betöltő számláló, nyitó képmaszk,
rögzített hero-jelenet, sima görgetés, görgetésre kitöltődő szöveg, vízszintes galéria, sebességfüggő futószalag,
egyedi kurzor, teljes képernyős menü és függönyös lábléc. A rendszer "csökkentett mozgás" beállításánál ezek kikapcsolnak.

## Fotók
Az `images/` mappában lévő képek **ideiglenes helyettesítők** a fő oldalról (artofsushi.hu, `wp-content/uploads/2025/02/`),
mert a régi oldal (artofsushi.hu/istvan) képei már nem elérhetők (404). A `download-images.ps1` ugyanezt a hozzárendelést tölti le újra.

| Fájl az `images/`-ben | Forrás (2025/02) | Hol látszik |
|---|---|---|
| ART02955.jpg | SS-4.jpg | hero, Szásimi |
| ART02966.jpg | SS-5.jpg | Sushi |
| ART02977.jpg | SS-15.jpg | Előétel |
| ART02988.jpg | SS-3.jpg | Wok |
| ART02922.jpg | SS-1.jpg | Séf ajánlata 1 |
| ART02933.jpg | SS-13.jpg | Séf ajánlata 2 |
| 1-3.jpg, 1-4.jpg | SS-22.jpg, SS-23.jpg | Rólunk |
| 2-1.jpg … 2-8.jpg | SS-6, SS-10, SS-24, SS-5, SS-23, SS-15, SS-1, SS-13 | Galéria |

Saját fotó cseréjéhez: tedd be ugyanazzal a fájlnévvel az `images/` mappába.

## Foglalási űrlap
A foglalások egy Google táblázatba érkeznek (Google Apps Script), e-mail értesítéssel és HU/EN visszaigazolással – telepítés: `apps-script/README.md`.
A `js/main.js` elején: `FORM_ENDPOINT` = az Apps Script webalkalmazás URL-je, `TURNSTILE_SITEKEY` = Cloudflare Turnstile kulcs (opcionális).

## Szerkeszthető tartalom (Pages CMS)
- `content/*.json` – nyitvatartás, telefon, árak, közlemény, étlap, séf ajánlata, galéria, szövegek (magyar + angol)
- `.pages.yml` – a szerkesztőfelület mezői
- a HTML-ben `data-cms…` jelölések mutatják, hová kerül a tartalom; leírás a `scripts/build.mjs` elején
- `js/content-i18n.js` – a build írja felül (a szerkesztett szövegek angol párjai)

## Jogi oldalak
`impresszum.html`, `adatkezeles.html` – a `[ … ]` mezőket a cég adataival ki kell tölteni.
A betűtípusok saját tárhelyen vannak (`fonts/`), a Google térkép csak kattintásra töltődik be.

## Ellenőrizendő
- Szervizdíj: 15% (Bazilika).
- Az árak (12 999 Ft / 6 999 Ft) és szabályok a fő oldalról (artofsushi.hu) származnak – ellenőrizd, hogy a Bazilika üzletre is érvényesek-e.
- Impresszum és adatkezelési tájékoztató: cégadatok kitöltése.
