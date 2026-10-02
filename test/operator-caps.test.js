#!/usr/bin/env node
/**
 * Operator caps + flush e2e (pass 88) — prime's issues #105–#110.
 *
 * Covers:
 *   #108  canSpawn deny-by-default + process-local grant made CLI spawn
 *         unreachable. ROOT FIX: boot hydrates persisted
 *         orgchart.operatorCapabilities (widen-only) — fresh processes
 *         inherit the operator grant. Negative control FIRST (no caps
 *         persisted -> boot+spawn denied), then persist + positive.
 *   #105  org capability grants don't persist across processes — same fix,
 *         verified by a real cold child process.
 *   #106  bin/agents.js spawn/kill were stubs — now real; spawn round-trip
 *         via CLI must persist and list in a SECOND process.
 *   #107  subcommand-level --help must print usage (not "Spawning: --help").
 *   #109  fire-and-forget saves raced process exit — CLI flows flush; the
 *         cold-process spawn list is itself the flush proof.
 *   #110  audit.healthCheck() contract drift (validate always failed).
 *   habitat CLI grant flush: vant habitat grant persists across processes.
 *
 * ISOLATION: scratch brain (VANT_BRAIN) + scratch config namespace;
 * subprocesses inherit VANT_BRAIN via env.
 */

const SCRATCH_BRAIN = 'op-test-' + Date.now().toString(36);
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
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
function lib(name) { return path.join(ROOT, 'lib', name); }

/** Run a node snippet as a REAL child process sharing the scratch brain. */
function coldRun(script, label) {
    const r = spawnSync('node', ['-e', script], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
    });
    if (r.status !== 0) throw new Error(label + ' child exit ' + r.status + ': ' + (r.stderr || r.stdout).slice(0, 400));
    return r.stdout;
}

