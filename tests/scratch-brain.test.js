#!/usr/bin/env node
'use strict';

/**
 * Per-suite scratch-brain lifecycle pins (pass 378).
 *
 * The harness-level sweep janitor (tests/slate.js + tests/harness-autoreap.js)
 * only reaps what appeared during ONE sweep — a suite run directly, or a
 * fixed-name mint (qc-*, p9x-*, gstest) that predates the sweep, survived
 * forever. tests/scratch-brain.js is the suite's own duty: mint → point
 * VANT_BRAIN → reap on process exit.
 *
 * Pinned here:
 *   1. scratchBrain sets VANT_BRAIN and returns the declared name.
 *   2. Real brains (vant, axolotl) are refused — never delete the operator.
 *   3. Hostile names (separators, dot-dirs, spaces, proto games) are refused.
 *   4. reapScratchBrain removes BOTH sides, is idempotent, and leaves a
 *      sibling brain it never minted alone.
 *   5. A child process that mints scratch and exits leaves no dir behind
 *      (the direct-run path the sweep never sees).
 *
 * Run: node tests/scratch-brain.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { scratchBrain, reapScratchBrain } = require('./scratch-brain');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + (e && e.message || e)); }
}

const SCRATCH = 'sb-pin-' + Date.now().toString(36);
const KEEPER = SCRATCH + '-keeper';

function dir(side, name) { return path.join(ROOT, 'models', side, name); }
function mk(side, name) {
    fs.mkdirSync(dir(side, name), { recursive: true });
    fs.writeFileSync(path.join(dir(side, name), '.guests.json'), '{}');
}
function gone(side, name) { return !fs.existsSync(dir(side, name)); }

console.log('\n▓ SCRATCH-BRAIN LIFECYCLE PINS (per-suite mint → reap)\n');

test('scratchBrain points VANT_BRAIN at the declared name', () => {
    const prev = process.env.VANT_BRAIN;
    try {
        const name = scratchBrain(SCRATCH);
        assert.strictEqual(name, SCRATCH);
        assert.strictEqual(process.env.VANT_BRAIN, SCRATCH);
    } finally {
        if (prev === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prev;
    }
});

test('real brains are refused (never reap the operator)', () => {
    for (const real of ['vant', 'axolotl']) {
        assert.throws(() => scratchBrain(real), /real brain/);
        // reap is deliberately total (safe on the exit path): it refuses by
        // doing nothing, not by throwing.
        assert.deepStrictEqual(reapScratchBrain(real), []);
    }
});

test('hostile names are refused, never guessed into deletion', () => {
    const hostile = ['../escape', 'a/b', '.hidden', '..', '.', 'with space', 'x'.repeat(300)];
    for (const name of hostile) {
        assert.throws(() => scratchBrain(name), /scratch-brain/);
        assert.deepStrictEqual(reapScratchBrain(name), []);
    }
});

test('reap removes both sides, is idempotent, and spares the keeper', () => {
    mk('private', SCRATCH);
    mk('public', SCRATCH);
    mk('private', KEEPER);
    try {
        const removed = reapScratchBrain(SCRATCH);
        assert.deepStrictEqual(removed.sort(), ['private/' + SCRATCH, 'public/' + SCRATCH]);
        assert.ok(gone('private', SCRATCH) && gone('public', SCRATCH), 'a mint survived the reap');
        assert.ok(fs.existsSync(dir('private', KEEPER)), 'the reap touched a brain it never minted');
        assert.deepStrictEqual(reapScratchBrain(SCRATCH), [], 'second reap was not a no-op');
    } finally {
        fs.rmSync(dir('private', KEEPER), { recursive: true, force: true });
    }
});

test('a child process that mints scratch leaves no dir after exit', () => {
    const name = SCRATCH + '-child';
    const script = `
        const fs = require('fs'), path = require('path');
        const root = ${JSON.stringify(ROOT)};
        const name = ${JSON.stringify(name)};
        require(${JSON.stringify(path.join(__dirname, 'scratch-brain'))}).scratchBrain(name);
        for (const side of ['private', 'public']) {
            const d = path.join(root, 'models', side, name);
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, '.guests.json'), '{}');
        }
    `;
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
    assert.strictEqual(r.status, 0, 'child failed: ' + (r.stderr || '').slice(0, 300));
    assert.ok(gone('private', name) && gone('public', name), 'child exit did not reap its mint');
});

console.log(`\n=== scratch-brain: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
