// rclone-backup.js — backup to Google Drive, OneDrive or Dropbox via rclone.
//
// WHY RCLONE AND NOT A NATIVE INTEGRATION
// Drive, OneDrive and Dropbox issue no user-pasteable credential the way the AI
// providers do: they require OAuth, where the APPLICATION is registered with the
// provider. Natively that application would have to be Ine's - her Google Cloud
// project, her consent screen, her quota, her name on verification, carrying other
// people's backups, three times over. rclone is already registered with all of
// them, owns the OAuth itself, and keeps its tokens in its own config file, so
// Lorekeeper never handles a cloud credential at all.
//
// THE OWNERSHIP RULE, which is the whole design
// `rclone sync` deletes everything at the destination that is not in the source -
// verified, not assumed: a test sync wiped a README and an unrelated folder. That
// is the same footgun as the old `robocopy /MIR` route. So this NEVER syncs a whole
// destination. It syncs each owned folder to its own path and copies the loose
// pretty file, which means deletion can only ever happen inside folders Lorekeeper
// put there. Anything else at the destination is left untouched, exactly as with
// the GitHub engine and the folder mirror.
//
// No electron import, so this runs and is testable outside the app.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const gh = require('./github-backup');

// The backends offered. rclone supports ~70; these are the three the roadmap asked
// for, and every extra one is a support question nobody wants.
const BACKENDS = [
  { id: 'drive',   label: 'Google Drive' },
  { id: 'onedrive', label: 'OneDrive' },
  { id: 'dropbox', label: 'Dropbox' }
];

// The remote rclone config entry Lorekeeper creates. Fixed, because the user never
// needs to know it exists.
const REMOTE_NAME = 'lorekeeper';

// ── Finding the binary ───────────────────────────────────
// Bundled first, then anything on PATH. The bundled copy is what makes this work
// for someone who has never heard of rclone; the PATH fallback is what makes it
// work in dev, before a packaged build exists.
function resolveRclone(opts) {
  const o = opts || {};
  const exe = (o.platform || process.platform) === 'win32' ? 'rclone.exe' : 'rclone';
  const candidates = [];
  if (o.resourcesPath) candidates.push(path.join(o.resourcesPath, 'rclone', exe));
  if (o.extraDir) candidates.push(path.join(o.extraDir, exe));
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return { ok: true, path: c, bundled: true }; } catch (e) {}
  }
  return { ok: false, path: exe, bundled: false, fallbackToPath: true };
}

// ── Running it ───────────────────────────────────────────
// Every call passes --config. Without it rclone uses %APPDATA%\rclone\rclone.conf,
// which is the user's OWN config - they may already use rclone for something else,
// and a backup tool has no business writing into it or depending on what is there.
function run(bin, args, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    let out = '', err = '';
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true, env: { ...process.env, ...(o.env || {}) } });
    } catch (e) {
      resolve({ ok: false, code: -1, out: '', err: e.message });
      return;
    }
    child.stdout.on('data', d => { out += d.toString(); if (o.onLine) o.onLine(d.toString()); });
    child.stderr.on('data', d => { err += d.toString(); if (o.onLine) o.onLine(d.toString()); });
    const timer = o.timeout ? setTimeout(() => { try { child.kill(); } catch (e) {} }, o.timeout) : null;
    child.on('error', (e) => { if (timer) clearTimeout(timer); resolve({ ok: false, code: -1, out, err: e.message }); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ ok: code === 0, code, out: out.trim(), err: err.trim() });
    });
    if (o.onChild) o.onChild(child);
  });
}

function cfgArgs(configPath) { return ['--config', configPath]; }

// ── Config inspection ────────────────────────────────────
async function listRemotes(bin, configPath) {
  const res = await run(bin, ['config', 'dump', ...cfgArgs(configPath)], { timeout: 20000 });
  if (!res.ok) return { ok: false, error: describe(res, 'reading the rclone config') };
  try {
    const parsed = JSON.parse(res.out || '{}');
    return { ok: true, remotes: Object.keys(parsed).map(name => ({ name, type: parsed[name].type })) };
  } catch (e) {
    return { ok: false, error: 'rclone returned something unreadable for its config.' };
  }
}

// ── Authorization ────────────────────────────────────────
// `rclone authorize <backend>` opens the browser, takes the user through the
// provider's consent screen, and prints the resulting token between two markers.
// Capturing it from stdout avoids rclone's interactive `config` prompt entirely,
// which cannot be driven from a GUI.
//
// The markers are rclone's own and have been stable for years, but a parser built
// on screen-scraping should fail loudly rather than return something wrong, so an
// unrecognised output is an error and not an empty token.
const TOKEN_START = 'Paste the following into your remote machine --->';
const TOKEN_END   = '<---End paste';

