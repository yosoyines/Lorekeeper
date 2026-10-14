const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const os = require('os');
const { spawn } = require('child_process');
// Stage 3b: backup straight to GitHub over the REST API, so a clean install needs
// no git binary, no cloned repo and no script placed by hand. All of its wiring
// lives in github-ipc.js; main.js carries only this require and the call below.
const { createGitHubBackup } = require('./github-ipc');

// PIN THE APP NAME. Electron derives app.getPath('userData') from the app name,
// and the name it picks depends on HOW the app was launched: `electron .` reads
// package.json and gets "lorekeeper", while `electron src/main.js` has no
// package.json beside the entry file and falls back to "Electron". Two launch
// scripts in this repo do exactly those two things, so the same install had two
// different userData folders depending on which one was used - and the GitHub
// token lives in that folder. Saved from one launcher, it was invisible to the
// other, and to the scheduled run.
//
// Must be set before anything reads a path, which is why it sits above the
// createGitHubBackup() call rather than inside app.whenReady().
app.setName('Lorekeeper');

// In production: data lives next to the exe (user chose location at install)
// In dev: hardcoded to I:\Lorekeeper
const DATA_DIR = app.isPackaged
  ? path.dirname(process.execPath)
  : 'I:\\Lorekeeper';
const DATA_FILE = path.join(DATA_DIR, 'lorekeeper-data.json');
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];

// ── Git backup sync ──────────────────────────────────────
// The backup repo is a SEPARATE folder from DATA_DIR, because DATA_DIR is
// already the source repo's working tree and two repos cannot share one.
// A sync script there mirrors text-only data in and pushes it.
//
// PATHS ARE CONFIGURABLE SINCE SESSION 36. They were hardcoded to I:\ , which
// meant a rebuild or a new machine silently stopped the backup, and a packaged
// build handed to anyone else showed a panel citing a drive letter they do not
// have. Settings now owns them; this module caches what the renderer sends and
// generates sync-paths.cmd so the SCHEDULED run (which never loads the app)
// reads the same values.
const PRETTY_FILE = path.join(DATA_DIR, 'lorekeeper-data.pretty.json');

// Ine's original hardcoded values. Used ONLY by the one-time migration below,
// so an existing install keeps working before Settings has ever been opened.
// A fresh install fails the probe and stays unconfigured, which is correct —
// an unconfigured backup must do nothing rather than something wrong.
const LEGACY = {
  provider: 'github',
  dst:   'I:\\LorekeeperBackup',
  cloud: ''
};

// Module-level cache. The renderer pushes this on load and on every Settings
// change; resolveSyncPaths() falls back to the data file, then to the migration.
let syncPaths = null;

// Reads the backup paths straight out of the data file's settings. The fallback
// for a sync requested before the renderer has pushed anything — on shutdown,
// for instance, if the user never opened Settings this run.
function syncPathsFromDataFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const st = (d && d.settings) || {};
    if (!st.backup_repo_dir) return null;
    return {
      provider: st.backup_provider || 'github',
      dst:   st.backup_repo_dir || '',
      cloud: st.backup_cloud_dir || ''
    };
  } catch (e) { return null; }
}

function resolveSyncPaths() {
  if (syncPaths && syncPaths.dst) return syncPaths;
  const fromFile = syncPathsFromDataFile();
  if (fromFile) { syncPaths = fromFile; return syncPaths; }
  // One-time migration: adopt the legacy constants only if that install is
  // actually present on this machine.
  if (fs.existsSync(path.join(LEGACY.dst, 'lorekeeper-sync.bat'))) {
    syncPaths = { ...LEGACY };
    return syncPaths;
  }
  return null;
}

function backupDir() { const p = resolveSyncPaths(); return p ? p.dst : null; }
function syncScript() { const d = backupDir(); return d ? path.join(d, 'lorekeeper-sync.bat') : null; }

