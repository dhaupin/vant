#!/usr/bin/env node
/**
 * Workspace Memory Namespacing Tests (pass 85)
 *
 * Covers #5: per-workspace memory namespacing (with RLS subject chain).
 *   1. Flat keys unchanged for anonymous callers (pre-85 behavior).
 *   2. Explicit workspace / userCtx / current-agent identity all resolve
 *      to per-workspace namespaces (ws<wsLen>.<ws>.<key>), mirroring
 *      islands._resolveRlsContext.
 *   3. Namespaces are ISOLATING: no flat fallback, no cross-tenant reads.
 *   4. Key shape is collision-free under lib/storage.js's sanitizer
 *      ([A-Za-z0-9._-] + 100-char truncation) and fails closed on overflow.
 *   5. Pinned-unscoped escape hatch (workspace: null) for process-global
 *      state (habitat _habitat, nature _flywheel, context history).
 *   6. Islands CLI touch-up: boundaries subcommand + load --as.
 *
 * ISOLATION: scratch brain (VANT_BRAIN).
 */

const SCRATCH_BRAIN = 'wm-test-' + Date.now().toString(36);
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// brain.write appends '.md' itself, so state/<name>.json -> state/<name>.json.md
function stateFile(brainName, name) {
    return path.join(ROOT, 'models', 'private', brainName, 'state', name + '.json.md');
}

