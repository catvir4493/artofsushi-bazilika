// Art of Sushi Bazilika — build
// A content/*.json tartalmat (amit a Pages CMS-ben szerkesztenek) beírja a HTML-be, és a dist/ mappába másolja az oldalt.
// Futtatás: node scripts/build.mjs   (külső csomag nem kell)
//
// Jelölések a HTML-ben:
//   data-cms="kulcs"              → az elem tartalma = a kulcs magyar szövege; az angol pár a nyelvváltóba kerül
//   data-cms-attr="href=kulcs|tel; src=kulcs"  → attribútumok (szűrők: tel, num, huf)
//   data-cms-list="kulcs"         → lista: az első gyermekelem a minta, elemenként megismételve
//     a mintán belül ".mező" az aktuális elemre, "#" a sorszámra (01, 02 …) mutat
//   data-cms-if="kulcs"           → az elem csak akkor marad meg, ha a kulcs értéke igaz
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'dist');
const SKIP = new Set(['.git', '.github', 'dist', 'node_modules', 'scripts', 'content', 'apps-script', '.pages.yml', 'README.md', 'DEPLOY.md', 'download-images.ps1', 'package.json']);
const PAGES = ['index.html', 'bazilika.html'];

/* ---------- tartalom ---------- */
const C = {};
for (const f of fs.readdirSync(path.join(ROOT, 'content'))) {
  if (f.endsWith('.json')) C[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
}

/* ---------- ellenőrzés: hibás adatnál a build megáll, így a régi oldal marad élesben ---------- */
const fail = msg => { console.error('HIBA: ' + msg); process.exit(1); };
if (!/^\d{1,2}:\d{2}$/.test(C.info.open) || !/^\d{1,2}:\d{2}$/.test(C.info.close)) fail('A nyitás / zárás formátuma ÓÓ:PP legyen (pl. 12:00).');
for (const k of ['adult', 'child', 'duration', 'service']) if (!(Number(C.prices[k]) >= 0)) fail(`Hibás ár / szám: prices.${k}`);
const jpOk = new Set(fs.readFileSync(path.join(ROOT, 'fonts', 'jp-chars.txt'), 'utf8').trim());
const jpNew = [...new Set([...(C.menu.categories || []), ...(C.menu.chef || [])].flatMap(x => [...(x.jp || '')]))].filter(ch => !jpOk.has(ch));
if (jpNew.length) console.warn(`Figyelem: ezek a japán írásjegyek nincsenek a betűtípusban, tartalék betűvel jelennek meg: ${jpNew.join('')}`);

const t = (hu, en) => ({ hu, en });
const hhmm = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h + (m || 0) / 60; };
const huNum = n => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // 12 999
const info = C.info, prices = C.prices;
const times = `${info.open} – ${info.close}`;
let openH = hhmm(info.open), closeH = hhmm(info.close);
if (closeH <= openH) closeH += 24;

// számolt kulcsok (több helyen megjelenő, egymásból adódó szövegek)
C.calc = {
  times,
  line: t(`${info.days.hu} · ${times}`, `${info.days.en} · ${times}`),
  overlay: t(`${info.days.hu} ${times}`, `${info.days.en} ${times}`),
  daily: t(`Minden nap ${times}`, `Open daily ${times}`),
  span: Math.round(closeH - openH),
  duration_rule: t(`Az önkiszolgáló étkezés időtartama legfeljebb ${prices.duration} óra.`, `All-you-can-eat dining is limited to ${prices.duration} hours per table.`),
  service_rule: t(`${prices.service}% szervizdíjat számolunk fel.`, `A ${prices.service}% service charge is added to the bill.`),
  child: `${huNum(prices.child)} Ft`,
  count: String((C.menu.categories || []).length).padStart(2, '0'),
  gcount: String((C.gallery.images || []).length).padStart(2, '0')
};

