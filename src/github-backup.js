// github-backup.js — Lorekeeper backup over the GitHub REST API.
//
// WHY THIS EXISTS
// The original backup route was a batch script: it needed git installed, a repo
// cloned by hand, a credential saved in Windows Credential Manager, and the
// script itself dropped into the backup folder. Four manual steps, none of which
// a stranger installing the app is going to do. This module replaces all of it
// with one pasted token.
//
// Deliberately free of any electron import, so it can be required and exercised
// outside the app — which is how every other piece of sync logic in this project
// got verified before it was trusted.
//
// WHAT A SYNC DOES
//   1. Read the remote tree for the branch (one call, whole repo).
//   2. Hash every local file with git's own blob hash and compare.
//   3. Upload only the files whose hash differs.
//   4. Write one tree, one commit, one ref update.
// A sync with nothing changed therefore costs two calls and uploads nothing.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// The same set the batch script mirrored. Text only — images are excluded at
// gather time rather than relying on a .gitignore, so an image physically cannot
// enter the repo even if the ignore file is missing.
// Timelines added session 43. A folder that is written but not listed here is backed
// up by nothing and nothing says so - the omission is silent, which is why this list
// and the startup folder list in main.js have to be changed together.
const MIRROR_FOLDERS = ['Notes', 'Templates', 'Companions', 'Lorebooks', 'Collections', 'Worlds', 'Personas', 'Timelines'];
const MIRROR_FILES = ['lorekeeper-data.pretty.json'];
const SKIP_EXT = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff',
  'mp4', 'webm', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'ogg', 'flac',
  'zip', 'rar', '7z', 'exe', 'dll', 'bundle'
]);

// A single file larger than this is skipped and reported rather than uploaded.
// The API takes a blob as base64 inside a JSON body, so the wire cost is about
// 4/3 of the file. 40 MB of file is already a ~54 MB request.
const MAX_FILE_BYTES = 40 * 1024 * 1024;

const USER_AGENT = 'Lorekeeper-Backup';

// ── git's own hash ───────────────────────────────────────
// Git names a blob by sha1("blob <bytelength>\0" + contents). Computing it here
// means the remote tree listing alone tells us which files changed — no second
// round trip, no downloading anything to compare against.
function gitBlobSha(buf) {
  const h = crypto.createHash('sha1');
  h.update('blob ' + buf.length + '\0', 'utf-8');
  h.update(buf);
  return h.digest('hex');
}

// ── Repo identity ────────────────────────────────────────
// Accepts whatever someone is likely to paste: a browser URL, a clone URL, or
// just owner/repo. Anything else is refused rather than guessed at.
function parseRepo(input) {
  if (!input) return null;
  let s = String(input).trim();
  s = s.replace(/^git\+/, '');
  s = s.replace(/\.git$/, '');
  s = s.replace(/\/+$/, '');
  // git@github.com:owner/repo
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  // https://github.com/owner/repo (with or without extra path segments)
  const url = s.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)/i);
  if (url) return { owner: url[1], repo: url[2] };
  // owner/repo
  const plain = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (plain) return { owner: plain[1], repo: plain[2] };
  return null;
}

