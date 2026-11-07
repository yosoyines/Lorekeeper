#!/usr/bin/env node
// compile-check.js — run before every handoff.
//
//   node compile-check.js src/index.html
//
// Extracts every inline <script> from the SHIPPED file and compiles each one with the
// pinned Babel standalone, reporting SOURCE and COMPILED size for both.
//
// WHY THIS EXISTS. Babel standalone deoptimises past roughly 500 KB per block, and the
// symptom is not an error — click handlers silently stop working app-wide. The limit is
// on what the generator EMITS, and JSX inflates by about 30% on the way through, so a
// block at 300 KB of source is already near 390 KB out. Reading source sizes against the
// ceiling gives false comfort by about a third. Hence both numbers, every time.
//
// It also catches the bracket and parse errors that would otherwise show up as a black
// screen with nothing useful in the console, and it reports the file line so the error
// can be found without counting script tags by hand.
//
// REQUIREMENT, and it is deliberately not in package.json dependencies: the app loads
// Babel from a CDN at runtime and must keep doing so, so this is a dev-only tool.
//
//   npm install --no-save @babel/standalone@7.23.10
//
// The version must match the one pinned in index.html, or this checks something the app
// will never run.

const fs = require('fs');
const path = require('path');

const PINNED = '7.23.10';
const CEILING_KB = 500;
const SPLIT_AT_KB = 400;

let Babel;
try {
  Babel = require('@babel/standalone');
} catch (e) {
  console.error('@babel/standalone is not installed. It is a dev-only tool and is kept out');
  console.error('of package.json on purpose, because the app loads Babel from a CDN.\n');
  console.error('  npm install --no-save @babel/standalone@' + PINNED + '\n');
  process.exit(2);
}

const have = require('@babel/standalone/package.json').version;
if (have !== PINNED) {
  console.error('WARNING: @babel/standalone is ' + have + ', index.html pins ' + PINNED + '.');
  console.error('This checks something the app will never run. Install the pinned version.\n');
}

const file = process.argv[2] || path.join('src', 'index.html');
if (!fs.existsSync(file)) {
  console.error('No such file: ' + file);
  process.exit(2);
}
const html = fs.readFileSync(file, 'utf8');

const kb = (s) => Buffer.byteLength(s, 'utf8') / 1024;
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;

let m, i = 0, failed = 0, overSplit = 0;
const rows = [];

while ((m = re.exec(html)) !== null) {
  i++;
  const isBabel = /text\/babel/.test(m[1]);
  const code = m[2];
  const startLine = html.slice(0, m.index).split('\n').length;
  const srcKB = kb(code);
  try {
    const out = Babel.transform(code, {
      presets: isBabel ? ['react'] : [],
      filename: 'block' + i + (isBabel ? '.jsx' : '.js')
    }).code;
    rows.push({ i, isBabel, startLine, srcKB, outKB: kb(out), ok: true });
  } catch (err) {
    failed++;
    rows.push({ i, isBabel, startLine, srcKB, ok: false, err });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('', 6) + pad('block', 24) + pad('source', 12) + pad('compiled', 12) + 'of ceiling');
console.log('-'.repeat(68));

for (const r of rows) {
  const label = 'block ' + r.i + ' (' + (r.isBabel ? 'babel' : 'plain JS') + ')';
  if (!r.ok) {
    console.log(pad('FAIL', 6) + pad(label, 24) + pad(r.srcKB.toFixed(1) + ' KB', 12) + '— did not compile');
    const first = String(r.err.message).split('\n')[0];
    console.log('    ' + first);
    if (r.err.loc) {
      console.log('    at block line ' + r.err.loc.line + ', column ' + r.err.loc.column +
                  '  ->  ' + file + ' line ~' + (r.startLine + r.err.loc.line - 1));
    }
    continue;
  }
  const pct = (r.outKB / CEILING_KB) * 100;
  let flag = '';
  if (r.isBabel && r.outKB > SPLIT_AT_KB) { flag = '  <== OVER ' + SPLIT_AT_KB + ' KB, SPLIT THIS BLOCK'; overSplit++; }
  else if (r.isBabel && pct > 70) { flag = '  <-- watch'; }
  console.log(pad('OK', 6) + pad(label, 24) + pad(r.srcKB.toFixed(1) + ' KB', 12) +
              pad(r.outKB.toFixed(1) + ' KB', 12) + pct.toFixed(0) + '%' + flag);
}

console.log('');

// The render call has to be in the LAST block, or nothing mounts.
const lastBabel = html.lastIndexOf('<script type="text/babel">');
const render = html.lastIndexOf('ReactDOM.createRoot');
if (render === -1) {
  console.log('WARNING: no ReactDOM.createRoot call found at all.');
  failed++;
} else if (render < lastBabel) {
  console.log('FAIL: ReactDOM.createRoot is not in the last babel block — nothing will mount.');
  failed++;
}

// A name declared at top level in two blocks throws on load and blanks the app.
const seen = new Map();
let dupes = 0;
let b, bi = 0;
const bre = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
while ((b = bre.exec(html)) !== null) {
  bi++;
  const names = b[2].match(/^(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/gm) || [];
  for (const raw of names) {
    const n = raw.split(/\s+/)[1];
    if (seen.has(n)) {
      console.log('FAIL: "' + n + '" is declared at top level in block ' + seen.get(n) + ' and block ' + bi + '.');
      dupes++;
    } else {
      seen.set(n, bi);
    }
  }
}
if (dupes) failed += dupes;

if (failed) console.log('\n' + failed + ' problem(s). Do not ship this.');
else if (overSplit) console.log(overSplit + ' block(s) over ' + SPLIT_AT_KB + ' KB compiled — split before adding to them.');
else console.log('All ' + rows.length + ' blocks compiled, ' + seen.size + ' top-level declarations, no duplicates.');

process.exit(failed ? 1 : 0);