async function main() {
    console.log('\n\ud83d\udd12 OPERATOR CAPS + FLUSH TESTS (pass 88)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')\n');

    const brain = require(lib('brain'));
    const config = require(lib('config'));
    const sb = require(lib('sandbox'));

    // ---------- #108/#105: persisted caps hydrate at boot (cold) ----------
    console.log('  #108/#105 persisted operator capabilities:');

    await test('negative control: boot scopes lacking spawn + NO persisted caps -> canSpawn denied', () => {
        // The boot task's own scopes satisfy can() via sudo linkage, so the
        // sharp negative control grants read/write scopes only: without a
        // persisted capabilities row, canSpawn stays deny-by-default.
        const out = coldRun(`
            require(${JSON.stringify(lib('boot'))}).init({ taskId: 'neg', scopes: ['read','write'], debug: false });
            const sb = require(${JSON.stringify(lib('sandbox'))});
            console.log('CAPS=' + JSON.stringify({ spawn: sb.can('canSpawn'), write: sb.can('canWrite') }));
        `, 'negative');
        const m = out.match(/CAPS=(\{.*\})/);
        assert(m, 'caps line missing: ' + out.slice(0, 200));
        const caps = JSON.parse(m[1]);
        assert(caps.spawn === false, 'expected canSpawn false without persisted grant: ' + m[1]);
    });

    await test('persist operatorCapabilities -> cold boot inherits them (#108 root fix)', () => {
        // Persist exactly like `vant org config --set-operator-caps` does.
        const existing = config.loadBrainConfig(SCRATCH_BRAIN) || {};
        const merged = { ...existing, orgchart: { ...(existing.orgchart || {}), operatorCapabilities: { canWrite: true, canSpawn: true } } };
        assert(config.saveBrainConfig(SCRATCH_BRAIN, merged), 'saveBrainConfig failed');
        const out = coldRun(`
            require(${JSON.stringify(lib('boot'))}).init({ taskId: 'pos', scopes: ['read','write','spawn'], debug: false });
            const sb = require(${JSON.stringify(lib('sandbox'))});
            const agents = require(${JSON.stringify(lib('agents'))});
            const r = agents.spawn({ name: 'caps-child-probe' });
            console.log('SPAWN=' + JSON.stringify(r));
            agents.flush().then(() => console.log('FLUSHED'));
        `, 'positive');
        assert(/SPAWN=\{"id":"agent_/.test(out), 'spawn must succeed in cold child with persisted caps: ' + out.slice(0, 300));
        assert(/FLUSHED/.test(out), 'flush must complete');
    });

    await test('widen-only: boot never NARROWS a host-configured sandbox', () => {
        const out = coldRun(`
            const sb = require(${JSON.stringify(lib('sandbox'))});
            sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
            require(${JSON.stringify(lib('boot'))}).init({ taskId: 'host', scopes: ['read'], debug: false });
            console.log('HOSTCAPS=' + JSON.stringify({ spawn: sb.can('canSpawn') }));
        `, 'widen-only');
        assert(/HOSTCAPS=\{"spawn":true\}/.test(out), 'host authority must survive boot: ' + out.slice(0, 200));
    });

    // ---------- #106/#109: CLI spawn round-trip (real, cold-persisted) ----------
    console.log('\n  #106/#109 agents CLI is real + flush persists:');

    await test('vant agents spawn CLI persists; SECOND process lists the agent', () => {
        const r1 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'spawn', 'cli-cold-probe'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r1.status === 0, 'spawn exit ' + r1.status + ': ' + (r1.stderr || r1.stdout).slice(0, 300));
        assert(/✓ Spawned agent: agent_/.test(r1.stdout), 'spawn output: ' + r1.stdout.slice(0, 200));
        assert(/persisted/.test(r1.stdout), 'flush confirmation missing');
        const r2 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'list'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r2.status === 0, 'list exit ' + r2.status + ': ' + (r2.stderr || r2.stdout).slice(0, 300));
        assert(/cli-cold-probe/.test(r2.stdout), 'agent must survive the process boundary (flush proof): ' + r2.stdout.slice(0, 300));
    });

    await test('vant agents kill CLI terminates + persists (second process sees it gone)', () => {
        const r1 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'spawn', 'cli-kill-probe'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        const id = (r1.stdout.match(/agent_[a-z0-9]+/) || [])[0];
        assert(id, 'spawned id not found: ' + r1.stdout.slice(0, 200));
        const r2 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'kill', id], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r2.status === 0, 'kill exit ' + r2.status + ': ' + (r2.stderr || r2.stdout).slice(0, 300));
        const r3 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'info', id], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r3.status !== 0, 'killed agent must be gone in a fresh process');
    });

    await test('subcommand-level --help prints usage, never acts (#107)', () => {
        const r = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'spawn', '--help'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r.status === 0, 'help exit ' + r.status + ': ' + (r.stderr || r.stdout).slice(0, 200));
        assert(/Usage:/.test(r.stdout), 'usage text missing: ' + r.stdout.slice(0, 200));
        assert(!/Spawning/.test(r.stdout), 'help must not spawn');
        const r2 = spawnSync('node', [path.join(ROOT, 'bin', 'agents.js'), 'kill', '--help'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r2.status === 0 && /Usage:/.test(r2.stdout), 'kill --help must print usage');
        assert(!/Terminated/.test(r2.stdout), 'help must not kill');
    });

    // ---------- #110: audit healthCheck contract ----------
    console.log('\n  #110 audit.healthCheck contract:');

    await test('healthCheck returns {healthy, issues, entries} (validate reads this)', () => {
        const audit = require(lib('audit'));
        const h = audit.healthCheck();
        assert(h.healthy === true, 'healthy must be a real boolean: ' + JSON.stringify(h));
        assert(Array.isArray(h.issues) && h.issues.length === 0, 'issues array: ' + JSON.stringify(h.issues));
        assert(typeof h.entries === 'number', 'entries count: ' + JSON.stringify(h));
        assert(h.status === 'ok', 'status: ' + JSON.stringify(h));
    });

    // ---------- habitat CLI flush (#109 class) ----------
    console.log('\n  habitat CLI grant flush:');

    await test('vant habitat grant persists across processes (flush before exit)', () => {
        const ws = 'org-flush-' + Date.now().toString(36);
        const r1 = spawnSync('node', [path.join(ROOT, 'bin', 'habitat.js'), 'init', ws], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r1.status === 0, 'init exit ' + r1.status + ': ' + (r1.stderr || r1.stdout).slice(0, 300));
        const r2 = spawnSync('node', [path.join(ROOT, 'bin', 'habitat.js'), 'grant', ws, 'editor', 'flush-user'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN }
        });
        assert(r2.status === 0, 'grant exit ' + r2.status + ': ' + (r2.stderr || r2.stdout).slice(0, 300));
        // COLD read: roles must be on disk already (grant used to race exit).
        const out = coldRun(`
            require(${JSON.stringify(lib('habitat'))}).getSharedReady().then(h => {
                console.log('ROLES=' + JSON.stringify(h.getUserRoles('${ws}', 'flush-user')));
            });
        `, 'cold roles');
        const m = out.match(/ROLES=(\[.*\])/);
        assert(m, 'roles line missing: ' + out.slice(0, 300));
        assert(JSON.parse(m[1]).includes('editor'), 'editor role must persist: ' + m[1]);
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
