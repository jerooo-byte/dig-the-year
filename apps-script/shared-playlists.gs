/**
 * Dig the Year: shared list of player playlists.
 *
 * Paste into Extensions → Apps Script of a Google Sheet that only you can open.
 * Deploy → New deployment → Web app: Execute as "Me", Who has access "Anyone".
 * Put the web app URL (ends in /exec) into SHARED_URL in index.html.
 *
 * GET  lists every playlist (newest first).
 * POST adds one playlist. There is no edit or delete: you remove a playlist by deleting its row.
 * Columns on the "playlists" tab: id | name | created | songs (JSON).
 */
const SHEET_NAME = 'playlists';
const MAX_SONGS = 400;

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const sh = sheet_();
  const n = sh.getLastRow();
  const rows = n ? sh.getRange(1, 1, n, 4).getValues() : [];
  const out = [];
  rows.forEach(function (r) {
    if (!r[0] || !r[3]) return;
    try {
      out.push({
        id: String(r[0]),
        name: String(r[1]),
        created: r[2] instanceof Date ? r[2].toISOString() : String(r[2]),
        songs: JSON.parse(r[3])
      });
    } catch (e) { /* skip a row that was edited by hand into bad JSON */ }
  });
  out.reverse();
  return json_({ playlists: out });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    let name = String(body.name || '').trim().slice(0, 60);
    if (!name) return json_({ ok: false, error: 'name' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // never let a name become a formula
    const songs = [], seen = {};
    (body.songs || []).slice(0, MAX_SONGS).forEach(function (s) {
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
    });
    if (!songs.length) return json_({ ok: false, error: 'songs' });
    const data = JSON.stringify(songs);
    if (data.length > 49000) return json_({ ok: false, error: 'too big' }); // a cell holds 50,000 characters
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, new Date(), data]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad request' });
  } finally {
    lock.releaseLock();
  }
}
