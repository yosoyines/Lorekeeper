// github-ipc.js — wiring between the renderer and github-backup.js.
//
// Kept out of main.js on purpose. main.js gains three lines for all of this:
// one require, one destructure addition, one call. Everything that can change
// while Stage 3b is being built changes in here instead, where a mistake cannot
// take the whole app down with it.
//
// CREDENTIALS
// The token is the one secret Lorekeeper holds itself. It is encrypted with
// Electron's safeStorage (which on Windows hands the work to DPAPI, keyed to the
// Windows account) and written to the app's own userData folder.
//
// It is NOT written into the data folder, and that is not a preference. The data
// folder is what gets backed up: a token placed there would be pushed to GitHub
// and would stay recoverable from the repository history permanently, even after
// the file was deleted. The LM Studio section of the sync script carries the same
// warning for the same reason.

const fs = require('fs');
const path = require('path');
const gh = require('./github-backup');
const rclone = require('./rclone-backup');

// Returns { register, runBackup }. runBackup is what both the button and the
// scheduled run go through - ONE code path, which is the whole point of
// retiring the script. A second implementation for the unattended case is how
// the old setup ended up with a panel reporting healthy pushes while the
// scheduled run had been failing for days.
function createGitHubBackup({ ipcMain, safeStorage, app, dataDir, writePrettyData, resourcesPath, vendorDir }) {

  const stateDir = app.getPath('userData');
  const TOKEN_FILE = path.join(stateDir, 'github-token.bin');
  const STATE_FILE = path.join(stateDir, 'github-backup-state.json');

  // rclone's own config, deliberately NOT the user's. Without --config rclone reads
  // %APPDATA%\rclone\rclone.conf, which may already hold remotes they use for
  // something else entirely. A backup tool has no business writing in there, and no
  // business depending on what it finds.
  const RCLONE_CONFIG = path.join(stateDir, 'rclone.conf');
  // Staging lives beside it, NOT in the data folder - the data folder is what gets
  // backed up, and a second copy of the corpus inside it would be backed up too.
  const RCLONE_STAGE = path.join(stateDir, 'rclone-stage');

  function rcloneBin() {
    return rclone.resolveRclone({ resourcesPath: resourcesPath, extraDir: vendorDir }).path;
  }

  // Everywhere the binary could legitimately be, for the error message. A failure that
  // does not say where it looked is the same dead end the GitHub token folder was.
  function rcloneSearchedIn() {
    const out = [];
    if (resourcesPath) out.push(path.join(resourcesPath, 'rclone'));
    if (vendorDir) out.push(vendorDir);
    out.push('anywhere on PATH');
    return out;
  }

  function ensureStateDir() {
    try { if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true }); } catch (e) {}
  }

  // Finding a token written before the app name was pinned.
  //
  // Electron derives userData from the app name, and the name depended on how the
  // app was launched: `electron .` found package.json and used "lorekeeper", while
  // `electron src/main.js` did not and fell back to "Electron". main.js now calls
  // app.setName('Lorekeeper'), so there is one folder from here on - but a token
  // saved under either old name sits in a folder nothing looks at any more.
  //
  // THE FIRST VERSION OF THIS GOT IT WRONG, in a way worth recording. It took the
  // first candidate folder that merely CONTAINED a token file, copied it, and
  // deleted the source. Both old folders existed on the real machine, so it took
  // the wrong one, destroyed it, and left a file that would not decrypt sitting in
  // the destination - which then made every later attempt exit early and never look
  // in the folder holding the real token. Two lessons, both already in the spec: a
  // file existing is not the same as a file being valid, and never delete the only
  // copy of something to prove a theory about it.
  //
  // WORTH KNOWING: on Windows this rescue usually CANNOT succeed across an app-name
  // change, and that is not a bug here. safeStorage generates a key and protects it
  // with DPAPI, but the generated key itself lives in a `Local State` file inside the
  // userData folder. Move folders and the token comes with you while the key does not,
  // so the blob is intact and unreadable. The honest fix is to paste the token again
  // once; copying `Local State` across would drag unrelated encrypted state with it.
  // The rescue is kept because it costs nothing and does work where the key is shared.
  //
  // So: try EVERY candidate, accept one only when it actually decrypts, and never
  // delete a source. A stale copy left behind costs nothing; a deleted token costs
  // a trip to GitHub to make another.
  //
  // Runs lazily on the first read rather than at construction, because safeStorage
  // cannot decrypt before the app is ready and this module is built before that.
  let rescueTried = false;

  function decryptFile(file) {
    try {
      if (!fs.existsSync(file)) return null;
      const txt = safeStorage.decryptString(fs.readFileSync(file));
      return txt && txt.trim() ? txt.trim() : null;
    } catch (e) { return null; }
  }

  function legacyCandidates() {
    const parent = path.dirname(stateDir);
    const here = path.resolve(stateDir).toLowerCase();
    return ['Electron', 'lorekeeper', 'Lorekeeper']
      .map(n => path.join(parent, n))
      .filter(d => path.resolve(d).toLowerCase() !== here);
  }

  // Returns a working token from an old folder, copying it into place. Only called
  // when the current folder has no usable token of its own.
  function rescueLegacyToken() {
    if (rescueTried) return null;
    rescueTried = true;
    if (!safeStorage.isEncryptionAvailable()) return null;
    for (const old of legacyCandidates()) {
      const token = decryptFile(path.join(old, 'github-token.bin'));
      if (!token) continue;
      try {
        ensureStateDir();
        fs.copyFileSync(path.join(old, 'github-token.bin'), TOKEN_FILE);
        const oldState = path.join(old, 'github-backup-state.json');
        if (fs.existsSync(oldState) && !fs.existsSync(STATE_FILE)) fs.copyFileSync(oldState, STATE_FILE);
        console.log('Backup: found a working token in ' + old + ', copied to ' + stateDir + '. The original was left alone.');
      } catch (e) {
        console.error('rescueLegacyToken: token found in ' + old + ' but could not be copied:', e.message);
      }
      return token;
    }
    return null;
  }

  // Every folder a token might be in, and whether what is there actually works.
  // Used by the failure message, so it reports what was checked instead of guessing.
  function tokenDiagnosis() {
    const seen = [{dir: stateDir, current: true, file: fs.existsSync(TOKEN_FILE), ok: !!decryptFile(TOKEN_FILE)}];
    for (const old of legacyCandidates()) {
      const f = path.join(old, 'github-token.bin');
      if (fs.existsSync(f)) seen.push({dir: old, current: false, file: true, ok: !!decryptFile(f)});
    }
    return seen;
  }

  // A file that will not decrypt is treated as ABSENT, not as an error. That is what
  // lets a bad copy in the current folder fall through to the rescue instead of
  // permanently masking a good token in an old one.
  function readToken() {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const here = decryptFile(TOKEN_FILE);
    if (here) return here;
    return rescueLegacyToken();
  }

  function writeToken(token) {
    // Refuse rather than fall back to plain text. A token sitting unencrypted on
    // disk is worse than no stored token at all, and silently downgrading the
    // protection is exactly the kind of thing nobody finds out about until later.
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Windows is not offering encrypted storage right now, so the token was not saved. Nothing is stored in plain text.' };
    }
    try {
      ensureStateDir();
      fs.writeFileSync(TOKEN_FILE, safeStorage.encryptString(token));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Could not save the token: ' + e.message };
    }
  }

  // ── Small state file: what this machine last pushed ────
  // Lives beside the token, not in the data folder, so it never becomes part of
  // what gets backed up and can never cause a commit of its own.
  function readState() {
    try {
      if (!fs.existsSync(STATE_FILE)) return {};
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) || {};
    } catch (e) { return {}; }
  }

  function writeState(patch) {
    try {
      ensureStateDir();
      const next = { ...readState(), ...patch };
      fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf-8');
      return next;
    } catch (e) { console.error('writeState:', e); return null; }
  }

  // ── Handlers ───────────────────────────────────────────

  // ── The one backup path ────────────────────────────────
  // provider decides the destination; everything before that is shared.
  async function runBackup({ provider, repo, branch, folder, onProgress }) {
    const progress = onProgress || function () {};

    if (provider === 'folder') {
      if (typeof writePrettyData === 'function') {
        const pretty = await writePrettyData();
        if (!pretty.success) return { success: false, error: 'Could not prepare the data file for backup: ' + pretty.error };
      }
      progress('Copying to the folder…');
      const res = gh.mirrorToFolder(dataDir, folder);
      if (res.success) writeState({ lastSync: new Date().toISOString(), lastCounts: res.counts, folder: folder });
      return res;
    }

    if (provider === 'rclone') {
      if (typeof writePrettyData === 'function') {
        const pretty = await writePrettyData();
        if (!pretty.success) return { success: false, error: 'Could not prepare the data file for backup: ' + pretty.error };
      }
      const st2 = readState();
      const backend = (opts && opts.backend) || st2.rcloneBackend;
      if (!backend) return { success: false, error: 'No cloud account connected. Connect one in Settings, Backup.' };
      const res = await rclone.syncToRemote({
        bin: rcloneBin(),
        configPath: RCLONE_CONFIG,
        dataDir: dataDir,
        stageDir: RCLONE_STAGE,
        remote: rclone.REMOTE_NAME,
        basePath: (opts && opts.folder) || st2.rclonePath || 'Lorekeeper',
        onProgress: progress
      });
      if (res.success) {
        writeState({ lastSync: new Date().toISOString(), lastCounts: res.counts, rcloneDestination: res.destination });
      }
      return res;
    }

    if (provider !== 'github-api') {
      return { success: false, error: 'No backup destination is set. Choose one in Settings, Backup.' };
    }

    const token = readToken();
    if (!token) {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'Windows is not offering encrypted storage, so the saved token cannot be read. Nothing was uploaded.' };
      }
      const seen = tokenDiagnosis();
      console.error('Backup: checked these folders for a saved token:\n' + seen.map(d =>
        '  ' + d.dir + (d.current ? '  (current)' : '') + ' - ' +
        (!d.file ? 'no token file' : d.ok ? 'token found and readable' : 'token file present but will not decrypt')
      ).join('\n'));
      const stale = seen.some(d => d.file && !d.ok);
      return { success: false, error: stale
        ? 'A saved token was found but could not be read. Windows keeps the key that decrypts it inside the app data folder, so a token saved before the folder was pinned cannot be opened from the new one. Open Lorekeeper, go to Settings then Backup, and paste the token again - this only happens once.'
        : 'No token saved. Add one in Settings, Backup.' };
    }

    const st = readState();
    const id = gh.parseRepo(repo || st.repo);
    if (!id) return { success: false, error: 'No repository set. Choose one in Settings, Backup.' };

    // The pretty-printed copy is what actually gets committed - the live data
    // file is one enormous line, which git stores as a whole fresh copy every
    // time. Refresh it first or the backup pushes a stale snapshot.
    if (typeof writePrettyData === 'function') {
      const pretty = await writePrettyData();
      if (!pretty.success) return { success: false, error: 'Could not prepare the data file for backup: ' + pretty.error };
    }

    let res;
    try {
      res = await gh.syncRepo({
        token: token,
        owner: id.owner,
        repo: id.repo,
        branch: branch || st.branch || null,
        dataDir: dataDir,
        lastCommit: st.lastCommit || null,
        onProgress: progress
      });
    } catch (err) {
      return { success: false, error: 'The backup stopped with an unexpected error: ' + err.message };
    }

    if (res.success) {
      writeState({
        repo: id.owner + '/' + id.repo,
        branch: res.branch,
        lastCommit: res.commit,
        lastSync: new Date().toISOString(),
        lastCounts: res.counts
      });
    }
    return res;
  }

  ipcMain.handle('github-status', async () => {
    const st = readState();
    const token = readToken();
    return {
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      hasToken: !!token,
      login: st.login || null,
      repo: st.repo || null,
      branch: st.branch || null,
      lastCommit: st.lastCommit || null,
      lastSync: st.lastSync || null,
      lastCounts: st.lastCounts || null,
      tokenExpiry: st.tokenExpiry || null,
      stateDir: stateDir
    };
  });

  // Validates before storing. A token that does not work should fail here, while
  // the person is looking at the field, rather than at 11pm inside a scheduled run.
  ipcMain.handle('github-set-token', async (e, token) => {
    const t = (token || '').trim();
    if (!t) return { ok: false, error: 'No token was entered.' };
    const who = await gh.getUser(t);
    if (!who.ok) return { ok: false, error: who.error };
    const stored = writeToken(t);
    if (!stored.ok) return stored;
    writeState({ login: who.login, tokenExpiry: who.expiry || null });
    return { ok: true, login: who.login, name: who.name, expiry: who.expiry || null };
  });

  ipcMain.handle('github-clear-token', async () => {
    try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch (err) {}
    writeState({ login: null, tokenExpiry: null });
    return { ok: true };
  });

  ipcMain.handle('github-list-repos', async () => {
    const token = readToken();
    if (!token) return { ok: false, error: 'No token saved yet.' };
    return await gh.listRepos(token);
  });

  // Checks one repository and reports what the token can actually do with it,
  // so a missing write permission is visible at setup rather than at first sync.
  ipcMain.handle('github-check-repo', async (e, repoInput) => {
    const token = readToken();
    if (!token) return { ok: false, error: 'No token saved yet.' };
    const id = gh.parseRepo(repoInput);
    if (!id) return { ok: false, error: 'That does not look like a repository. Use owner/name, or paste the repository URL.' };
    const info = await gh.getRepo(token, id.owner, id.repo);
    if (!info.ok) return info;
    const canPush = !!(info.permissions && (info.permissions.push || info.permissions.admin || info.permissions.maintain));
    return {
      ok: true,
      fullName: info.fullName,
      private: info.private,
      defaultBranch: info.defaultBranch,
      canPush: canPush,
      warning: canPush ? null : 'This token can read the repository but may not be able to write to it. Check that it has Contents set to Read and write.'
    };
  });

  ipcMain.handle('github-sync', async (event, opts) => {
    const o = opts || {};
    const send = (msg) => {
      try {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('github-sync-progress', msg);
        }
      } catch (err) {}
    };
    return await runBackup({
      provider: o.provider || 'github-api',
      repo: o.repo,
      branch: o.branch,
      folder: o.folder,
      onProgress: send
    });
  });

  // ── rclone ─────────────────────────────────────────────
  ipcMain.handle('rclone-status', async () => {
    const r = rclone.resolveRclone({ resourcesPath: resourcesPath, extraDir: vendorDir });
    const st = readState();
    const out = {
      binaryFound: r.ok,
      bundled: r.bundled,
      binaryPath: r.path,
      backends: rclone.BACKENDS,
      backend: st.rcloneBackend || null,
      folder: st.rclonePath || 'Lorekeeper',
      destination: st.rcloneDestination || null,
      connected: false,
      searchedIn: rcloneSearchedIn()
    };
    // Found on PATH rather than bundled is still usable, so ask rclone itself
    // rather than trusting the file check.
    const ver = await rclone.run(out.binaryPath, ['version'], { timeout: 15000 });
    out.binaryFound = ver.ok;
    out.version = ver.ok ? (ver.out.split('\n')[0] || '').trim() : null;
    if (ver.ok) {
      const list = await rclone.listRemotes(out.binaryPath, RCLONE_CONFIG);
      out.connected = !!(list.ok && list.remotes.some(x => x.name === rclone.REMOTE_NAME));
    }
    return out;
  });

  // The whole sign-in, start to finish: consent in the browser, save the remote,
  // then PROVE it works with a real round trip before reporting success. The OAuth
  // flow could not be tested without a cloud account, so the first person to use it
  // is the test - which is only acceptable if it tells them the truth immediately.
  ipcMain.handle('rclone-connect', async (event, opts) => {
    const o = opts || {};
    const backend = o.backend;
    if (!rclone.BACKENDS.some(b => b.id === backend)) return { ok: false, error: 'Unknown cloud service.' };
    const bin = rcloneBin();
    const send = (msg) => {
      try {
        if (event && event.sender && !event.sender.isDestroyed()) event.sender.send('rclone-connect-progress', msg);
      } catch (e) {}
    };

    send('Opening your browser to sign in…');
    const auth = await rclone.authorize(bin, backend, { onLine: () => {} });
    if (!auth.ok) return { ok: false, error: auth.error };

    send('Saving the connection…');
    const made = await rclone.createRemote(bin, RCLONE_CONFIG, backend, auth.token);
    if (!made.ok) return { ok: false, error: made.error };

    const folder = (o.folder || 'Lorekeeper').replace(/^\/+|\/+$/g, '') || 'Lorekeeper';
    send('Checking that the destination accepts files…');
    const proof = await rclone.verifyRemote(bin, RCLONE_CONFIG, rclone.REMOTE_NAME + ':' + folder);
    if (!proof.ok) {
      // A connection that cannot store anything is worse than none, because the
      // panel would report healthy backups. Remove it rather than keep it.
      await rclone.deleteRemote(bin, RCLONE_CONFIG);
      return { ok: false, error: proof.error };
    }

    writeState({ rcloneBackend: backend, rclonePath: folder });
    return { ok: true, backend, folder };
  });

  ipcMain.handle('rclone-disconnect', async () => {
    await rclone.deleteRemote(rcloneBin(), RCLONE_CONFIG);
    writeState({ rcloneBackend: null, rcloneDestination: null });
    try { fs.rmSync(RCLONE_STAGE, { recursive: true, force: true }); } catch (e) {}
    return { ok: true };
  });

  // Lets the panel show what a sync would send without sending it.
  ipcMain.handle('github-preview', async () => {
    try {
      const g = gh.gatherFiles(dataDir);
      return {
        ok: true,
        count: g.files.length,
        bytes: g.files.reduce((n, f) => n + f.size, 0),
        skipped: g.skipped
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  return { runBackup: runBackup };
}

module.exports = { createGitHubBackup };
