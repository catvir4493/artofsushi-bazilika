/**
 * Art of Sushi Bazilika — asztalfoglalások (Google Apps Script)
 *
 * Mit csinál:
 *  - a weboldal űrlapja ide küldi a foglalást (doPost) → új sor a „Foglalások” lapon
 *  - értesítő e-mail az üzletnek (Válasz = a vendég címe)
 *  - automatikus visszaigazolás a vendégnek: „megkaptuk, hamarosan visszaigazoljuk”
 *  - „Foglalás” menü a táblázatban: visszaigazolás / elutasítás küldése a kijelölt sorra
 *  - „Ma” és „Holnap” lap a napi foglalásokhoz
 *  - naponta törli a 90 napnál régebbi foglalásokat (GDPR)
 *
 * Telepítés: apps-script/README.md
 */

const CFG = {
  SHEET: 'Foglalások',
  RESTAURANT: 'Art of Sushi Bazilika',
  ADDRESS: 'Sas u. 4, 1051 Budapest',
  PHONE: '+36 30 516 1606',
  SITE: 'https://artofsushibp.hu/bazilika.html',
  RETENTION_DAYS: 90,
  MAX_GUESTS: 30
};

// Az oszlopok sorrendje a „Foglalások” lapon
const COLS = ['Beérkezett', 'Dátum', 'Időpont', 'Létszám', 'Név', 'Telefon', 'Email', 'Egyéb kérés', 'Nyelv', 'Állapot', 'Kezelte', 'Belső megjegyzés', 'Azonosító'];
const C = Object.fromEntries(COLS.map((n, i) => [n, i + 1]));
const STATUS = { NEW: 'Új', OK: 'Visszaigazolva', NO: 'Elutasítva', SHOW: 'Megjelent', NOSHOW: 'Nem jelent meg' };

/* ---------- Beállítások (Script properties) ----------
   NOTIFY_EMAIL      – ide jön az értesítő (pl. foglalas@artofsushibp.hu); üresen: a táblázat tulajdonosa
   TURNSTILE_SECRET  – Cloudflare Turnstile titkos kulcs (opcionális; ha meg van adva, kötelező az ellenőrzés) */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

/* =========================================================
   1. Beérkező foglalás a weboldalról
   ========================================================= */
function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // csapda mező: emberek nem töltik ki
    if (d.website) return json_({ ok: true });

    const secret = prop_('TURNSTILE_SECRET');
    if (secret && !verifyTurnstile_(secret, d.turnstile)) return json_({ ok: false, error: 'captcha' });

    const b = clean_(d);
    if (!b) return json_({ ok: false, error: 'invalid' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = sheet_();
      const row = new Array(COLS.length).fill('');
      row[C['Beérkezett'] - 1] = new Date();
      row[C['Dátum'] - 1] = b.dateObj;
      row[C['Időpont'] - 1] = b.time;
      row[C['Létszám'] - 1] = b.guests;
      row[C['Név'] - 1] = b.name;
      row[C['Telefon'] - 1] = b.phone;
      row[C['Email'] - 1] = b.email;
      row[C['Egyéb kérés'] - 1] = b.note;
      row[C['Nyelv'] - 1] = b.lang.toUpperCase();
      row[C['Állapot'] - 1] = STATUS.NEW;
      row[C['Azonosító'] - 1] = b.id;
      sh.appendRow(row);
    } finally { lock.releaseLock(); }

    notifyRestaurant_(b);
    sendGuest_('received', b);
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
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g, '').length < 6) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (!(guests >= 1 && guests <= CFG.MAX_GUESTS)) return null;
  const [y, m, dd] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, dd);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (dateObj < today) return null;
  const id = Utilities.getUuid().slice(0, 8).toUpperCase();
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
  hu: { hello: n => `Kedves ${n}!`, date: 'Dátum', time: 'Időpont', guests: 'Létszám', g: n => `${n} fő`, note: 'Egyéb kérés', addr: 'Cím', bye: 'Üdvözlettel' },
  en: { hello: n => `Dear ${n},`, date: 'Date', time: 'Time', guests: 'Guests', g: n => `${n}`, note: 'Requests', addr: 'Address', bye: 'Kind regards' }
};

