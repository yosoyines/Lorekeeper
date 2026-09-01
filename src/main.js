const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const os = require('os');
const { spawn } = require('child_process');

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
const BACKUP_DIR = 'I:\\LorekeeperBackup';
const SYNC_SCRIPT = path.join(BACKUP_DIR, 'lorekeeper-sync.bat');
const PRETTY_FILE = path.join(DATA_DIR, 'lorekeeper-data.pretty.json');

// Ensure all standard data folders exist on startup
['', 'Companions', 'Lorebooks', 'Collections', 'Worlds', 'Personas', 'Templates', 'Notes'].forEach(sub => {
  const p = sub ? path.join(DATA_DIR, sub) : DATA_DIR;
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

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

// Fire-and-forget launch of the sync script. Detached and unref'd so a slow
// git push can never hold the app open or delay quitting.
function launchSyncDetached() {
  try {
    if (!fs.existsSync(SYNC_SCRIPT)) return false;
    const child = spawn('cmd.exe', ['/c', SYNC_SCRIPT], {
      cwd: BACKUP_DIR, detached: true, stdio: 'ignore', windowsHide: true
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
      try { await writePrettyData(); } catch (err) {}
      launchSyncDetached();
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

ipcMain.handle('get-data-path', () => DATA_FILE);

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
    properties: ['openFile']
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
ipcMain.handle('import-image', async (event, opts) => {
  const dialogOpts = {
    filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
    properties: ['openFile']
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
    properties: ['openFile', 'multiSelections']
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
  const pretty = await writePrettyData();
  if (!pretty.success) return { success: false, error: 'Pretty-print failed: ' + pretty.error };
  if (!fs.existsSync(SYNC_SCRIPT)) return { success: false, error: 'Sync script not found at ' + SYNC_SCRIPT };
  return await new Promise((resolve) => {
    let out = '';
    const child = spawn('cmd.exe', ['/c', SYNC_SCRIPT], { cwd: BACKUP_DIR, windowsHide: true });
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} resolve({ success: false, error: 'Sync timed out after 3 minutes', output: out }); }, 180000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ success: false, error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, output: out.trim(), prettySize: pretty.size });
    });
  });
});

ipcMain.handle('get-sync-info', async () => ({
  backupDir: BACKUP_DIR,
  scriptFound: fs.existsSync(SYNC_SCRIPT),
  prettyExists: fs.existsSync(PRETTY_FILE),
  prettyMtime: fs.existsSync(PRETTY_FILE) ? fs.statSync(PRETTY_FILE).mtime.toISOString() : null
}));

ipcMain.handle('open-backup-folder', async () => {
  if (!fs.existsSync(BACKUP_DIR)) return false;
  shell.openPath(BACKUP_DIR);
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
      properties: ['openFile']
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