function extractToken(output) {
  if (!output) return null;
  const a = output.indexOf(TOKEN_START);
  if (a === -1) return null;
  const b = output.indexOf(TOKEN_END, a);
  if (b === -1) return null;
  const token = output.slice(a + TOKEN_START.length, b).trim();
  if (!token) return null;
  // What rclone prints is a JSON object holding the OAuth token. Anything else
  // means the format moved and this parser needs revisiting.
  if (!(token.startsWith('{') && token.endsWith('}'))) return null;
  return token;
}

// Runs the consent flow. Resolves with the token, or an error explaining what the
// user would have seen. Long timeout: a person has to find their password, pick an
// account and read a consent screen.
async function authorize(bin, backend, opts) {
  const o = opts || {};
  const res = await run(bin, ['authorize', backend], {
    timeout: o.timeout || 300000,
    onLine: o.onLine,
    onChild: o.onChild
  });
  const combined = (res.out || '') + '\n' + (res.err || '');
  const token = extractToken(combined);
  if (token) return { ok: true, token };
  if (!res.ok) return { ok: false, error: describe(res, 'the sign-in') };
  return { ok: false, error: 'Sign-in finished but rclone did not return a token in the form this expects. Nothing was saved.' };
}

// Writes the authorized remote into OUR config file.
async function createRemote(bin, configPath, backend, token, name) {
  const remote = name || REMOTE_NAME;
  const res = await run(bin, ['config', 'create', remote, backend, 'token=' + token,
    '--non-interactive', ...cfgArgs(configPath)], { timeout: 60000 });
  if (!res.ok) return { ok: false, error: describe(res, 'saving the connection') };
  return { ok: true, remote };
}

async function deleteRemote(bin, configPath, name) {
  const res = await run(bin, ['config', 'delete', name || REMOTE_NAME, ...cfgArgs(configPath)], { timeout: 20000 });
  return { ok: res.ok, error: res.ok ? null : describe(res, 'removing the connection') };
}

// Cheap reachability check, so a broken connection is visible at setup rather than
// at 11pm inside a scheduled run.
async function checkRemote(bin, configPath, remotePath) {
  const res = await run(bin, ['lsjson', '--max-depth', '1', remotePath, ...cfgArgs(configPath)], { timeout: 60000 });
  if (res.ok) return { ok: true, exists: true };
  // A path that does not exist yet is fine - the first sync creates it. Anything
  // else is a real problem worth reporting now.
  if (/directory not found|couldn't find|not found/i.test(res.err)) return { ok: true, exists: false };
  return { ok: false, error: describe(res, 'checking the destination') };
}

// ── Proving the connection actually works ────────────────
// The OAuth flow is the one part of this engine that cannot be tested without a
// real cloud account, so the first person to connect one IS the test. Rather than
// trusting that a saved token means a working destination, this writes a small
// file, reads it back, compares the contents and deletes it. A connection that
// looks fine but cannot actually store anything then fails at setup, in front of
// someone who can do something about it, instead of at 11pm inside a scheduled run.
async function verifyRemote(bin, configPath, remotePath, opts) {
  const o = opts || {};
  const tmpDir = o.tmpDir || path.join(require('os').tmpdir(), 'lorekeeper-rclone-check');
  const name = 'lorekeeper-connection-test.txt';
  const body = 'Lorekeeper connection test ' + new Date().toISOString() + '\n' +
               'Safe to delete. Written to confirm this destination accepts files.\n';
  const local = path.join(tmpDir, name);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(local, body, 'utf-8');
  } catch (e) {
    return { ok: false, error: 'Could not create a temporary file to test with: ' + e.message };
  }

  const up = await run(bin, ['copyto', local, remotePath + '/' + name, ...cfgArgs(configPath)], { timeout: 120000 });
  if (!up.ok) return { ok: false, error: 'Could not write a test file to the destination. ' + describe(up, 'the test upload') };

  const backDir = path.join(tmpDir, 'back');
  try { fs.mkdirSync(backDir, { recursive: true }); } catch (e) {}
  const down = await run(bin, ['copyto', remotePath + '/' + name, path.join(backDir, name), ...cfgArgs(configPath)], { timeout: 120000 });

  let matched = false;
  try { matched = fs.readFileSync(path.join(backDir, name), 'utf-8') === body; } catch (e) { matched = false; }

  // Tidy up regardless, so a failed check does not leave litter in someone's Drive.
  await run(bin, ['deletefile', remotePath + '/' + name, ...cfgArgs(configPath)], { timeout: 60000 });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  if (!down.ok) return { ok: false, error: 'The test file uploaded but could not be read back. ' + describe(down, 'the test download') };
  if (!matched) return { ok: false, error: 'The test file came back different from what was sent, so this destination cannot be trusted with a backup.' };
  return { ok: true };
}