// ── HTTP ─────────────────────────────────────────────────
// Uses the https module rather than fetch so the module does not depend on
// which Node version a given Electron build ships.
function apiRequest(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (body !== undefined && body !== null) {
      payload = Buffer.from(JSON.stringify(body), 'utf-8');
    }
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      'Authorization': 'Bearer ' + token
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: method,
      headers: headers,
      timeout: 120000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        resolve({ status: res.statusCode, json: json, text: text, headers: res.headers });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('The request to GitHub timed out.')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Turns an API failure into something a person can act on. A backup that fails
// uninformatively is barely better than one that fails silently, which is the
// whole lesson of Stage 2.
function describeFailure(res, what) {
  const msg = (res.json && res.json.message) || res.text || '';
  if (res.status === 401) {
    return 'GitHub rejected the token. It may have been revoked, or it may have expired — fine-grained tokens expire on a date you chose when you created it.';
  }
  if (res.status === 403 && /rate limit/i.test(msg)) {
    return 'GitHub is rate limiting this token. Wait an hour and try again.';
  }
  if (res.status === 403) {
    return 'GitHub refused: ' + (msg || 'forbidden') + '. The token most likely does not have Contents write access to this repository.';
  }
  if (res.status === 404) {
    return 'Repository not found, or this token cannot see it. A fine-grained token only reaches repositories it was explicitly given.';
  }
  if (res.status === 422) {
    return 'GitHub rejected the data: ' + (msg || 'unprocessable') + '.';
  }
  return 'GitHub returned ' + res.status + ' for ' + what + (msg ? ': ' + msg : '') + '.';
}

// ── Account and repository ───────────────────────────────
async function getUser(token) {
  const res = await apiRequest(token, 'GET', '/user');
  if (res.status !== 200) return { ok: false, error: describeFailure(res, 'the account check') };
  // Fine-grained tokens carry their own expiry date on every response. Without
  // reading it the first anyone knows about an expired token is a backup that
  // has already stopped, which is the failure mode Stage 2 existed to end.
  const exp = res.headers['github-authentication-token-expiration'] || null;
  return { ok: true, login: res.json.login, name: res.json.name, expiry: exp };
}

// Lists what the token can reach. With a token scoped to one repository this
// returns exactly that one — which is the point: the user picks from a list
// instead of typing a name correctly.
async function listRepos(token) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const res = await apiRequest(token, 'GET', '/user/repos?per_page=100&sort=updated&page=' + page);
    if (res.status !== 200) return { ok: false, error: describeFailure(res, 'the repository list') };
    const batch = Array.isArray(res.json) ? res.json : [];
    for (const r of batch) {
      out.push({
        fullName: r.full_name,
        owner: r.owner && r.owner.login,
        name: r.name,
        private: !!r.private,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at
      });
    }
    if (batch.length < 100) break;
  }
  return { ok: true, repos: out };
}

async function getRepo(token, owner, repo) {
  const res = await apiRequest(token, 'GET', '/repos/' + owner + '/' + repo);
  if (res.status !== 200) return { ok: false, error: describeFailure(res, 'the repository check') };
  return {
    ok: true,
    fullName: res.json.full_name,
    private: !!res.json.private,
    defaultBranch: res.json.default_branch,
    permissions: res.json.permissions || {}
  };
}

// ── Gathering local files ────────────────────────────────
function walk(dir, relBase, out, skipped) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    const rel = relBase ? relBase + '/' + entry.name : entry.name;
    if (entry.isDirectory()) { walk(full, rel, out, skipped); continue; }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (SKIP_EXT.has(ext)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch (e) { continue; }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({ path: rel, size: stat.size });
      continue;
    }
    out.push({ path: rel, full: full, size: stat.size });
  }
}

