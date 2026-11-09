/**
 * Art of Sushi Bazilika — asztalfoglalások (Google Apps Script)
 *
 * Mit csinál:
 *  - a weboldal űrlapja ide küldi a foglalást (doPost) → új sor a „Foglalások” lapon
 *  - értesítő e-mail az üzletnek (Válasz = a vendég címe)
 *  - automatikus visszaigazolás a vendégnek: „megkaptuk, hamarosan visszaigazoljuk”
 *  - „Foglalás” menü a táblázatban: visszaigazolás / elutasítás küldése a kijelölt sorra
 *  - a következő 7 nap mindegyikének saját lapja („11.08”), élőben a fő lapból
 *  - minden éjjel törli az elmúlt nap foglalásait és lapját, és létrehozza a 7. napot
 *  - 10 percenként megnézi a Gmailt: ha egy vendég írt és még nem válaszoltunk, a „Levél” oszlopban jelzi (link a levélre)
 *
 * Telepítés: apps-script/README.md
 */

const CFG = {
  SHEET: 'Foglalások',
  RESTAURANT: 'Art of Sushi Bazilika',
  ADDRESS: 'Sas u. 4, 1051 Budapest',
  PHONE: '+36 30 516 1606',
  SITE: 'https://artofsushibp.hu/bazilika',
  DAY_TABS: 7,
  MAX_GUESTS: 30,
  MAX_DAYS_AHEAD: 180,     // legfeljebb ennyi nappal előre lehet foglalni
  MAX_PER_HOUR: 20,        // összesen ennyi új foglalás óránként (védi a napi ~100 e-mailes Gmail-keretet)
  MAX_PER_GUEST_DAY: 3,    // ugyanarról az e-mail címről / telefonszámról naponta legfeljebb ennyi
  MIN_FILL_MS: 3000,       // ennél gyorsabban kitöltött űrlap = robot
  BACKUP_KEEP_DAYS: 14     // a „Mentés 备份” biztonsági lapok ennyi nap után törlődnek (személyes adatok!)
};

// Az oszlopok sorrendje a „Foglalások” lapon (az utolsó három rejtett)
const COLS = ['Dátum', 'Időpont', 'Név', 'Létszám', 'Telefon', 'Email', 'Egyéb kérés', 'Állapot', 'Levél', 'Beérkezett', 'Nyelv', 'Azonosító'];
const HIDDEN_FROM = 'Beérkezett';
const C = Object.fromEntries(COLS.map((n, i) => [n, i + 1]));
// Fejléc a táblázatban: magyar + kínai (a kód a magyar kulcsot használja)
const LABELS = {
  'Dátum': 'Dátum 日期', 'Időpont': 'Időpont 时间', 'Név': 'Név 姓名', 'Létszám': 'Létszám 人数',
  'Telefon': 'Telefon 电话', 'Email': 'Email 邮箱', 'Egyéb kérés': 'Egyéb kérés 备注', 'Állapot': 'Állapot 状态', 'Levél': 'Levél 客人邮件',
  'Beérkezett': 'Beérkezett 提交时间', 'Nyelv': 'Nyelv 语言', 'Azonosító': 'Azonosító 编号'
};
const STATUS = { NEW: 'Új 新订单', OK: 'Visszaigazolva 已确认', NO: 'Elutasítva 已拒绝', SHOW: 'Megjelent 已到店', NOSHOW: 'Nem jelent meg 未到店' };
// régi (csak magyar) állapotok → új, kétnyelvű
const OLD_STATUS = { 'Új': STATUS.NEW, 'Visszaigazolva': STATUS.OK, 'Elutasítva': STATUS.NO, 'Megjelent': STATUS.SHOW, 'Nem jelent meg': STATUS.NOSHOW };
// a napi lapok oszlopai (a fő lapból)
const DAY_COLS = ['Időpont', 'Név', 'Létszám', 'Telefon', 'Egyéb kérés', 'Állapot', 'Levél'];
const DAY_TAB = /^\d{2}\.\d{2}$/;      // pl. „11.08”
const OLD_TABS = ['Ma', 'Holnap', 'Ma 今天', 'Holnap 明天', 'Régi sorok 旧行'];
const HEAD_BG = '#0c0b0a', HEAD_FG = '#e8dcc4';

/* ---------- Beállítások (Script properties) ----------
   NOTIFY_EMAIL      – ide jön az értesítő (pl. artofsushi.szentistvan@gmail.com); üresen: a táblázat tulajdonosa
   TURNSTILE_SECRET  – Cloudflare Turnstile titkos kulcs (opcionális; ha meg van adva, kötelező az ellenőrzés) */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

/* =========================================================
   1. Beérkező foglalás a weboldalról
   ========================================================= */
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    if (raw.length > 5000) return json_({ ok: false, error: 'invalid' });
    const d = JSON.parse(raw);

    // csapda mező: emberek nem töltik ki; és ember nem tölti ki 3 mp alatt — a robot „sikert” lát, de nem rögzítünk semmit
    if (d.website) return json_({ ok: true });
    if (d.t != null && Number(d.t) < CFG.MIN_FILL_MS) return json_({ ok: true });

    const secret = prop_('TURNSTILE_SECRET');
    if (secret && !verifyTurnstile_(secret, d.turnstile)) return json_({ ok: false, error: 'captcha' });

    const b = clean_(d);
    if (!b) return json_({ ok: false, error: 'invalid' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = sheet_();
      migrate_(SpreadsheetApp.getActive(), sh); // ha még a régi elrendezés van, előbb átírja (csak egyszer)
      // ugyanaz a foglalás még egyszer (dupla kattintás, újraküldés, újratöltés után): nem lesz új sor, nincs új e-mail
      const dup = findDuplicate_(sh, b);
      if (dup.id) return json_({ ok: true, id: dup.id, duplicate: true });
      // tömeges / ismételt beküldés ellen (a Gmail napi kerete véges, és a vendégnek automatikus levél megy)
      if (!allow_(b)) return json_({ ok: false, error: 'limit' });
      // ugyanaz a vendég ugyanarra a napra más időpontra: rögzítjük, de jelöljük
      if (dup.otherTimes.length) b.flag = `⚠ Ugyanaz a vendég aznap már: ${dup.otherTimes.join(', ')} · 同一客人当天已订 ${dup.otherTimes.join(', ')}`;
      const row = new Array(COLS.length).fill('');
      const put = (k, v) => { row[C[k] - 1] = v; };
      put('Dátum', b.dateObj);
      put('Időpont', b.time);
      put('Név', cell_(b.name));
      put('Létszám', b.guests);
      put('Telefon', "'" + b.phone); // szövegként, különben a „+36…” képletnek látszik
      put('Email', cell_(b.email));
      put('Egyéb kérés', cell_(b.flag ? b.flag + (b.note ? ' | ' + b.note : '') : b.note));
      put('Állapot', STATUS.NEW);
      if (b.note) put('Levél', noteFlag_(b.note));   // a vendég kért valamit: válaszra vár
      put('Beérkezett', new Date());
      put('Nyelv', b.lang.toUpperCase());
      put('Azonosító', b.id);
      sh.appendRow(row);
      formatRows_(sh);
      sortMain_(sh);
      syncNoteBoxes_(sh);
      ensureDayTabs_();
    } finally { lock.releaseLock(); }

    // a foglalás már mentve van: egy e-mail hiba (pl. elfogyott a napi keret) ne jelenjen meg hibaként a vendégnek
    try { notifyRestaurant_(b); } catch (err) { console.error('notify', err); }
    try { if (MailApp.getRemainingDailyQuota() > 3) sendGuest_('received', b); } catch (err) { console.error('guest', err); }
    return json_({ ok: true, id: b.id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

function doGet() { return json_({ ok: true, service: 'booking' }); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Táblázat-cellába írt szöveg: ha =, +, -, @ jellel kezdődik, a Google Táblázatok képletként futtatná
// (pl. =IMPORTXML(...) a vendégadatok kiszivárogtatására) — az elé tett ' miatt sima szöveg marad (nem látszik).
function cell_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Egyszerű korlát CacheService-szel (az Apps Script nem látja a látogató IP-címét)
function allow_(b) {
  const cache = CacheService.getScriptCache();
  const hourKey = 'h' + Utilities.formatDate(new Date(), 'Europe/Budapest', 'yyyyMMddHH');
  const dayTag = Utilities.formatDate(new Date(), 'Europe/Budapest', 'yyyyMMdd');
  const keys = [hourKey, 'e' + dayTag + b.email.toLowerCase(), 'p' + dayTag + phoneKey_(b.phone)]
    .map(k => Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k)).slice(0, 40));
  const got = cache.getAll(keys);
  const n = keys.map(k => Number(got[k] || 0));
  if (n[0] >= CFG.MAX_PER_HOUR || n[1] >= CFG.MAX_PER_GUEST_DAY || n[2] >= CFG.MAX_PER_GUEST_DAY) return false;
  const put = {}; keys.forEach((k, i) => { put[k] = String(n[i] + 1); });
  cache.putAll(put, 6 * 3600); // legfeljebb 6 óra a CacheService-ben
  return true;
}

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|cn|xyz|top|info|io|link|click)\b)/i;