// Writes sync-paths.cmd next to the script, so the scheduled task — which never
// loads Lorekeeper and therefore never sees Settings — uses the same paths.
//
// THIS FILE MUST BE PLAIN ASCII, WITH NO chcp LINE.
//
// A `chcp 65001` was tried here on 8 October 2026 so that an accented path
// would survive, and it broke the sync completely. Changing the codepage while
// a batch file is running makes cmd re-read the remainder under a different
// encoding and lose its byte position; it then executes fragments of its own
// comment lines as commands. The observed failure was a wall of "'the' is not
// recognized as an internal or external command" followed by the script giving
// up because DST had never been set - the parser never reached the set lines.
//
// So: ASCII comments, no codepage change. A non-ASCII character in a PATH is
// still unsolved for the batch route and is reported rather than written, since
// a silently wrong path is worse than a refusal. Stage 3b retires this script in
// favour of a Node implementation, which has no codepage problem at all, so a
// proper batch-Unicode fix would be wasted work.
function writeSyncPathsCmd(p) {
  try {
    if (!p || !p.dst || !fs.existsSync(p.dst)) return false;
    const esc = (v) => String(v || '').replace(/"/g, '');
    // A non-ASCII path cannot be represented reliably in a batch file read under
    // the OEM codepage, and writing it anyway produces a path that looks right in
    // the file and resolves to something else at runtime. Refuse instead.
    const nonAscii = [p.dst, cloudPath(p), DATA_DIR].filter(v => v && /[^\x00-\x7F]/.test(v));
    if (nonAscii.length) {
      console.error('writeSyncPathsCmd: refusing, path contains non-ASCII characters:', nonAscii);
      return false;
    }
    const lines = [
      'REM Generated by Lorekeeper from Settings > Backup. Do not edit by hand -',
      'REM it is overwritten on startup and whenever those settings change.',
      'REM',
      'REM Only paths Lorekeeper owns appear here. Anything else the backup covers',
      'REM lives in sync-extras.cmd, which Lorekeeper never reads or writes, so it',
      'REM survives these regenerations and never ships in a build given elsewhere.',
      'set "SRC=' + esc(DATA_DIR) + '"',
      'set "DST=' + esc(p.dst) + '"',
      'set "CLOUD=' + esc(cloudPath(p)) + '"',
      ''
    ].join('\r\n');
    fs.writeFileSync(path.join(p.dst, 'sync-paths.cmd'), lines, 'utf-8');
    return true;
  } catch (e) { console.error('writeSyncPathsCmd:', e); return false; }
}

// The ONE place that decides whether a cloud copy happens at all.
//
// backup_provider is the seam, shaped like ai_provider. 'github' — the default —
// means git and nothing else, and the folder copy is unreachable regardless of
// what backup_cloud_dir happens to contain. A stale path left in that field can
// therefore never start syncing on its own; opting in is an explicit act.
//
// 'rclone' is the planned third option (see the spec's Stage 3b). It is not
// accepted here yet, so selecting it cannot silently behave like 'folder'.
function cloudPath(p) {
  if (!p) return '';
  if ((p.provider || 'github') !== 'folder') return '';
  return p.cloud || '';
}

// Environment overrides for a spawned sync. These win over sync-paths.cmd, so
// Sync now always uses what Settings says this instant, even if the generated
// file is stale.
function syncEnv(p) {
  return { ...process.env,
    LK_SRC: DATA_DIR,
    LK_DST: p.dst || '',
    LK_CLOUD: cloudPath(p) };
}

// The script's exit codes, in words. Without this the panel can only say
// "failed", and a backup that fails uninformatively is barely better than one
// that fails silently.
const SYNC_CODES = {
  0: null,
  1: 'A configured folder does not exist. Check the paths in Settings > Backup.',
  2: 'Backup is not configured yet. Set the folders in Settings > Backup.',
  3: 'Aborted: the backup repo is behind its remote. Nothing was copied or deleted. Pull in the backup folder, then sync again.',
  4: 'The second destination was unreachable — if it is on a virtual drive, that program may not have started yet. The git push still succeeded.',
  5: 'Git push failed. The commit is saved locally and will go out on the next run.'
};

// Ensure all standard data folders exist on startup
['', 'Companions', 'Lorebooks', 'Collections', 'Worlds', 'Personas', 'Templates', 'Notes'].forEach(sub => {
  const p = sub ? path.join(DATA_DIR, sub) : DATA_DIR;
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Regenerate sync-paths.cmd at startup, not only when Settings changes.
// Without this, an install that updates to session 36 and never opens Settings
// would have no generated file at all, so the SCHEDULED run — which is the
// primary backup path, since it runs whether or not the app does — would resolve
// no paths and exit 2. The migration inside resolveSyncPaths() supplies the
// legacy values, so an existing setup keeps working untouched.
// ONLY for an install still on the retired script route. Previously this ran
// unconditionally, so a fresh install whose machine happened to have the old backup
// folder wrote a generated file into it at startup - touching a folder it had nothing
// to do with, with backup set to None. The script does not even read this file any
// more (it takes its paths from sync-extras.cmd), so for every current route it was
// writing something nothing reads.
try {
  const prov0 = activeProvider();
  if (prov0 === 'github' || prov0 === 'legacy-folder') {
    const p0 = resolveSyncPaths();
    if (p0) writeSyncPathsCmd(p0);
  }
} catch (e) { console.error('startup writeSyncPathsCmd:', e); }

// Writes a pretty-printed, key-sorted copy of the data file for git to diff.
// saveData writes compact single-line JSON, which git treats as one giant line:
// every commit would store a whole fresh copy instead of a small delta. Sorting
// keys matters too — without it, key reordering alone shows as a full rewrite.
// Not called on every autosave (stringifying tens of MB is too slow for that);
// only on shutdown and on an explicit Sync Now.
async function writePrettyData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { success: false, error: 'no data file' };
    const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const sortKeys = (v) => {
      if (Array.isArray(v)) return v.map(sortKeys);
      if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
        return out;
      }
      return v;
    };
    const pretty = JSON.stringify(sortKeys(parsed), null, 2);
    await fs.promises.writeFile(PRETTY_FILE, pretty, 'utf-8');
    return { success: true, size: Buffer.byteLength(pretty, 'utf-8') };
  } catch (e) {
    console.error('writePrettyData:', e);
    return { success: false, error: e.message };
  }
}

// Register the GitHub backup handlers. Placed here rather than at the top because
// the sync needs writePrettyData: the live data file is a single enormous line, so
// what actually gets committed is the pretty-printed copy.
const githubBackup = createGitHubBackup({ ipcMain, safeStorage, app, dataDir: DATA_DIR, writePrettyData,
  // Where electron-builder puts extraResources in a packaged build. In dev it points
  // inside node_modules/electron, where no bundled rclone exists, so the resolver
  // falls through to any rclone on PATH - which is what makes this testable before
  // a packaged build exists.
  resourcesPath: process.resourcesPath,
  // AND the project's own vendor folder. In DEV, process.resourcesPath points inside
  // node_modules/electron/dist/resources - Electron's own folder, nothing to do with
  // this project - so a binary placed at vendor/rclone/rclone.exe was never looked at
  // and the app fell through to PATH, which may not have rclone on it at all.
  // Packaged, extraResources puts it under resourcesPath and this second path simply
  // does not exist. Checking both means one place to put the file either way.
  vendorDir: path.join(__dirname, '..', 'vendor', 'rclone') });

// Which destination is configured, read straight from the data file. 'none' is
// the default and means exactly that: nothing is copied, nothing is written, no
// panel cites a folder that is not there. A fresh install has to stay silent.
//
// The legacy script values ('github' meaning the batch route, and the old
// 'folder' which also went through it) are deliberately NOT treated as
// configured here. They are reported to the renderer, which shows a notice
// asking the user to pick again, rather than quietly running a script that a
// packaged build may not even have.
// WHICH DESTINATION IS CHOSEN COMES FROM THE DATA FILE AND NOWHERE ELSE.
//
// This used to read the syncPaths cache first, and that was wrong in a way that only
// showed up on a fresh install. syncPaths is about the retired script's PATHS, and it
// gets populated at startup by the legacy migration whenever I:\LorekeeperBackup
// happens to exist on the machine - carrying provider 'github' with it. So a brand new
// install, with nothing configured and the UI correctly showing None, reported the
// retired script route here, wrote a 33 MB pretty file on close and launched the batch
// script. Found by running the packaged build (session 41).
//
// A cache of where some paths are must never answer the question of what the user chose.
function activeProvider() {
  try {
    if (!fs.existsSync(DATA_FILE)) return 'none';
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return ((d && d.settings && d.settings.backup_provider) || 'none');
  } catch (e) { return 'none'; }
}

