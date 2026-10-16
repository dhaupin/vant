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
            ballot: ['yes', 'no'],
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

    // ================================================================
    // (Wave U4 — prd-universe.md) Deliberation→Decision Records
    // U4.1 thread linkage; U4.3 roundtrip + no-orphans after restart
    // ================================================================

    let u4Thread = null, u4Topic = null;
    await test('U4.1: vote created on a thread links thread→topic durably', async () => {
        const forumMod = restartForum();
        const _eventMod = require(path.join(ROOT, 'lib', 'event'));
        const f = forumMod.forum;
        const v = await f.vote('Adopt the agora decision log', { thread: 'PUB-U4TEST01' });
        assert(v.voted === true, 'vote create failed: ' + JSON.stringify(v).slice(0, 120));
        u4Thread = 'PUB-U4TEST01';
        u4Topic = v.topic;
        assert(v.thread === u4Thread, 'vote result missing its thread');
        const links = f.listThreadLinks();
        const row = links.find(l => l.thread === u4Thread);
        assert(row, 'thread link not listed');
        assert(row.topic === u4Topic, 'link points at the wrong topic');
        const trailFile = path.join(ROOT, 'models', 'private', 'vant', 'state', 'forum-threads.json');
        assert(fs.existsSync(trailFile), 'links file not persisted');
        const disk = JSON.parse(fs.readFileSync(trailFile, 'utf8'));
        assert(disk.links && disk.links[u4Thread] && disk.links[u4Thread].topic === u4Topic, 'link not on disk');
    });

    await test('U4.3: decision → thread retains the linkage (roundtrip in-process)', async () => {
        const eventMod = require(path.join(ROOT, 'lib', 'event'));
        const f = require(path.join(ROOT, 'lib', 'forum')).forum;
        eventMod.emit('vote:consensus', { topic: u4Topic, winner: 'yes', votes: 2, percentage: '100.0' });
        const d = f.decisions.find(x => x.topic === u4Topic);
        assert(d, 'decision not logged');
        assert(d.thread === u4Thread, 'decision record does not carry its thread');
        const trail = f.threadDecisionTrail(u4Thread);
        assert(trail.ok === true, 'trail refused: ' + (trail.error || ''));
        assert(trail.topic === u4Topic, 'trail resolved wrong topic');
        assert(trail.decision && trail.decision.winner === 'yes', 'trail missing the decision outcome');
        assert(trail.proposal === 'Adopt the agora decision log', 'trail proposal lost');
    });

    await test('U4.3: no-orphans after restart — trail survives a fresh process', async () => {
        const forumMod2 = restartForum();
        const f2 = forumMod2.forum;
        // _openVotes died with the old process; the LINK must not have.
        const trail = f2.threadDecisionTrail(u4Thread);
        assert(trail.ok === true, 'post-restart trail refused: ' + (trail.error || ''));
        assert(trail.topic === u4Topic, 'post-restart link orphaned');
        const d2 = f2.decisions.find(x => x.topic === u4Topic);
        assert(d2, 'decision history lost on restart (pre-pass-44 regression)');
        assert(d2.thread === u4Thread, 'hydrated decision lost its thread field');
        // A thread with NO link still refuses typed (no silent empty trail).
        const orph = f2.threadDecisionTrail('PUB-NEVER-LINKED');
        assert(orph.ok === false && orph.code === 'E_FORUM_ABSENT', 'unlinked thread should refuse typed');
    });

    await test('U4.1 link FIFO cap: the links map stays bounded (max 500)', async () => {
        const forumMod = restartForum();
        const f = forumMod.forum;
        for (let i = 0; i < 520; i++) {
            const r = f.linkThreadToVote('PUB-CAP-' + i, 'topic-cap-' + i, { proposal: 'cap', author: 't' });
            assert(r.ok, 'link ' + i + ' refused');
        }
        const links = f.listThreadLinks();
        assert(links.length === 500, 'link cap not enforced: ' + links.length);
        assert(!links.find(l => l.thread === 'PUB-CAP-0'), 'FIFO dropped the wrong end');
        assert(links.find(l => l.thread === 'PUB-CAP-519'), 'newest link evicted');
        // hostile inputs typed
        assert(f.linkThreadToVote('', 't').ok === false, 'empty thread accepted');
        assert(f.threadDecisionTrail('').ok === false, 'empty trail thread accepted');
    });

    await test('QC-205 publications persist: publish → disk → fresh module load hydrates the board', async () => {
        const forumMod = restartForum();
        const f = forumMod.forum;
        const r = await f.publish('QC-205 durability', 'must survive restart');
        assert(r.published, 'publish refused: ' + JSON.stringify(r).slice(0, 120));
        const barcode = r.publication.id;
        assert(barcode && barcode.startsWith('PUB-'), 'no barcode: ' + barcode);

        const PUB_FILE = path.join(ROOT, 'models', 'private', 'vant', 'state', 'forum-publications.json');
        assert(fs.existsSync(PUB_FILE), 'forum-publications.json not written');
        const onDisk = JSON.parse(fs.readFileSync(PUB_FILE, 'utf8'));
        assert(onDisk.pubs && onDisk.pubs[barcode], 'file missing the publication');
        assert(onDisk.pubs[barcode].title === 'QC-205 durability', 'stored record lost its title');

        const forum2 = restartForum().forum;
        const got = await forum2.get(barcode);
        assert(got.found, 'publication NOT visible after restart (the evaporated-board bug)');
        assert(got.publication.title === 'QC-205 durability', 'hydrated title lost');
        assert(got.publication.content === 'must survive restart', 'hydrated content lost');
    });

    await test('QC-205 unpublish tombstone persists: restarted process still cannot see it', async () => {
        const forumMod = restartForum();
        const f = forumMod.forum;
        const r = await f.publish('QC-205 to be deleted', 'gone soon');
        assert(r.published, 'publish refused');
        const barcode = r.publication.id;

        const del = await f.unpublish(barcode);
        assert(del.unpublished, 'unpublish refused: ' + JSON.stringify(del));

        const forum2 = restartForum().forum;
        assert(!(await forum2.get(barcode)).found, 'tombstoned publication resurrected after restart');
        const listed = await forum2.list({});
        assert(!listed.publications.find(p => p.id === barcode), 'tombstone leaked into list');
    });

    await test('QC-205 publication FIFO cap: the board stays bounded (max 500)', async () => {
        const forumMod = restartForum();
        const f = forumMod.forum;
        for (let i = 0; i < 520; i++) {
            const r = await f.publish('cap-' + String(i).padStart(4, '0'), 'x'.repeat(8));
            assert(r.published, 'cap publish ' + i + ' refused');
        }
        const listed = await f.list({});
        assert(listed.publications.length === 500, 'pub cap not enforced: ' + listed.publications.length);
        assert(!listed.publications.find(p => p.title === 'cap-0000'), 'FIFO dropped the wrong end');
        assert(listed.publications.find(p => p.title === 'cap-0519'), 'newest publication evicted');
        const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'private', 'vant', 'state', 'forum-publications.json'), 'utf8'));
        assert(Object.keys(onDisk.pubs).length === 500, 'persisted board unbounded: ' + Object.keys(onDisk.pubs).length);
    });

    await test('U4 closeout: clearState wipes the links store too (ops parity)', async () => {
        const forumMod = restartForum();
        assert(forumMod.forum.listThreadLinks().length > 0, 'precondition: links present');
        forumMod.clearState();
        assert(forumMod.forum.listThreadLinks().length === 0, 'clearState left thread links');
        assert(!fs.existsSync(path.join(ROOT, 'models', 'private', 'vant', 'state', 'forum-threads.json')), 'clearState left forum-threads.json on disk');
    });

    console.log(`\n=== Forum decision persistence: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