function verifyTurnstile_(secret, token) {
  if (!token) return false;
  const r = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post', payload: { secret, response: token }, muteHttpExceptions: true
  });
  try { return JSON.parse(r.getContentText()).success === true; } catch (e) { return false; }
}

// Ellenőrzés és tisztítás — csak a foglaláshoz szükséges adatokat tároljuk
function clean_(d) {
  const s = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const name = s(d.name, 80), email = s(d.email, 120), phone = s(d.phone, 40);
  const date = s(d.date, 10), time = s(d.time, 5), note = s(d.note, 500);
  const guests = parseInt(d.guests, 10);
  const lang = d.lang === 'en' ? 'en' : 'hu';
  if (!name || URL_RE.test(name) || /[<>]/.test(name)) return null;  // névben nincs link (spam a vendégnek küldött levélben)
  if (!/^[^@\s<>",;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i.test(email)) return null;
  if (!/^[\d\s()+\-./]+$/.test(phone) || phone.replace(/\D/g, '').length < 6) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (!(guests >= 1 && guests <= CFG.MAX_GUESTS)) return null;
  const [y, m, dd] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, dd);
  if (dateObj.getMonth() !== m - 1 || dateObj.getDate() !== dd) return null;  // pl. 2026-02-31
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxDay = new Date(today); maxDay.setDate(maxDay.getDate() + CFG.MAX_DAYS_AHEAD);
  if (dateObj < today || dateObj > maxDay) return null;
  // az űrlap saját azonosítót küld (ugyanaz marad újrapróbálkozáskor) → így ugyanaz a kérés csak egyszer kerül be
  const rid = String(d.rid || '').toUpperCase();
  const id = /^[A-Z0-9]{8,16}$/.test(rid) ? rid : Utilities.getUuid().slice(0, 8).toUpperCase();
  return { name, email, phone, date, time, note, guests, lang, dateObj, id };
}

/* =========================================================
   2. E-mailek
   ========================================================= */
const DAYS = {
  hu: ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
const MONTHS = {
  hu: ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
function fmtDate_(dt, lang) {
  return lang === 'en'
    ? `${DAYS.en[dt.getDay()]}, ${dt.getDate()} ${MONTHS.en[dt.getMonth()]} ${dt.getFullYear()}`
    : `${dt.getFullYear()}. ${MONTHS.hu[dt.getMonth()]} ${dt.getDate()}., ${DAYS.hu[dt.getDay()]}`;
}

const TPL = {
  received: {
    hu: { subject: 'Foglalási kérését megkaptuk', lead: 'Köszönjük foglalási kérését! Hamarosan visszaigazoljuk e-mailben. Az alábbi adatokat kaptuk:', foot: 'Ha sürgős, hívjon minket:' },
    en: { subject: 'We have received your booking request', lead: 'Thank you for your booking request. We will confirm it by email shortly. These are the details we received:', foot: 'If it is urgent, please call us on' }
  },
  confirm: {
    hu: { subject: 'Asztalfoglalás visszaigazolva', lead: 'Örömmel visszaigazoljuk asztalfoglalását:', foot: 'Ha változik a terve, kérjük, válaszoljon erre a levélre vagy hívjon minket:' },
    en: { subject: 'Your table is confirmed', lead: 'We are pleased to confirm your booking:', foot: 'If your plans change, please reply to this email or call us on' }
  },
  reject: {
    hu: { subject: 'Asztalfoglalás – sajnos nincs szabad asztal', lead: 'Köszönjük megkeresését. Sajnos a kért időpontra nincs szabad asztalunk:', foot: 'Szívesen segítünk másik időpontot találni. Válaszoljon erre a levélre vagy hívjon minket:' },
    en: { subject: 'Your booking request – no table available', lead: 'Thank you for your request. Unfortunately we have no table available at the requested time:', foot: 'We would be happy to find you another time. Please reply to this email or call us on' }
  }
};
const LBL = {
  hu: { hello: n => `Kedves ${n}!`, date: 'Dátum', time: 'Időpont', guests: 'Létszám', g: n => `${n} fő`, note: 'Egyéb kérés', reply: 'Kérésével kapcsolatban', addr: 'Cím', bye: 'Üdvözlettel' },
  en: { hello: n => `Dear ${n},`, date: 'Date', time: 'Time', guests: 'Guests', g: n => `${n}`, note: 'Requests', reply: 'About your request', addr: 'Address', bye: 'Kind regards' }
};

function esc_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function sendGuest_(kind, b) {
  const t = TPL[kind][b.lang], l = LBL[b.lang];
  const rows = [[l.date, fmtDate_(b.dateObj, b.lang)], [l.time, b.time], [l.guests, l.g(b.guests)], [l.addr, CFG.ADDRESS]];
  // a megjegyzést csak akkor tesszük a levélbe, ha nincs benne link (különben bárki „reklámlevelet” küldethetne velünk)
  if (b.note && (kind === 'received' || b.reply) && !URL_RE.test(b.note)) rows.push([l.note, b.note]);
  // a személyzet válasza a vendég kérésére (visszaigazoláskor / elutasításkor írják be)
  const reply = String(b.reply || '').trim();
  const plain = [l.hello(b.name), '', t.lead, ...rows.map(r => `${r[0]}: ${r[1]}`), ...(reply ? ['', `${l.reply}: ${reply}`] : []), '', `${t.foot} ${CFG.PHONE}`, '', l.bye, CFG.RESTAURANT, CFG.SITE].join('\n');
  const html = `
  <div style="font-family:Georgia,serif;color:#1d1b18;max-width:560px;margin:0 auto;padding:24px">
    <div style="font-size:20px;letter-spacing:.08em;border-bottom:1px solid #c4a46c;padding-bottom:10px;margin-bottom:18px">ART OF SUSHI · BAZILIKA</div>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(l.hello(b.name))}</p>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(t.lead)}</p>
    <table style="font-family:Arial,sans-serif;font-size:14px;background:#faf8f4;border:1px solid #e8e2d6;border-radius:6px;padding:10px 14px;margin:12px 0">
      ${rows.map(r => `<tr><td style="color:#80786a;padding:3px 16px 3px 0">${esc_(r[0])}</td><td style="font-weight:bold">${esc_(r[1])}</td></tr>`).join('')}
    </table>
    ${reply ? `<p style="font-family:Arial,sans-serif;font-size:14px;border-left:2px solid #c4a46c;padding:4px 0 4px 12px"><b>${esc_(l.reply)}:</b><br>${esc_(reply).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(t.foot)} <b>${CFG.PHONE}</b></p>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(l.bye)}<br>${CFG.RESTAURANT}</p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#80786a">${CFG.ADDRESS} · <a href="${CFG.SITE}" style="color:#9a7a3f">artofsushibp.hu</a></p>
  </div>`;
  MailApp.sendEmail({ to: b.email, subject: `${t.subject} – ${CFG.RESTAURANT}`, body: plain, htmlBody: html, name: CFG.RESTAURANT, replyTo: prop_('NOTIFY_EMAIL') || undefined });
}

function notifyRestaurant_(b) {
  const to = prop_('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  const url = SpreadsheetApp.getActive().getUrl();
  const body = [
    `Új foglalás (${b.id})`, '',
    ...(b.flag ? [b.flag, 'Lehet, hogy időpontot akar módosítani – érdemes rákérdezni. 可能是想改时间，建议先问一下客人。', ''] : []),
    `Dátum: ${fmtDate_(b.dateObj, 'hu')} ${b.time}`,
    `Létszám: ${b.guests} fő`,
    `Név: ${b.name}`, `Telefon: ${b.phone}`, `Email: ${b.email}`,
    `Egyéb kérés: ${b.note || '-'}`, `Nyelv: ${b.lang.toUpperCase()}`, '',
    `Visszaigazolás: nyissa meg a táblázatot, jelölje ki a sort, majd Foglalás → Visszaigazolás küldése.`,
    url, '',
    `Erre a levélre válaszolva közvetlenül a vendégnek ír.`
  ].join('\n');
  MailApp.sendEmail({ to, subject: `${b.flag ? '⚠ ' : ''}Új foglalás: ${b.date} ${b.time}, ${b.guests} fő – ${b.name}`, body, replyTo: b.email, name: 'Foglalás – weboldal' });
}

/* =========================================================
   3. Menü a táblázatban
   ========================================================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Foglalás 订桌')
    .addItem('✓ Visszaigazolás küldése · 发送确认', 'menuConfirm')
    .addItem('✕ Elutasítás küldése · 发送拒绝', 'menuReject')
    .addSeparator()
    .addItem('✉ Válasz a vendégnek · 回复客人', 'menuReply')
    .addItem('✉ Levél kezelve · 邮件已处理', 'menuMailDone')
    .addItem('✉ Levelek ellenőrzése most · 立即检查邮件', 'menuCheckMail')
    .addSeparator()
    .addItem('Ismétlődő foglalások törlése · 删除重复订单', 'removeDuplicates')
    .addItem('Beállítás / frissítés · 设置/更新', 'setup')
    .addToUi();
}
function menuConfirm() { actOnSelection_('confirm'); }
function menuReject() { actOnSelection_('reject'); }

function actOnSelection_(kind) {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CFG.SHEET) { ui.alert(`Kérjük, a „${CFG.SHEET}” lapon jelölje ki a foglalás sorát.\n请在「${CFG.SHEET}」表里选中订单那一行。`); return; }
  const r = sh.getActiveRange().getRow();
  if (r < 2) { ui.alert('Jelöljön ki egy foglalást (ne a fejlécet).\n请选中一条订单（不是表头）。'); return; }
  const v = sh.getRange(r, 1, 1, COLS.length).getValues()[0];
  const get = n => v[C[n] - 1];
  const b = {
    name: get('Név'), email: get('Email'), time: fmtTime_(get('Időpont')), guests: get('Létszám'),
    dateObj: new Date(get('Dátum')), note: get('Egyéb kérés'), lang: String(get('Nyelv')).toLowerCase() === 'en' ? 'en' : 'hu'
  };
  const status = get('Állapot');
  if (!b.email) { ui.alert('Ebben a sorban nincs e-mail cím.\n这一行没有邮箱。'); return; }
  const label = kind === 'confirm' ? 'visszaigazolást' : 'elutasítást';
  const zh = kind === 'confirm' ? '确认' : '拒绝';
  if (status === STATUS.OK || status === STATUS.NO) {
    if (ui.alert(`Ez a foglalás már „${status}”. Biztosan újra küld ${label}?\n这个订单已经是「${status}」，确定再发一次${zh}邮件？`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  // ha a vendég kért valamit: itt lehet rá válaszolni, és a válasz bekerül a levélbe
  const req = guestNote_(b.note);
  b.note = req;                      // a levélbe csak a vendég saját szövege kerül (a ⚠ jelzés nem)
  if (req) {
    const langName = b.lang === 'en' ? 'angolul · 用英文' : 'magyarul · 用匈牙利文';
    const p = ui.prompt(`Válasz a vendég kérésére · 回复客人的要求`,
      `A vendég kérése · 客人备注:\n„${req}”\n\nÍrja be a választ (${langName}) — bekerül a levélbe. Üresen hagyva csak a ${label} megy ki.\n` +
      `在下面写回复（${b.lang === 'en' ? '英文' : '匈牙利文'}），会写进邮件；留空就只发${zh}邮件，这一格继续标「待回复」。`, ui.ButtonSet.OK_CANCEL);
    if (p.getSelectedButton() !== ui.Button.OK) return;
    b.reply = p.getResponseText().trim();
  }
  if (ui.alert(`${label.charAt(0).toUpperCase() + label.slice(1)} küld · 发送${zh}邮件:\n${b.name}, ${fmtDate_(b.dateObj, 'hu')} ${b.time}, ${b.guests} fő (${b.email})` +
    (b.reply ? `\n\nVálasz · 回复: ${b.reply}` : ''), ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sendGuest_(kind, b);
  sh.getRange(r, C['Állapot']).setValue(kind === 'confirm' ? STATUS.OK : STATUS.NO);
  if (b.reply) {                     // a kérésre válaszoltunk: a „📝 待回复” jelzés eltűnik
    PropertiesService.getScriptProperties().setProperty(noteKey_(get('Azonosító'), b.email), String(Date.now()));
    const cell = sh.getRange(r, C['Levél']);
    if (String(cell.getValue()).indexOf(NOTE_MARK) === 0) cell.clearContent();
  }
  SpreadsheetApp.getActive().toast('Elküldve · 已发送', 'Foglalás', 4);
}

function fmtTime_(t) {
  if (t instanceof Date) return Utilities.formatDate(t, Session.getScriptTimeZone(), 'HH:mm');
  return String(t);
}

/* =========================================================
   4. Beállítás / frissítés (többször is futtatható)
   - ha a lap még a régi elrendezésű: előbb rejtett biztonsági másolat, majd átírás az új oszlopokra
   - a múltbeli és a hibás (elcsúszott) sorok kimaradnak
   ========================================================= */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Europe/Budapest');
  const sh = sheet_();
  migrate_(ss, sh);

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map(c => LABELS[c])]);
  styleHeader_(sh.getRange(1, 1, 1, COLS.length));
  const widths = { 'Dátum': 105, 'Időpont': 80, 'Név': 170, 'Létszám': 80, 'Telefon': 140, 'Email': 220, 'Egyéb kérés': 240, 'Állapot': 160, 'Levél': 300, 'Beérkezett': 140, 'Nyelv': 75, 'Azonosító': 95 };
  COLS.forEach((c, i) => sh.setColumnWidth(i + 1, widths[c]));
  formatRows_(sh);
  syncNoteBoxes_(sh);

  const st = sh.getRange(2, C['Állapot'], sh.getMaxRows() - 1, 1);
  st.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS), true).build());
  const colors = [[STATUS.NEW, '#fde7c3'], [STATUS.OK, '#d4edda'], [STATUS.NO, '#f9d6d5'], [STATUS.SHOW, '#dbe7fb'], [STATUS.NOSHOW, '#e6e6e6']];
  const mail = sh.getRange(2, C['Levél'], sh.getMaxRows() - 1, 1);
  sh.setConditionalFormatRules(colors.map(([t, c]) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build())
    .concat(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith(NOTE_MARK).setBackground(NOTE_BG).setBold(true).setRanges([mail]).build())
    .concat(SpreadsheetApp.newConditionalFormatRule().whenCellNotEmpty().setBackground(MAIL_BG).setBold(true).setRanges([mail]).build()));

  // ritkán kell: Beérkezett, Nyelv, Azonosító elrejtve (jobb klikk az oszlopfejlécen → megjelenítés)
  sh.showColumns(1, COLS.length);
  sh.hideColumns(C[HIDDEN_FROM], COLS.length - C[HIDDEN_FROM] + 1);

  OLD_TABS.forEach(n => { const o = ss.getSheetByName(n); if (o) ss.deleteSheet(o); });
  ss.getSheets().forEach(s => { if (DAY_TAB.test(s.getName())) ss.deleteSheet(s); }); // napi lapok újraépítése (formázás)
  if (sh.getIndex() !== 1) { ss.setActiveSheet(sh); ss.moveActiveSheet(1); }
  daily();

  ScriptApp.getProjectTriggers().filter(t => ['cleanup', 'daily', 'checkMail'].includes(t.getHandlerFunction())).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('daily').timeBased().everyDays(1).atHour(0).nearMinute(10).create();
  ScriptApp.newTrigger('checkMail').timeBased().everyMinutes(MAIL.EVERY_MIN).create();
  checkMail();
  ss.setActiveSheet(sh);
  ss.toast('Kész · 完成', 'Beállítás', 5);
}

function styleHeader_(rng) {
  rng.setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG).setHorizontalAlignment('center').setVerticalAlignment('middle');
}

// adatsorok: balra igazítva, fix dátum/idő formátum
function formatRows_(sh) {
  const n = sh.getMaxRows() - 1;
  sh.getRange(2, 1, n, COLS.length).setHorizontalAlignment('left');
  sh.getRange(2, C['Dátum'], n, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, C['Időpont'], n, 1).setNumberFormat('@');
  sh.getRange(2, C['Telefon'], n, 1).setNumberFormat('@');
  sh.getRange(2, C['Beérkezett'], n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange(2, C['Levél'], n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);   // ne lógjon át a szomszéd oszlopokra
}

// dátum, majd időpont szerint
function sortMain_(sh) {
  const last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, COLS.length).sort([{ column: C['Dátum'], ascending: true }, { column: C['Időpont'], ascending: true }]);
}

function today_() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }

// régi elrendezés → új (a fejléc szövege alapján, így a régi oszlopsorrendtől független)
function migrate_(ss, sh) {
  const lastC = Math.max(sh.getLastColumn(), 1), last = sh.getLastRow();
  if (last < 1) return;
  const head = sh.getRange(1, 1, 1, lastC).getValues()[0].map(h => String(h).trim());
  const same = COLS.every((c, i) => head[i] === LABELS[c]) && head.slice(COLS.length).every(h => !h);
  if (same) return;

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  sh.copyTo(ss).setName('Mentés 备份 ' + stamp).hideSheet();

  const keys = ['Beérkezett', 'Dátum', 'Időpont', 'Létszám', 'Név', 'Telefon', 'Email', 'Egyéb kérés', 'Nyelv', 'Állapot', 'Kezelte', 'Belső megjegyzés', 'Azonosító'];
  const idx = {};
  head.forEach((h, i) => { const k = keys.find(k => h === k || h.startsWith(k + ' ')); if (k && !(k in idx)) idx[k] = i; });
  const toStatus = v => OLD_STATUS[v] || (Object.values(STATUS).includes(v) ? v : '');
  const t0 = today_();
  const out = [];
  if (last > 1) {
    sh.getRange(2, 1, last - 1, lastC).getValues().forEach(r => {
      const g = k => (k in idx ? r[idx[k]] : '');
      const d = g('Dátum');
      if (!(d instanceof Date) || d.getFullYear() < 2000 || d < t0) return;   // múltbeli / elcsúszott / üres sor
      let note = String(g('Egyéb kérés') || '').trim();
      let st = toStatus(String(g('Állapot') || '').trim()) || STATUS.NEW;
      const inNote = toStatus(note);                // az állapotot tévesen a megjegyzés oszlopban állították
      if (inNote) { if (st === STATUS.NEW) st = inNote; note = ''; }
      const row = new Array(COLS.length).fill('');
      const put = (k, v) => { row[C[k] - 1] = v; };
      put('Dátum', d); put('Időpont', fmtTime_(g('Időpont'))); put('Név', g('Név')); put('Létszám', g('Létszám'));
      put('Telefon', "'" + String(g('Telefon')).replace(/^'/, '')); put('Email', g('Email')); put('Egyéb kérés', note);
      put('Állapot', st); put('Beérkezett', g('Beérkezett')); put('Nyelv', g('Nyelv')); put('Azonosító', g('Azonosító'));
      out.push(row);
    });
  }
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map(c => LABELS[c])]);
  if (out.length) sh.getRange(2, 1, out.length, COLS.length).setValues(out);
  sortMain_(sh);
}

/* =========================================================
   5. Minden éjjel (0:10): elmúlt napok foglalásainak törlése, 7 napi lap
   ========================================================= */
function daily() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const t0 = today_();
  if (last > 1) {
    const dates = sh.getRange(2, C['Dátum'], last - 1, 1).getValues();
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dates[i][0];
      if (d instanceof Date && d < t0) sh.deleteRow(i + 2);
    }
  }
  dropOldBackups_();
  ensureDayTabs_();
}

// a „Mentés 备份 2026-11-07 10.15” lapok régi foglalásokat (személyes adatokat) tartalmaznak: néhány nap után törlés
function dropOldBackups_() {
  const ss = SpreadsheetApp.getActive();
  const limit = today_(); limit.setDate(limit.getDate() - CFG.BACKUP_KEEP_DAYS);
  ss.getSheets().forEach(s => {
    const m = s.getName().match(/^Mentés 备份 (\d{4})-(\d{2})-(\d{2})/);
    if (m && new Date(+m[1], m[2] - 1, +m[3]) < limit && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}

// a következő 7 nap lapjai: a régieket törli, a hiányzókat létrehozza, sorrendbe teszi
function ensureDayTabs_() {
  const ss = SpreadsheetApp.getActive();
  const tz = Session.getScriptTimeZone();
  const t0 = today_();
  const want = [];
  for (let i = 0; i < CFG.DAY_TABS; i++) {
    const d = new Date(t0); d.setDate(d.getDate() + i);
    want.push({ name: Utilities.formatDate(d, tz, 'MM.dd'), d });
  }
  const names = want.map(w => w.name);
  ss.getSheets().forEach(s => { if (DAY_TAB.test(s.getName()) && !names.includes(s.getName())) ss.deleteSheet(s); });
  want.forEach((w, i) => { if (!ss.getSheetByName(w.name)) buildDayTab_(ss.insertSheet(w.name, i + 1), w.d); });
  // sorrend: fő lap, majd a napok
  want.forEach((w, i) => {
    const s = ss.getSheetByName(w.name);
    if (s.getIndex() !== i + 2) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 2); }
  });
}

function buildDayTab_(s, d) {
  s.clear();
  const src = `'${CFG.SHEET}'`;
  const col = k => { const L = String.fromCharCode(64 + C[k]); return `${src}!${L}2:${L}`; };
  const day = `DATE(${d.getFullYear()},${d.getMonth() + 1},${d.getDate()})`;
  s.getRange(1, 1, 1, DAY_COLS.length).setValues([DAY_COLS.map(c => LABELS[c])]);
  styleHeader_(s.getRange(1, 1, 1, DAY_COLS.length));
  s.getRange('A2').setFormula(
    `=IFERROR(SORT(FILTER({${DAY_COLS.map(col).join(',')}},${col('Dátum')}=${day},${col('Állapot')}<>"${STATUS.NO}"),1,TRUE),"Nincs foglalás · 暂无订单")`);
  s.setFrozenRows(1);
  s.getRange(2, 1, s.getMaxRows() - 1, DAY_COLS.length).setHorizontalAlignment('left');
  s.getRange(2, DAY_COLS.indexOf('Levél') + 1, s.getMaxRows() - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  s.getRange(2, DAY_COLS.indexOf('Egyéb kérés') + 1, s.getMaxRows() - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP).setVerticalAlignment('top');
  s.getRange(2, 1, s.getMaxRows() - 1, 1).setNumberFormat('@');
  [80, 170, 80, 140, 260, 160, 300].forEach((w, i) => s.setColumnWidth(i + 1, w));
  const mail = s.getRange(2, DAY_COLS.indexOf('Levél') + 1, s.getMaxRows() - 1, 1);
  s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=REGEXMATCH(${mail.getCell(1, 1).getA1Notation()},"^${NOTE_MARK}")`).setBackground(NOTE_BG).setBold(true).setRanges([mail]).build(),
    SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=LEFT(${mail.getCell(1, 1).getA1Notation()},1)="✉"`).setBackground(MAIL_BG).setBold(true).setRanges([mail]).build()]);
}

function ymd_(d) { return Utilities.formatDate(d, 'Europe/Budapest', 'yyyy-MM-dd'); }
// telefonszám összevetéshez: csak az utolsó 9 számjegy (+36 30… = 06 30… = 30…)
function phoneKey_(p) { return String(p || '').replace(/\D/g, '').slice(-9); }
// ugyanaz a vendég: azonos e-mail VAGY azonos telefonszám
function sameGuest_(email, phone, b) {
  const em = String(email || '').trim().toLowerCase(), ph = phoneKey_(phone);
  return (!!em && em === String(b.email || '').trim().toLowerCase()) || (ph.length >= 6 && ph === phoneKey_(b.phone));
}

// { id: meglévő foglalás azonosítója, ha ez ugyanaz a foglalás; otherTimes: ugyanaz a vendég aznap más időpontokra }
function findDuplicate_(sh, b) {
  const out = { id: '', otherTimes: [] };
  const last = sh.getLastRow();
  if (last < 2) return out;
  const rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  const day = ymd_(b.dateObj);
  for (const v of rows) {
    const get = n => v[C[n] - 1];
    if (b.id && String(get('Azonosító')) === b.id) { out.id = b.id; return out; }
    const d = get('Dátum');
    if (!(d instanceof Date) || ymd_(d) !== day) continue;
    if (get('Állapot') === STATUS.NO) continue;          // elutasított foglalás után újra lehet foglalni
    if (!sameGuest_(get('Email'), get('Telefon'), b)) continue;
    const t = fmtTime_(get('Időpont'));
    if (t === b.time) { out.id = String(get('Azonosító') || 'dup'); return out; }
    if (out.otherTimes.indexOf(t) < 0) out.otherTimes.push(t);
  }
  return out;
}

// Menü: a már bekerült ismétlődő sorok törlése (azonos nap + időpont + ugyanaz a vendég) — az elsőt (vagy a visszaigazoltat) megtartja
function removeDuplicates() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('Nincs ismétlődő foglalás.\n没有重复订单。'); return; }
  const rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  const get = (v, n) => v[C[n] - 1];
  const kept = [], drop = [];
  rows.forEach((v, i) => {
    const d = get(v, 'Dátum');
    if (!(d instanceof Date) || get(v, 'Állapot') === STATUS.NO) return;
    const key = ymd_(d) + ' ' + fmtTime_(get(v, 'Időpont'));
    const k = kept.find(x => x.key === key && sameGuest_(get(v, 'Email'), get(v, 'Telefon'), { email: get(x.v, 'Email'), phone: get(x.v, 'Telefon') }));
    if (!k) { kept.push({ key, v, i }); return; }
    // ha az ismétlés már vissza van igazolva, a régebbi pedig nem, akkor azt tartjuk meg
    if (get(v, 'Állapot') === STATUS.OK && get(k.v, 'Állapot') !== STATUS.OK) { drop.push(k.i); k.v = v; k.i = i; }
    else drop.push(i);
  });
  if (!drop.length) { ui.alert('Nincs ismétlődő foglalás.\n没有重复订单。'); return; }
  const list = drop.map(i => `${ymd_(get(rows[i], 'Dátum'))} ${fmtTime_(get(rows[i], 'Időpont'))}  ${get(rows[i], 'Név')}`).join('\n');
  if (ui.alert(`${drop.length} ismétlődő sor törlése (az eredeti megmarad):\n将删除 ${drop.length} 条重复订单（保留原来那条）：\n\n${list}`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  drop.sort((a, b) => b - a).forEach(i => sh.deleteRow(i + 2));
  SpreadsheetApp.getActive().toast(`${drop.length} törölve · 已删除`, 'Foglalás', 4);
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(CFG.SHEET) || ss.insertSheet(CFG.SHEET, 0);
}

/* =========================================================
   6. Vendégek levelei (10 percenként)
   Ha egy jövőbeli foglalás vendége a foglalás után írt (új levél vagy válasz a visszaigazolásra),
   és a levelezés utolsó üzenete tőle jön (= még nem válaszoltunk), a „Levél 客人邮件” oszlopban
   megjelenik: „✉ 11.09 14:32 · a levél eleje…”, kattintva megnyílik a Gmailben.
   Magától eltűnik, ha válaszolunk a Gmailből, vagy archiváljuk a levelet.
   Ha telefonon intéztük el: sor kijelölése → Foglalás → „✉ Levél kezelve · 邮件已处理”.
   ========================================================= */
const MAIL = {
  EVERY_MIN: 10,       // milyen gyakran nézze (perc)
  DAYS: 30,            // az elmúlt ennyi nap leveleit nézi
  MAX_THREADS: 150,    // egyszerre legfeljebb ennyi levelezést (a Gmail napi keretének kímélése)
  SNIPPET: 40          // ennyi karakter a levél elejéből a cellában
};
const MAIL_BG = '#dbe9fb', NOTE_BG = '#fde7c3';
const MAIL_DONE = 'mailok_';   // Script property: <kulcs> → eddig az időpontig (ms) kezelve

function menuCheckMail() {
  const n = checkMail();
  SpreadsheetApp.getActive().toast(n ? `${n} foglalásnál új levél · ${n} 个订单有新邮件` : 'Nincs megválaszolatlan levél · 没有待回复的邮件', 'Levél', 5);
}

// a sor kulcsa: azonosító, ha nincs (régi sor), akkor az e-mail cím
function mailKey_(id, email) { return MAIL_DONE + (String(id || '').trim() || String(email || '').trim().toLowerCase()); }
function noteKey_(id, email) { return NOTE_DONE + mailKey_(id, email).slice(MAIL_DONE.length); }

/* --- Egyéb kérés: ha a vendég írt valamit, az válaszra vár ---
   eltűnik, ha: visszaigazoláskor/elutasításkor válaszolunk rá; a Gmailből írunk a vendégnek a foglalás után;
   vagy a „✉ Levél kezelve · 邮件已处理” menüvel. A ✉ (új levél a vendégtől) erősebb: akkor az látszik. */
const NOTE_DONE = 'noteok_';
const NOTE_MARK = '📝';
// a cellából csak a vendég saját szövege (a ⚠ „ugyanaz a vendég aznap már…” jelzés nélkül)
function guestNote_(v) {
  let s = String(v || '').trim();
  if (s.indexOf('⚠') === 0) { const k = s.indexOf(' | '); s = k < 0 ? '' : s.slice(k + 3).trim(); }
  return s;
}
function noteFlag_(note) {
  const n = String(note).replace(/\s+/g, ' ');
  return `${NOTE_MARK} Válaszra vár · 备注待回复: ${n.length > 60 ? n.slice(0, 59) + '…' : n}`;
}
// a szkript saját, automatikus levelei (ezek nem számítanak „válasznak”)
function autoSubjects_() {
  const out = new Set();
  Object.keys(TPL).forEach(k => ['hu', 'en'].forEach(lg => out.add(`${TPL[k][lg].subject} – ${CFG.RESTAURANT}`)));
  return out;
}

/* --- Válasz a vendégnek közvetlenül a táblázatból ---
   Kijelölt sor → menü → beírjuk a választ → a vendég megkapja (az ő nyelvén keretezve).
   Ha a vendég már írt (✉ link a cellában), a válasz ugyanabba a Gmail-levelezésbe megy; különben új levél.
   Utána a ✉ / 📝 jelzés eltűnik. */
const REPLY_TPL = {
  hu: { subject: 'Foglalásával kapcsolatban', booking: 'Az Ön foglalása' },
  en: { subject: 'About your booking', booking: 'Your booking' }
};
function menuReply() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CFG.SHEET) { ui.alert(`Kérjük, a „${CFG.SHEET}” lapon jelölje ki a foglalás sorát.\n请在「${CFG.SHEET}」表里选中订单那一行。`); return; }
  const r = sh.getActiveRange().getRow();
  if (r < 2) { ui.alert('Jelöljön ki egy foglalást (ne a fejlécet).\n请选中一条订单（不是表头）。'); return; }
  const v = sh.getRange(r, 1, 1, COLS.length).getValues()[0];
  const get = n => v[C[n] - 1];
  const b = {
    name: get('Név'), email: String(get('Email') || '').trim(), time: fmtTime_(get('Időpont')), guests: get('Létszám'),
    dateObj: new Date(get('Dátum')), lang: String(get('Nyelv')).toLowerCase() === 'en' ? 'en' : 'hu'
  };
  if (!b.email) { ui.alert('Ebben a sorban nincs e-mail cím.\n这一行没有邮箱。'); return; }

  // mire válaszolunk: a vendég kérése és/vagy legutóbbi levele
  const cell = sh.getRange(r, C['Levél']);
  const rich = cell.getRichTextValue();
  const link = rich ? rich.getLinkUrl() : null;
  const m = link && link.match(/#all\/([0-9a-f]+)/i);
  const threadId = m ? m[1] : '';
  const req = guestNote_(get('Egyéb kérés'));
  const ctx = [`${b.name} · ${fmtDate_(b.dateObj, 'hu')} ${b.time} · ${b.guests} fő · ${b.lang.toUpperCase()}`];
  if (req) ctx.push(`Kérés · 备注: „${req}”`);
  if (threadId) ctx.push(`Levél · 客人邮件: ${String(cell.getValue()).replace(/^✉\s*/, '')}`);
  const p = ui.prompt('✉ Válasz a vendégnek · 回复客人',
    ctx.join('\n') + `\n\nÍrja be a választ (${b.lang === 'en' ? 'angolul' : 'magyarul'}) · 写回复（${b.lang === 'en' ? '英文' : '匈牙利文'}）：\n` +
    'A megszólítást, a foglalás adatait és az aláírást a levél automatikusan tartalmazza. · 称呼、订单信息和落款会自动加上。', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  const text = p.getResponseText().trim();
  if (!text) { ui.alert('Üres válasz – nem küldtünk semmit.\n回复是空的，什么都没发。'); return; }
  if (ui.alert(`Elküldi ${b.name} (${b.email}) részére? · 发给这位客人？\n\n${text}`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const mail = replyMail_(b, text);
  let thread = null;
  if (threadId) { try { thread = GmailApp.getThreadById(threadId); } catch (e) { thread = null; } }
  if (thread) thread.reply(mail.plain, { htmlBody: mail.html, name: CFG.RESTAURANT });   // a vendég levelezésébe
  else MailApp.sendEmail({ to: b.email, subject: mail.subject, body: mail.plain, htmlBody: mail.html, name: CFG.RESTAURANT, replyTo: prop_('NOTIFY_EMAIL') || undefined });

  const props = PropertiesService.getScriptProperties(), now = String(Date.now());
  props.setProperty(mailKey_(get('Azonosító'), b.email), now);
  props.setProperty(noteKey_(get('Azonosító'), b.email), now);
  cell.clearContent();
  SpreadsheetApp.getActive().toast('Elküldve · 已发送', 'Válasz', 4);
}

function replyMail_(b, text) {
  const t = REPLY_TPL[b.lang], l = LBL[b.lang];
  const rows = [[l.date, fmtDate_(b.dateObj, b.lang)], [l.time, b.time], [l.guests, l.g(b.guests)], [l.addr, CFG.ADDRESS]];
  const plain = [l.hello(b.name), '', text, '', `${t.booking}:`, ...rows.map(x => `${x[0]}: ${x[1]}`), '', l.bye, CFG.RESTAURANT, CFG.PHONE, CFG.SITE].join('\n');
  const html = `
  <div style="font-family:Georgia,serif;color:#1d1b18;max-width:560px;margin:0 auto;padding:24px">
    <div style="font-size:20px;letter-spacing:.08em;border-bottom:1px solid #c4a46c;padding-bottom:10px;margin-bottom:18px">ART OF SUSHI · BAZILIKA</div>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(l.hello(b.name))}</p>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(text).replace(/\n/g, '<br>')}</p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#80786a;margin:18px 0 4px">${esc_(t.booking)}</p>
    <table style="font-family:Arial,sans-serif;font-size:14px;background:#faf8f4;border:1px solid #e8e2d6;border-radius:6px;padding:10px 14px;margin:0 0 12px">
      ${rows.map(x => `<tr><td style="color:#80786a;padding:3px 16px 3px 0">${esc_(x[0])}</td><td style="font-weight:bold">${esc_(x[1])}</td></tr>`).join('')}
    </table>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(l.bye)}<br>${CFG.RESTAURANT}<br><b>${CFG.PHONE}</b></p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#80786a">${CFG.ADDRESS} · <a href="${CFG.SITE}" style="color:#9a7a3f">artofsushibp.hu</a></p>
  </div>`;
  return { subject: `${t.subject} – ${CFG.RESTAURANT}`, plain, html };
}

/* --- Hosszú „Egyéb kérés”: a teljes szöveg felugró megjegyzésben ---
   A cellában csak az eleje fér el; rákattintva / fölé víve egy kis dobozban a teljes szöveg látszik
   (Google Táblázatok „megjegyzés”, a cella jobb felső sarkában kis fekete háromszög jelzi). */
const NOTE_BOX_MIN = 25;   // ennél rövidebb szövegnél nem kell
function syncNoteBoxes_(sh, rows) {
  const last = sh.getLastRow();
  if (last < 2) return;
  if (!rows) rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  const rng = sh.getRange(2, C['Egyéb kérés'], rows.length, 1);
  const cur = rng.getNotes();
  const want = rows.map(r => { const t = String(r[C['Egyéb kérés'] - 1] || '').trim(); return [t.length >= NOTE_BOX_MIN ? t : '']; });
  if (want.some((w, i) => w[0] !== cur[i][0])) rng.setNotes(want);   // csak ha változott (egy hívás)
}

function menuMailDone() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CFG.SHEET) { ui.alert(`Kérjük, a „${CFG.SHEET}” lapon jelölje ki a foglalás sorát.\n请在「${CFG.SHEET}」表里选中订单那一行。`); return; }
  const rng = sh.getActiveRange();
  if (rng.getLastRow() < 2) { ui.alert('Jelöljön ki egy foglalást (ne a fejlécet).\n请选中一条订单（不是表头）。'); return; }
  const top = Math.max(rng.getRow(), 2), n = rng.getLastRow() - top + 1;
  const v = sh.getRange(top, 1, n, COLS.length).getValues();
  const props = PropertiesService.getScriptProperties(), now = String(Date.now());
  v.forEach((r, i) => {
    props.setProperty(mailKey_(r[C['Azonosító'] - 1], r[C['Email'] - 1]), now);
    props.setProperty(noteKey_(r[C['Azonosító'] - 1], r[C['Email'] - 1]), now);
    sh.getRange(top + i, C['Levél']).clearContent();
  });
  SpreadsheetApp.getActive().toast('Kész · 已标记为处理', 'Levél', 4);
}

// a fő feladat (időzítő hívja); visszaadja, hány foglalásnál van megválaszolatlan levél
function checkMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return 0;     // épp foglalás érkezik / fut valami: majd legközelebb
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    if (last < 2) { pruneMailDone_(props, all, new Set()); return 0; }
    const rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();

    // vendég e-mail cím → a foglalásai (sor, beérkezés ideje, kulcs)
    const byEmail = {}, keys = new Set(), notes = {};   // notes: sor index → megválaszolatlan kérés szövege
    rows.forEach((r, i) => {
      const em = String(r[C['Email'] - 1] || '').trim().toLowerCase();
      if (!em || r[C['Állapot'] - 1] === STATUS.NO) return;
      const key = mailKey_(r[C['Azonosító'] - 1], em), nkey = noteKey_(r[C['Azonosító'] - 1], em);
      keys.add(key); keys.add(nkey);
      const got = r[C['Beérkezett'] - 1];
      const t0 = got instanceof Date ? got.getTime() : 0;
      const since = Math.max(t0, Number(all[key] || 0));
      (byEmail[em] = byEmail[em] || []).push({ i, since, t0 });
      const req = guestNote_(r[C['Egyéb kérés'] - 1]);
      if (req && !all[nkey]) notes[i] = req;
    });

    // saját címeink (ezektől jövő utolsó üzenet = már válaszoltunk)
    const me = Session.getEffectiveUser().getEmail().toLowerCase();
    const mine = new Set([me, prop_('NOTIFY_EMAIL').toLowerCase()].concat(GmailApp.getAliases().map(a => a.toLowerCase())));

    // keresés a vendégek címeire (30-asával): a beérkezett mappa elmúlt napjai
    const emails = Object.keys(byEmail).filter(em => /^[^\s"(){}]+$/.test(em));
    const threads = [], seen = new Set();
    for (let k = 0; k < emails.length && threads.length < MAIL.MAX_THREADS; k += 30) {
      const q = `in:inbox newer_than:${MAIL.DAYS}d from:(${emails.slice(k, k + 30).join(' OR ')})`;
      GmailApp.search(q, 0, MAIL.MAX_THREADS - threads.length).forEach(th => { if (!seen.has(th.getId())) { seen.add(th.getId()); threads.push(th); } });
    }
    const msgs = threads.length ? GmailApp.getMessagesForThreads(threads) : [];

    // kérés van, de írtunk-e már a vendégnek a Gmailből a foglalás után? (a szkript automatikus levelei nem számítanak)
    const noteEmails = [...new Set(Object.keys(notes).map(i => String(rows[i][C['Email'] - 1]).trim().toLowerCase()))]
      .filter(em => /^[^\s"(){}]+$/.test(em));
    if (noteEmails.length) {
      const auto = autoSubjects_(), lastSent = {};   // vendég címe → utolsó általunk küldött levél ideje
      for (let k = 0; k < noteEmails.length; k += 30) {
        const sent = GmailApp.search(`in:sent newer_than:${MAIL.DAYS}d to:(${noteEmails.slice(k, k + 30).join(' OR ')})`, 0, 100);
        (sent.length ? GmailApp.getMessagesForThreads(sent) : []).forEach(list => list.forEach(m => {
          if (m.isDraft() || !mine.has(addr_(m.getFrom())) || auto.has(m.getSubject())) return;
          const to = String(m.getTo() + ',' + m.getCc()).toLowerCase();
          noteEmails.forEach(em => { if (to.indexOf(em) >= 0) lastSent[em] = Math.max(lastSent[em] || 0, m.getDate().getTime()); });
        }));
      }
      Object.keys(notes).forEach(i => {
        const em = String(rows[i][C['Email'] - 1]).trim().toLowerCase();
        const b = byEmail[em].find(x => x.i === +i);
        if (lastSent[em] && lastSent[em] > b.t0) {    // válaszoltunk: többé ne jelezze
          props.setProperty(noteKey_(rows[i][C['Azonosító'] - 1], em), String(lastSent[em]));
          delete notes[i];
        }
      });
    }

    const hit = {};   // sor index → { date, threadId, msg }
    msgs.forEach((list, t) => {
      const real = list.filter(m => !m.isDraft() && !m.isInTrash());
      const lastMsg = real[real.length - 1];
      if (!lastMsg) return;
      const from = addr_(lastMsg.getFrom());
      if (mine.has(from) || !byEmail[from]) return;           // utolsó üzenet tőlünk, vagy nem vendég
      const date = lastMsg.getDate().getTime();
      byEmail[from].forEach(b => {
        if (date <= b.since) return;                           // a foglalás előtti / már kezelt levél
        const old = hit[b.i];
        if (!old || date > old.date) hit[b.i] = { date, threadId: threads[t].getId(), msg: lastMsg };
      });
    });

    // csak a változott cellákat írjuk át
    const col = sh.getRange(2, C['Levél'], rows.length, 1);
    const cur = col.getRichTextValues();
    let count = 0;
    rows.forEach((r, i) => {
      const h = hit[i];
      const now = cur[i][0], nowText = now ? now.getText() : '', nowLink = now ? now.getLinkUrl() : null;
      if (!h && notes[i] != null) {                  // nincs új levél, de a kérés még válaszra vár
        count++;
        const text = noteFlag_(notes[i]);
        if (nowText !== text || nowLink) col.getCell(i + 1, 1).setValue(text);
        return;
      }
      if (!h) { if (nowText) col.getCell(i + 1, 1).clearContent(); return; }
      count++;
      // authuser: ha a böngészőben több Google-fiók van (vagy még nincs belépve), a bolt fiókjába visz / bejelentkezést kér
      const link = `https://mail.google.com/mail/?authuser=${encodeURIComponent(me)}#all/${h.threadId}`;
      const stamp = Utilities.formatDate(new Date(h.date), 'Europe/Budapest', 'MM.dd HH:mm');
      // ugyanaz a levél már ki van írva: nem nyúlunk hozzá (és nem olvassuk újra a levél szövegét)
      const head = `✉ Új levél · 新邮件 ${stamp}`;
      if (nowLink === link && nowText.indexOf(head) === 0) return;
      const text = `${head} · ${snippet_(h.msg)}`;
      // kattintható, de ne legyen kék aláhúzott (olvashatóbb); a háttérszínt a feltételes formázás adja
      const plain = SpreadsheetApp.newTextStyle().setUnderline(false).setForegroundColor('#1d1b18').build();
      col.getCell(i + 1, 1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(text).setLinkUrl(link).setTextStyle(plain).build());
    });

    syncNoteBoxes_(sh, rows);
    pruneMailDone_(props, all, keys);
    return count;
  } finally { lock.releaseLock(); }
}

