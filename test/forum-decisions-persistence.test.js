#!/usr/bin/env node
/**
 * Forum decision-log persistence tests (pass 44, live-fire round 2 cont.)
 *
 * Pins the pass-44 fix: forum's decision feed (the records an agent reads
 * to learn "we decided X") is now DURABLE, not memory-only.
 *   1. decision returned in-process -> persisted to state/forum.json
 *   2. restart (fresh module load) -> decision history hydrated back,
 *      proposal/author intact via the pass-43 ledger-metadata stamp
 *   3. FIFO cap: the log stays bounded (MAX 200) under a chatty crew
 *   4. clearState() seam wipes log + file (test/ops parity with consensus)
 *
 * Restart is simulated by evicting lib/forum AND lib/event (and the
 * state-store shim) from the require cache, then re-requiring: the new
 * singleton hydrates at module load — the same path a fresh process
 * takes — while the old singleton's vote:consensus subscription dies
 * with the old emitter (no double-count). consensus.create is
 * lock-wrapped and returns a PROMISE; tests must await it.
 *
 * Run: node test/forum-decisions-persistence.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
        });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Clean brain state BEFORE requiring modules (load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const consensus = require(path.join(ROOT, 'lib', 'consensus'));

const STATE_FILE = path.join(ROOT, 'models', 'private', 'vant', 'state', 'forum.json');

// Fresh-process simulation: drop the cached forum + event modules so the
// re-require rebuilds the singleton and re-runs module-load hydration.
// Evicting event too kills the old singleton's decision-return listener.
function restartForum() {
    for (const m of ['lib/forum.js', 'lib/event.js', 'lib/state-store.js']) {
        delete require.cache[require.resolve(path.join(ROOT, m))];
    }
    return require(path.join(ROOT, 'lib', 'forum'));
}

async function main() {
    console.log('\n📜 FORUM DECISION PERSISTENCE TESTS (pass 44)\n');

    let topic = null;
    await test('decision return -> decision logged AND persisted to state/forum.json', async () => {
        const ledger = await consensus.create('p44-durable-topic', {
            options: ['yes', 'no'],
            minQuorum: 1,
            metadata: { proposal: 'Persist the decision feed', author: 'tester', viaForum: true }
        });
        assert(!ledger.error, 'ledger create failed: ' + (ledger.error || 'ok'));
        assert(ledger.metadata && ledger.metadata.viaForum, 'create dropped metadata (precondition)');
        topic = ledger.topic;

        const event = require(path.join(ROOT, 'lib', 'event'));
        const forum = require(path.join(ROOT, 'lib', 'forum')).forum;

        // The real path: consensus emits vote:consensus on quorum.
        event.emit('vote:consensus', { topic, winner: 'yes', votes: 1, percentage: '100.0' });

        assert(forum.decisions.length === 1, 'decision not logged in memory');
        assert(forum.decisions[0].proposal === 'Persist the decision feed', 'proposal missing on record');
        assert(fs.existsSync(STATE_FILE), 'state/forum.json not written');
        const onDisk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        assert(Array.isArray(onDisk.decisions) && onDisk.decisions.length === 1, 'file missing the decision');
        assert(onDisk.decisions[0].topic === topic, 'file decision has wrong topic');
    });

    await test('restart: fresh module load hydrates the decision history back', async () => {
        const forumMod2 = restartForum();
        const forum2 = forumMod2.forum;

        assert(forum2.decisions.length === 1, 'decision history not hydrated after restart');
        const d = forum2.decisions[0];
        assert(d.topic === topic, 'hydrated decision has wrong topic');
        assert(d.proposal === 'Persist the decision feed', 'hydrated proposal lost (pass-43 metadata stamp broken?)');
        assert(d.author === 'tester', 'hydrated author lost');
        assert(d.winner === 'yes' && d.percentage === '100.0', 'hydrated outcome fields lost');
    });

    await test('FIFO cap: decision log stays bounded (max 200)', async () => {
        const { forum: forum3 } = restartForum();
        const event3 = require(path.join(ROOT, 'lib', 'event'));
        // No ledgers for these — bare emissions prove the cap, not the metadata path.
        for (let i = 0; i < 210; i++) {
            event3.emit('vote:consensus', { topic: 'p44-cap-' + i, winner: 'yes', votes: 1, percentage: '100.0' });
        }
        assert(forum3.decisions.length === 200, 'cap not enforced: length ' + forum3.decisions.length);
        // Oldest 11 spliced off (1 hydrated + cap-0..9); cap-10 is the new head.
        assert(forum3.decisions[0].topic === 'p44-cap-10', 'FIFO dropped the wrong end: ' + forum3.decisions[0].topic);
        const onDisk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        assert(onDisk.decisions.length === 200, 'persisted log unbounded: ' + onDisk.decisions.length);
    });

    await test('clearState seam wipes log + file (consensus/market parity)', async () => {
        const forumMod4 = restartForum();
        assert(forumMod4.forum.decisions.length === 200, 'precondition: hydrated log present');
        forumMod4.clearState();
        assert(forumMod4.forum.decisions.length === 0, 'clearState left decisions in memory');
        assert(!fs.existsSync(STATE_FILE), 'clearState left the state file on disk');
    });

    console.log(`\n=== Forum decision persistence: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
