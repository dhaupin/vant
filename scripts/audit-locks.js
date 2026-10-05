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
 *   4. Separation of concern (pass 106, §8.3 / F8-F11): the mutex and the
 *      lease keep separate roots and modules; lib/recursion.js (a depth
 *      guard) requires neither; the whole-snapshot writers take the mutex.
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

// 2b. separation-of-concern contract (pass 106, labs/LOCKS.md §8.3 / F8-F11).
// The mutex and the lease keep SEPARATE roots and mechanisms ON PURPOSE; this
// asserts they are not folded together and that the non-locks stay non-locks.
const srcCache = {};
function source(relPath) {
    if (!(relPath in srcCache)) {
        const full = path.join(ROOT, relPath);
        srcCache[relPath] = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    }
    return srcCache[relPath];
}
function requires(text, mod) {
    return new RegExp(`require\\(['\"](\\.\\.?\\/)*${mod}['\"]\\)`).test(text);
}

const mutexSrc = source('lib/lock.js') || '';
const leaseSrc = source('lib/brain-lock.js') || '';

// F8 — two distinct roots, by design.
if (!/models\/private[\s\S]{0,40}\.locks/.test(mutexSrc)) {
    problems.push('lib/lock.js no longer builds the per-brain mutex root models/private/<brain>/.locks/');
}
if (!/LOCK_DIR = '\.locks'/.test(leaseSrc)) {
    problems.push("lib/brain-lock.js no longer defines LOCK_DIR = '.locks'");
}
if (!/getBrainPath\(\)[\s\S]{0,120}'\.\.'/.test(leaseSrc)) {
    problems.push('lib/brain-lock.js lease root is no longer one dir above the per-brain dirs (models/private/.locks/)');
}
if (requires(leaseSrc, 'lock')) {
    problems.push('lib/brain-lock.js requires lib/lock.js — the lease must NOT depend on the mutex (roots differ on purpose, PRD §8.3 F8)');
}
if (requires(mutexSrc, 'brain-lock')) {
    problems.push('lib/lock.js requires lib/brain-lock.js — the mutex must NOT depend on the lease (roots differ on purpose, PRD §8.3 F8)');
}

// F11 — explicitly NOT locks; must not pull in a lock module.
for (const f of ['lib/recursion.js']) {
    const s = source(f);
    if (s && (requires(s, 'lock') || requires(s, 'brain-lock'))) {
        problems.push(`${f} is classified as a NON-lock (PRD §8.3 F11) but now requires a lock module`);
    }
}

// F10/F7 — whole-snapshot writers must take the cross-process mutex THROUGH
// withLock (pass 109: the ONE acquire/release implementation, failMode
// 'closed'); their in-process save chains are write ordering, not the
// concurrency control.
for (const f of ['lib/state-store.js', 'lib/teams.js', 'lib/agents/internal.js', 'lib/habitat.js']) {
    const s = source(f);
    if (s && !requires(s, 'lock')) {
        problems.push(`${f} writes a whole snapshot but no longer requires lib/lock.js — a save chain is not a lock (PRD §8.3 F10)`);
    }
    // (pass 115) withLockSync counts: identical primitive, sync surface —
    // callers that must stay synchronous (teams create*/restoreState) read
    // the honest outcome directly instead of through the promise wrapper.
    if (s && !/withLock(?:Sync)?\(/.test(s)) {
        problems.push(`${f} writes a whole snapshot but no longer goes through lock.withLock — hand-rolled acquire/release is the F7 regression (PRD §8.6 S4)`);
    }
}

// F12 (pass 111, S5) — the five writers that adopted merge-under-lock
// guards in the unguarded-writer triage must KEEP them; hand-rolled
// acquire/release sneaking back is a regression (labs/LOCKS.md §8.5).
for (const f of ['lib/auth.js', 'lib/vaf.js', 'lib/config.js', 'lib/mcp.js', 'lib/citations.js']) {
    const s = source(f);    // (pass 116) withLockSync counts here too — sync bodies in sync
    // functions (auth/vaf) read the fail-closed outcome directly; the async
    // wrapper only HIDES it (the parity-sweep finding).
    if (s && !/withLock(?:Sync)?\(/.test(s)) {
        problems.push(`${f} adopted a withLock guard in S5 (§8.5 decision (a)) but no longer uses it — the merge-under-lock regressed`);
    }
}

// 3. no leaked lockfiles under any .locks/ or .locks-global/ root
const leaked = [];
function findLocks(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.locks' || entry.name === '.locks-global') {
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
console.log(`  mutex root:                          models/private/<brain>/.locks/  (per-brain)`);
console.log(`  global mutex root:                   models/.locks-global/            (repo-scoped resources, S5)`);
console.log(`  lease root:                          models/private/.locks/           (cross-brain, separate by design)`);
console.log(`  non-locks (must require neither):    lib/recursion.js`);
console.log(`  guarded whole-snapshot writers:      lib/state-store.js, lib/teams.js, lib/agents/internal.js, lib/habitat.js (withLock, F7)`);
console.log(`  guarded repo-scoped writers (S5):    lib/auth.js, lib/vaf.js, lib/config.js, lib/mcp.js, lib/citations.js`);
console.log(`  leaked lockfiles:                    ${leaked.length}`);

if (problems.length) {
    console.log('\n✗ LOCK-AUDIT FAILED:');
    for (const p of problems) console.log('  - ' + p);
    process.exit(1);
}
console.log('\n✓ LOCK-AUDIT PASS — every lock path goes through lock.pathFor, no leaks.\n');
