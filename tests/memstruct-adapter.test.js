#!/usr/bin/env node
/**
 * memstruct adapter pins (vant#354) — the vant brain <-> memstruct store bridge.
 *
 * memstruct (dhaupin/memstruct, format id `memstruct@1`) is the record grammar
 * vant's markdown store already implies. This suite pins the ADAPTER contract:
 *
 *   M1 export  — a vant brain exports a lint-clean memstruct@1 store; every
 *                record carries the four-field envelope (id/createdAt/
 *                updatedAt/deletedAt) as integers, body carried verbatim.
 *   M2 determinism — export is stable across runs (sorted by id).
 *   M3 round-trip — a body edited in the store imports back to the file.
 *   M4 tombstone — a record with deletedAt set is NOT written (a delete is
 *                not an erase).
 *   M5 traversal — an id that escapes the brain root REFUSES (typed), and a
 *                non-markdown id is skipped, never written.
 *   M6 lint parity — the adapter's lint agrees with the real memstruct CLI.
 *
 * DISCRIMINATING: every pin requires lib/adapters/memstruct.js; stashing it
 * (and the connectors/index.js registration) fails M1–M6, passes post-fix.
 *
 * Isolation: every pin runs against a tmp models root minted per test — the
 * real brain is never touched.
 *
 * Run: node tests/memstruct-adapter.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { MemstructAdapter } = require('../lib/adapters/memstruct');
const connectors = require('../lib/connectors');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  \u2713 ' + name); }
    catch (e) { failed++; console.log('  \u2717 ' + name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}

/** Mint an isolated models root with one scratch brain. */
function mintBrain(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-adapter-'));
    const brainDir = path.join(root, 'private', 'scratch');
    fs.mkdirSync(brainDir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
        const p = path.join(brainDir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body);
    }
    return root;
}

// M0 — registration: the adapter is exported from the connectors index (the
// same place langchain lives), so the call-site is symmetric.
test('M0 memstruct is registered as an adapter beside langchain', () => {
    assert.strictEqual(typeof connectors.memstruct, 'function', 'connectors.memstruct missing');
    const a = connectors.memstruct({ root: mintBrain({ 'identity.md': '# i' }) });
    assert.strictEqual(a.type, 'memstruct');
    assert.strictEqual(typeof a.exportStore, 'function');
    assert.strictEqual(typeof a.importStore, 'function');
});

