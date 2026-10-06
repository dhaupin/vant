#!/usr/bin/env node
/**
 * S5 snapshot-writer guard tests (pass 111, labs/LOCKS.md §8.5)
 *
 * Five whole-snapshot writers adopted merge-under-lock guards (F12 decision
 * (a)): auth lockouts, vaf blocklist, brain config, mcp insights (static
 * gate — the handler needs an embed provider, not offline-runnable),
 * citations. Gated here: a peer's row written to disk between our load and
 * our save SURVIVES our write — the exact last-writer-wins loss these guards
 * close. Contention simulation is native (scratch files on disk), no
 * property replacement anywhere.
 * (scratch brain qc-sg, wiped at start; repo-root state files backed up)
 */

process.env.VANT_BRAIN = 'qc-sg';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = path.join(ROOT, 'models', 'private', 'qc-sg');
fs.rmSync(BRAIN, { recursive: true, force: true });
fs.mkdirSync(BRAIN, { recursive: true });

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

const results = { passed: 0, failed: 0 };
const suite = [];
function test(name, fn) { suite.push({ name, fn }); }

// Repo-root state files are SHARED with any real runtime on this machine —
// back them up and restore them no matter how the suite ends.
const backups = [];
function backupRepoFile(p) {
    backups.push({ p, had: fs.existsSync(p), content: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null });
}
function restoreRepoFiles() {
    for (const b of backups.reverse()) {
        if (b.had) fs.writeFileSync(b.p, b.content);
        else { try { fs.unlinkSync(b.p); } catch (e) { /* already gone */ } }
    }
}
backupRepoFile(path.join(ROOT, '.circuit-auth.json'));
backupRepoFile(path.join(ROOT, '.circuit-vaf.json'));
backupRepoFile(path.join(ROOT, 'models', 'public', 'insights.json'));

console.log('\n🛡️  S5 SNAPSHOT-WRITER GUARD TESTS\n');

// ============================================
// auth.js — lockout merge-under-lock
// ============================================

test('auth lockout: a peer entry written to disk after our load survives our save', () => {
    const Auth = require(path.join(ROOT, 'lib', 'auth')).Auth;
    const a = new Auth();
    // Simulate a peer process recording its own lockout AFTER we loaded:
    fs.writeFileSync(path.join(ROOT, '.circuit-auth.json'), JSON.stringify({
        'peer-user': { count: 2, lockoutUntil: Date.now() + 600000 }
    }, null, 2));
    for (let i = 0; i < 4; i++) a.recordFailedAttempt('local-user');
    const disk = JSON.parse(fs.readFileSync(path.join(ROOT, '.circuit-auth.json'), 'utf8'));
    const ok = !!(disk['peer-user'] && disk['peer-user'].lockoutUntil > Date.now()
        && disk['local-user'] && disk['local-user'].count === 4);
    return { success: ok, error: ok ? null : JSON.stringify(disk).slice(0, 200) };
});

test('auth lockout: the LOCKOUT itself is persisted (was memory-only before pass 111)', () => {
    const Auth = require(path.join(ROOT, 'lib', 'auth')).Auth;
    const a = new Auth();
    let out = null;
    for (let i = 0; i < 5; i++) out = a.recordFailedAttempt('victim');
    const disk = JSON.parse(fs.readFileSync(path.join(ROOT, '.circuit-auth.json'), 'utf8'));
    const ok = !!(disk['victim'] && disk['victim'].lockoutUntil > Date.now() && out && out.locked);
    return { success: ok, error: ok ? null : JSON.stringify({ out, disk: disk['victim'] }) };
});

// ============================================
// vaf.js — blocklist merge-under-lock
// ============================================

test('vaf blocklist: a peer block on disk survives our save', () => {
    // vaf caches blockedIPs at require time — seed the peer row BEFORE the
    // first require of this module in the file load order where possible;
    // the merge reads disk fresh at save time either way.
    fs.writeFileSync(path.join(ROOT, '.circuit-vaf.json'), JSON.stringify({
        '203.0.113.7': { until: Date.now() + 600000, reason: 'peer process blocked this attacker' }
    }, null, 2));
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    for (let i = 0; i < 6; i++) vaf.recordFailedAttempt('198.51.100.9', 'test');
    const disk = JSON.parse(fs.readFileSync(path.join(ROOT, '.circuit-vaf.json'), 'utf8'));
    const ok = !!(disk['203.0.113.7'] && disk['203.0.113.7'].until > Date.now()
        && disk['198.51.100.9'] && disk['198.51.100.9'].until > Date.now());
    return { success: ok, error: ok ? null : JSON.stringify(disk).slice(0, 200) };
});

// ============================================
// config.js — brain config merge-under-lock
// ============================================

test('brain config: a disk-only key survives our save (merge-under-lock)', () => {
    fs.writeFileSync(path.join(BRAIN, 'config.json'), JSON.stringify({
        extraKey: 'keep',
        nested: { a: 1 }
    }, null, 2));
    const config = require(path.join(ROOT, 'lib', 'config'));
    const okSave = config.saveBrainConfig('qc-sg', { myKey: 1 });
    const disk = JSON.parse(fs.readFileSync(path.join(BRAIN, 'config.json'), 'utf8'));
    const ok = okSave === true && disk.extraKey === 'keep' && disk.nested && disk.nested.a === 1 && disk.myKey === 1;
    return { success: ok, error: ok ? null : JSON.stringify({ okSave, disk }).slice(0, 200) };
});

// ============================================
// citations.js — re-read under lock
// ============================================

test('citations: a peer source row survives our add (re-read under lock)', () => {
    fs.writeFileSync(path.join(BRAIN, '.citations.json'), JSON.stringify({
        version: '1.0',
        sources: [{ id: 7, commit: 'peerabc123', context: 'peer row', timestamp: new Date().toISOString() }]
    }, null, 2));
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    const added = citations.addSource('localbc123', 'local row');
    const disk = JSON.parse(fs.readFileSync(path.join(BRAIN, '.citations.json'), 'utf8'));
    const ok = !!added && disk.sources.length === 2
        && disk.sources.some(s => s.commit === 'peerabc123')
        && disk.sources.some(s => s.commit === 'localbc123');
    return { success: ok, error: ok ? null : JSON.stringify({ added, disk }).slice(0, 200) };
});

// ============================================
// mcp.js — insights guard (static; handler needs an embed provider)
// ============================================

test('mcp insights: share path goes through pathForGlobal merge-under-lock (static)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'mcp.js'), 'utf8');
    return { success: /pathForGlobal\('mcp-insights'\)/.test(src) && /withLock\(/.test(src) };
});

// ============================================

(async () => {
    try {
        for (const t of suite) {
            try {
                const r = await t.fn();
                if (r === true || (r && r.success)) {
                    results.passed++;
                    console.log(`  ✓ ${t.name}`);
                } else {
                    results.failed++;
                    console.log(`  ✗ ${t.name}: ${(r && r.error) || 'assertion failed'}`);
                }
            } catch (e) {
                results.failed++;
                console.log(`  ✗ ${t.name}: ${e.message}`);
            }
        }
    } finally {
        restoreRepoFiles();
        fs.rmSync(BRAIN, { recursive: true, force: true });
        try { fs.rmSync(path.join(ROOT, 'models', '.locks-global'), { recursive: true, force: true }); } catch (e) { /* shared root — best effort */ }
    }

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
