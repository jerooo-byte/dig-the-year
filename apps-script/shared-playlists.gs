/**
 * Dig the Year: playlists shared by every device.
 *
 * Setup (once):
 * 1. Make a new Google Sheet that only you can open. Extensions → Apps Script, paste this file, save.
 * 2. Project Settings (gear) → Script properties → add ADMIN_PASSWORD with your admin password.
 * 3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the URL (ends in /exec)
 *    into SHARED_URL in index.html. After changing this code, use Deploy → Manage deployments → Edit →
 *    New version, so the URL stays the same.
 *
 * The "playlists" tab has one row per playlist: id | name | created | songs (JSON) | main (TRUE/FALSE).
 * Anyone with the game can list playlists and add a player playlist. Only someone who sends the admin
 * password can add a main playlist, edit, delete, or switch a playlist between main and player.
 * The password lives only in Script properties, never in the website's code.
 */
const SHEET_NAME = 'playlists';
const MAX_SONGS = 400;
const MAX_FAILS = 8;          // wrong passwords allowed per 15 minutes before admin is locked for 15 minutes

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function rows_() {
  const sh = sheet_();
  const n = sh.getLastRow();
  return n ? sh.getRange(1, 1, n, 5).getValues() : [];
}

function doGet() {
  const out = [];
  rows_().forEach(function (r) {
    if (!r[0] || !r[3]) return;
    try {
      out.push({
        id: String(r[0]),
        name: String(r[1]).replace(/^'/, ''),
        created: r[2] instanceof Date ? r[2].toISOString() : String(r[2]),
        songs: JSON.parse(r[3]),
        main: r[4] === true || String(r[4]).toUpperCase() === 'TRUE'
      });
    } catch (e) { /* skip a row edited by hand into bad JSON */ }
  });
  out.reverse();
  return json_({ playlists: out });
}

function cleanName_(v) {
  let name = String(v || '').trim().slice(0, 60);
  if (/^[=+\-@]/.test(name)) name = "'" + name; // never let a name become a formula
  return name;
}

function cleanSongs_(list) {
  const songs = [], seen = {};
  (list || []).slice(0, MAX_SONGS).forEach(function (s) {
    const id = String(s.id || ''), year = Number(s.year);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id) || seen[id] || !(year >= 1900 && year <= 2100)) return;
    seen[id] = true;
    songs.push({
      id: id,
      artist: String(s.artist || '').slice(0, 200),
      title: String(s.title || '').slice(0, 200),
      year: year,
      start: Math.max(0, Math.floor(Number(s.start) || 0))
    });
    if (s.off === true) songs[songs.length - 1].off = true; // kept in the playlist, never drawn in a game
  });
  const data = JSON.stringify(songs);
  if (!songs.length || data.length > 49000) return null; // a cell holds 50,000 characters
  return data;
}

/* true when the password is right. Counts wrong tries; too many locks admin for a while. */
function isAdmin_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) return 'locked';
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (real && password && String(password) === real) return true;
  cache.put('fails', String(fails + 1), 900);
  return false;
}

function findRow_(id) {
  const rows = rows_();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(id)) return i + 1;
  return 0;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'add';
    let admin = false;
    if (action !== 'add' || body.main) {
      admin = isAdmin_(body.password);
      if (admin === 'locked') return json_({ ok: false, error: 'locked' });
      if (!admin) return json_({ ok: false, error: 'password' });
    }
    if (action === 'check') return json_({ ok: true });

    if (action === 'add') {
      const name = cleanName_(body.name), data = cleanSongs_(body.songs);
      if (!name) return json_({ ok: false, error: 'name' });
      if (!data) return json_({ ok: false, error: 'songs' });
      const id = Utilities.getUuid().slice(0, 8);
      sheet_().appendRow([id, name, new Date(), data, admin && !!body.main]);
      return json_({ ok: true, id: id });
    }

    const row = findRow_(body.id);
    if (!row) return json_({ ok: false, error: 'notfound' });
    const sh = sheet_();
    if (action === 'delete') { sh.deleteRow(row); return json_({ ok: true }); }
    if (action === 'update') {
      const name = cleanName_(body.name), data = cleanSongs_(body.songs);
      if (!name) return json_({ ok: false, error: 'name' });
      if (!data) return json_({ ok: false, error: 'songs' });
      sh.getRange(row, 2).setValue(name);
      sh.getRange(row, 4).setValue(data);
      sh.getRange(row, 5).setValue(!!body.main);
      return json_({ ok: true, id: String(body.id) });
    }
    if (action === 'setMain') { sh.getRange(row, 5).setValue(!!body.main); return json_({ ok: true }); }
    return json_({ ok: false, error: 'action' });
  } catch (err) {
    return json_({ ok: false, error: 'bad request' });
  } finally {
    lock.releaseLock();
  }
}
