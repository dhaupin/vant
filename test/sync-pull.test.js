#!/usr/bin/env node
/**
 * Sync pull/rebase real-implementation tests (audit P2 #23, #24)
 *
 * #23: pullAny returned "repoInfo + branch" only — no brain data applied,
 *      corpus cache left stale. Now: per-provider corpus diff (added /
 *      updated / unchanged) after a successful pull, brain caches refreshed.
 * #24: rebase was "pull + push" with zero conflict handling. Now: conflict
 *      classification from pull errors, conflict-marker scan over brain
 *      files BEFORE any push (marker-polluted brain is never pushed),
 *      needsManual flag, and an applied-diff report on clean rebases.
 *
 * Provider DI: sync._setTestProvider(name, obj) — same pattern as the s3
 * connector's _setR2TestClient. Fake providers only exist inside the test
 * map; production getConfiguredProviders/rebase never see them unless the
 * test registered one.
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const sync = require(path.join(ROOT, 'lib', 'sync'));
const brain = require(path.join(ROOT, 'lib', 'brain'));

const results = { passed: 0, failed: 0 };
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n🔄 SYNC PULL/REBASE TESTS (P2 #23, #24)\n');

// ---------- diffCorpus (pure) ----------
test('diffCorpus: classifies added/updated/unchanged', () => {
    const before = [
        { id: 'identity', content: 'v1' },
        { id: 'goals', content: 'same' }
    ];
    const after = [
        { id: 'identity', content: 'v2' },
        { id: 'goals', content: 'same' },
        { id: 'learnings', content: 'new' }
    ];
    const d = sync.diffCorpus(before, after);
    return {
        success: d.added.length === 1 && d.added[0] === 'learnings' &&
                 d.updated.length === 1 && d.updated[0] === 'identity' &&
                 d.unchanged === 1 && d.total === 3,
        error: JSON.stringify(d)
    };
});

test('diffCorpus: empty before → everything added', () => {
    const d = sync.diffCorpus([], [{ id: 'a', content: 'x' }, { id: 'b', content: 'y' }]);
    return { success: d.added.length === 2 && d.updated.length === 0 && d.unchanged === 0 };
});

test('diffCorpus: deterministic sorted output', () => {
    const d = sync.diffCorpus([], [{ id: 'z', content: '' }, { id: 'a', content: '' }]);
    return { success: JSON.stringify(d.added) === JSON.stringify(['a', 'z']) };
});

// ---------- scanConflictMarkers (pure) ----------
test('scanConflictMarkers: detects git conflict markers', () => {
    const files = [
        { name: 'identity.md', content: '# me\n<<<<<<< HEAD\nlocal\n=======\nremote\n>>>>>>> origin/main\n' },
        { name: 'goals.md', content: 'clean content' },
        { name: 'notes.md', content: '>>>>>>> stray marker' }
    ];
    const hits = sync.scanConflictMarkers(files);
    return { success: hits.length === 2 && hits.includes('identity.md') && hits.includes('notes.md'), error: JSON.stringify(hits) };
});

test('scanConflictMarkers: clean files → empty', () => {
    const files = [
        { name: 'identity.md', content: '# clean\n\nno markers here\n' },
        { name: 'goals.md', content: '=== equals signs alone are fine ===' }
    ];
    return { success: sync.scanConflictMarkers(files).length === 0 };
});

// ---------- brain.invalidateCorpusCache (P2 #23 dependency) ----------
test('brain exports invalidateCorpusCache', () => {
    return { success: typeof brain.invalidateCorpusCache === 'function' };
});

test('corpus refresh: new brain file visible after invalidate', async () => {
    // Write through the brain FileStore rooted at the RESOLVED brain path —
    // the layout is multibrain (models/private/<brain>), so the file must
    // land where loadCorpus actually reads (never hardcode the layout).
    const store = new (require(path.join(ROOT, 'lib', 'storage')).FileStorage)({
        basePath: path.join(ROOT, 'models')
    });
    const brainDir = path.relative(path.join(ROOT, 'models'), path.join(ROOT, brain.getBrainPath()));
    const rel = path.join(brainDir, 'zz-pulltest-probe.md');
    const marker = '# zz-pulltest-probe ' + Date.now();
    let sawIt = false;
    try {
        store.write(rel, marker);
        brain.invalidateCorpusCache();
        const corpus = await brain.loadCorpus();
        sawIt = corpus.some(c => c.id === 'zz-pulltest-probe' && c.content === marker);
    } finally {
        try { store.delete(rel); } catch (e) {}
        brain.invalidateCorpusCache();
    }
    return { success: sawIt };
});

// ---------- pullAny guards (no DI / no providers) ----------
test('pullAny: no providers configured → structured refusal', async () => {
    // The DI map may already hold fakes from top-level registration — clear
    // it for this check, then restore fakegit for the flow tests below.
    sync._clearTestProviders();
    const r = await sync.pullAny({});
    const refused = r && r.success === false && /No providers configured/.test(r.error || '');
    sync._setTestProvider('fakegit', {
        getType: () => 'fakegit',
        isConfigured: () => true,
        async getRepoInfo() { return { owner: 'test', repo: 'brain' }; },
        async pull(branch) { pulls.push(branch); return branch || 'main'; },
        async push() { return 'pushed'; }
    });
    return { success: refused, error: JSON.stringify(r).slice(0, 100) };
});

// ---------- pullAny flow with a fake provider ----------
const pulls = [];
sync._setTestProvider('fakegit', {
    getType: () => 'fakegit',
    isConfigured: () => true,
    async getRepoInfo() { return { owner: 'test', repo: 'brain' }; },
    async pull(branch) { pulls.push(branch); return branch || 'main'; },
    async push() { return 'pushed'; }
});

test('pullAny: real apply — result includes applied corpus diff', async () => {
    const r = await sync.pullAny({ preference: 'fakegit' });
    const fake = r && r.results && r.results.fakegit;
    return {
        success: r && r.success === true && fake && fake.success === true &&
                 fake.applied && typeof fake.applied.total === 'number' &&
                 Array.isArray(fake.applied.added) && Array.isArray(fake.applied.updated),
        error: JSON.stringify(r).slice(0, 160)
    };
});

test('pullAny: dryRun pulls nothing', async () => {
    const before = pulls.length;
    const r = await sync.pullAny({ preference: 'fakegit', dryRun: true });
    const fake = r && r.results && r.results.fakegit;
    return {
        success: r && r.success === true && fake && fake.dryRun === true &&
                 fake.applied === undefined && pulls.length === before,
        error: JSON.stringify({ r: fake, pulls: pulls.length, before })
    };
});

// ---------- rebase flow ----------
test('rebase: unknown provider → structured error', async () => {
    const r = await sync.rebase('nonexistent-provider');
    return { success: r && r.success === false, error: JSON.stringify(r).slice(0, 100) };
});

test('rebase: clean pull → applied diff reported, push happens', async () => {
    let pushed = false;
    sync._setTestProvider('fakerebase', {
        getType: () => 'fakerebase',
        isConfigured: () => true,
        async getRepoInfo() { return { owner: 't', repo: 'b' }; },
        async pull() { return 'main'; },
        async push() { pushed = true; return 'ok'; }
    });
    const r = await sync.rebase('fakerebase');
    return {
        success: r && r.success === true && r.pushed === true && pushed === true &&
                 r.applied && typeof r.applied.total === 'number' && r.conflict !== true,
        error: JSON.stringify(r).slice(0, 160)
    };
});

test('rebase: conflict from pull → needsManual, push NEVER called', async () => {
    let pushed = false;
    sync._setTestProvider('fakeconflict', {
        getType: () => 'fakeconflict',
        isConfigured: () => true,
        async getRepoInfo() { return { owner: 't', repo: 'b' }; },
        async pull() { throw new Error('error: Your local changes... CONFLICT (content): Merge conflict in identity.md'); },
        async push() { pushed = true; return 'ok'; }
    });
    const r = await sync.rebase('fakeconflict');
    return {
        success: r && r.success === false && r.conflict === true &&
                 r.needsManual === true && pushed === false,
        error: JSON.stringify({ r, pushed })
    };
});

test('rebase: marker-polluted brain files block the push', async () => {
    // Seed the conflict-marker scan via DI: the scan reads brain files, so we
    // plant a marked file through the store and clean up after.
    const store = new (require(path.join(ROOT, 'lib', 'storage')).FileStorage)({
        basePath: path.join(ROOT, 'models')
    });
    const brainDir = path.relative(path.join(ROOT, 'models'), path.join(ROOT, brain.getBrainPath()));
    const rel = path.join(brainDir, 'zz-rebase-marked.md');
    let pushed = false;
    let r;
    try {
        store.write(rel, '<<<<<<< HEAD\nlocal\n>>>>>>> remote\n');
        sync._setTestProvider('fakemarkers', {
            getType: () => 'fakemarkers',
            isConfigured: () => true,
            async getRepoInfo() { return { owner: 't', repo: 'b' }; },
            async pull() { return 'main'; },
            async push() { pushed = true; return 'ok'; }
        });
        r = await sync.rebase('fakemarkers');
    } finally {
        try { store.delete(rel); } catch (e) {}
        brain.invalidateCorpusCache();
    }
    return {
        success: r && r.success === false && r.conflict === true &&
                 Array.isArray(r.conflictedFiles) && r.conflictedFiles.includes('zz-rebase-marked') &&
                 pushed === false && r.needsManual === true,
        error: JSON.stringify({ r, pushed }).slice(0, 200)
    };
});

test('test provider map: production path ignores it when empty', () => {
    // Remove all test providers; rebase('fakegit') must now fail as unknown.
    sync._clearTestProviders();
    return sync.rebase('fakegit').then(r => ({ success: r && r.success === false }));
});

_chain.then(() => {
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
});