// M1 — export shape: envelope integers + verbatim body.
test('M1 export yields a memstruct@1 store with a full integer envelope', () => {
    const root = mintBrain({ 'identity.md': '# identity\nI am vant.', 'nested/goals.md': '# goals\nShip.' });
    try {
        const store = new MemstructAdapter({ root }).exportStore();
        assert.strictEqual(store.memstruct, 1, 'store.memstruct must be 1');
        assert.strictEqual(store.records.length, 2, 'expected 2 records');
        const byId = Object.fromEntries(store.records.map((r) => [r.id, r]));
        const id = byId['private/scratch/identity.md'];
        assert.ok(id, 'identity record missing: ' + Object.keys(byId));
        assert.ok(Number.isInteger(id.createdAt), 'createdAt must be an integer');
        assert.ok(Number.isInteger(id.updatedAt), 'updatedAt must be an integer');
        assert.strictEqual(id.deletedAt, null, 'deletedAt must be null on a live record');
        assert.strictEqual(id.scope, 'private', 'scope must be the brain side');
        assert.strictEqual(id.kind, 'identity', 'kind must be the basename');
        assert.strictEqual(id.body, '# identity\nI am vant.', 'body must be carried verbatim');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M2 — determinism: same tree, same store, sorted by id.
test('M2 export is deterministic (sorted by id across runs)', () => {
    const root = mintBrain({ 'z.md': 'z', 'a.md': 'a', 'm/n.md': 'n' });
    try {
        const a = new MemstructAdapter({ root }).exportStore();
        const b = new MemstructAdapter({ root }).exportStore();
        assert.deepStrictEqual(a.records.map((r) => r.id), b.records.map((r) => r.id), 'id order must be stable');
        const ids = a.records.map((r) => r.id);
        assert.deepStrictEqual(ids, [...ids].sort(), 'records must be sorted by id');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M3 — round-trip: an edited body imports back to the file on disk.
test('M3 importStore writes an edited body back to the file', () => {
    const root = mintBrain({ 'goals.md': '# goals\nShip it.' });
    try {
        const a = new MemstructAdapter({ root });
        const store = a.exportStore();
        const rec = store.records.find((r) => r.id === 'private/scratch/goals.md');
        rec.body = '# goals\nShip it FASTER.';
        const res = a.importStore(store);
        assert.strictEqual(res.written, 1, 'one record written');
        const onDisk = fs.readFileSync(path.join(root, 'private', 'scratch', 'goals.md'), 'utf8');
        assert.strictEqual(onDisk, '# goals\nShip it FASTER.', 'file must carry the imported body');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M4 — tombstone: a deleted record is not written (a delete is not an erase).
test('M4 a record with deletedAt set is skipped, not written', () => {
    const root = mintBrain({ 'keep.md': 'keep' });
    try {
        const a = new MemstructAdapter({ root });
        const res = a.importStore({
            memstruct: 1,
            records: [
                { id: 'private/scratch/ghost.md', createdAt: 1, deletedAt: 1700000000000, body: 'do not write' }
            ]
        });
        assert.strictEqual(res.written, 0, 'a tombstoned record must not be written');
        assert.strictEqual(res.skipped, 1, 'it must count as skipped');
        assert.ok(!fs.existsSync(path.join(root, 'private', 'scratch', 'ghost.md')), 'ghost.md must not exist');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M5 — traversal refusal + non-markdown skip.
test('M5 an id escaping the brain root refuses (typed); a non-markdown id is skipped', () => {
    const root = mintBrain({ 'keep.md': 'keep' });
    try {
        const a = new MemstructAdapter({ root });
        let err = null;
        try { a.importStore({ memstruct: 1, records: [{ id: '../../etc/evil.md', createdAt: 1, body: 'x' }] }); }
        catch (e) { err = e; }
        assert.ok(err, 'a traversal id must refuse');
        assert.match(err.message, /escapes the brain root/, 'refusal must name the cause');
        assert.strictEqual(err.code, 'E_MEMSTRUCT_TRAVERSAL', 'refusal must carry the typed code');
        const res = a.importStore({ memstruct: 1, records: [{ id: 'private/scratch/evil.sh', createdAt: 1, body: 'x' }] });
        assert.strictEqual(res.written, 0, 'a non-markdown id must not be written');
        assert.strictEqual(res.skipped, 1, 'it must count as skipped');
        assert.ok(!fs.existsSync(path.join(root, 'private', 'scratch', 'evil.sh')), 'evil.sh must not exist');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M5b — a non-store document refuses typed.
test('M5b a non-memstruct@1 document refuses typed', () => {
    const root = mintBrain({ 'keep.md': 'keep' });
    try {
        const a = new MemstructAdapter({ root });
        let err = null;
        try { a.importStore({ records: [] }); } catch (e) { err = e; }
        assert.ok(err, 'a store missing the version must refuse');
        assert.strictEqual(err.code, 'E_MEMSTRUCT_STORE', 'refusal must carry the typed code');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// M6 — lint parity: the adapter's verdict matches the real memstruct CLI.
test('M6 the exported store passes the real memstruct CLI (lint parity)', () => {
    const root = mintBrain({ 'identity.md': '# i', 'nested/goals.md': '# g' });
    const storePath = path.join(root, 'store.json');
    try {
        const a = new MemstructAdapter({ root });
        const store = a.exportStore();
        const inProc = a.lint(store);
        assert.strictEqual(inProc.ok, true, 'adapter lint must pass: ' + JSON.stringify(inProc.violations));
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        // The real CLI is the arbiter; skip gracefully when memstruct is not
        // installed (it is a dev dependency, not a runtime one).
        let cliOk = null;
        try {
            execFileSync('npx', ['memstruct', 'lint', storePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            cliOk = true;
        } catch (e) {
            if (e && (e.status === undefined || /not found|ENOENT/.test(e.message))) cliOk = null; // CLI unavailable
            else cliOk = false;
        }
        if (cliOk !== null) assert.strictEqual(cliOk, true, 'memstruct CLI must accept the store');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

console.log(`\n=== memstruct-adapter: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