/* ---------- segédek ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');
const norm = s => s.replace(/\s+/g, ' ').trim();
// *szöveg* → <em>szöveg</em>, sortörés → <br>
const rich = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
const img = s => String(s || '').replace(/^\/+/, '');

const EXTRA = {};
function pair(hu, en) { if (en && norm(hu) !== norm(en)) EXTRA[norm(hu)] = en; }

function lookup(key, scope, index) {
  if (key === '#') return String(index + 1).padStart(2, '0');
  let v = key.startsWith('.') ? scope : C;
  for (const k of key.replace(/^\./, '').split('.').filter(Boolean)) v = v == null ? undefined : v[k];
  if (v === undefined) throw new Error(`Hiányzó tartalom: ${key}`);
  return v;
}
const huOf = v => (v && typeof v === 'object' && 'hu' in v) ? v.hu : v;
const FILTERS = {
  tel: v => 'tel:' + String(v).replace(/[^\d+]/g, ''),
  num: v => String(Number(v)),
  huf: v => `${huNum(v)} Ft`,
  img,
  gcls: v => `g g--${((Number(v) - 1) % 4) + 1}`,           // galéria: 4 képméret váltakozva
  galt: v => `Galéria kép ${Number(v)}`,
  feat: v => Number(v) % 2 ? 'feature' : 'feature feature--rev' // séf ajánlata: jobbra-balra
};

/* ---------- egyszerű HTML-bejáró ---------- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;

// az elem záró címkéjének helye (azonos nevű beágyazott elemeket számolva)
function closeOf(html, name, from) {
  const re = new RegExp(TAG.source, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (!m[3] || m[3].toLowerCase() !== name) continue;
    if (m[2]) { if (--depth === 0) return { start: m.index, end: re.lastIndex }; }
    else if (!m[5]) depth++;
  }
  throw new Error(`Nincs lezárva: <${name}>`);
}
const getAttr = (attrs, n) => { const m = attrs.match(new RegExp(`\\s${n}\\s*=\\s*"([^"]*)"`)); return m ? m[1] : null; };
const dropAttr = (attrs, n) => attrs.replace(new RegExp(`\\s${n}\\s*=\\s*"[^"]*"`), '');
const setAttr = (attrs, n, v) => getAttr(attrs, n) !== null
  ? attrs.replace(new RegExp(`(\\s${n}\\s*=\\s*)"[^"]*"`), `$1"${escAttr(v)}"`)
  : `${attrs} ${n}="${escAttr(v)}"`;

function render(html, scope, index) {
  const re = new RegExp(TAG.source, 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const [full, , closing, rawName, attrs0, selfClose] = m;
    if (!rawName || closing || !/\sdata-cms/.test(attrs0 || '')) continue;
    const name = rawName.toLowerCase();
    let attrs = attrs0;
    const isVoid = VOID.has(name) || selfClose;
    const close = isVoid ? null : closeOf(html, name, re.lastIndex);
    const inner = isVoid ? '' : html.slice(re.lastIndex, close.start);
    const endAll = isVoid ? re.lastIndex : close.end;

    const cond = getAttr(attrs, 'data-cms-if');
    if (cond !== null) {
      attrs = dropAttr(attrs, 'data-cms-if');
      if (!huOf(lookup(cond, scope, index))) { out += html.slice(last, m.index); last = endAll; re.lastIndex = endAll; continue; }
    }
    const spec = getAttr(attrs, 'data-cms-attr');
    if (spec !== null) {
      attrs = dropAttr(attrs, 'data-cms-attr');
      for (const part of spec.split(';').map(s => s.trim()).filter(Boolean)) {
        const [a, rhs] = part.split('=').map(s => s.trim());
        const [key, filter] = rhs.split('|');
        const v = lookup(key, scope, index);
        let val = huOf(v);
        if (filter) val = FILTERS[filter](val);
        if (v && typeof v === 'object' && 'en' in v) pair(val, v.en);
        attrs = setAttr(attrs, a, val);
      }
    }
    let body = inner;
    const list = getAttr(attrs, 'data-cms-list');
    const textKey = getAttr(attrs, 'data-cms');
    if (list !== null) {
      attrs = dropAttr(attrs, 'data-cms-list');
      const items = lookup(list, scope, index) || [];
      const first = new RegExp(TAG.source, 'g'); let fm;
      while ((fm = first.exec(inner)) && (!fm[3] || fm[2])) {}
      if (!fm) throw new Error(`Üres lista minta: ${list}`);
      const fname = fm[3].toLowerCase();
      const fend = VOID.has(fname) ? first.lastIndex : closeOf(inner, fname, first.lastIndex).end;
      const tpl = inner.slice(fm.index, fend);
      const indent = (inner.slice(0, fm.index).match(/\n([ \t]*)$/) || ['', ''])[1];
      body = '\n' + items.map((it, i) => indent + render(tpl, it, i)).join('\n') + '\n' + indent.replace(/  $/, '');
    } else if (textKey !== null) {
      attrs = dropAttr(attrs, 'data-cms');
      const v = lookup(textKey, scope, index);
      const isObj = v && typeof v === 'object' && 'hu' in v;
      const hu = rich(isObj ? v.hu : v);
      body = hu;
      if (isObj) pair(hu, rich(v.en || v.hu));
    } else {
      body = render(inner, scope, index);
    }
    out += html.slice(last, m.index) + `<${rawName}${attrs}${selfClose ? ' /' : ''}>` + (isVoid ? '' : body + `</${rawName}>`);
    last = endAll; re.lastIndex = endAll;
  }
  return out + html.slice(last);
}

/* ---------- kimenet ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
function copy(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (src === ROOT && (SKIP.has(e.name) || e.name.startsWith('.'))) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); }
    else fs.copyFileSync(s, d);
  }
}
fs.mkdirSync(OUT, { recursive: true });
copy(ROOT, OUT);

const runtime = {
  open: info.open, close: info.close, phone: info.phone,
  notice: C.notice.show ? { from: C.notice.from || '', to: C.notice.to || '' } : null
};
for (const p of PAGES) {
  let html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  html = render(html, C, 0);
  // nyitvatartás és telefon a JS-nek, a strukturált adatnak
  html = html.replace(/<html([^>]*)>/, (m, a) => `<html${a} data-open="${info.open}" data-close="${info.close}" data-phone="${escAttr(info.phone)}">`);
  html = html.replace(/"telephone":\s*"[^"]*"/, `"telephone": "${FILTERS.tel(info.phone).slice(4)}"`);
  html = html.replace(/"opens":\s*"[^"]*","closes":\s*"[^"]*"/, `"opens": "${info.open}","closes": "${info.close === '00:00' ? '23:59' : info.close}"`);
  fs.writeFileSync(path.join(OUT, p), html);
}
fs.writeFileSync(path.join(OUT, 'js', 'content-i18n.js'),
  `/* automatikusan készül (scripts/build.mjs) – ne szerkessze */\nwindow.AOS_TEXT_EXTRA = ${JSON.stringify(EXTRA, null, 1)};\nwindow.AOS_RUNTIME = ${JSON.stringify(runtime)};\n`);
console.log(`Kész: dist/ (${PAGES.length} oldal, ${Object.keys(EXTRA).length} angol szövegpár)`);