// ── The sync ─────────────────────────────────────────────
// Two stages. First the same gather-and-mirror used by the plain folder
// destination, into a staging directory - which is where the file selection and
// the image exclusion already live, tested, in one place. Then rclone uploads that
// staging directory. Duplicating the selection rules in rclone's filter syntax was
// the alternative, and every piece of logic this project has kept in two places has
// drifted within a few sessions.
//
// Staging costs a second copy on disk, but only changed files are rewritten, so
// after the first run it is a few kilobytes rather than the whole corpus.
async function syncToRemote(opts) {
  const { bin, configPath, dataDir, stageDir, remote, basePath } = opts;
  const progress = opts.onProgress || function () {};
  const remoteName = remote || REMOTE_NAME;
  const base = (basePath || 'Lorekeeper').replace(/^\/+|\/+$/g, '');

  progress('Collecting files…');
  const staged = gh.mirrorToFolder(dataDir, stageDir);
  if (!staged.success) return { success: false, error: staged.error };

  let uploaded = 0;
  const target = (sub) => remoteName + ':' + base + (sub ? '/' + sub : '');

  // One sync per owned folder. This is the ownership rule: rclone deletes whatever
  // is not in the source, so it is only ever pointed at a folder Lorekeeper owns.
  for (const folder of gh.MIRROR_FOLDERS) {
    const local = path.join(stageDir, folder);
    if (!fs.existsSync(local)) continue;
    progress('Uploading ' + folder + '…');
    const res = await run(bin, ['sync', local, target(folder), '--stats-one-line', ...cfgArgs(configPath)],
      { timeout: 1800000, onLine: opts.onLine });
    if (!res.ok) return { success: false, error: 'Upload failed on ' + folder + '. ' + describe(res, 'the upload') };
    uploaded++;
  }

  // The loose files are COPIED, never synced. A sync of the base folder would
  // delete everything beside them that Lorekeeper did not put there.
  for (const name of gh.MIRROR_FILES) {
    const local = path.join(stageDir, name);
    if (!fs.existsSync(local)) continue;
    progress('Uploading ' + name + '…');
    const res = await run(bin, ['copy', local, target(''), '--stats-one-line', ...cfgArgs(configPath)],
      { timeout: 1800000, onLine: opts.onLine });
    if (!res.ok) return { success: false, error: 'Upload failed on ' + name + '. ' + describe(res, 'the upload') };
    uploaded++;
  }

  return {
    success: true,
    noop: staged.noop,
    counts: staged.counts,
    skipped: staged.skipped,
    destination: target('')
  };
}

// Turns an rclone failure into something a person can act on.
function describe(res, what) {
  const text = (res.err || res.out || '').trim();
  if (res.code === -1 && /ENOENT/i.test(text)) {
    return 'rclone could not be found. It ships with Lorekeeper, so this usually means the install is incomplete.';
  }
  if (/oauth|token|unauthoriz|401/i.test(text)) {
    return 'The cloud account rejected the saved sign-in. Reconnect it in Settings, Backup.';
  }
  if (/quota|storage.*full|insufficient/i.test(text)) {
    return 'The cloud account is out of space, so nothing was uploaded.';
  }
  if (/no such host|dial tcp|network is unreachable|timeout/i.test(text)) {
    return 'Could not reach the cloud service. Check the internet connection and try again.';
  }
  // rclone writes NOTICE and DEBUG lines to stderr alongside real errors, and a
  // "config file not found - using defaults" NOTICE is routine on a first run.
  // Taking the last line blindly quoted that noise back at the user instead of the
  // actual failure, so prefer a line that is actually an error.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const real = lines.filter(l => /ERROR|Failed|error:/i.test(l) && !/^\S+\s+\S+\s+NOTICE/.test(l));
  const pick = (real.length ? real : lines.filter(l => !/NOTICE|DEBUG/.test(l)));
  const first = (pick.length ? pick[pick.length - 1] : lines[lines.length - 1]) || ('exit code ' + res.code);
  // Strip rclone's leading timestamp, which is noise in a UI message.
  return 'rclone failed during ' + what + ': ' + first.replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+/, '');
}

module.exports = {
  BACKENDS, REMOTE_NAME,
  resolveRclone, run, listRemotes,
  extractToken, authorize, createRemote, deleteRemote, checkRemote,
  syncToRemote, verifyRemote, describe,
  TOKEN_START, TOKEN_END
};
