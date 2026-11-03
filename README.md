# Art of Sushi Bazilika – weboldal

Statikus weboldal (HTML + CSS + JS, nincs build lépés) az új üzlethez: **Sas u. 4, 1051 Budapest**.
Tervezett domain: **artofsushi-bazilika.hu**

## Megnyitás
Dupla klikk az `index.html`-re – böngészőben azonnal működik.

## Fájlok
- `index.html` – az oldal tartalma (magyar)
- `css/style.css` – stílus (színek a fájl elején, `:root`)
- `js/main.js` – animációk, nyitvatartás-jelző, galéria, foglalási űrlap
- `images/` – fotók helye
- `download-images.ps1` – letölti a fotókat a régi oldalról ide

## Animációk
Minden animáció saját JavaScript (`js/main.js`), külső könyvtár nélkül: betöltő számláló, nyitó képmaszk,
rögzített hero-jelenet, sima görgetés, görgetésre kitöltődő szöveg, vízszintes galéria, sebességfüggő futószalag,
egyedi kurzor, teljes képernyős menü és függönyös lábléc. A rendszer "csökkentett mozgás" beállításánál ezek kikapcsolnak.

## Fotók
Az oldal először az `images/` mappában keresi a képeket; ha nincsenek ott,
automatikusan a régi oldal (artofsushi.hu/istvan) szerveréről tölti be őket.
Élesítés előtt futtasd a `download-images.ps1`-t, hogy a képek helyben legyenek.
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
