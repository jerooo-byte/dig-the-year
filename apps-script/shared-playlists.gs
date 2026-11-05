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
 * The "playlists" tab has one row per playlist: id | name | created | songs (JSON) | main (TRUE/FALSE) | more songs…
 * A cell holds at most 50,000 characters (about 400 songs), so a longer playlist is split: the first part
 * stays in column D and the rest goes in columns F, G, H… Each part is its own JSON list of songs.
 * Anyone with the game can list playlists and add a player playlist. Only someone who sends the admin
 * password can add a main playlist, edit, delete, or switch a playlist between main and player.
 * The password lives only in Script properties, never in the website's code.
 *
 * Optional second year source: add the Script property DISCOGS_TOKEN (a personal access token from
 * discogs.com → Settings → Developers). The game then asks this script (GET ?discogs=1&artist=…&title=…)
 * for the song's earliest Discogs release year; the token never leaves the script.
 */
const SHEET_NAME = 'playlists';
const MAX_SONGS = 5000;       // a YouTube playlist holds at most 5000 videos
const CHUNK = 45000;          // characters per cell; Sheets allows 50,000
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
  return n ? sh.getRange(1, 1, n, Math.max(5, sh.getLastColumn())).getValues() : [];
}

/* All songs of a row: column D plus the extra parts in columns F onwards. */
function rowSongs_(r) {
  let songs = JSON.parse(r[3]);
  for (let c = 5; c < r.length; c++) if (r[c]) songs = songs.concat(JSON.parse(r[c]));
  return songs;
}

/* Writes the song parts of one row: part 1 in column D, the rest from column F, and clears old leftovers. */
function writeSongs_(sh, row, parts) {
  const need = 5 + parts.length - 1;
  if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  sh.getRange(row, 4).setValue(parts[0]);
  const last = sh.getLastColumn();
  if (last >= 6) sh.getRange(row, 6, 1, last - 5).clearContent();
  if (parts.length > 1) sh.getRange(row, 6, 1, parts.length - 1).setValues([parts.slice(1)]);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.discogs) return json_(discogs_(e.parameter));
  const out = [];
  rows_().forEach(function (r) {
    if (!r[0] || !r[3]) return;
    try {
      out.push({
        id: String(r[0]),
        name: String(r[1]).replace(/^'/, ''),
        created: r[2] instanceof Date ? r[2].toISOString() : String(r[2]),
        songs: rowSongs_(r),
        main: r[4] === true || String(r[4]).toUpperCase() === 'TRUE'
      });
    } catch (e) { /* skip a row edited by hand into bad JSON */ }
  });
  out.reverse();
  return json_({ playlists: out });
}

/* Discogs lookup: earliest release of this artist with this track, leaving out compilations, promos,
   bootlegs (Unofficial Release) and test pressings. Answers are cached for 6 hours; at most 1500
   Discogs requests an hour go out, so nobody can run up the token's quota through this script. */
const DG_SKIP = ['Compilation', 'Promo', 'Unofficial Release', 'Test Pressing', 'Mixed', 'Partially Mixed', 'Transcription'];
function dgNorm_(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(\d+\)$/, '').replace(/\*/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
}
function discogs_(p) {
  const token = PropertiesService.getScriptProperties().getProperty('DISCOGS_TOKEN');
  if (!token) return { ok: false, error: 'notoken' };
  const artist = String(p.artist || '').trim().slice(0, 100), title = String(p.title || '').trim().slice(0, 150);
  if (!artist || !title) return { ok: false, error: 'bad request' };
  const cache = CacheService.getScriptCache();
  const key = 'dg' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, artist + '|' + title));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const n = Number(cache.get('dgcount') || 0);
  if (n >= 1500) return { ok: false, error: 'busy' };
  cache.put('dgcount', String(n + 1), 3600);
  const url = 'https://api.discogs.com/database/search?type=release&sort=year&sort_order=asc&per_page=100' +
    '&artist=' + encodeURIComponent(artist) + '&track=' + encodeURIComponent(title);
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true,
    headers: { 'Authorization': 'Discogs token=' + token, 'User-Agent': 'DigTheYear/1.0' } });
  if (r.getResponseCode() !== 200) return { ok: false, error: 'busy' };
  const want = dgNorm_(artist);
  let best = null;
  (JSON.parse(r.getContentText()).results || []).forEach(function (x) {
    const y = Number(x.year), fmt = x.format || [];
    const who = dgNorm_(String(x.title || '').split(' - ')[0]);
    if (!(y >= 1900) || fmt.some(function (f) { return DG_SKIP.indexOf(f) >= 0; })) return;
    if (!who || !(who === want || who.indexOf(want) >= 0 || want.indexOf(who) >= 0)) return;
    if (!best || y < best.y) best = { y: y, x: x, fmt: fmt };
  });
  let out = { ok: true, year: null };
  if (best) {
    const f = best.fmt, kind = f.indexOf('Single') >= 0 ? 'Single' : f.indexOf('EP') >= 0 ? 'EP' : (f.indexOf('Album') >= 0 || f.indexOf('LP') >= 0) ? 'Album' : (f[0] || 'Release');
    const rel = String(best.x.title || '').split(' - ').slice(1).join(' - ');
    out = { ok: true, year: best.y, src: kind + ' "' + rel + '", ' + best.y + (best.x.country ? ', ' + best.x.country : '') };
  }
  cache.put(key, JSON.stringify(out), 21600);
  return out;
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
  if (!songs.length || (list || []).length > MAX_SONGS) return null;
  // Split into parts that each fit in one cell (whole songs per part, so every part is valid JSON).
  const parts = [];
  let cur = [], len = 2;
  songs.forEach(function (s) {
    const n = JSON.stringify(s).length + 1;
    if (cur.length && len + n > CHUNK) { parts.push(JSON.stringify(cur)); cur = []; len = 2; }
    cur.push(s); len += n;
  });
  parts.push(JSON.stringify(cur));
  return parts;
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
      const sh = sheet_();
      sh.appendRow([id, name, new Date(), data[0], admin && !!body.main]);
      if (data.length > 1) writeSongs_(sh, sh.getLastRow(), data);
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
      writeSongs_(sh, row, data);
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