function esc_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function sendGuest_(kind, b) {
  const t = TPL[kind][b.lang], l = LBL[b.lang];
  const rows = [[l.date, fmtDate_(b.dateObj, b.lang)], [l.time, b.time], [l.guests, l.g(b.guests)], [l.addr, CFG.ADDRESS]];
  if (b.note && kind === 'received') rows.push([l.note, b.note]);
  const plain = [l.hello(b.name), '', t.lead, ...rows.map(r => `${r[0]}: ${r[1]}`), '', `${t.foot} ${CFG.PHONE}`, '', l.bye, CFG.RESTAURANT, CFG.SITE].join('\n');
  const html = `
  <div style="font-family:Georgia,serif;color:#1d1b18;max-width:560px;margin:0 auto;padding:24px">
    <div style="font-size:20px;letter-spacing:.08em;border-bottom:1px solid #c4a46c;padding-bottom:10px;margin-bottom:18px">ART OF SUSHI · BAZILIKA</div>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(l.hello(b.name))}</p>
    <p style="font-family:Arial,sans-serif;font-size:14px">${esc_(t.lead)}</p>
    <table style="font-family:Arial,sans-serif;font-size:14px;background:#faf8f4;border:1px solid #e8e2d6;border-radius:6px;padding:10px 14px;margin:12px 0">
      ${rows.map(r => `<tr><td style="color:#80786a;padding:3px 16px 3px 0">${esc_(r[0])}</td><td style="font-weight:bold">${esc_(r[1])}</td></tr>`).join('')}
    </table>
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
    `Dátum: ${fmtDate_(b.dateObj, 'hu')} ${b.time}`,
    `Létszám: ${b.guests} fő`,
    `Név: ${b.name}`, `Telefon: ${b.phone}`, `Email: ${b.email}`,
    `Egyéb kérés: ${b.note || '-'}`, `Nyelv: ${b.lang.toUpperCase()}`, '',
    `Visszaigazolás: nyissa meg a táblázatot, jelölje ki a sort, majd Foglalás → Visszaigazolás küldése.`,
    url, '',
    `Erre a levélre válaszolva közvetlenül a vendégnek ír.`
  ].join('\n');
  MailApp.sendEmail({ to, subject: `Új foglalás: ${b.date} ${b.time}, ${b.guests} fő – ${b.name}`, body, replyTo: b.email, name: 'Foglalás – weboldal' });
}

/* =========================================================
   3. Menü a táblázatban
   ========================================================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Foglalás')
    .addItem('✓ Visszaigazolás küldése', 'menuConfirm')
    .addItem('✕ Elutasítás küldése', 'menuReject')
    .addSeparator()
    .addItem('Első beállítás (egyszer kell)', 'setup')
    .addToUi();
}
function menuConfirm() { actOnSelection_('confirm'); }
function menuReject() { actOnSelection_('reject'); }

function actOnSelection_(kind) {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CFG.SHEET) { ui.alert(`Kérjük, a „${CFG.SHEET}” lapon jelölje ki a foglalás sorát.`); return; }
  const r = sh.getActiveRange().getRow();
  if (r < 2) { ui.alert('Jelöljön ki egy foglalást (ne a fejlécet).'); return; }
  const v = sh.getRange(r, 1, 1, COLS.length).getValues()[0];
  const get = n => v[C[n] - 1];
  const b = {
    name: get('Név'), email: get('Email'), time: fmtTime_(get('Időpont')), guests: get('Létszám'),
    dateObj: new Date(get('Dátum')), note: get('Egyéb kérés'), lang: String(get('Nyelv')).toLowerCase() === 'en' ? 'en' : 'hu'
  };
  const status = get('Állapot');
  const label = kind === 'confirm' ? 'visszaigazolást' : 'elutasítást';
  if (status === STATUS.OK || status === STATUS.NO) {
    if (ui.alert(`Ez a foglalás már „${status}”. Biztosan újra küld ${label}?`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  if (ui.alert(`${label.charAt(0).toUpperCase() + label.slice(1)} küld: ${b.name}, ${fmtDate_(b.dateObj, 'hu')} ${b.time}, ${b.guests} fő (${b.email})?`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sendGuest_(kind, b);
  sh.getRange(r, C['Állapot']).setValue(kind === 'confirm' ? STATUS.OK : STATUS.NO);
  sh.getRange(r, C['Kezelte']).setValue(Session.getActiveUser().getEmail() || 'igen');
  SpreadsheetApp.getActive().toast('Elküldve.', 'Foglalás', 4);
}

function fmtTime_(t) {
  if (t instanceof Date) return Utilities.formatDate(t, Session.getScriptTimeZone(), 'HH:mm');
  return String(t);
}

/* =========================================================
   4. Első beállítás: fejléc, legördülő, színek, Ma/Holnap, napi törlés
   ========================================================= */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Europe/Budapest');
  const sh = sheet_();
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#0c0b0a').setFontColor('#e8dcc4');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('C:C').setNumberFormat('@');
  const widths = [130, 95, 70, 70, 160, 130, 200, 220, 55, 130, 140, 200, 90];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  const st = sh.getRange(2, C['Állapot'], sh.getMaxRows() - 1, 1);
  st.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS), true).build());
  const colors = [[STATUS.NEW, '#fde7c3'], [STATUS.OK, '#d4edda'], [STATUS.NO, '#f9d6d5'], [STATUS.SHOW, '#dbe7fb'], [STATUS.NOSHOW, '#e6e6e6']];
  sh.setConditionalFormatRules(colors.map(([t, c]) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build()));

  dayView_(ss, 'Ma', 'TODAY()');
  dayView_(ss, 'Holnap', 'TODAY()+1');

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'cleanup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(4).create();
  SpreadsheetApp.getActive().toast('Kész. A Foglalás menü használható.', 'Beállítás', 5);
}

function dayView_(ss, name, dayExpr) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  const src = `'${CFG.SHEET}'`;
  sh.getRange('A1').setFormula(
    `=IFERROR(SORT(FILTER({${src}!C2:C,${src}!D2:D,${src}!E2:E,${src}!F2:F,${src}!H2:H,${src}!J2:J},${src}!B2:B=${dayExpr},${src}!J2:J<>"${STATUS.NO}"),1,TRUE),"Nincs foglalás")`);
  sh.insertRowBefore(1);
  sh.getRange(1, 1, 1, 6).setValues([['Időpont', 'Létszám', 'Név', 'Telefon', 'Egyéb kérés', 'Állapot']])
    .setFontWeight('bold').setBackground('#0c0b0a').setFontColor('#e8dcc4');
  sh.setFrozenRows(1);
}

/* =========================================================
   5. GDPR: 90 napnál régebbi foglalások törlése (naponta 4:00)
   ========================================================= */
function cleanup() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const limit = new Date(); limit.setHours(0, 0, 0, 0); limit.setDate(limit.getDate() - CFG.RETENTION_DAYS);
  const dates = sh.getRange(2, C['Dátum'], last - 1, 1).getValues();
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i][0];
    if (d instanceof Date && d < limit) sh.deleteRow(i + 2);
  }
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(CFG.SHEET) || ss.insertSheet(CFG.SHEET, 0);
}