function backupTarget() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const st = (d && d.settings) || {};
    return { repo: st.backup_github_repo || '', folder: st.backup_cloud_dir || '' };
  } catch (e) { return {}; }
}

// Unattended run for the scheduled task: Lorekeeper.exe --backup
//
// Goes through the SAME runBackup as the button. It needs Electron rather than
// plain node because the token is encrypted with safeStorage, which only exists
// inside an Electron process - which is also what keeps the token out of reach
// of anything else on the machine.
async function runHeadlessBackup() {
  const provider = activeProvider();
  const t = backupTarget();
  if (provider !== 'github-api' && provider !== 'folder' && provider !== 'rclone') {
    console.log('Backup: nothing configured, doing nothing.');
    app.exit(2);
    return;
  }
  try {
    const res = await githubBackup.runBackup({
      provider: provider, repo: t.repo, folder: t.folder,
      onProgress: (m) => console.log(m)
    });
    if (res.success) {
      const c = res.counts || {};
      console.log(res.noop ? 'Backup: already up to date.'
        : 'Backup: ' + c.uploaded + ' uploaded, ' + c.deleted + ' removed, ' + c.total + ' tracked.');
      app.exit(0);
    } else {
      console.error('Backup FAILED: ' + res.error);
      app.exit(5);
    }
  } catch (e) {
    console.error('Backup FAILED: ' + e.message);
    app.exit(5);
  }
}

// Fire-and-forget launch of the sync script. Detached and unref'd so a slow
// git push can never hold the app open or delay quitting.
function launchSyncDetached() {
  try {
    const p = resolveSyncPaths();
    if (!p) return false;
    const script = syncScript();
    if (!script || !fs.existsSync(script)) return false;
    const child = spawn('cmd.exe', ['/c', script], {
      cwd: p.dst, detached: true, stdio: 'ignore', windowsHide: true, env: syncEnv(p)
    });
    child.unref();
    return true;
  } catch (e) { console.error('launchSyncDetached:', e); return false; }
}

let mainWindow;
let allowClose = false;
// Tracks the current disk write so shutdown can wait for it instead of killing it midway.
let saveInFlight = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    frame: true, backgroundColor: '#0f0e13',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'Lorekeeper'
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Electron flags misspellings out of the box but ships no context menu, so right-clicking
  // a red-underlined word did nothing. Build one: suggestions first, then dictionary and
  // the usual edit actions.
  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [];

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: 'No suggestions', enabled: false });
      }
      template.push({ type: 'separator' });
      template.push({
        label: 'Add to dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      template.push({ type: 'separator' });
    }

    const canEdit = params.isEditable;
    const hasSelection = params.selectionText && params.selectionText.trim().length > 0;
    template.push({ label: 'Cut', role: 'cut', enabled: canEdit && hasSelection });
    template.push({ label: 'Copy', role: 'copy', enabled: hasSelection });
    template.push({ label: 'Paste', role: 'paste', enabled: canEdit });
    if (canEdit) {
      template.push({ type: 'separator' });
      template.push({ label: 'Select all', role: 'selectAll' });
    }

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  // Autosave is debounced in the renderer, and a large data file takes real time to
  // stringify and write. Quitting used to kill both the pending timer and any in-flight
  // write, silently losing the last edit of a session. Hold the window open until the
  // renderer confirms it has flushed.
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('flush-complete', finish);
      if (saveInFlight) { try { await saveInFlight; } catch (err) {} }
      // Data is now final on disk, so this is the correct moment to refresh the
      // pretty copy and hand off to the sync script. The spawn is detached, so
      // quitting is not blocked on git.
      // Gated on sync being configured (session 36). Unconfigured, this wrote a
      // ~21 MB pretty copy into the data folder on every single close, forever,
      // for nothing — which is what a packaged build handed to someone else
      // would have done.
      // On close we refresh the pretty-printed copy and stop there. Uploading
      // is NOT done here: a 33 MB push takes 15-20 seconds and the close path
      // is time-boxed to 8, so it would be killed halfway every time while
      // appearing to have run. The scheduled --backup run and the button own
      // the upload; this just makes sure they have current data to send.
      //
      // Gated on something actually being configured. Unconfigured, this wrote
      // a 33 MB file into the data folder on every single close, forever, for
      // nothing - which is what a packaged build handed to someone else did.
      const prov = activeProvider();
      if (prov === 'github-api' || prov === 'folder' || prov === 'rclone') {
        try { await writePrettyData(); } catch (err) {}
      } else if (resolveSyncPaths() && (prov === 'github' || prov === 'legacy-folder')) {
        // The retired batch route, still honoured for an install that has not
        // been switched over yet.
        try { await writePrettyData(); } catch (err) {}
        launchSyncDetached();
      }
      allowClose = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    };
    // A hung or crashed renderer must never trap the window open.
    setTimeout(finish, 8000);
    ipcMain.once('flush-complete', finish);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('flush-before-close');
  });
}

app.whenReady().then(() => {
  // --backup is the scheduled task's entry point: no window, no renderer, run
  // the backup and exit with a code the task log can show.
  if (process.argv.includes('--backup')) { runHeadlessBackup(); return; }

  // Allow CDN resources
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // http://localhost is required for local LLM servers (LM Studio, Ollama). Without it
        // Chromium blocks the fetch in the renderer before it ever leaves the process.
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' https: http://localhost:* http://127.0.0.1:* data: blob:"]
      }
    });
  });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Data ────────────────────────────────────────────────
