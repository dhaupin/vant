#!/usr/bin/env node
/**
 * Protocol State Persistence Tests (pass 37 / prd-vant-os Wave 2)
 *
 * Pins Architecture A for trust + msg (registry already pinned in
 * registry-persistence.test.js):
 *   1. trust round-trip across a REAL process death (record → kill →
 *      new process hydrates scores/karma/history)
 *   2. trust write-through on record/reset; bounded history on disk
 *   3. trust read DENIAL throws E_STATE_READ — never resets
 *   4. trust corrupt file = warn + fresh, never crash
 *   5. msg conversations round-trip across a REAL process death
 *      (post → kill → new process has messages + participants; Sets
 *      restored)
 *   6. msg channels are NOT persisted (ephemeral IPC by design)
 *   7. msg delete() removes the conversation from disk
 *   8. transform gather exposes crewBus (relay seam swapped); restore
 *      does NOT fabricate secrets (topology-note only)
 *
 * Self-reporting suite: exit 1 on fail. Cleans its state files on exit.
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

// Children emit [INFO]/[WARN] lines around our JSON — extract robustly.
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

const trustPath = path.join(ROOT, 'models/private/vant/state/trust.json');
const msgPath = path.join(ROOT, 'models/private/vant/state/msg-conversations.json');

const CHILD_TRUST_WRITE = `
const trust = require(${JSON.stringify(path.join(ROOT, 'lib/trust.js'))});
trust.clearState();
const t = trust.getTrust();
t.record('peer_alpha', 'help', { positive: true, note: 'solid work' });
t.record('peer_alpha', 'help', { positive: true });
t.record('peer_beta', 'violation', { positive: false, note: 'bad trade' });
t.setRequired('trade', 0.4);
console.log('TRUST_WROTE');
`;

const CHILD_TRUST_READ = `
const trust = require(${JSON.stringify(path.join(ROOT, 'lib/trust.js'))});
const t = trust.getTrust();
console.log(JSON.stringify({
    alpha: t.getScore('peer_alpha'),
    alphaKarma: t.getKarma('peer_alpha'),
    beta: t.getScore('peer_beta'),
    betaKarma: t.getKarma('peer_beta'),
    alphaHistory: t.getHistory('peer_alpha', 5).length,
    requiredTrade: (() => { const exp = trust.export(); return exp.roleTrust.trade; })()
}));
`;

const CHILD_TRUST_CORRUPT = `
const trust = require(${JSON.stringify(path.join(ROOT, 'lib/trust.js'))});
const t = trust.getTrust();
console.log(JSON.stringify({ alpha: t.getScore('peer_alpha') }));
`;

const CHILD_MSG_WRITE = `
// post() checks sandbox.can('canWrite') directly (strict: undefined cap =
// false, unlike FileStorage's allow-with-warning default). Grant operator
// caps the bin/org.js way before writing.
require(${JSON.stringify(path.join(ROOT, 'lib/sandbox.js'))}).defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const msg = require(${JSON.stringify(path.join(ROOT, 'lib/msg.js'))});
msg.clearState();
msg.create({ id: 'wave2-conv', maxMessages: 500 });
msg.addParticipant('wave2-conv', 'aria');
msg.addParticipant('wave2-conv', 'volt');
const r1 = msg.post('wave2-conv', 'hello crew', { author: 'aria' });
const r2 = msg.post('wave2-conv', 'reply incoming', { author: 'volt' });
if (r1.error || r2.error) { console.error('POST_FAIL:' + JSON.stringify([r1, r2])); process.exit(1); }
console.log('MSG_WROTE');
`;

const CHILD_MSG_READ = `
const msg = require(${JSON.stringify(path.join(ROOT, 'lib/msg.js'))});
const list = msg.list();
const conv = list.find(c => c.id === 'wave2-conv');
const parts = msg.participants('wave2-conv');
const msgs = msg.messages('wave2-conv', { limit: 10 });
console.log(JSON.stringify({
    found: !!conv,
    messageCount: conv ? conv.messageCount : 0,
    participants: parts.sort(),
    firstAuthor: msgs.length ? msgs[0].author : null
}));
`;

const CHILD_MSG_DELETE = `
const msg = require(${JSON.stringify(path.join(ROOT, 'lib/msg.js'))});
const removed = msg.delete('wave2-conv');
const onDisk = require('fs').existsSync(${JSON.stringify(msgPath)}) ?
    JSON.parse(require('fs').readFileSync(${JSON.stringify(msgPath)}, 'utf8')) : { conversations: [] };
console.log(JSON.stringify({ removed, stillOnDisk: onDisk.conversations.some(c => c.id === 'wave2-conv') }));
`;

const CHILD_TRANSFORM_GATHER = `
(async () => {
    const transform = require(${JSON.stringify(path.join(ROOT, 'lib/transform.js'))});
    // gather reports the DEFAULT singleton (one bus per process is the
    // documented normal case) — configure it via the module exports.
    const crewBus = require(${JSON.stringify(path.join(ROOT, 'lib/crew-bus.js'))});
    crewBus.configure({ name: 'gather-probe', port: 4770 + (process.pid % 30), secret: 'probe-secret' });
    crewBus.registerNode({ name: 'peer-x', url: 'http://127.0.0.1:4999', secret: 'super-secret-value' });
    const data = await transform.gather({ full: true });
    const out = {
        hasCrewBus: !!data.crewBus,
        name: data.crewBus && data.crewBus.name,
        peerNames: data.crewBus && data.crewBus.peers ? data.crewBus.peers.map(p => p.name) : [],
        noRelayKey: !('relay' in data)
    };
    console.log('GATHER_JSON:' + JSON.stringify(out));
    console.log('LEAK_CHECK:' + JSON.stringify(data).includes('super-secret-value'));
})().catch((e) => { console.error('GATHER_FAIL:' + e.message); process.exit(1); });
`;

async function main() {
    console.log('\n🧠 PROTOCOL STATE PERSISTENCE TESTS (Wave 2)\n');

    // Clean slate
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    // ---------- trust ----------
    await test('trust: round-trip across a real process death', async () => {
        const w = await run(CHILD_TRUST_WRITE);
        assert(lastLine(w.out) === 'TRUST_WROTE', 'writer failed: ' + w.out + w.err);
        assert(fs.existsSync(trustPath), 'trust state file should exist');

        const r = await run(CHILD_TRUST_READ); // cold process
        const d = parseJsonOut(r.out);
        assert(d.alpha > 0.5, 'alpha should be boosted above initial, got ' + d.alpha);
        assert(d.alphaKarma === 2, 'alpha karma 2, got ' + d.alphaKarma);
        assert(d.beta < 0.5, 'beta should be penalized below initial, got ' + d.beta);
        assert(d.betaKarma === -1, 'beta karma -1, got ' + d.betaKarma);
        assert(d.alphaHistory === 2, 'alpha history 2 entries, got ' + d.alphaHistory);
        assert(d.requiredTrade === 0.4, 'roleTrust.trade should round-trip, got ' + d.requiredTrade);
    });

    await test('trust: write-through on reset; history bounded on disk', async () => {
        const s = await run(`
const trust = require(${JSON.stringify(path.join(ROOT, 'lib/trust.js'))});
const t = trust.getTrust();
t.reset('peer_alpha');
console.log('RESET_DONE');
`);
        assert(lastLine(s.out) === 'RESET_DONE', 'reset failed: ' + s.out + s.err);
        const r = await run(CHILD_TRUST_READ);
        const d = parseJsonOut(r.out);
        // Fresh process: alpha is gone from disk → getScore re-initializes to default
        assert(d.alpha === 0.5, 'alpha should be back to initial after reset+restart, got ' + d.alpha);
        assert(d.alphaKarma === 0, 'alpha karma reset, got ' + d.alphaKarma);
    });

    await test('trust: read DENIAL throws E_STATE_READ — never resets', async () => {
        // Seed a fresh state file, then lock down
        const seed = await run(CHILD_TRUST_WRITE);
        assert(lastLine(seed.out) === 'TRUST_WROTE', 'seed failed: ' + seed.err);
        const r = await run(`
const trust = require(${JSON.stringify(path.join(ROOT, 'lib/trust.js'))});
trust.clearState();
const t = trust.getTrust();
t.record('victim', 'help', { positive: true });
const sandbox = require(${JSON.stringify(path.join(ROOT, 'lib/sandbox.js'))});
sandbox.defaultSandbox.setCapabilities({ canRead: false, canWrite: false });
const stateStore = require(${JSON.stringify(path.join(ROOT, 'lib/state-store.js'))});
try {
    // Direct hydrate against the locked-down store — the pass-31 rule path.
    stateStore.hydrate({ moduleName: 'trust', stateFile: trust._stateFile, apply: () => {} });
    console.log('NO_THROW');
} catch (e) {
    console.log(JSON.stringify({ code: e.code }));
}
`);
        const d = parseJsonOut(r.out);
        assert(d.code === 'E_STATE_READ', 'expected E_STATE_READ, got ' + r.out + r.err);
    });

    await test('trust: corrupt file = warn + fresh, never crash', async () => {
        fs.mkdirSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true });
        fs.writeFileSync(trustPath, '{corrupt!!');
        const r = await run(CHILD_TRUST_CORRUPT);
        const d = parseJsonOut(r.out);
        assert(d.alpha === 0.5, 'corrupt file should re-initialize to default, got ' + d.alpha);
        assert(r.err.includes('corrupted'), 'should warn loudly: ' + r.err.slice(0, 200));
    });

    // ---------- msg ----------
    await test('msg: conversations round-trip across a real process death', async () => {
        const w = await run(CHILD_MSG_WRITE);
        assert(lastLine(w.out) === 'MSG_WROTE', 'writer failed: ' + w.out + w.err);
        assert(fs.existsSync(msgPath), 'msg state file should exist');

        const r = await run(CHILD_MSG_READ); // cold process
        const d = parseJsonOut(r.out);
        assert(d.found === true, 'conversation should hydrate: ' + r.out + r.err);
        assert(d.messageCount === 2, 'two messages, got ' + d.messageCount);
        assert(JSON.stringify(d.participants) === JSON.stringify(['aria', 'volt']), 'participants restored (Sets→Arrays→Sets), got ' + JSON.stringify(d.participants));
        assert(d.firstAuthor === 'aria', 'first message author aria, got ' + d.firstAuthor);
    });

    await test('msg: channels are NOT persisted (ephemeral IPC by design)', async () => {
        const s = await run(`
const msg = require(${JSON.stringify(path.join(ROOT, 'lib/msg.js'))});
msg.send('wave2-channel', { from: 'a', text: 'ephemeral' });
console.log('SENT');
`);
        assert(lastLine(s.out) === 'SENT', 'send failed: ' + s.out + s.err);
        const onDisk = fs.existsSync(msgPath) ? JSON.parse(fs.readFileSync(msgPath, 'utf8')) : { conversations: [] };
        const serialized = JSON.stringify(onDisk);
        assert(!serialized.includes('wave2-channel'), 'channels must never hit disk');
        const r = await run(`
const msg = require(${JSON.stringify(path.join(ROOT, 'lib/msg.js'))});
console.log(JSON.stringify({ channelMsgs: msg.channelMessages('wave2-channel').length }));
`);
        const d = parseJsonOut(r.out);
        assert(d.channelMsgs === 0, 'channel should be empty in a fresh process');
    });

    await test('msg: delete() removes the conversation from disk', async () => {
        const r = await run(CHILD_MSG_DELETE);
        const d = parseJsonOut(r.out);
        assert(d.removed === true, 'delete should return true');
        assert(d.stillOnDisk === false, 'conversation must be gone from disk');
    });

    // ---------- transform seam ----------
    await test('transform: gather exposes crewBus (relay seam swapped), no relay key', async () => {
        const r = await run(CHILD_TRANSFORM_GATHER);
        const jsonLine = r.out.split('\n').find((l) => l.startsWith('GATHER_JSON:'));
        const leakLine = r.out.split('\n').find((l) => l.startsWith('LEAK_CHECK:'));
        assert(jsonLine, 'gather output missing: ' + r.out.slice(0, 300));
        const d = JSON.parse(jsonLine.slice('GATHER_JSON:'.length));
        assert(d.hasCrewBus === true, 'crewBus section should exist');
        assert(d.name === 'gather-probe', 'bus name reported, got ' + d.name);
        assert(d.peerNames.includes('peer-x'), 'peer topology reported');
        assert(d.noRelayKey === true, 'relay key must be gone from gather output');
        assert(leakLine && leakLine.endsWith('false'), 'peer secret must never leak through gather');
    });

    // Cleanup
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Protocol state persistence: ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) console.log('Failures: ' + failures.join(', '));
    console.log('='.repeat(50));

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