// Returns the exact set of files a sync is responsible for, with each file's
// git hash already computed.
function gatherFiles(dataDir) {
  const files = [];
  const skipped = [];
  for (const folder of MIRROR_FOLDERS) {
    const dir = path.join(dataDir, folder);
    if (fs.existsSync(dir)) walk(dir, folder, files, skipped);
  }
  for (const name of MIRROR_FILES) {
    const full = path.join(dataDir, name);
    if (!fs.existsSync(full)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch (e) { continue; }
    if (stat.size > MAX_FILE_BYTES) { skipped.push({ path: name, size: stat.size }); continue; }
    files.push({ path: name, full: full, size: stat.size });
  }
  for (const f of files) {
    f.buf = fs.readFileSync(f.full);
    f.sha = gitBlobSha(f.buf);
  }
  return { files, skipped };
}

// True for a remote path this app is responsible for. Anything outside this —
// a README, a .gitignore, the old sync scripts, the ComfyUI and LM Studio
// folders the batch file still mirrors — is left strictly alone. The engine
// never deletes something it did not put there.
function inScope(p) {
  if (MIRROR_FILES.indexOf(p) !== -1) return true;
  for (const folder of MIRROR_FOLDERS) {
    if (p === folder || p.indexOf(folder + '/') === 0) return true;
  }
  return false;
}

// ── The sync ─────────────────────────────────────────────
//
// opts: { token, owner, repo, branch, dataDir, lastCommit, onProgress }
//
// lastCommit is the commit this machine pushed last time. If the remote head is
// something else, somebody or something else has committed since — so deletions
// are held back for that run and only uploads go through. That is the lighter
// descendant of the batch script's pull guard: the script had to abort outright
// because robocopy would have deleted the pulled commits off the disk first.
// Here nothing local is at risk, so refusing to delete is enough.
async function syncRepo(opts) {
  const token = opts.token;
  const owner = opts.owner;
  const repo = opts.repo;
  const dataDir = opts.dataDir;
  const progress = opts.onProgress || function () {};
  const base = '/repos/' + owner + '/' + repo;

  // 1. Repository, and which branch to write to.
  const info = await getRepo(token, owner, repo);
  if (!info.ok) return { success: false, error: info.error };
  const branch = opts.branch || info.defaultBranch || 'main';

  // 2. Current head. A repository with no commits yet answers 409 here, which
  //    is a legitimate starting state, not a failure.
  progress('Reading the remote branch…');
  let headSha = null;
  let baseTreeSha = null;
  let emptyRepo = false;

  const refRes = await apiRequest(token, 'GET', base + '/git/ref/heads/' + encodeURIComponent(branch));
  if (refRes.status === 200) {
    headSha = refRes.json.object.sha;
  } else if (refRes.status === 409 || refRes.status === 404) {
    emptyRepo = true;
  } else {
    return { success: false, error: describeFailure(refRes, 'the branch lookup') };
  }

  // 3. The remote tree, in one recursive call.
  const remote = new Map();
  let truncated = false;
  if (!emptyRepo) {
    const commitRes = await apiRequest(token, 'GET', base + '/git/commits/' + headSha);
    if (commitRes.status !== 200) return { success: false, error: describeFailure(commitRes, 'the head commit') };
    baseTreeSha = commitRes.json.tree.sha;

    const treeRes = await apiRequest(token, 'GET', base + '/git/trees/' + baseTreeSha + '?recursive=1');
    if (treeRes.status !== 200) return { success: false, error: describeFailure(treeRes, 'the file listing') };
    truncated = !!treeRes.json.truncated;
    for (const node of (treeRes.json.tree || [])) {
      if (node.type === 'blob') remote.set(node.path, node.sha);
    }
  }

  // GitHub truncates a tree listing past roughly 100,000 entries. Comparing
  // against a partial listing would re-upload files that are already fine and,
  // worse, read a present file as missing. Refuse rather than act on it.
  if (truncated) {
    return { success: false, error: 'The repository is too large for GitHub to list in one response, so this sync cannot tell which files changed. Nothing was uploaded.' };
  }

  // 4. Compare.
  progress('Checking which files changed…');
  const gathered = gatherFiles(dataDir);
  const local = gathered.files;
  if (!local.length) {
    return { success: false, error: 'There is nothing to back up — no data files were found. Check that the data folder is where you expect.' };
  }

  const changed = local.filter(f => remote.get(f.path) !== f.sha);

  const localPaths = new Set(local.map(f => f.path));
  const remoteAhead = !emptyRepo && opts.lastCommit && opts.lastCommit !== headSha;
  let deleted = [];
  if (!remoteAhead) {
    for (const p of remote.keys()) {
      if (inScope(p) && !localPaths.has(p)) deleted.push(p);
    }
  }

  if (!changed.length && !deleted.length) {
    return {
      success: true,
      noop: true,
      commit: headSha,
      branch: branch,
      counts: { uploaded: 0, deleted: 0, total: local.length },
      skipped: gathered.skipped,
      remoteAhead: remoteAhead
    };
  }

  // 5. Upload the changed blobs. Sequential on purpose — a parallel burst on a
  //    first sync is the fastest way to hit secondary rate limiting, and the
  //    whole point of the hash comparison is that later syncs upload very little.
  let done = 0;
  for (const f of changed) {
    done++;
    progress('Uploading ' + done + ' of ' + changed.length + ': ' + f.path);
    const res = await apiRequest(token, 'POST', base + '/git/blobs', {
      content: f.buf.toString('base64'),
      encoding: 'base64'
    });
    if (res.status !== 201) {
      return { success: false, error: 'Upload failed on ' + f.path + '. ' + describeFailure(res, 'a file upload') };
    }
    f.uploadedSha = res.json.sha;
  }

  // 6. One tree holding only the differences, laid over the existing one.
  progress('Writing the commit…');
  const treeEntries = [];
  for (const f of changed) {
    treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: f.uploadedSha });
  }
  for (const p of deleted) {
    treeEntries.push({ path: p, mode: '100644', type: 'blob', sha: null });
  }

  const treeBody = { tree: treeEntries };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const newTree = await apiRequest(token, 'POST', base + '/git/trees', treeBody);
  if (newTree.status !== 201) return { success: false, error: describeFailure(newTree, 'the tree write') };

  // Local time, not UTC. toISOString() stamps UTC, which put the commit three
  // hours ahead of the clock on the machine that made it and disagreed with the
  // panel's own "last backup" line right beside it. It also broke the ordering
  // against the older auto-sync commits, which the batch script stamped local
  // via PowerShell. Built by hand rather than with toLocaleString so the format
  // is fixed regardless of the machine's locale.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
                ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  const commitBody = {
    message: 'Lorekeeper backup ' + stamp,
    tree: newTree.json.sha,
    parents: headSha ? [headSha] : []
  };
  const newCommit = await apiRequest(token, 'POST', base + '/git/commits', commitBody);
  if (newCommit.status !== 201) return { success: false, error: describeFailure(newCommit, 'the commit') };

  // 7. Move the branch. On an empty repository the ref does not exist yet, so it
  //    is created rather than patched.
  let refOut;
  if (emptyRepo) {
    refOut = await apiRequest(token, 'POST', base + '/git/refs', {
      ref: 'refs/heads/' + branch,
      sha: newCommit.json.sha
    });
    if (refOut.status !== 201) return { success: false, error: describeFailure(refOut, 'creating the branch') };
  } else {
    // force stays false. If the remote moved while this sync was running, the
    // update is rejected rather than overwriting whatever arrived.
    refOut = await apiRequest(token, 'PATCH', base + '/git/refs/heads/' + encodeURIComponent(branch), {
      sha: newCommit.json.sha,
      force: false
    });
    if (refOut.status !== 200) {
      return { success: false, error: 'The commit was created but the branch could not be moved — the repository probably changed while this was running. Nothing was lost; run the sync again. ' + describeFailure(refOut, 'the branch update') };
    }
  }

  return {
    success: true,
    noop: false,
    commit: newCommit.json.sha,
    branch: branch,
    counts: { uploaded: changed.length, deleted: deleted.length, total: local.length },
    uploadedBytes: changed.reduce((n, f) => n + f.size, 0),
    skipped: gathered.skipped,
    remoteAhead: remoteAhead
  };
}

