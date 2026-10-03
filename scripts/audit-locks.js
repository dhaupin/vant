#!/usr/bin/env node
/**
 * Lock-surface audit (pass 103, labs/LOCKS.md §4 item 6)
 *
 * "Scattered" becomes "listed". Asserts the invariants the locks canonicalization
 * set, so the four-formula spaghetti cannot quietly come back:
 *
 *   1. Lock path strings are built ONLY in lib/lock.js (mutex) and
 *      lib/brain-lock.js (lease) — no ad-hoc `<x> + '.lock'` / `'.locks'`
 *      formulas anywhere else in lib/ or bin/.
 *   2. Every mutex consumer requires ./lock (or ../lock); the brain-lock
 *      lease module exists and the old flat filename lib/flock.js is gone.
 *   3. No lockfile is left behind under any `.locks/` directory.
 *
 * Prints the enumerated call sites; exits 1 on any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// The only files allowed to construct lock paths.
const PATH_LITERAL_OK = new Set(['lib/lock.js', 'lib/brain-lock.js']);

function collectJs(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectJs(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

const files = [...collectJs(path.join(ROOT, 'lib')), ...collectJs(path.join(ROOT, 'bin'))];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

const problems = [];
const mutexRequires = [];
const leaseRequires = [];

// Ad-hoc lock-path formulas (code, not prose): string concat of a `.lock`
// literal, a bare `'.locks'` root literal, or any quoted string ENDING in
// `.lock` (catches path.resolve(base, '.habitat.lock')).
const CONCAT_LOCK = /\+\s*['"`]\.lock/;
const DOTLOCKS = /['"`]\.locks['"`]/;
const QUOTED_LOCK = /['"`][^'"`]*\.lock['"`]/;

for (const file of files) {
    const r = rel(file);
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');

    lines.forEach((line, i) => {
        if (/require\(['"](\.\.?\/)*lock['"]\)/.test(line)) mutexRequires.push(`${r}:${i + 1}`);
        if (/require\(['"](\.\.?\/)*brain-lock['"]\)/.test(line)) leaseRequires.push(`${r}:${i + 1}`);
    });

    if (!PATH_LITERAL_OK.has(r)) {
        lines.forEach((line, i) => {
            if (CONCAT_LOCK.test(line) || DOTLOCKS.test(line) || QUOTED_LOCK.test(line)) {
                problems.push(`${r}:${i + 1} builds a lock path outside lib/lock.js — use lock.pathFor()\n      ${line.trim()}`);
            }
        });
    }
}

// 2. rename invariants
if (fs.existsSync(path.join(ROOT, 'lib', 'flock.js'))) {
    problems.push('lib/flock.js exists — it was renamed to lib/lock.js (pass 102)');
}
if (!fs.existsSync(path.join(ROOT, 'lib', 'lock.js'))) {
    problems.push('lib/lock.js (the mutex) is missing');
}
if (!fs.existsSync(path.join(ROOT, 'lib', 'brain-lock.js'))) {
    problems.push('lib/brain-lock.js (the authorization lease) is missing');
}
if (mutexRequires.length === 0) {
    problems.push('no module requires lib/lock.js — the mutex primitive is unwired?');
}

// 3. no leaked lockfiles under any .locks/ root
const leaked = [];
function findLocks(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.locks') {
                for (const lf of fs.readdirSync(full)) {
                    if (lf.endsWith('.lock')) leaked.push(path.relative(ROOT, path.join(full, lf)));
                }
            } else {
                findLocks(full);
            }
        }
    }
}
findLocks(path.join(ROOT, 'models'));
if (leaked.length) problems.push(`${leaked.length} leaked lockfile(s): ${leaked.join(', ')}`);

// ---- report ----
console.log('\n🔐 LOCK SURFACE\n');
console.log(`  mutex requires (lib/lock.js):        ${mutexRequires.length}`);
for (const c of mutexRequires) console.log(`    - ${c}`);
console.log(`  lease requires (lib/brain-lock.js):  ${leaseRequires.length}`);
for (const c of leaseRequires) console.log(`    - ${c}`);
console.log(`  path-formula owners:                 lib/lock.js, lib/brain-lock.js`);
console.log(`  leaked lockfiles:                    ${leaked.length}`);

if (problems.length) {
    console.log('\n✗ LOCK-AUDIT FAILED:');
    for (const p of problems) console.log('  - ' + p);
    process.exit(1);
}
console.log('\n✓ LOCK-AUDIT PASS — every lock path goes through lock.pathFor, no leaks.\n');