ipcMain.handle('load-data', async () => {
  try {
    let content = null;
    let usedLastgood = false;

    if (fs.existsSync(DATA_FILE)) {
      content = fs.readFileSync(DATA_FILE, 'utf-8');
      const dataSize = Buffer.byteLength(content, 'utf-8');
      if (fs.existsSync(DATA_BACKUP_FILE)) {
        const lastgoodSize = fs.statSync(DATA_BACKUP_FILE).size;
        if (lastgoodSize > MIN_SIZE_TO_PROTECT && dataSize < lastgoodSize * SHRINK_REFUSE_RATIO) {
          console.warn('load-data: data file (' + dataSize + ' B) is suspiciously small vs lastgood (' + lastgoodSize + ' B) — auto-recovering from lastgood.');
          content = fs.readFileSync(DATA_BACKUP_FILE, 'utf-8');
          fs.writeFileSync(DATA_FILE, content, 'utf-8');
          usedLastgood = true;
        }
      }
    } else if (fs.existsSync(DATA_BACKUP_FILE)) {
      console.warn('load-data: no data file found — recovering from lastgood.');
      content = fs.readFileSync(DATA_BACKUP_FILE, 'utf-8');
      fs.writeFileSync(DATA_FILE, content, 'utf-8');
      usedLastgood = true;
    }

    if (!content) return { data: null, usedLastgood: false };
    return { data: JSON.parse(content), usedLastgood };
  } catch (e) { console.error('load-data:', e); return { data: null, usedLastgood: false }; }
});

// Safety net: refuse to silently overwrite a substantial existing data file with
// something drastically smaller (e.g. an empty/default shape from a race condition
// on app startup). This is a defense-in-depth check on top of the renderer-side
// dataLoaded guard — if the renderer guard ever fails for any reason, this is the
// last line of defense protecting the user's actual data on disk.
const DATA_BACKUP_FILE = path.join(DATA_DIR, 'lorekeeper-data.lastgood.json');
const SHRINK_REFUSE_RATIO = 0.5; // refuse if new size < 50% of old size
const MIN_SIZE_TO_PROTECT = 5000; // only protect files already bigger than ~5KB

ipcMain.handle('save-data', async (event, data) => {
  try {
    const newContent = JSON.stringify(data);
    const newSize = Buffer.byteLength(newContent, 'utf-8');

    const refuseWrite = (reason) => {
      console.error('save-data REFUSED: ' + reason + '. Writing to lorekeeper-data.SUSPICIOUS.json instead.');
      const suspiciousFile = path.join(DATA_DIR, 'lorekeeper-data.SUSPICIOUS.json');
      fs.promises.writeFile(suspiciousFile, newContent, 'utf-8').catch(() => {});
    };

    if (fs.existsSync(DATA_FILE)) {
      const oldSize = fs.statSync(DATA_FILE).size;
      if (oldSize > MIN_SIZE_TO_PROTECT && newSize < oldSize * SHRINK_REFUSE_RATIO) {
        refuseWrite('new write (' + newSize + ' B) << existing file (' + oldSize + ' B)');
        return false;
      }
    }

    // Also check against lastgood — catches the case where data.json was already cleared
    // before the save attempt (so oldSize would also be small and the check above would pass).
    if (fs.existsSync(DATA_BACKUP_FILE)) {
      const lastgoodSize = fs.statSync(DATA_BACKUP_FILE).size;
      if (lastgoodSize > MIN_SIZE_TO_PROTECT && newSize < lastgoodSize * SHRINK_REFUSE_RATIO) {
        refuseWrite('new write (' + newSize + ' B) << lastgood (' + lastgoodSize + ' B)');
        return false;
      }
    }

    const write = (async () => {
      await fs.promises.writeFile(DATA_FILE, newContent, 'utf-8');
      // Keep a rolling last-known-good backup of any write that passed the safety check above.
      // This is a cheap extra layer of recovery in case of any other unforeseen issue.
      fs.promises.writeFile(DATA_BACKUP_FILE, newContent, 'utf-8').catch(() => {});
    })();
    saveInFlight = write;
    await write;
    if (saveInFlight === write) saveInFlight = null;

    return true;
  }
  catch (e) { console.error('save-data:', e); return false; }
});

// Read from package.json by Electron itself, so there is exactly one version
// number in the project and the About panel cannot drift from the installer.
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-data-path', () => DATA_FILE);
// The data FOLDER. get-data-path returns the data FILE, which Settings displays — the
// portrait picker was appending 'Companions/<folder>' onto that, producing a path
// through lorekeeper-data.json that could never exist, so no defaultPath was passed and
// the dialog fell back to whatever folder Windows had open last.
ipcMain.handle('get-data-dir', () => DATA_DIR);

// Intentional-shrink save. The ratio guard above cannot tell a catastrophic empty-state
// write from a legitimate bulk shrink (clearing 190 MB of base64 down to file paths), so
// the image migration/cleanup paths use this instead. It is NOT a blind bypass: it takes a
// timestamped snapshot of the current file first, so the pre-shrink state stays recoverable.
ipcMain.handle('save-data-allow-shrink', async (event, { data, reason }) => {
  try {
    const newContent = JSON.stringify(data);

    let snapshotPath = null;
    if (fs.existsSync(DATA_FILE)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      snapshotPath = path.join(DATA_DIR, 'lorekeeper-data.preshrink-' + stamp + '.json');
      await fs.promises.copyFile(DATA_FILE, snapshotPath);
      console.warn('save-data-allow-shrink (' + (reason || 'unspecified') + '): snapshot at ' + snapshotPath);
    }

    await fs.promises.writeFile(DATA_FILE, newContent, 'utf-8');
    // Reset lastgood too, otherwise the next ordinary autosave is measured against the
    // old 190 MB baseline and gets refused for being "suspiciously small".
    await fs.promises.writeFile(DATA_BACKUP_FILE, newContent, 'utf-8').catch(() => {});

    return { success: true, snapshot: snapshotPath };
  }
  catch (e) {
    console.error('save-data-allow-shrink:', e);
    return { success: false, error: e.message };
  }
});

// Read image from system clipboard
ipcMain.handle('paste-image', async () => {
  const img = clipboard.readImage();
  if (!img || img.isEmpty()) return null;
  const png = img.toPNG();
  const size = img.getSize();
  return {
    base64: 'data:image/png;base64,' + png.toString('base64'),
    width: size.width,
    height: size.height
  };
});

