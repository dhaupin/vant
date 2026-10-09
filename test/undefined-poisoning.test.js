#!/usr/bin/env node
/**
 * Undefined-poisoning pins (live-fire pass 178 regression class).
 *
 * THE BUG CLASS: a protocol-state payload (consensus ledgers, market
 * listings, trust scores, ...) that contains an explicit `undefined`
 * value serializes FINE through JSON.stringify (the key is silently
 * dropped from the file) but POISONS the tree tier: canonical.encode
 * refuses undefined → persist/persistMerged throws → the write dies,
 * the .state-anchor.jsonl row never lands, and `verifyStateRoot` reads
 * 'never anchored'. Two consumers shipped with this bug (consensus
 * `deposit`, market `_reserved`/`summary`) and the tier looked broken
 * exactly the way you'd expect: file on disk correct, anchor missing.
 *
 * Pinned at BOTH levels so a re-introduction fails either gate:
 *   1. PRIMITIVE: toTree must refuse an undefined-bearing payload
 *      LOUDLY (coded error) — silent tier rot is what let this class
 *      ship in two consumers.
 *   2. CONSUMER: consensus.create/vote (minimal options bag, the exact
 *      shape that shipped the bug) persist + anchor + round-trip via
 *      the tier. Async awaited — consensus mutators run under the
 *      topic-lock mutex which wraps results in a promise.
 *   3. HYGIENE: null / 0 are legal tier values; undefined never is.
 *
 * Exit code is the verdict, per house test conventions.
 */
'use strict';
const assert = require('assert');

let passed = 0, failed = 0;
async function testAsync(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + (e && e.message ? ' — ' + e.message : '')); }
}

const stateStore = require('../lib/state-store');

function withBrain(name, fn) {
    const prev = process.env.VANT_BRAIN;
    process.env.VANT_BRAIN = name;
    return Promise.resolve().then(fn).finally(() => {
        if (prev === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prev;
    });
}

// Unique per-process topic/voter: the consumer pins must be rerunnable
// against a warm brain — hasVoted (one vote per agent) makes a reused
// pair a silent no-op, which once faked a failure in this very pin.
const runId = Date.now().toString(36);

(async () => {
    console.log('\n▓ UNDEFINED-POISONING PINS (consensus deposit, market _reserved class)\n');

    await testAsync('primitive: toTree refuses an undefined value with a coded, loud error', async () => {
        try {
            stateStore.toTree('probe', { ok: 1, badField: undefined });
            throw new Error('toTree accepted an undefined value silently');
        } catch (e) {
            assert.ok(/unsupported value type undefined/.test(e.message),
                'expected the canonical undefined complaint, got: ' + e.message);
            assert.ok(e.code, 'coded error required, got code=' + e.code);
        }
    });

    await testAsync('primitive: JSON.stringify DROPS undefined keys — the exact mechanism that hid the class', async () => {
        const payload = { a: 1, poison: undefined };
        const back = JSON.parse(JSON.stringify(payload));
        assert.ok(!('poison' in back), 'undefined key survived stringify (cover-up gone)');
        assert.strictEqual(back.a, 1);
        // The tree tier is NOT stringify: it sees the undefined → throws.
        // That asymmetry IS the bug class. This pin documents the asymmetry.
    });

    await testAsync('consensus.create (minimal options bag) persists AND anchors', () =>
        withBrain('up-def-pin', async () => {
            const cons = require('../lib/consensus');
            const topic = 'pin-min-' + runId;
            const r = await cons.create(topic, { ballot: ['a', 'b'], minQuorum: 1, requireRegistry: false });
            assert.ok(r && !r.error, 'create refused unexpectedly: ' + JSON.stringify(r));
            const file = 'state/consensus.json';
            const tier = stateStore.treeFor(file);
            assert.strictEqual(tier.state, 'PRESENT', 'tree tier must see the ledger: ' + JSON.stringify(tier).slice(0, 120));
            const v = stateStore.verifyStateRoot(file);
            assert.strictEqual(v.ok, true, 'ledger must verify against its own anchor: ' + JSON.stringify(v).slice(0, 160));
        }));

    await testAsync('vote WITHOUT a deposit persists — no undefined rider, anchor tracks the post-vote root', () =>
        withBrain('up-def-pin', async () => {
            const cons = require('../lib/consensus');
            const topic = 'pin-vote-' + runId;
            const voter = 'pin-voter-' + runId;
            const r = await cons.create(topic, { ballot: ['a', 'b'], minQuorum: 1, requireRegistry: false });
            assert.ok(r && !r.error, 'create refused unexpectedly: ' + JSON.stringify(r));
            const v = await cons.vote(topic, 'a', voter);
            assert.ok(v && !v.error, 'vote refused unexpectedly: ' + JSON.stringify(v));
            const d = stateStore.fromTree('consensus', stateStore.treeFor('state/consensus.json').tree);
            const led = (d.ledgers || []).find(l => l.topic === topic);
            assert.ok(led, 'voted ledger missing from tier after vote');
            assert.ok(led.votes[voter], 'vote record missing: ' + JSON.stringify(led.votes).slice(0, 120));
            assert.ok(!('deposit' in led.votes[voter]) || led.votes[voter].deposit !== undefined,
                'undefined deposit rider persisted — the exact regression');
            const v2 = stateStore.verifyStateRoot('state/consensus.json');
            assert.strictEqual(v2.ok, true, 'anchor must track the post-vote root: ' + JSON.stringify(v2).slice(0, 160));
        }));

    await testAsync('vote WITH a staked deposit (0 and explicit number) persists both', () =>
        withBrain('up-def-pin', async () => {
            const cons = require('../lib/consensus');
            const topic = 'pin-dep-' + runId;
            await cons.create(topic, { ballot: ['a', 'b'], minQuorum: 1, requireRegistry: false });
            const v = await cons.vote(topic, 'a', 'pin-dep-v-' + runId, { deposit: 0 });
            assert.ok(v && !v.error, 'staked-0 vote refused unexpectedly: ' + JSON.stringify(v));
            const d = stateStore.fromTree('consensus', stateStore.treeFor('state/consensus.json').tree);
            const led = (d.ledgers || []).find(l => l.topic === topic);
            assert.strictEqual(led.votes['pin-dep-v-' + runId].deposit, 0, 'explicit 0 must survive the tier');
        }));

    await testAsync('hygiene: null and 0 are legal tier values, undefined never is', async () => {
        const ok = stateStore.toTree('probe', { zeroDeposit: 0, nullWhitelist: null, nested: { a: [1, { b: null }] } });
        assert.ok(typeof ok.rootHash() === 'string' && ok.rootHash().length >= 32,
            'hygiene-legal payload must hash cleanly');
        try {
            stateStore.toTree('probe2', { badField: undefined });
            throw new Error('undefined accepted — pin regression');
        } catch (e) {
            assert.ok(/unsupported value type undefined/.test(e.message));
        }
    });

    console.log('\n  Undefined-poisoning pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
    process.exit(0);
})().catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