async function main() {
    console.log('\n\ud83e\udde0 WORKSPACE MEMORY TESTS (pass 85)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    sandbox.setScopes(['read', 'write']);
    sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

    const memory = require(path.join(ROOT, 'lib', 'memory'));
    const m = memory.memory;  // the singleton instance (has _cache/_resolveWorkspace)
    // brain.write resolves the current brain from VANT_BRAIN (env wins on
    // disk); brain.currentBrain() reports the STACK pointer instead, so the
    // env value is the truthful name for path assertions here.
    const brainName = process.env.VANT_BRAIN;

    // ---------- Flat keys (backward compat) ----------
    console.log('\n  Flat keys (anonymous = pre-85 behavior):');

    await test('anonymous state/recall round-trips on the flat key', async () => {
        const r = await m.state('wm-flat', 'flat-v1', { ttl: 600000 });
        assert(r.success === true, 'state failed');
        assert(r.workspace === null, 'anonymous resolution must be null, got ' + JSON.stringify(r.workspace));
        assert(r.storeKey === 'wm-flat', 'flat storeKey, got ' + r.storeKey);
        const v = await m.recall('wm-flat');
        assert(v === 'flat-v1', 'recall got ' + JSON.stringify(v));
    });

    await test('anonymous state lands on the FLAT disk path', async () => {
        assert(fs.existsSync(stateFile(brainName, 'wm-flat')), 'expected flat file state/wm-flat.json.md');
    });

    // ---------- Explicit workspace ----------
    console.log('\n  Explicit workspace namespace:');

    await test('workspace-scoped store lands on ws<wsLen>.<ws>.<key>', async () => {
        const r = await m.state('proj', 'acme-secret', { ttl: 600000, workspace: 'acme' });
        assert(r.success === true, 'state failed');
        assert(r.storeKey === 'ws4.acme.proj', 'composite storeKey, got ' + r.storeKey);
        assert(r.workspace === 'acme', 'workspace echo, got ' + JSON.stringify(r.workspace));
        assert(fs.existsSync(stateFile(brainName, 'ws4.acme.proj')), 'expected scoped file state/ws4.acme.proj.json.md');
        assert(!fs.existsSync(stateFile(brainName, 'proj')), 'flat file must NOT exist for a scoped write');
    });

    await test('same workspace reads its own namespace', async () => {
        const v = await m.recall('proj', { workspace: 'acme' });
        assert(v === 'acme-secret', 'scoped recall got ' + JSON.stringify(v));
    });

    await test('namespace is ISOLATING: no flat fallback, no cross-tenant reads', async () => {
        const anon = await m.recall('proj');
        assert(anon === undefined, 'anonymous must NOT see scoped rows, got ' + JSON.stringify(anon));
        const other = await m.recall('proj', { workspace: 'globex' });
        assert(other === undefined, 'globex must NOT read acme rows, got ' + JSON.stringify(other));
    });

    await test('scoped read works from DISK with a cold cache (cross-process shape)', async () => {
        const cacheKey = brainName + ':state:ws4.acme.proj';
        m._cache.delete(cacheKey);
        const v = await m.recall('proj', { workspace: 'acme' });
        assert(v === 'acme-secret', 'cold scoped recall got ' + JSON.stringify(v));
    });

    await test('two workspaces never collide on the same key', async () => {
        await m.state('proj', 'globex-secret', { ttl: 600000, workspace: 'globex' });
        const a = await m.recall('proj', { workspace: 'acme' });
        const g = await m.recall('proj', { workspace: 'globex' });
        assert(a === 'acme-secret', 'acme got ' + JSON.stringify(a));
        assert(g === 'globex-secret', 'globex got ' + JSON.stringify(g));
    });

    // ---------- Key shape (sanitizer-proof, fail closed) ----------
    console.log('\n  Composite key shape:');

    await test('ambiguous-concatenation pairs get DISTINCT store keys', () => {
        // Storage strips colons and truncates at 100 - bare concatenation
        // would collide these; the length prefix separates them.
        assert(memory.stateKey('ab', 'cx') === 'ws2.ab.cx', 'got ' + memory.stateKey('ab', 'cx'));
        assert(memory.stateKey('abc', 'x') === 'ws3.abc.x', 'got ' + memory.stateKey('abc', 'x'));
        assert(memory.stateKey('a.b', 'c') === 'ws3.a.b.c', 'got ' + memory.stateKey('a.b', 'c'));
        assert(memory.stateKey('a', 'b.c') === 'ws1.a.b.c', 'got ' + memory.stateKey('a', 'b.c'));
        return true;
    });

    await test('composite over the 100-char storage budget fails closed', async () => {
        let threw = null;
        try { await m.state('x'.repeat(120), 'v', { workspace: 'acme' }); } catch (e) { threw = e; }
        assert(threw, 'expected throw');
        assert(threw.code === 'VAF_INPUT_INVALID', 'expected VAF_INPUT_INVALID, got ' + threw.code);
        assert(/storage budget/.test(threw.message), 'message: ' + threw.message);
    });

    // ---------- userCtx resolution ----------
    console.log('\n  userCtx subject resolution:');

    await test('opts.userCtx.workspace scopes the row', async () => {
        const r = await m.state('ctxkey', 'ctx-v', { ttl: 600000, userCtx: { userId: 'u1', workspace: 'ws-ctx' } });
        assert(r.workspace === 'ws-ctx', 'expected ws-ctx, got ' + JSON.stringify(r.workspace));
        assert(r.storeKey === 'ws6.ws-ctx.ctxkey', 'got ' + r.storeKey);
        const v = await m.recall('ctxkey', { workspace: 'ws-ctx' });
        assert(v === 'ctx-v', 'userCtx-written row not readable, got ' + JSON.stringify(v));
    });

    // ---------- Current-agent identity (spawn e2e) ----------
    console.log('\n  Current-agent habitat identity:');

    const agents = require(path.join(ROOT, 'lib', 'agents'));
    const spawned = agents.spawn({ name: 'mem-probe', role: 'editor', team: 'wmx' });
    assert(!spawned.error, 'spawn failed: ' + (spawned.error || ''));
    agents.setCurrentAgentId(spawned.id);

    let agentWs = null;
    try {
        await test('spawned agent auto-scopes to its habitat workspace', async () => {
            const ctx = agents.agentContext(spawned.id);
            assert(ctx && ctx.workspace, 'agent should have a workspace: ' + JSON.stringify(ctx));
            agentWs = ctx.workspace;  // team 'wmx' -> org-wmx (pass 82)
            const r = await m.state('agentkey', 'agent-v', { ttl: 600000 });  // NO explicit workspace
            assert(r.workspace === agentWs, 'auto-resolution expected ' + agentWs + ', got ' + JSON.stringify(r.workspace));
            assert(r.storeKey === 'ws' + agentWs.length + '.' + agentWs + '.agentkey', 'composite storeKey, got ' + r.storeKey);
            const scoped = await m.recall('agentkey', { workspace: agentWs });
            assert(scoped === 'agent-v', 'identity row readable in its namespace');
        });

        await test('workspace: null pins UNscoped even under identity (habitat/nature contract)', async () => {
            const r = await m.state('wm-pinned', 'pinned-v', { ttl: 600000, workspace: null });
            assert(r.workspace === null, 'pin must resolve null, got ' + JSON.stringify(r.workspace));
            assert(r.storeKey === 'wm-pinned', 'pinned storeKey must stay flat, got ' + r.storeKey);
        });

        await test('habitat.save() stays on the flat _habitat row under identity', async () => {
            const habitat = require(path.join(ROOT, 'lib', 'habitat'));
            const h = habitat.getShared();
            await habitat.getSharedReady();
            await h.save();
            assert(fs.existsSync(stateFile(brainName, '_habitat')), 'habitat state must live at flat state/_habitat.json.md');
            assert(!fs.existsSync(stateFile(brainName, 'ws' + (agentWs || '').length + '.' + agentWs + '._habitat')), 'no per-workspace _habitat fragment');
            const restored = await h.restore();
            assert(restored && typeof restored === 'object', 'restore reads the flat row back');
        });
    } finally {
        agents.setCurrentAgentId('default');
    }

    // Anonymous-side assertions run AFTER the identity is cleared.
    await test('identity rows invisible to anonymous callers (post-identity check)', async () => {
        const anon = await m.recall('agentkey');
        assert(anon === undefined, 'anonymous must not see identity rows, got ' + JSON.stringify(anon));
        const pinned = await m.recall('wm-pinned');
        assert(pinned === 'pinned-v', 'pinned row readable on the flat key, got ' + JSON.stringify(pinned));
    });

    // ---------- Validation (fail closed) ----------
    console.log('\n  Workspace name validation:');

    await test('path-traversal workspace name throws (names become filenames)', async () => {
        let threw = null;
        try { await m.state('k', 'v', { workspace: '../evil' }); } catch (e) { threw = e; }
        assert(threw, 'expected throw');
        assert(threw.code === 'VAF_INPUT_INVALID', 'expected VAF_INPUT_INVALID, got ' + threw.code);
    });

    await test('slash workspace name throws', async () => {
        let threw = null;
        try { await m.state('k', 'v', { workspace: 'a/b' }); } catch (e) { threw = e; }
        assert(threw && threw.code === 'VAF_INPUT_INVALID', 'expected VAF_INPUT_INVALID, got ' + (threw && threw.code));
    });

    await test('digit-start workspace name throws (length prefix needs letter start)', async () => {
        let threw = null;
        try { await m.state('k', 'v', { workspace: '2abc' }); } catch (e) { threw = e; }
        assert(threw && threw.code === 'VAF_INPUT_INVALID', 'expected VAF_INPUT_INVALID, got ' + (threw && threw.code));
    });

    await test('empty workspace string pins flat (no throw)', async () => {
        const r = await m.state('wm-empty-ws', 'v', { workspace: '' });
        assert(r.workspace === null && r.storeKey === 'wm-empty-ws', 'empty string = flat, got ' + JSON.stringify(r));
    });

    // ---------- Islands CLI touch-up ----------
    console.log('\n  Islands CLI (pass 85 touch-up):');

    await test('islands boundaries subcommand runs', () => {
        const { spawnSync } = require('child_process');
        const r = spawnSync('node', [path.join(ROOT, 'bin', 'islands.js'), 'boundaries'], { cwd: ROOT, encoding: 'utf8' });
        assert(r.status === 0, 'exit ' + r.status + ': ' + (r.stderr || r.stdout));
        assert(/gated islands/.test(r.stdout), 'boundary output: ' + r.stdout.slice(0, 200));
        return true;
    });

    await test('islands load --as <unknown> fails loudly', () => {
        const { spawnSync } = require('child_process');
        const r = spawnSync('node', [path.join(ROOT, 'bin', 'islands.js'), 'load', 'identity', '--as', 'agent-nope-' + Date.now()], { cwd: ROOT, encoding: 'utf8' });
        assert(r.status === 1, 'expected exit 1, got ' + r.status);
        assert(/No habitat identity/.test(r.stderr || ''), 'error text: ' + (r.stderr || '').slice(0, 200));
        return true;
    });

    await test('islands load --as <spawned agent> uses its identity (same-process e2e)', () => {
        // The agents registry is in-memory, so --as is e2e-tested inside ONE
        // child process: spawn there, then invoke the CLI with that id.
        const { spawnSync } = require('child_process');
        const script =
            'const sb = require(' + JSON.stringify(path.join(ROOT, 'lib', 'sandbox')) + ');' +
            'sb.setScopes(["read", "write", "spawn"]);' +
            'sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });' +
            'const a = require(' + JSON.stringify(path.join(ROOT, 'lib', 'agents')) + ');' +
            'const s = a.spawn({ name: "cli-probe", role: "editor" });' +
            'if (s.error) { console.error("spawn failed: " + JSON.stringify(s.error)); process.exit(2); }' +
            'process.argv = [process.argv[0], "islands", "load", "identity", "--as", s.id];' +
            'require(' + JSON.stringify(path.join(ROOT, 'bin', 'islands.js')) + ');';
        const r = spawnSync('node', ['-e', script], { cwd: ROOT, encoding: 'utf8' });
        assert(r.status === 0, 'exit ' + r.status + ': ' + (r.stderr || r.stdout));
        assert(/Acting as:/.test(r.stdout), 'identity banner missing: ' + r.stdout.slice(0, 300));
        assert(/Loaded identity/.test(r.stdout), 'load result missing: ' + r.stdout.slice(0, 300));
        return true;
    });

    // ---------- Summary ----------
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('SUITE ERROR:', e.stack || e.message);
    process.exit(1);
});
