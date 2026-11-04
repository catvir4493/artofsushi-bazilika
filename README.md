# Art of Sushi Bazilika – weboldal

Statikus weboldal (HTML + CSS + JS, nincs build lépés) az új üzlethez: **Sas u. 4, 1051 Budapest**.
Tervezett domain: **artofsushi-bazilika.hu**

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
Statikus oldalon nincs szerver, ezért a `js/main.js` elején a `CONFIG`-ban állítsd be:
- `FORM_ENDPOINT` – pl. ingyenes Formspree URL (https://formspree.io) → e-mailben jönnek a foglalások
- vagy `BOOKING_EMAIL` – a látogató levelezője nyílik meg kitöltött levéllel
Ha egyik sincs megadva, az űrlap telefonos megerősítést kér (+36 30 516 1606).

## Ellenőrizendő
- Szervizdíj: 15% (Bazilika).
- Az árak (12 999 Ft / 6 999 Ft) és szabályok a fő oldalról (artofsushi.hu) származnak – ellenőrizd, hogy a Bazilika üzletre is érvényesek-e.
- Adatkezelési tájékoztató: jelenleg a fő oldal tájékoztatójára mutat.
