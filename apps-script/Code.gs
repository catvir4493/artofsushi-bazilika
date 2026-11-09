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
  MAX_GUESTS: 30
};

// Az oszlopok sorrendje a „Foglalások” lapon (az utolsó három rejtett)
const COLS = ['Dátum', 'Időpont', 'Név', 'Létszám', 'Telefon', 'Email', 'Egyéb kérés', 'Állapot', 'Beérkezett', 'Nyelv', 'Azonosító'];
const HIDDEN_FROM = 'Beérkezett';
const C = Object.fromEntries(COLS.map((n, i) => [n, i + 1]));
// Fejléc a táblázatban: magyar + kínai (a kód a magyar kulcsot használja)
const LABELS = {
  'Dátum': 'Dátum 日期', 'Időpont': 'Időpont 时间', 'Név': 'Név 姓名', 'Létszám': 'Létszám 人数',
  'Telefon': 'Telefon 电话', 'Email': 'Email 邮箱', 'Egyéb kérés': 'Egyéb kérés 备注', 'Állapot': 'Állapot 状态',
  'Beérkezett': 'Beérkezett 提交时间', 'Nyelv': 'Nyelv 语言', 'Azonosító': 'Azonosító 编号'
};
const STATUS = { NEW: 'Új 新订单', OK: 'Visszaigazolva 已确认', NO: 'Elutasítva 已拒绝', SHOW: 'Megjelent 已到店', NOSHOW: 'Nem jelent meg 未到店' };
// régi (csak magyar) állapotok → új, kétnyelvű
const OLD_STATUS = { 'Új': STATUS.NEW, 'Visszaigazolva': STATUS.OK, 'Elutasítva': STATUS.NO, 'Megjelent': STATUS.SHOW, 'Nem jelent meg': STATUS.NOSHOW };
// a napi lapok oszlopai (a fő lapból)
const DAY_COLS = ['Időpont', 'Név', 'Létszám', 'Telefon', 'Egyéb kérés', 'Állapot'];
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
      migrate_(SpreadsheetApp.getActive(), sh); // ha még a régi elrendezés van, előbb átírja (csak egyszer)
      // ugyanaz a foglalás még egyszer (dupla kattintás, újraküldés, újratöltés után): nem lesz új sor, nincs új e-mail
      const dup = findDuplicate_(sh, b);
      if (dup.id) return json_({ ok: true, id: dup.id, duplicate: true });
      // ugyanaz a vendég ugyanarra a napra más időpontra: rögzítjük, de jelöljük
      if (dup.otherTimes.length) b.flag = `⚠ Ugyanaz a vendég aznap már: ${dup.otherTimes.join(', ')} · 同一客人当天已订 ${dup.otherTimes.join(', ')}`;
      const row = new Array(COLS.length).fill('');
      const put = (k, v) => { row[C[k] - 1] = v; };
      put('Dátum', b.dateObj);
      put('Időpont', b.time);
      put('Név', b.name);
      put('Létszám', b.guests);
      put('Telefon', "'" + b.phone); // szövegként, különben a „+36…” képletnek látszik
      put('Email', b.email);
      put('Egyéb kérés', b.flag ? b.flag + (b.note ? ' | ' + b.note : '') : b.note);
      put('Állapot', STATUS.NEW);
      put('Beérkezett', new Date());
      put('Nyelv', b.lang.toUpperCase());
      put('Azonosító', b.id);
      sh.appendRow(row);
      formatRows_(sh);
      sortMain_(sh);
      ensureDayTabs_();
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
  if (ui.alert(`${label.charAt(0).toUpperCase() + label.slice(1)} küld · 发送${zh}邮件:\n${b.name}, ${fmtDate_(b.dateObj, 'hu')} ${b.time}, ${b.guests} fő (${b.email})`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sendGuest_(kind, b);
  sh.getRange(r, C['Állapot']).setValue(kind === 'confirm' ? STATUS.OK : STATUS.NO);
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
  const widths = { 'Dátum': 105, 'Időpont': 80, 'Név': 170, 'Létszám': 80, 'Telefon': 140, 'Email': 220, 'Egyéb kérés': 240, 'Állapot': 160, 'Beérkezett': 140, 'Nyelv': 75, 'Azonosító': 95 };
  COLS.forEach((c, i) => sh.setColumnWidth(i + 1, widths[c]));
  formatRows_(sh);

  const st = sh.getRange(2, C['Állapot'], sh.getMaxRows() - 1, 1);
  st.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS), true).build());
  const colors = [[STATUS.NEW, '#fde7c3'], [STATUS.OK, '#d4edda'], [STATUS.NO, '#f9d6d5'], [STATUS.SHOW, '#dbe7fb'], [STATUS.NOSHOW, '#e6e6e6']];
  sh.setConditionalFormatRules(colors.map(([t, c]) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([st]).build()));

  // ritkán kell: Beérkezett, Nyelv, Azonosító elrejtve (jobb klikk az oszlopfejlécen → megjelenítés)
  sh.showColumns(1, COLS.length);
  sh.hideColumns(C[HIDDEN_FROM], COLS.length - C[HIDDEN_FROM] + 1);

  OLD_TABS.forEach(n => { const o = ss.getSheetByName(n); if (o) ss.deleteSheet(o); });
  ss.getSheets().forEach(s => { if (DAY_TAB.test(s.getName())) ss.deleteSheet(s); }); // napi lapok újraépítése (formázás)
  if (sh.getIndex() !== 1) { ss.setActiveSheet(sh); ss.moveActiveSheet(1); }
  daily();

  ScriptApp.getProjectTriggers().filter(t => ['cleanup', 'daily'].includes(t.getHandlerFunction())).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('daily').timeBased().everyDays(1).atHour(0).nearMinute(10).create();
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
  ensureDayTabs_();
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
  s.getRange(2, 1, s.getMaxRows() - 1, 1).setNumberFormat('@');
  [80, 170, 80, 140, 260, 160].forEach((w, i) => s.setColumnWidth(i + 1, w));
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
