# Dig the Year

Renamed from "Needle Drop" on 2026-11-04. The folder was renamed to dig-the-year the same day; localStorage keys keep the `nd_` prefix so saved libraries and games survive.

A private, digital version of the Hitster music-timeline party game. One device (iPad, laptop or phone) is the board and is passed between players. A second phone plays the music face down: it scans a QR code shown on the board and opens the song in the YouTube app.

Private use only (one family/friend group), shared by link. Not commercial.

## Current state

- The whole game is one self-contained file: `index.html` (plain HTML/CSS/JavaScript, no framework, no build step).
- Hosted on GitHub Pages: https://jerooo-byte.github.io/dig-the-year/ (repo jerooo-byte/dig-the-year, branch main, root).
- External script: `qrcodejs` 1.0.0 from cdnjs. Fonts: Unbounded + DM Sans from Google Fonts.
- v1 was built and published as a private claude.ai artifact; artifact-only code was removed on 2026-11-04 for standalone hosting.
- **Playlists** (redesigned 2026-11-04 with the user):
  - **Playlist store** = a Google Sheet owned by the user, behind a Google Apps Script web app (`apps-script/shared-playlists.gs`, URL in `SHARED_URL` in `index.html`). One row per playlist: id | name | created | songs JSON | main. GET lists; POST `add` (anyone, player playlists only); `check`, `update`, `delete`, `setMain` and adding a main playlist need the admin password, which lives only in the script's Script properties (`ADMIN_PASSWORD`), never in the site code. 8 wrong passwords in 15 min lock admin for 15 min.
  - **Main playlists** = store rows marked main, always available on every device. Admin mode (Playlists screen → Admin → password, kept in sessionStorage for that tab) can edit any playlist, delete, and switch main/player. While editing, "Recheck all years" looks every kept song up again in MusicBrainz with its current artist/title; differing years are only proposals on an "Approve new years" screen (each ticked by default, untick to reject), and nothing is stored until Save. On the edit screen admins can tick songs ("Select all/none") and "Recheck selected years" only for those. Every song has a "Plays in games" switch: off keeps it in the playlist but it is never drawn (stored as `off: true` in the song JSON; the CSV export/import column `play` = yes/no). Admin "Merge playlists" (top of the Playlists screen): asks the new name first, then two or more playlists; builds a new draft with duplicates dropped (same video, or same artist+title ignoring case/punctuation). On a duplicate the first picked playlist wins, differing years are flagged to check, and the song plays in games if any copy did. Originals are untouched; nothing is stored until Save. Admin can also "Export CSV" any playlist (list row or edit screen; columns artist, title, year, youtube_link, start_sec, play) and, on the edit screen, "Replace songs from CSV" to bring an edited file back into the same playlist (missing years looked up, review, then Save).
  - **New playlist** (Playlists screen): the name is always asked first (it can differ from the YouTube playlist's name), then songs come from a YouTube playlist link or a CSV file (columns artist, title, youtube_link; year and start_sec optional; missing years are looked up the same way).
  - **Player playlists**: anyone imports a YouTube playlist (paste link) or a CSV. The app reads it with the YouTube Data API (`YT_API_KEY`, restricted to the GitHub Pages address), splits "Artist - Title", looks up the earliest release year in MusicBrainz (about 1 request/second), flags doubtful years, and the player checks them on a review screen before saving. Saved playlists go to the store and show on every device; players can't edit or delete them, only "Copy and fix" into a new one. If publishing fails, the playlist stays on that device ("On this device only") with a "Share with everyone" retry.
  - Repo files in `playlists/` (listed in `playlists/index.json`, CSV with the Sheet columns) are only a fallback while the store is off or unreachable; admin can "Copy in as main playlist".
  - Nobody can change playlists without the password; years are checked by a person before a playlist is saved.
- Storage is `localStorage` keys `nd_admin` (repo-file cache), `nd_shared` (store cache), `nd_mylists`, `nd_draft`, `nd_failed`, `nd_setup`, `nd_game`, `nd_sound`, `nd_screen`. Old keys `nd_lib`, `nd_history`, `nd_edits`, `nd_sheet` are no longer read. Storage is per web address, so moving hosts starts fresh.

## Next planned steps

1. ~~GitHub Pages hosting~~ done 2026-11-04 (private link for the group, not a public launch).
2. ~~Google Sheet CSV link loading~~ done 2026-11-04.
3. ~~Airhorn~~ done 2026-11-04: `airhorn.mp3` (the user's own "DJ Airhorn Sound Effect" file, source unknown, trimmed to the first 3 s) plays on a correct answer; the synthesized horn is the fallback.
4. ~~End-of-round edge case~~ decided 2026-11-04: when 2+ players pass 10 cards in the same round with different counts (e.g. 11 vs 10), the higher count wins. Sudden death only for an exact tie at the top.

No open steps left from v1.

## Game spec (confirmed with the user — do not change without asking)

### 1. Players and setup
- Individual players only (no teams for now). 1–5 players.
- Each player enters a name and picks a colour.
- Everyone starts with 1 revealed card on their timeline and 2 tokens.
- The board device is passed to whoever's turn it is.

### 2. A turn
- The **next player in turn order is the DJ**. The DJ taps "Show QR", scans it with the music phone, puts the phone face down. (The YouTube app shows the title, so the active player must not scan.) Solo: the player is their own DJ.
- No timer. The DJ decides how long the song plays.
- The DJ has a **"Song didn't play — replace"** button: draws a new song, no penalty, and records the song in a "songs that didn't play" list in the library screen.
- The active player **drags** the mystery card into a gap in their timeline (tapping a gap also works), then taps **"Lock in"**.
- The answer is shown only after a separate **"Reveal"** tap.

### 3. Placement and scoring (same as Hitster)
- Same year as a neighbouring card counts as correct on either side.
- Wrong placement: card is discarded (unless a challenger was right — see 4).
- No partial credit. 1 card = 1 point.

### 4. Tokens and challenges (Hitster rules)
- Start with 2 tokens, maximum 5.
- Earn 1 token by naming **both artist and title**; the **DJ judges** this (Yes/No buttons before Reveal).
- Spend 1 token: skip the song.
- Spend 1 token: challenge. **Only one challenger per round.** The table decides who shouted first; the board holder taps that player's name, then the challenger picks a different gap in the active player's timeline. If the active player was wrong and the challenger right, the challenger gets the card (inserted in correct order in their timeline). The challenge token is spent either way.
- **The DJ cannot challenge** (they know the song). So challenges only exist with 3+ players.
- Spend 3 tokens: buy the current card straight into your timeline.
- Solo: only skip and buy apply.

### 5. Winning
- First to **10 cards**.
- When someone reaches 10, **finish the round** so everyone has had the same number of turns.
- If several players reach 10+ in the same round, the highest count wins (11 beats 10).
- Exact tie at the top: **sudden death** — each tied player gets one more song, no tokens or challenges; if exactly one is correct they win, otherwise repeat (players who were correct continue if 2+ were correct). Tied players DJ for each other.
- If the songs run out: most cards wins, same tie-break.

### 6. Song library and playlists
- Source of truth is the playlist store (see Current state). Repo fallback files use these columns (header row required, case-insensitive):
  `artist | title | year | youtube_link | start_sec | playlists`
- `year` = original release year (4 digits), curated by hand — YouTube upload dates are wrong for this.
- `start_sec` = optional second to start the video at (adds `?t=` to the link).
- `playlists` = comma-separated playlist names, e.g. `80s, Rock, Party`. A song can be in many playlists. New names create playlists automatically.
- `start_sec` accepts seconds (`90`) or m:ss (`1:30`).
- Main playlists: only the admin (password) changes them. Player playlists: anyone adds them from a YouTube playlist; only the admin edits or deletes them.
- Bad rows (missing year, non-YouTube link, duplicate video) are skipped and listed with row numbers.
- At game setup, select any mix of main and player playlists; merged, duplicates (same video) removed.
- **No play history** (changed 2026-11-04 at the user's request): every game shuffles the whole selection, so each song has the same chance to come up; no song repeats within a game.
- Warn at setup if the selection has too few songs for the number of players (~15 per player).

### 7. Screens and devices
- Must work on iPad, laptop and phone.
- iPad/laptop: horizontal timeline. Phone: vertical timeline (oldest at top).
- Only the **active player's timeline** is shown; others appear only on a scoreboard (name, colour, cards, tokens).
- Cards styled like Hitster: big year, artist and title, in the owner's colour.
- English interface.

### 8. Extras
- Auto-save and resume a game in progress.
- "Undo last action" button.
- Airhorn sound on a correct answer (`airhorn.mp3`). No animations needed.

## Working conventions
- Keep it a single static site with no backend unless the user asks.
- Test on a narrow (phone) width as well as tablet/laptop widths after UI changes.
- Ask before changing any rule in the spec above.
