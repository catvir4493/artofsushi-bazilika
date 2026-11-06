/* Art of Sushi — magyar / angol nyelvváltás
   A HTML magyarul van megírva; ez a fájl a magyar szövegekhez rendeli az angol változatot.
   Új szövegnél: vegye fel ide a pontos magyar szöveget és az angol párját. */
(() => {
  'use strict';

  /* ---------- Szövegek (magyar → angol) ---------- */
  const TEXT = {
    // kezdőlap
    '01 — Új üzlet': '01 — New location',
    'Cím': 'Address',
    'Nyitvatartás': 'Opening hours',
    'Hétfő – Vasárnap · 12:00 – 00:00': 'Monday – Sunday · 12:00 – 00:00',
    'Hétfő – Vasárnap · 12:00 – 23:00': 'Monday – Sunday · 12:00 – 23:00',

    // fejléc, menü
    'Minden nap 12:00 – 00:00': 'Open daily 12:00 – 00:00',
    'Asztalfoglalás': 'Book a table',
    'Menü': 'Menu',
    'Bezár': 'Close',
    'Rólunk': 'About',
    'Étlap': 'Menu',
    'Séf ajánlata': 'Chef’s picks',
    'Galéria': 'Gallery',
    'Árak': 'Prices',
    'Foglalás': 'Reservations',
    'Hétfő – Vasárnap 12:00 – 00:00': 'Monday – Sunday 12:00 – 00:00',
    'Hétfő – Vasárnap': 'Monday – Sunday',

    // nyitókép
    'Új üzlet a Szent István-bazilika mellett': 'Our new restaurant beside St Stephen’s Basilica',
    'Korlátlan prémium sushi,': 'Unlimited premium sushi,',
    'a Bazilika árnyékában.': 'in the shadow of the Basilica.',
    'Görgessen': 'Scroll',

    // rólunk
    'Kizárólag Olaszországból érkező, prémium friss tengeri alapanyagok – autentikus japán kézművességgel, <em>a sushi lakomák csúcsán.</em>':
      'Premium fresh seafood, sourced exclusively from Italy – prepared with authentic Japanese craftsmanship, <em>sushi feasting at its finest.</em>',
    'A sushi művészete': 'The art of sushi',
    'Üdvözöljük az Art of Sushi-ban – fedezze fel a sushi lakomák csúcsát! Alapanyagainkat autentikus japán konyhaművészettel dolgozzuk fel, hogy a legkiválóbb ízeket nyújtsuk Önnek.':
      'Welcome to Art of Sushi – discover sushi feasting at its finest. Every ingredient is prepared with authentic Japanese culinary craft, to bring you the finest flavours.',
    'Legyen szó klasszikus sushiról, sashimiról vagy kreatív japán fogásokról, széles választékunk garantáltan minden ízlést kielégít.':
      'From classic sushi and sashimi to creative Japanese dishes, our wide selection has something for every taste.',
    'óra korlátlan lakoma': 'hours of unlimited dining',
    'óra nyitvatartás, minden nap': 'hours open, every day',
    'kategória, szásimitól a wokig': 'categories, from sashimi to wok',

    // étlap
    'Étlapunk': 'Our menu',
    'Fedezze fel friss, kiváló minőségű alapanyagokból gondosan elkészített sushi- és ázsiai ételeinket.':
      'Discover our sushi and Asian dishes, carefully prepared from fresh, top-quality ingredients.',
    'Szásimi': 'Sashimi',
    'Vékonyra szelt, nyers prémium hal – a tiszta íz, rizs nélkül.': 'Thinly sliced premium raw fish – pure flavour, no rice.',
    'Nigiri, maki és látványos tekercsek, frissen a pult mögül.': 'Nigiri, maki and showpiece rolls, made fresh behind the counter.',
    'Előétel': 'Starters',
    'Könnyű, ízgazdag kezdés a lakoma előtt.': 'A light, flavourful start to the feast.',
    'Forró wokban pirított tészták és ázsiai fogások.': 'Noodles and Asian dishes, tossed in a fiery wok.',

    // séf ajánlata
    'A séf kedvencei': 'Chef’s favourites',
    'Éttermünk legkedveltebb fogásai, amelyeket séfünk gondosan válogatott és tökéletesre alkotott – friss, ízletes és mindig a legjobb minőségben tálalva.':
      'Our most-loved dishes, hand-picked and perfected by our chef – fresh, full of flavour and always served at their best.',
    'Angolna rizs': 'Eel rice',
    'Különféle japán rizses ételeket kínálunk, friss alapanyagokból, eredeti ízekkel.': 'A choice of Japanese rice dishes, made from fresh ingredients with authentic flavours.',
    'Változatos, látványos sushi tekercsek – friss alapanyagokból, tökéletes ízharmóniával.': 'A varied range of striking sushi rolls – fresh ingredients in perfect harmony.',

    // galéria
    'Pillanatok': 'Moments',
    'Várjuk szeretettel': 'We look forward to welcoming you',
    'Foglaljon': 'Book',
    'asztalt': 'a table',

    // árak
    'Felnőtt ár': 'Adults',
    'személyenként': 'per person',
    '1 m alatt': 'Children under 1 m',
    'Ingyenes': 'Free',
    '1 – 1,4 m': 'Children 1 – 1.4 m',
    'Étkezési időszak': 'Dining time',
    'Az önkiszolgáló étkezés időtartama legfeljebb 2 óra.': 'All-you-can-eat dining is limited to 2 hours per table.',
    'Italok és desszertek': 'Drinks and desserts',
    'Nem tartoznak a svédasztalos árba, külön rendelhetők és külön fizetendők.': 'Not included in the all-you-can-eat price; they are ordered and paid for separately.',
    'Szervizdíj': 'Service charge',
    '15% szervizdíjat számolunk fel.': 'A 15% service charge is added to the bill.',

    // foglalás
    'Foglaljon asztalt': 'Book a table',
    'Gyors és ingyenes online foglalás néhány kattintással. Visszaigazolásunkat hamarosan megkapja.':
      'Quick, free online booking in just a few clicks. We will confirm your reservation shortly.',
    'Telefonos foglalás': 'Book by phone',
    'Név *': 'Name *',
    'Email *': 'Email *',
    'Telefonszám *': 'Phone *',
    'Dátum *': 'Date *',
    'Időpont *': 'Time *',
    'Létszám *': 'Guests *',
    'Egyéb kérés': 'Special requests',
    'Elolvastam és elfogadom az': 'I have read and accept the',
    'adatkezelési tájékoztatót': 'privacy policy',
    'Foglalás elküldése': 'Send booking request',

    // kapcsolat, lábléc
    'Kapcsolat': 'Contact',
    'Itt talál minket': 'Find us',
    'Telefon': 'Phone',
    'Követés': 'Follow us',
    'Útvonaltervezés': 'Get directions',
    'Testvérüzletünk: Liszt Ferenc tér 5, 1061 ·': 'Our sister restaurant: Liszt Ferenc tér 5, 1061 ·',
    'Találkozzunk': 'See you',
    'a Bazilikánál.': 'at the Basilica.',
    'Adatkezelési tájékoztató': 'Privacy policy',
    'Impresszum': 'Legal notice',
    'Térkép betöltése': 'Load map',
    'A térkép a Google Maps szolgáltatásból töltődik be.': 'The map is loaded from Google Maps.',
    'Megnyitás a Google Térképen ↗': 'Open in Google Maps ↗',
    'Vissza a tetejére ↑': 'Back to top ↑',
    'A weboldalon a minőségi felhasználói élmény érdekében sütiket használunk.': 'We use cookies to give you the best possible experience on our website.',
    'Elfogad': 'Accept'
  };

  /* ---------- Attribútumok (alt, aria-label, kurzorfelirat, title) ---------- */
  const ATTR = {
    'Válasszon üzletet': 'Choose a location',
    'Art of Sushi Bazilika – kezdőlap': 'Art of Sushi Bazilika – home',
    'Menü megnyitása': 'Open menu',
    'Menü bezárása': 'Close menu',
    'Fő navigáció': 'Main navigation',
    'Foglalás': 'Book',
    'Prémium szásimi tál': 'Premium sashimi platter',
    'Art Of Sushi – festett logó': 'Art Of Sushi – painted logo',
    'Az Art of Sushi Bazilika belső tere': 'Inside Art of Sushi Bazilika',
    'Frissen készített sushi': 'Freshly made sushi',
    'Étlap kategóriák': 'Menu categories',
    'Húzza': 'Drag',
    'Szásimi': 'Sashimi',
    'Előétel': 'Starters',
    'Előző kategória': 'Previous category',
    'Következő kategória': 'Next category',
    'Kóstolja': 'Taste',
    'Angolna rizs': 'Eel rice',
    'Nagyít': 'View',
    'Kevesebb fő': 'Fewer guests',
    'Több fő': 'More guests',
    'Art of Sushi Bazilika térkép': 'Art of Sushi Bazilika map',
    'Kép nagyítva': 'Enlarged image',
    'Bezárás': 'Close',
    'Előző': 'Previous',
    'Következő': 'Next'
  };
  for (let i = 1; i <= 40; i++) ATTR[`Galéria kép ${i}`] = `Gallery image ${i}`;

  /* ---------- Oldalcím és leírás ---------- */
  const META = {
    'Art of Sushi · Budapest · Bazilika & Liszt Ferenc tér': 'Art of Sushi · Budapest · Bazilika & Liszt Ferenc tér',
    'Art of Sushi Budapesten – két üzlet: az új Bazilika üzlet (Sas u. 4, 1051) és a Liszt Ferenc téri üzlet (Liszt Ferenc tér 5, 1061).':
      'Art of Sushi in Budapest – two restaurants: our new Bazilika location (Sas u. 4, 1051) and Liszt Ferenc tér (Liszt Ferenc tér 5, 1061).',
    'Art of Sushi Bazilika · All You Can Eat sushi · Budapest, Sas u. 4': 'Art of Sushi Bazilika · All You Can Eat Sushi · Budapest, Sas u. 4',
    'Art of Sushi Bazilika – korlátlan prémium sushi a Szent István-bazilika mellett. Budapest, Sas u. 4, 1051. Nyitva minden nap 12:00–00:00. Asztalfoglalás: +36 30 516 1606.':
      'Art of Sushi Bazilika – unlimited premium sushi beside St Stephen’s Basilica. Budapest, Sas u. 4, 1051. Open daily 12:00–00:00. Reservations: +36 30 516 1606.'
  };

  const HOURS = { open: document.documentElement.dataset.open || '12:00', close: document.documentElement.dataset.close || '00:00' };

  /* ---------- A JavaScript által írt szövegek ---------- */
  const STR = {
    hu: {
      open: () => `Most nyitva · ${HOURS.close}-ig`, closed: () => `Most zárva · nyitás ${HOURS.open}-kor`,
      pillOpen: '● Most nyitva', pillClosed: '● Most zárva',
      menuOpen: 'Menü megnyitása', menuClose: 'Menü bezárása',
      formErr: 'Kérjük, töltse ki a kötelező (*) mezőket, és fogadja el a tájékoztatót.',
      sent: (n, d, t, g, p) => `Köszönjük, ${n}! Foglalási kérését (${d}, ${t}, ${g} fő) elküldtük – hamarosan visszaigazoljuk. Sürgős esetben hívjon: ${p}.`,
      call: (n, d, t, g, p) => `Köszönjük, ${n}! A foglalás (${d}, ${t}, ${g} fő) véglegesítéséhez kérjük, hívjon minket: ${p}.`,
      fail: p => `Hiba történt a küldéskor. Kérjük, foglaljon telefonon: ${p}.`,
      sending: 'Küldés folyamatban…',
      langName: 'magyar'
    },
    en: {
      open: () => `Open now · until ${HOURS.close}`, closed: () => `Closed now · opens at ${HOURS.open}`,
      pillOpen: '● Open now', pillClosed: '● Closed now',
      menuOpen: 'Open menu', menuClose: 'Close menu',
      formErr: 'Please fill in the required (*) fields and accept the privacy policy.',
      sent: (n, d, t, g, p) => `Thank you, ${n}! Your booking request (${d}, ${t}, ${g} ${g == 1 ? 'guest' : 'guests'}) has been sent – we will confirm it shortly. If it is urgent, please call ${p}.`,
      call: (n, d, t, g, p) => `Thank you, ${n}! To confirm your booking (${d}, ${t}, ${g} ${g == 1 ? 'guest' : 'guests'}), please call us on ${p}.`,
      fail: p => `Sorry, something went wrong. Please book by phone: ${p}.`,
      sending: 'Sending…',
      langName: 'angol'
    }
  };

  // a Pages CMS-ben szerkesztett szövegek angol párjai (js/content-i18n.js, a build készíti)
  Object.assign(TEXT, window.AOS_TEXT_EXTRA || {});
  Object.assign(ATTR, window.AOS_TEXT_EXTRA || {});

  /* ---------- Működés ---------- */
  const root = document.documentElement;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'aos-lang';

  // nyelv: ?lang= → elmentett választás → böngésző nyelve (nem magyar böngészőnél angol)
  let lang = 'hu';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    const saved = localStorage.getItem(KEY);
    if (q === 'hu' || q === 'en') lang = q;
    else if (saved === 'hu' || saved === 'en') lang = saved;
    else lang = (navigator.languages || [navigator.language || 'hu']).some(l => /^hu/i.test(l)) ? 'hu' : 'en';
  } catch (e) {}

  // a magyar eredetik összegyűjtése, mielőtt bármi más hozzányúlna a szövegekhez
  const whole = [...document.querySelectorAll('.split, [data-fill]')].map(el => ({ el, hu: el.innerHTML.trim() }));
  const inWhole = n => whole.some(w => w.el.contains(n));
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (!n.parentElement.closest('script,style,.lang') && TEXT[norm(n.nodeValue)] && !inWhole(n)) ? 1 : 3
  });
  for (let n; (n = walker.nextNode());) {
    const raw = n.nodeValue, core = norm(raw);
    texts.push({ n, pre: raw.match(/^\s*/)[0], post: raw.match(/\s*$/)[0], hu: core, en: TEXT[core] });
  }
  const attrs = [];
  document.querySelectorAll('[alt],[aria-label],[data-cursor],[title]').forEach(el => {
    if (el.closest('.lang')) return;
    ['alt', 'aria-label', 'data-cursor', 'title'].forEach(a => {
      const v = el.getAttribute(a);
      if (v && ATTR[norm(v)]) attrs.push({ el, a, hu: v, en: ATTR[norm(v)] });
    });
  });
  const desc = document.querySelector('meta[name="description"]');
  const meta = { title: document.title, desc: desc ? desc.content : '' };

  function apply(l) {
    const en = l === 'en';
    texts.forEach(t => { t.n.nodeValue = t.pre + (en ? t.en : t.hu) + t.post; });
    attrs.forEach(t => t.el.setAttribute(t.a, en ? t.en : t.hu));
    whole.forEach(w => {
      const src = en ? (TEXT[norm(w.hu)] || w.hu) : w.hu;
      // a betűnkénti bontást a main.js az aos:lang eseményre újra elvégzi
      w.el.innerHTML = src;
      w.el.removeAttribute('aria-label');
    });
    document.title = en ? (META[meta.title] || meta.title) : meta.title;
    if (desc) desc.content = en ? (META[meta.desc] || meta.desc) : meta.desc;
    root.lang = l;
    document.querySelectorAll('.lang [data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  }

  const api = window.AOS_I18N = {
    get lang() { return lang; },
    s: (k, ...a) => { const v = STR[lang][k]; return typeof v === 'function' ? v(...a) : v; },
    set(l) {
      if (l === lang || (l !== 'hu' && l !== 'en')) return;
      lang = l;
      try { localStorage.setItem(KEY, l); } catch (e) {}
      const swap = () => { apply(l); document.dispatchEvent(new CustomEvent('aos:lang', { detail: l })); };
      if (reduce) { swap(); return; }
      clearTimeout(api._t);
      root.classList.add('lang-fade');
      requestAnimationFrame(() => root.classList.add('lang-out'));
      setTimeout(() => {
        swap();
        requestAnimationFrame(() => root.classList.remove('lang-out'));
        api._t = setTimeout(() => root.classList.remove('lang-fade'), 420);
      }, 360);
    }
  };

  // első alkalmazás: csak ha angol (a HTML eleve magyar), és még a betűbontás előtt
  if (lang === 'en') apply('en'); else apply('hu');

  document.addEventListener('click', e => {
    const b = e.target.closest('.lang [data-lang]');
    if (!b) return;
    e.preventDefault();
    api.set(b.dataset.lang);
  });
})();