// „Név <cim@pelda.hu>” → cim@pelda.hu
function addr_(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

// a levél eleje, az idézett előzmények nélkül
function snippet_(m) {
  const lines = String(m.getPlainBody() || '').split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    const t = l.trim();
    if (/^>/.test(t)) continue;
    // innen az előző levél idézete jön: „On … wrote:”, „… írta:”, „… 写道：”, vagy egy sor „Név <cim@…>” címmel
    if (/^(-{2,}\s*Original Message|Feladó:|From:|发件人[:：])/i.test(t) ||
        /<[^<>\s]+@[^<>\s]+>/.test(t) ||
        /(wrote|írta|写道|schrieb|a écrit|escribió|scrisse|napisał|napsal)\s*[:：]?\s*$/i.test(t) ||
        /^(On|Am|Le|El|Il) .*\d{4}/.test(t)) break;
    if (t) out.push(t);
    if (out.join(' ').length > MAIL.SNIPPET) break;
  }
  let s = out.join(' ').replace(/\s+/g, ' ') || String(m.getSubject() || '');
  if (s.length > MAIL.SNIPPET) s = s.slice(0, MAIL.SNIPPET - 1) + '…';
  return s;
}

// a már törölt foglalások „kezelve” jelzéseit eltakarítjuk (különben gyűlnének)
function pruneMailDone_(props, all, keys) {
  Object.keys(all).forEach(k => { if ((k.indexOf(MAIL_DONE) === 0 || k.indexOf(NOTE_DONE) === 0) && !keys.has(k)) props.deleteProperty(k); });
}
