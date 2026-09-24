#!/usr/bin/env node
/**
 * Registry Persistence Tests (pass 36 / prd-vant-os Wave 1)
 *
 * Pins Architecture A for the node-registry (consensus's vote anchor):
 *   1. Round-trip across a REAL process death (register → kill → new
 *      process hydrates the peer table from disk)
 *   2. Write-through on register/heartbeat/unregister
 *   3. Corrupt state file = start empty + warn (never crash)
 *   4. Read DENIAL throws E_STATE_READ — never resets (pass-31 rule)
 *   5. Brain scoping: vant vs other brain hold separate tables
 *   6. crew-bus interop: listen() registers `crew_<name>` alive peer;
 *      stop() unregisters
 *
 * Self-reporting suite: exit 1 on fail. Run from the repo root so the
 * models/ state path lands in the project (cleaned up on exit).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = process.cwd();
const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            failures.push(name);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

// Children emit [INFO] audit lines alongside our JSON (and the storage
// banner can land on the same line) — extract the JSON object robustly.
function parseJsonOut(out) {
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON in output: ' + out.slice(0, 200));
    return JSON.parse(out.slice(start, end + 1));
}

function lastLine(out) {
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || '';
}

function run(cmd, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', cmd], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
        child.on('error', reject);
        if (input) child.stdin.end(input);
        else child.stdin.end();
    });
}

const statePath = (brain) => path.join(ROOT, 'models/private', brain, 'state/node-registry.json');

const CHILD_READ = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
const peers = registry.list();
console.log(JSON.stringify({ n: peers.length, ids: peers.map(p => p.id).sort() }));
`;

const CHILD_ROUNDTRIP = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
registry.clearState();
registry.register({ id: 'survivor_a', name: 'aria', host: 'localhost', port: 4101, status: 'alive' });
registry.register({ id: 'survivor_b', name: 'volt', host: 'localhost', port: 4102, status: 'joining' });
console.log('WROTE');
`;

const CHILD_DENIAL = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
registry.clearState();
// Persist one peer so the state file exists...
registry.register({ id: 'victim', name: 'x', host: 'localhost', port: 1 });
// ...then lock the store down: explicitly-enforced sandbox without canRead.
const sandbox = require(${JSON.stringify(path.join(ROOT, 'lib/sandbox.js'))});
sandbox.defaultSandbox.setCapabilities({ canRead: false, canWrite: false });
// New process would hydrate here; this one must re-hydrate via the reset seam.
registry._resetHydration();
try {
    registry.get('victim');
    console.log('NO_THROW');
} catch (e) {
    console.log(JSON.stringify({ code: e.code, msg: e.message }));
}
`;

async function main() {
    console.log('\n📡 REGISTRY PERSISTENCE TESTS (Wave 1)\n');

    // Clean slate for this suite's state (wave1-other is a throwaway brain
    // created below; vant's state subdir is shared repo runtime state)
    fs.rmSync(path.join(ROOT, 'models/private/wave1-other'), { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    await test('round-trip: peer table survives a real process death', async () => {
        const w = await run(CHILD_ROUNDTRIP);
        assert(lastLine(w.out) === 'WROTE', 'writer failed: ' + w.out + w.err);
        assert(fs.existsSync(statePath('vant')), 'state file should exist on disk');

        const r = await run(CHILD_READ); // brand-new process, cold module state
        const data = parseJsonOut(r.out);
        assert(data.n === 2, 'expected 2 hydrated peers, got ' + data.n + ' (' + r.out + r.err + ')');
        assert(data.ids.includes('survivor_a') && data.ids.includes('survivor_b'), 'both peers hydrated');
    });

    await test('write-through: heartbeat + unregister hit disk', async () => {
        const heartbeatScript = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
registry.heartbeat('survivor_a');
const onDisk = JSON.parse(require('fs').readFileSync(${JSON.stringify(statePath('vant'))}, 'utf8'));
const a = onDisk.nodes.find(n => n.id === 'survivor_a');
console.log(JSON.stringify({ status: a.status, total: onDisk.nodes.length }));
`;
        const hb = await run(heartbeatScript);
        const d = parseJsonOut(hb.out);
        assert(d.status === 'alive', 'heartbeat should mark alive on disk, got ' + hb.out + hb.err);
        assert(d.total === 2, 'two peers on disk after heartbeat');

        const unregScript = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
registry.unregister('survivor_b');
const onDisk = JSON.parse(require('fs').readFileSync(${JSON.stringify(statePath('vant'))}, 'utf8'));
console.log(JSON.stringify({ total: onDisk.nodes.length, gone: !onDisk.nodes.some(n => n.id === 'survivor_b') }));
`;
        const ur = await run(unregScript);
        const d2 = parseJsonOut(ur.out);
        assert(d2.total === 1 && d2.gone === true, 'unregister should persist: ' + ur.out + ur.err);
    });

    await test('corrupt state file = start empty, never crash', async () => {
        fs.mkdirSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true });
        fs.writeFileSync(statePath('vant'), '{corrupt json!!!');
        const r = await run(CHILD_READ);
        const data = JSON.parse(r.out);
        assert(data.n === 0, 'corrupt file should hydrate zero peers, got ' + data.n);
        assert(r.err.includes('State file unreadable'), 'should warn loudly: ' + r.err);
    });

    await test('read DENIAL throws E_STATE_READ — never resets', async () => {
        // Recreate a valid state file first
        const seed = await run(CHILD_ROUNDTRIP);
        assert(lastLine(seed.out) === 'WROTE', 'seed failed: ' + seed.err);
        const r = await run(CHILD_DENIAL);
        const parsed = parseJsonOut(r.out);
        assert(parsed.code === 'E_STATE_READ', 'expected E_STATE_READ, got ' + JSON.stringify(parsed));
    });

    await test('brain scoping: separate brains hold separate tables', async () => {
        // pushBrain adds to the stack but the PATH-active brain is
        // currentBrain(name) — set it explicitly (matches getBrainPath()
        // semantics: env override > active brain).
        fs.mkdirSync(path.join(ROOT, 'models/private/wave1-other'), { recursive: true });
        const otherBrainScript = `
const brain = require(${JSON.stringify(path.join(ROOT, 'lib/brain.js'))});
brain.pushBrain('wave1-other', 'private');
brain.currentBrain('wave1-other');
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
registry.clearState();
registry.register({ id: 'other-peer', name: 'juno', host: 'localhost', port: 4200 });
console.log('WROTE_OTHER');
`;
        const w = await run(otherBrainScript);
        assert(lastLine(w.out) === 'WROTE_OTHER', 'other-brain writer failed: ' + w.out + w.err);
        assert(fs.existsSync(statePath('wave1-other')), 'other brain should have its own state file');
        assert(!fs.readFileSync(statePath('vant'), 'utf8').includes('other-peer'), 'vant table must not contain other brain peers');

        const r = await run(CHILD_READ);
        const data = parseJsonOut(r.out);
        assert(!data.ids.includes('other-peer'), 'default-brain read must not see other-brain peers');
    });

    await test('crew-bus interop: listen() registers crew_<name> alive; stop() unregisters', async () => {
        const PORT = 4550 + (process.pid % 40);
        const script = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
const { createBus } = require(${JSON.stringify(path.join(ROOT, 'lib/crew-bus.js'))});
const bus = createBus({ name: 'interop', port: ${PORT}, secret: 'wave1-secret' });
bus.listen();
const peer = registry.get('crew_interop');
const afterListen = JSON.stringify({ id: peer && peer.id, status: peer && peer.status, kind: peer && peer.metadata && peer.metadata.kind });
bus.stop().then(() => {
    // (|| null) — JSON.stringify drops undefined, which broke the pin once
    const gone = registry.get('crew_interop') || null;
    console.log(JSON.stringify({ afterListen: JSON.parse(afterListen), afterStop: gone }));
    process.exit(0);
});
`;
        const r = await run(script);
        const d = parseJsonOut(r.out);
        assert(d.afterListen.id === 'crew_interop', 'peer should be registered on listen: ' + JSON.stringify(d));
        assert(d.afterListen.status === 'alive', 'peer should be alive');
        assert(d.afterListen.kind === 'crew-node', 'metadata.kind should mark the crew node');
        assert(d.afterStop === null, 'peer should be gone after stop(), got ' + JSON.stringify(d.afterStop));
    });

    // Cleanup: this suite's state files (other suites' models/ state untouched)
    fs.rmSync(path.join(ROOT, 'models/private/wave1-other'), { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Registry persistence: ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) console.log('Failures: ' + failures.join(', '));
    console.log('='.repeat(50));

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
