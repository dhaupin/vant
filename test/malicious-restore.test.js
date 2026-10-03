#!/usr/bin/env node
/**
 * Malicious Backup Restore Tests
 * Hostile horcrux/backup payloads must NOT write outside the brain tree.
 * Covers the old P0 audit finding "path traversal in restore = arbitrary
 * file write" with REAL restore() executions against FileStorage-backed
 * writes: traversal segments, absolute paths, brain-name smuggling, and
 * dotfile weapons. Also proves a benign payload still restores.
 *
 * Run: node test/malicious-restore.test.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

const suite = [];
function define(name, fn) { suite.push({ name, fn }); }
async function runSuite() {
    for (const { name, fn } of suite) {
        try {
            const result = await fn();
            const ok = result === true || (result && result.success);
            if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
            else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    // Post-suite tidy: remove the benign probe brain (before exit so it
    // actually runs — process.exit is called below).
    try { fs.rmSync(path.join(MODELS, 'private', MAL), { recursive: true, force: true }); } catch (e) {}
    process.exit(results.failed > 0 ? 1 : 0);
}

const transform = require(path.join(ROOT, 'lib', 'transform'));

const MODELS = path.join(ROOT, 'models');
const MAL = 'qc-malicious-probe'; // brain used for the payload probes

console.log('\n💀 MALICIOUS RESTORE TESTS\n');

// Payload factory — minimal valid horcrux wrapper that reaches the
// brainStorage restore path.
function payload(brainsObject) {
    return {
        type: 'vant-horcrux',
        timestamp: Date.now(),
        version: '0.8.6',
        payload: {
            timestamp: Date.now(),
            version: '0.8.8.9',
            mode: { loaded: false },
            brainStorage: {
                loaded: true,
                brains: brainsObject
            }
        }
    };
}

// Track every canary file that could exist if an escape SUCCEEDED
function escapeArtifacts() {
    return [
        path.join(ROOT, 'pwned.txt'),
        path.join(ROOT, 'lib', 'pwned.txt'),
        path.join(ROOT, 'models', 'pwned.txt'),
        path.join(ROOT, 'models', 'pwned-dir', 'x.txt')
    ];
}
function cleanup() {
    for (const f of escapeArtifacts()) { try { fs.unlinkSync(f); } catch (e) {} }
    try { fs.rmdirSync(path.join(ROOT, 'models', 'pwned-dir')); } catch (e) {} // only if empty
    // remove probe brain if a benign test created it
    try { fs.rmSync(path.join(MODELS, 'private', MAL), { recursive: true, force: true }); } catch (e) {}
}

// ============================================
// 1. TRAVERSAL FILE PATHS — must be rejected
// ============================================

define('restore rejects ../ traversal in file path (payload-level)', async () => {
    cleanup();
    const v = transform.validateHorcruxData(payload({
        'qc-probe': { type: 'private', files: [{ path: '../../pwned.txt', content: 'evil' }] }
    }));
    return { success: !v.valid && v.errors.some(e => /Suspicious file path blocked/.test(e)), error: `validation passed a traversal path: ${JSON.stringify(v.errors)}` };
});

define('restore rejects absolute path in file path (payload-level)', async () => {
    cleanup();
    const v = transform.validateHorcruxData(payload({
        'qc-probe': { type: 'private', files: [{ path: '/tmp/pwned.txt', content: 'evil' }] }
    }));
    return { success: !v.valid, error: `validation passed an absolute path: ${JSON.stringify(v.errors)}` };
});

// ============================================
// 2. FULL RESTORE EXECUTION — hostile payload vs the write chain
// ============================================

define('restore() with traversal payload writes NOTHING outside the tree', async () => {
    cleanup();
    let threw = false;
    try {
        await transform.restore(payload({
            'qc-probe': { type: 'private', files: [{ path: '../pwned.txt', content: 'evil' }] }
        }));
    } catch (e) { threw = true; }

    // Either restore threw (validation) or it completed — either way, the
    // canary files must NOT exist. Note: '../pwned.txt' relative to the
    // probe brain dir is models/private/pwned.txt — ALSO must not exist.
    const canaries = escapeArtifacts().concat([path.join(MODELS, 'private', 'pwned.txt')]);
    const landed = canaries.filter(f => fs.existsSync(f));
    return { success: landed.length === 0, error: `escape artifacts landed: ${landed.join(', ')}` };
});

define('restore() with absolute-path payload writes NOTHING outside the tree', async () => {
    cleanup();
    let threw = false;
    try {
        await transform.restore(payload({
            'qc-probe': { type: 'private', files: [{ path: '/tmp/pwned-abs.txt', content: 'evil' }] }
        }));
    } catch (e) { threw = true; }
    return { success: !fs.existsSync('/tmp/pwned-abs.txt') && !fs.existsSync(path.join(MODELS, 'private', 'pwned-abs.txt')), error: 'absolute-path file materialized' };
});

// ============================================
// 3. BRAIN-NAME SMUGGLING — R-6 charset gate
// ============================================

define('restore rejects slash-traversal brain name (R-6 gate)', async () => {
    cleanup();
    let result = null, threw = false;
    try {
        result = await transform.restore(payload({
            '../../evilbrain': { type: 'private', files: [] }
            , evil: undefined
        }));
    } catch (e) { threw = true; }
    const escaped = fs.existsSync(path.join(MODELS, 'evilbrain')) || fs.existsSync(path.join(ROOT, 'evilbrain'));
    return { success: !escaped, error: 'brain-name traversal materialized a directory' };
});

define('restore rejects dotfile brain name (dotfile weaponization)', dotfileCase);

// The dotfile case (defined below to keep cases tidy)
async function dotfileCase() {
    cleanup();
    let threw = false;
    try {
        await transform.restore(payload({
            '.evil-hidden': { type: 'private', files: [] }
        }));
    } catch (e) { threw = true; }
    const landed = fs.existsSync(path.join(MODELS, 'private', '.evil-hidden')) ||
                   fs.existsSync(path.join(MODELS, 'public', '.evil-hidden'));
    return { success: !landed, error: 'dotfile brain materialized' };
}

// ============================================
// 4. BENIGN CONTROL — normal payload still restores
//Sub-note: benign control proves the gates don't block legitimate restores.
// ============================================

define('benign payload still restores brain files through the store', async () => {
    cleanup();
    const r = await transform.restore(payload({
        [MAL]: { type: 'private', files: [
            { path: 'identity.md', content: '# probe\nNAME: QC' },
            { path: 'notes/sub/probe.md', content: 'nested ok' }
        ] }
    }));
    const ok1 = fs.existsSync(path.join(MODELS, 'private', MAL, 'identity.md'));
    const ok2 = fs.existsSync(path.join(MODELS, 'private', MAL, 'notes', 'sub', 'probe.md'));
    return { success: ok1 && ok2, error: `benign restore failed (identity: ${ok1}, nested: ${ok2})` };
});

// ============================================
// RUN
// ============================================

runSuite();