// ── Synced-folder destination ────────────────────────────
// The other half of retiring the script: a folder copy done in Node, using the
// same gathered file set and the same ownership rule. Only paths this app owns
// are removed, so a destination holding anything else keeps it.
function mirrorToFolder(dataDir, destDir) {
  if (!destDir) return { success: false, error: 'No folder set.' };
  // The drive itself, not the leaf. A virtual mount - Google Drive's G: - does
  // not exist until that program has started, and a logon-time run can beat it.
  // Without this check the copy silently creates a real local folder that no
  // client ever uploads, and the backup looks fine while going nowhere.
  const root = path.parse(destDir).root;
  if (root && !fs.existsSync(root)) {
    return { success: false, error: 'The drive ' + root + ' is not available. If this is a cloud folder, that program may not have started yet. Nothing was copied.' };
  }
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  } catch (e) {
    return { success: false, error: 'Could not create ' + destDir + ': ' + e.message };
  }

  const gathered = gatherFiles(dataDir);
  if (!gathered.files.length) {
    return { success: false, error: 'There is nothing to back up - no data files were found.' };
  }

  let written = 0, unchanged = 0;
  for (const f of gathered.files) {
    const target = path.join(destDir, f.path.replace(/\//g, path.sep));
    try {
      let same = false;
      if (fs.existsSync(target)) {
        const st = fs.statSync(target);
        // Size first: it rules out most files without reading them, which
        // matters when one of them is 33 MB.
        if (st.size === f.size) same = gitBlobSha(fs.readFileSync(target)) === f.sha;
      }
      if (same) { unchanged++; continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.buf);
      written++;
    } catch (e) {
      return { success: false, error: 'Failed writing ' + f.path + ': ' + e.message };
    }
  }

  // Remove only what we own and no longer have.
  const localPaths = new Set(gathered.files.map(f => f.path));
  let removed = 0;
  const sweep = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const r = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) { if (inScope(r)) sweep(full, r); continue; }
      if (!inScope(r) || localPaths.has(r)) continue;
      try { fs.unlinkSync(full); removed++; } catch (e) {}
    }
  };
  sweep(destDir, '');

  return {
    success: true,
    noop: written === 0 && removed === 0,
    counts: { uploaded: written, deleted: removed, total: gathered.files.length, unchanged: unchanged },
    skipped: gathered.skipped
  };
}

module.exports = {
  parseRepo,
  mirrorToFolder,
  gitBlobSha,
  getUser,
  listRepos,
  getRepo,
  gatherFiles,
  inScope,
  syncRepo,
  MIRROR_FOLDERS,
  MIRROR_FILES
};