// Save a binary image file via save dialog — used by image tools
ipcMain.handle('save-image', async (event, { base64, defaultName }) => {
  const ext = (defaultName.split('.').pop() || 'jpg').toLowerCase();
  const extMap = { jpg:'JPEG', jpeg:'JPEG', png:'PNG', webp:'WebP', gif:'GIF' };
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(os.homedir(), 'Desktop', defaultName),
    filters: [{ name: extMap[ext]||'Image', extensions: [ext] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (canceled || !filePath) return { cancelled: true };
  try {
    const b64data = base64.includes(',') ? base64.split(',')[1] : base64;
    fs.writeFileSync(filePath, Buffer.from(b64data, 'base64'));
    return { success: true, path: filePath };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── File export ──────────────────────────────────────────
ipcMain.handle('export-file', async (event, { defaultName, content, folder }) => {
  // Pick the right save-dialog filter based on the file's actual extension, instead of
  // always hardcoding JSON. This is shared by every Export button in the app (characters,
  // lorebooks, collections, personas, templates) — both JSON and Markdown exports.
  const ext = (defaultName.split('.').pop() || '').toLowerCase();
  const filterMap = {
    json: { name: 'JSON', extensions: ['json'] },
    md: { name: 'Markdown', extensions: ['md'] },
    txt: { name: 'Text', extensions: ['txt'] },
  };
  const primaryFilter = filterMap[ext] || { name: 'All Files', extensions: ['*'] };
  const filters = [primaryFilter, { name: 'All Files', extensions: ['*'] }];

  // Default to the relevant subfolder (Companions/Lorebooks/Collections/etc) when the
  // caller knows which one applies, so the save dialog opens in the right place instead
  // of always landing at the Lorekeeper root.
  const baseDir = folder ? path.join(DATA_DIR, folder) : DATA_DIR;
  if (folder && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(baseDir, defaultName),
    filters
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, content, 'utf-8');
  // Return the chosen filename so the renderer can remember it. Deriving the export name
  // from the item's current title meant renaming an item silently started exporting to a
  // NEW file instead of updating the one already uploaded to Saucepan.
  return { success: true, filePath: filePath, fileName: path.basename(filePath) };
});

// ── JSON import ──────────────────────────────────────────
ipcMain.handle('import-file', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile', 'dontAddToRecent']
  });
  if (!filePaths || !filePaths[0]) return null;
  return fs.readFileSync(filePaths[0], 'utf-8');
});

// ── Image helpers ────────────────────────────────────────
function readImageAsBase64(filePath) {
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${data.toString('base64')}`;
}

function readImageAsPath(filePath) {
  // Returns relative path from DATA_DIR
  return path.relative(DATA_DIR, filePath).replace(/\\/g, '/');
}

// ── Import image (single, returns base64) ───────────────
// dontAddToRecent keeps Lorekeeper from feeding the shell's "last visited folder"
// memory, which is what the picker falls back to when no usable defaultPath is given.
ipcMain.handle('import-image', async (event, opts) => {
  const dialogOpts = {
    filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
    properties: ['openFile', 'dontAddToRecent']
  };
  // Open in the character's own companion folder when there is one — otherwise the picker
  // starts wherever Windows last left it, which is rarely where the portraits live.
  if (opts && opts.defaultPath) {
    const abs = path.isAbsolute(opts.defaultPath) ? opts.defaultPath : path.join(DATA_DIR, opts.defaultPath);
    if (fs.existsSync(abs)) dialogOpts.defaultPath = abs;
  }
  const { filePaths } = await dialog.showOpenDialog(mainWindow, dialogOpts);
  if (!filePaths || !filePaths[0]) return null;
  return { base64: readImageAsBase64(filePaths[0]), srcPath: filePaths[0] };
});

// ── Import multiple images (returns array) ───────────────
ipcMain.handle('import-images', async (event, opts) => {
  const dialogOpts = {
    filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
    properties: ['openFile', 'multiSelections', 'dontAddToRecent']
  };
  if (opts && opts.defaultPath) {
    const abs2 = path.isAbsolute(opts.defaultPath) ? opts.defaultPath : path.join(DATA_DIR, opts.defaultPath);
    if (fs.existsSync(abs2)) dialogOpts.defaultPath = abs2;
  }
  const { filePaths } = await dialog.showOpenDialog(mainWindow, dialogOpts);
  if (!filePaths || filePaths.length === 0) return [];
  return filePaths.slice(0, 10).map(fp => ({
    name: path.basename(fp, path.extname(fp)),
    base64: readImageAsBase64(fp),
    srcPath: fp
  }));
});

// ── Read image from relative path ───────────────────────
ipcMain.handle('read-image-path', async (event, relPath) => {
  try {
    const fullPath = path.join(DATA_DIR, relPath.replace(/\//g, path.sep));
    if (!fs.existsSync(fullPath)) return null;
    return readImageAsBase64(fullPath);
  } catch (e) { return null; }
});

// ── Scan Companions folder ───────────────────────────────
ipcMain.handle('scan-companions', async () => {
  const companionsDir = path.join(DATA_DIR, 'Companions');
  if (!fs.existsSync(companionsDir)) return [];

  const results = [];
  const entries = fs.readdirSync(companionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const charDir = path.join(companionsDir, entry.name);
    const files = fs.readdirSync(charDir);

    // Find JSON file
    const jsonFile = files.find(f => f.endsWith('.json'));
    const imageFiles = files.filter(f => IMAGE_EXTS.includes(path.extname(f).slice(1).toLowerCase()));

    let jsonData = null;
    if (jsonFile) {
      try { jsonData = JSON.parse(fs.readFileSync(path.join(charDir, jsonFile), 'utf-8')); }
      catch (e) { jsonData = null; }
    }

    // Read first image as thumbnail
    let thumbnail = null;
    if (imageFiles.length > 0) {
      try { thumbnail = readImageAsBase64(path.join(charDir, imageFiles[0])); }
      catch (e) {}
    }

    results.push({
      folderName: entry.name,
      folderPath: charDir,
      jsonFile: jsonFile ? path.join(charDir, jsonFile) : null,
      jsonData,
      imageFiles: imageFiles.map(f => ({
        name: path.basename(f, path.extname(f)),
        filename: f,
        relPath: `Companions/${entry.name}/${f}`
      })),
      thumbnail
    });
  }

  return results;
});

// ── Scan Lorebooks folder ────────────────────────────────
ipcMain.handle('scan-lorebooks', async () => {
  const dir = path.join(DATA_DIR, 'Lorebooks');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files.filter(f => f.endsWith('.json')).map(f => {
    try {
      const jsonData = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      const baseName = path.basename(f, '.json');
      const imageFile = files.find(img =>
        IMAGE_EXTS.includes(path.extname(img).slice(1).toLowerCase()) &&
        img.toLowerCase().startsWith(baseName.toLowerCase().slice(0, 8))
      );
      let thumbnail = null;
      let imageRelPath = null;
      if (imageFile) {
        try { thumbnail = readImageAsBase64(path.join(dir, imageFile)); } catch (e) {}
        imageRelPath = `Lorebooks/${imageFile}`;
      }
      return { filename: f, filePath: path.join(dir, f), jsonData, thumbnail, imageRelPath };
    } catch (e) { return null; }
  }).filter(Boolean);
});

// ── Scan Collections folder ──────────────────────────────
ipcMain.handle('scan-collections', async () => {
  const dir = path.join(DATA_DIR, 'Collections');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const results = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const jsonData = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      // Find any image in same folder with similar name
      const baseName = path.basename(f, '.json');
      const imageFile = files.find(img =>
        IMAGE_EXTS.includes(path.extname(img).slice(1).toLowerCase()) &&
        img.toLowerCase().includes(baseName.toLowerCase().slice(0, 6))
      );
      let thumbnail = null;
      let imageRelPath = null;
      if (imageFile) {
        try { thumbnail = readImageAsBase64(path.join(dir, imageFile)); } catch (e) {}
        imageRelPath = `Collections/${imageFile}`;
      }
      results.push({ filename: f, filePath: path.join(dir, f), jsonData, thumbnail, imageRelPath });
    } catch (e) {}
  }
  return results;
});

// ── List image files in a top-level data folder ──────────
ipcMain.handle('list-folder-images', async (event, subfolder) => {
  const dir = path.join(DATA_DIR, subfolder);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files
    .filter(f => IMAGE_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
    .map(f => ({
      name: path.basename(f, path.extname(f)),
      filename: f,
      relPath: `${subfolder}/${f}`
    }));
});

// ── Open folder in Explorer ──────────────────────────────
ipcMain.handle('open-folder', async (event, relPath) => {
  const fullPath = relPath ? path.join(DATA_DIR, relPath) : DATA_DIR;
  shell.openPath(fullPath);
});

// ── Write base64 image to a local subfolder ─────────────
ipcMain.handle('write-image-from-base64', async (event, { base64, destFolder, filename }) => {
  try {
    const destDir = path.join(DATA_DIR, destFolder);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const match = base64.match(/^data:image\/([\w]+);base64,(.+)$/s);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const data = Buffer.from(match[2], 'base64');
    const destFilename = filename.endsWith('.'+ext) ? filename : `${filename}.${ext}`;
    const destPath = path.join(destDir, destFilename);

    // Check if destination file already exists (previous migrate)
    if (fs.existsSync(destPath)) {
      const relPath = `${destFolder}/${destFilename}`.replace(/\\/g, '/');
      return { relPath };
    }
    // Check if any existing file in the folder already matches by base name
    if (fs.existsSync(destDir)) {
      const existing = fs.readdirSync(destDir).find(f => {
        const base = path.basename(f, path.extname(f)).toLowerCase();
        const target = filename.toLowerCase().replace(/\.[^.]+$/, '');
        return base === target && IMAGE_EXTS.includes(path.extname(f).slice(1).toLowerCase());
      });
      if (existing) {
        const relPath = `${destFolder}/${existing}`.replace(/\\/g, '/');
        return { relPath };
      }
    }

    fs.writeFileSync(destPath, data);
    const relPath = `${destFolder}/${destFilename}`.replace(/\\/g, '/');
    return { relPath };
  } catch (e) { console.error('write-image-from-base64:', e); return null; }
});

// ── Copy image file to a local subfolder ─────────────────
ipcMain.handle('copy-image-to-folder', async (event, { srcPath, destFolder, filename }) => {
  try {
    const normalSrc = path.normalize(srcPath);
    const normalDataDir = path.normalize(DATA_DIR);

    // If the file is already inside I:\Lorekeeper\, just return its relPath — no copy needed
    if (normalSrc.startsWith(normalDataDir + path.sep) || normalSrc.startsWith(normalDataDir + '/')) {
      const relPath = path.relative(DATA_DIR, normalSrc).replace(/\\/g, '/');
      return { relPath, base64: readImageAsBase64(normalSrc) };
    }

    const destDir = path.join(DATA_DIR, destFolder);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const ext = path.extname(srcPath);
    const destFilename = filename ? (filename.endsWith(ext) ? filename : filename + ext) : path.basename(srcPath);
    const destPath = path.join(destDir, destFilename);

    fs.copyFileSync(srcPath, destPath);
    const relPath = `${destFolder}/${destFilename}`.replace(/\\/g, '/');
    return { relPath, base64: readImageAsBase64(destPath) };
  } catch (e) { console.error('copy-image-to-folder:', e); return null; }
});

// ── Save companion JSON to disk ──────────────────────────
ipcMain.handle('save-companion-json', async (event, { folderName, data }) => {
  try {
    const charDir = path.join(DATA_DIR, 'Companions', folderName);
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });
    const filePath = path.join(charDir, 'companion.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('save-companion-json:', e); return false; }
});

// ── Save lorebook JSON to disk ───────────────────────────
ipcMain.handle('save-lorebook-json', async (event, { filename, data }) => {
  try {
    const dir = path.join(DATA_DIR, 'Lorebooks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename.endsWith('.json') ? filename : filename + '.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('save-lorebook-json:', e); return false; }
});

// ── Save collection JSON to disk ─────────────────────────
ipcMain.handle('save-collection-json', async (event, { filename, data }) => {
  try {
    const dir = path.join(DATA_DIR, 'Collections');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename.endsWith('.json') ? filename : filename + '.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('save-collection-json:', e); return false; }
});

// ── Save notes to standalone text files (independent of lorekeeper-data.json) ──
// Notes have no other backup mechanism — unlike characters/lorebooks/collections,
// which each auto-save to their own file, notes only ever lived inside the single
// big data file. This gives every world's notes (and the global scratchpad) their
// own plain-text file on disk, so they survive even if the main data file is lost.
ipcMain.handle('save-notes-file', async (event, { filename, content: noteContent }) => {
  try {
    const dir = path.join(DATA_DIR, 'Notes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(dir, safeName.endsWith('.md') ? safeName : safeName + '.md');
    await fs.promises.writeFile(filePath, noteContent || '', 'utf-8');
    return true;
  } catch (e) { console.error('save-notes-file:', e); return false; }
});

// Standalone template backup — same reasoning as Notes: templates only ever lived
// inside the single big data file with no independent file of their own, the same
// gap notes had before being fixed. Each template now also auto-saves to its own
// JSON file in Templates\, independent of the main data file write.
ipcMain.handle('save-template-file', async (event, { filename, data: templateData }) => {
  try {
    const dir = path.join(DATA_DIR, 'Templates');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(dir, safeName.endsWith('.json') ? safeName : safeName + '.json');
    await fs.promises.writeFile(filePath, JSON.stringify(templateData, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('save-template-file:', e); return false; }
});


// Standalone persona backup — same reasoning as Notes and Templates: personas
// only ever lived inside the main data file with no independent file of their own.
// The Personas\ folder existed but nothing ever wrote to it automatically; the .md
// files in there were manual "Export MD" saves, which are formatted documents and
// cannot be reimported. This writes real JSON, so a persona is actually recoverable.
ipcMain.handle('save-persona-file', async (event, { filename, data: personaData }) => {
  try {
    const dir = path.join(DATA_DIR, 'Personas');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(dir, safeName.endsWith('.json') ? safeName : safeName + '.json');
    await fs.promises.writeFile(filePath, JSON.stringify(personaData, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('save-persona-file:', e); return false; }
});

// ── Helpers for backup ───────────────────────────────────
function addDirToZip(zip, dirPath, zipPrefix) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    const zipPath = zipPrefix + '/' + entry.name;
    if (entry.isDirectory()) addDirToZip(zip, full, zipPath);
    else zip.addLocalFile(full, path.dirname(zipPath));
  }
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Lastgood helpers ──────────────────────────────────────────────
ipcMain.handle('get-lastgood-info', async () => {
  try {
    if (!fs.existsSync(DATA_BACKUP_FILE)) return null;
    const stat = fs.statSync(DATA_BACKUP_FILE);
    return { size: stat.size, mtime: stat.mtime.toISOString() };
  } catch(e) { return null; }
});

ipcMain.handle('restore-lastgood', async () => {
  try {
    if (!fs.existsSync(DATA_BACKUP_FILE)) return { success: false, error: 'No lastgood backup found' };
    const content = fs.readFileSync(DATA_BACKUP_FILE, 'utf-8');
    const data = JSON.parse(content);
    fs.writeFileSync(DATA_FILE, content, 'utf-8');
    return { success: true, data, size: fs.statSync(DATA_BACKUP_FILE).size };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── Git backup sync ──────────────────────────────────────
// Runs the sync script and waits for it, so the UI can report the real result.
// The shutdown path uses launchSyncDetached() instead — there, waiting is wrong.
ipcMain.handle('sync-to-git', async () => {
  const p = resolveSyncPaths();
  if (!p || !p.dst) return { success: false, error: SYNC_CODES[2], code: 2 };
  const script = syncScript();
  if (!script || !fs.existsSync(script)) return { success: false, error: 'Sync script not found at ' + script };
  const pretty = await writePrettyData();
  if (!pretty.success) return { success: false, error: 'Pretty-print failed: ' + pretty.error };
  // Refresh the generated file so the scheduled run agrees with Settings.
  writeSyncPathsCmd(p);
  return await new Promise((resolve) => {
    let out = '';
    const child = spawn('cmd.exe', ['/c', script], { cwd: p.dst, windowsHide: true, env: syncEnv(p) });
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} resolve({ success: false, error: 'Sync timed out after 3 minutes', output: out }); }, 180000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ success: false, error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        code,
        error: SYNC_CODES[code] || (code === 0 ? null : 'Sync exited with code ' + code),
        output: out.trim(),
        prettySize: pretty.size
      });
    });
  });
});

// The renderer pushes the configured paths here on load and whenever Settings
// changes, which both caches them for this process and regenerates the file the
// scheduled task reads.
ipcMain.handle('set-sync-paths', async (e, p) => {
  // Defaults to 'none', not 'github'. An absent provider means nothing has been
  // chosen, and reading it as the retired script route is how an unconfigured
  // install ends up acting configured.
  syncPaths = {
    provider: (p && p.provider) || 'none',
    dst:   (p && p.dst)   || '',
    cloud: (p && p.cloud) || ''
  };
  // sync-paths.cmd belongs to the retired script route and to nothing else.
  // Writing it on every Settings change put a generated file into a folder the
  // install does not use - which is what a fresh packaged build was caught doing
  // on 11 October 2026, with the provider correctly set to none. The startup
  // regeneration was gated the same day; this call site was missed because it is
  // 850 lines away from it.
  const scriptRoute = (syncPaths.provider === 'github' || syncPaths.provider === 'legacy-folder');
  const wrote = scriptRoute ? writeSyncPathsCmd(syncPaths) : false;
  return { ok: true, wrote, dataDir: DATA_DIR };
});

ipcMain.handle('get-sync-info', async () => {
  const p = resolveSyncPaths();
  const dst = p ? p.dst : null;
  const script = syncScript();
  const stamp = (name) => {
    try {
      if (!dst) return null;
      const f = path.join(dst, name);
      if (!fs.existsSync(f)) return null;
      return { text: fs.readFileSync(f, 'utf-8').trim(), at: fs.statSync(f).mtime.toISOString() };
    } catch (e) { return null; }
  };
  return {
    configured: !!(p && p.dst),
    dataDir: DATA_DIR,
    backupDir: dst,
    provider: p ? (p.provider || 'github') : 'github',
    // Deliberately reports the EFFECTIVE destination, not the stored field. If the
    // provider is github, the panel must not show a cloud folder as if it were in use.
    cloudDir: cloudPath(p) || null,
    backupDirExists: !!(dst && fs.existsSync(dst)),
    // Checks the cloud DRIVE, not the leaf folder: Google Drive's virtual mount
    // does not exist at all until Drive FS has started, and the leaf may legitimately
    // not exist before the first successful run.
    cloudDriveReady: (() => {
      try {
        const c = cloudPath(p);
        if (!c) return null;
        return fs.existsSync(path.parse(c).root);
      } catch (e) { return null; }
    })(),
    scriptFound: !!(script && fs.existsSync(script)),
    pathsCmdFound: !!(dst && fs.existsSync(path.join(dst, 'sync-paths.cmd'))),
    prettyExists: fs.existsSync(PRETTY_FILE),
    prettyMtime: fs.existsSync(PRETTY_FILE) ? fs.statSync(PRETTY_FILE).mtime.toISOString() : null,
    lastSync: stamp('last-sync.txt'),
    lastCloudSync: stamp('last-cloud-sync.txt')
  };
});

ipcMain.handle('open-backup-folder', async (e, which) => {
  const p = resolveSyncPaths();
  if (!p) return false;
  const target = which === 'cloud' ? cloudPath(p) : p.dst;
  if (!target || !fs.existsSync(target)) return false;
  shell.openPath(target);
  return true;
});

// ── Export backup ────────────────────────────────────────
ipcMain.handle('export-backup', async (event, { worldId }) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    const defaultName = worldId ? `lorekeeper-world-${date}.zip` : `lorekeeper-backup-${date}.zip`;
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(DATA_DIR, defaultName),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    });
    if (!filePath) return { success: false, cancelled: true };

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    let exportData = data;
    const world = worldId ? data.worlds.find(w => w.id === worldId) : null;

    if (worldId) {
      const chars = data.characters.filter(c => c.world_id === worldId);
      const lores = data.lorebooks.filter(l => l.world_id === worldId);
      const colls = data.collections.filter(c => c.world_id === worldId);
      exportData = { worlds: [world], characters: chars, lorebooks: lores, collections: colls,
        gallery: (data.gallery||[]).filter(g => g.world_id === worldId),
        personas: [], templates: (data.templates||[]).filter(t => t.world_id === worldId),
        lorebook_templates: (data.lorebook_templates||[]).filter(t => t.world_id === worldId),
        relationships: (data.relationships||[]).filter(r => r.worldId === worldId),
        notes: '', release_cycle: [], schedule_notes: {}, _world_export: true };
    }

    const zip = new AdmZip();
    zip.addFile('lorekeeper-data.json', Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8'));

    const folders = ['Companions', 'Lorebooks', 'Collections', 'Worlds', 'Personas', 'Notes', 'Templates'];
    if (worldId) {
      exportData.characters.forEach(c => {
        if (c.companion_folder) addDirToZip(zip, path.join(DATA_DIR, 'Companions', c.companion_folder), 'Companions/' + c.companion_folder);
      });
      if (exportData.lorebooks.length) addDirToZip(zip, path.join(DATA_DIR, 'Lorebooks'), 'Lorebooks');
      if (exportData.collections.length) addDirToZip(zip, path.join(DATA_DIR, 'Collections'), 'Collections');
      // Templates don't have a per-world subfolder the way Companions does, so when this
      // world has any templates, include the whole standalone Templates\ backup folder
      // rather than trying to guess which files belong to which world.
      if (exportData.templates.length) addDirToZip(zip, path.join(DATA_DIR, 'Templates'), 'Templates');
      // Include this world's standalone notes backup file if it exists, even though notes
      // are also embedded in lorekeeper-data.json above — the standalone .md file is the
      // independent safety net and should travel with any backup of this world.
      const worldNotesFile = path.join(DATA_DIR, 'Notes', (world.name || ('world-' + worldId)).replace(/[\\/:*?"<>|]/g, '_') + '.md');
      if (fs.existsSync(worldNotesFile)) zip.addLocalFile(worldNotesFile, 'Notes');
    } else {
      for (const folder of folders) addDirToZip(zip, path.join(DATA_DIR, folder), folder);
    }

    zip.writeZip(filePath);
    const size = fs.statSync(filePath).size;
    return { success: true, size, path: filePath };
  } catch (e) { console.error('export-backup:', e); return { success: false, error: e.message }; }
});

// ── Export platform ZIP (stripped JSONs ready for upload) ──
ipcMain.handle('export-platform-zip', async (event, { defaultName, files, folder }) => {
  try {
    const baseDir = folder ? path.join(DATA_DIR, folder) : DATA_DIR;
    if (folder && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(baseDir, defaultName),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    });
    if (!filePath) return { success: false, cancelled: true };
    const zip = new AdmZip();
    for (const f of files) {
      zip.addFile(f.name, Buffer.from(f.content, 'utf-8'));
    }
    zip.writeZip(filePath);
    const size = fs.statSync(filePath).size;
    return { success: true, size, path: filePath };
  } catch (e) { console.error('export-platform-zip:', e); return { success: false, error: e.message }; }
});

// ── Restore from backup ──────────────────────────────────
ipcMain.handle('restore-backup', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile', 'dontAddToRecent']
    });
    if (!filePaths || !filePaths[0]) return { success: false, cancelled: true };

    const zip = new AdmZip(filePaths[0]);
    const tmpDir = path.join(os.tmpdir(), 'lorekeeper-restore-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    zip.extractAllTo(tmpDir, true);

    const dataFile = path.join(tmpDir, 'lorekeeper-data.json');
    if (!fs.existsSync(dataFile)) return { success: false, error: 'No lorekeeper-data.json found in backup' };
    const backupData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

    const folders = ['Companions', 'Lorebooks', 'Collections', 'Worlds', 'Personas'];
    for (const folder of folders) {
      const src = path.join(tmpDir, folder);
      if (fs.existsSync(src)) copyDirRecursive(src, path.join(DATA_DIR, folder));
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: true, data: backupData };
  } catch (e) { console.error('restore-backup:', e); return { success: false, error: e.message }; }
});
