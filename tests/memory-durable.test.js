#!/usr/bin/env node
/**
 * Memory STANDING pins (wave A, vant#336).
 *
 * The durable state class: `durable: true` pins a row against every
 * read-time sweep (expiresAt is dropped); the ONLY release is an explicit
 * forget() — which for a durable row REQUIRES a receipt. Standing never
 * silently downgrades (a default TTL overwrite of a durable row refuses).
 * Tombstone receipts: forget(res receipt) stamps the residue with
 * { reason, reference?, at, by }. Multi-writer declaration:
 * multiWriter:true records contested-by-construction, surfaced on every
 * envelope read, never adjudicated.
 *
 * DISCRIMINATING: stashing the lib/memory.js + lib/error.js fixes flips
 * the finding-shaped pins (verified; see the run below).
 */

const results = { passed: 0, failed: 0, tests: [] };
const _asyncTests = [];

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

function assertCode(fn, code, msg) {
    try {
        fn();
        throw new Error(msg || 'expected a typed refusal, got none');
    } catch (e) {
        assert(e && e.code === code, `expected ${code}, got ${e ? e.code || e.message : String(e)}`);
    }
    return true;
}

async function asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

asyncTest('durable: a pinned row survives past any TTL window AND a cold read (no cache), while a TTL control decays', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('standing:' + s, { body: 'hold #4421 live' }, { durable: true, fresh: true });
    const ctlKey = 'session:' + s;
    await m.state(ctlKey, 'transient', { ttl: 40, fresh: true });
    await sleep(60);
    const ctl = await m.recall(ctlKey, { fresh: true });
    assert(ctl === undefined, 'TTL control did not decay (expiry read is broken?): ' + JSON.stringify(ctl));
    const standing = await m.recall('standing:' + s, { fresh: true });
    assert(standing && standing.body === 'hold #4421 live', 'durable row did not survive the TTL window: ' + JSON.stringify(standing));
    const env = await m.recall('standing:' + s, { fresh: true, envelope: true });
    assert(env.durable === true, 'envelope read lost the durable marker: ' + JSON.stringify(env));
    return true;
});

asyncTest('durable + ttl is a confused pin - typed refusal (MEMORY_INPUT_INVALID)', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    let caught = null;
    try {
        await m.state('standing:' + s, 'x', { durable: true, ttl: 1000 });
    } catch (e) { caught = e; }
    assert(caught && caught.code === 'MEMORY_INPUT_INVALID', 'expected MEMORY_INPUT_INVALID, got ' + (caught && caught.code));
    return true;
});

asyncTest('standing never silently downgrades: a default overwrite of a durable row refuses; durable:true re-assert passes', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('standing:' + s, { body: 'v1' }, { durable: true, fresh: true });
    let caught = null;
    try {
        await m.state('standing:' + s, { body: 'v2' }, { fresh: true });
    } catch (e) { caught = e; }
    assert(caught && caught.code === 'MEMORY_INPUT_INVALID', 'silent downgrade was allowed: ' + (caught && caught.code));
    await m.state('standing:' + s, { body: 'v2' }, { durable: true, fresh: true });
    const v2 = await m.recall('standing:' + s, { fresh: true });
    assert(v2 && v2.body === 'v2', 'durable re-assert did not replace the row: ' + JSON.stringify(v2));
    return true;
});

asyncTest('forget on durable standing without a receipt refuses (MEMORY_FORGET_RECEIPT_REQUIRED); with a receipt the residue explains itself', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('standing:' + s, { body: 'warrant', writers: ['court'] }, { durable: true, fresh: true });
    let caught = null;
    try {
        await m.forget('standing:' + s, { by: 'steward-7' });
    } catch (e) { caught = e; }
    assert(caught && caught.code === 'MEMORY_FORGET_RECEIPT_REQUIRED',
        'expected MEMORY_FORGET_RECEIPT_REQUIRED, got ' + (caught && caught.code));
    const f = await m.forget('standing:' + s, { by: 'steward-7', receipt: { reason: 'warrant executed, hold released', reference: 'warrant-4421' } });
    assert(f.deleted === true && f.receipt && f.receipt.reason === 'warrant executed, hold released'
        && f.receipt.reference === 'warrant-4421', 'forget did not carry the receipt: ' + JSON.stringify(f));
    const gone = await m.recall('standing:' + s, { fresh: true });
    assert(gone === undefined, 'recalled the forgotten standing: ' + JSON.stringify(gone));
    const tomb = await m.recall('standing:' + s, { fresh: true, envelope: true });
    assert(tomb.durable === true && tomb.receipt && tomb.receipt.reason && tomb.receipt.at && tomb.receipt.by === 'steward-7',
        'tombstone envelope lost its receipt/provenance: ' + JSON.stringify(tomb));
    return true;
});

asyncTest('receipt hygiene: non-object receipt, empty reason, and a bad reference all refuse typed', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('note:' + s, { body: 'x' }, { fresh: true, ttl: 600000 });
    const bad = async (receipt, why) => {
        let caught = null;
        try {
            await m.forget('note:' + s, { receipt });
        } catch (e) { caught = e; }
        assert(caught && caught.code === 'MEMORY_INPUT_INVALID', why + ': expected MEMORY_INPUT_INVALID, got ' + (caught && caught.code));
    };
    await bad('dropped it', 'string receipt accepted');
    await bad({}, 'empty reason accepted');
    await bad({ reason: 'ok', reference: 42 }, 'numeric reference accepted');
    return true;
});

asyncTest('multiWriter: the declaration records contested-by-construction; disjoint writers still flag a conflict; non-note rows refuse the flag', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('note:' + s, { body: 'first word', writers: ['alpha'] }, { multiWriter: true, fresh: true, ttl: 600000 });
    await m.state('note:' + s, { body: 'second word', writers: ['delta'] }, { fresh: true, ttl: 600000 });
    const env = await m.recall('note:' + s, { fresh: true, envelope: true });
    assert(env.multiWriter === true, 'envelope lost the multiWriter declaration: ' + JSON.stringify(env));
    assert(env.conflict && env.conflict.between && env.conflict.and,
        'disjoint writers did not flag a conflict: ' + JSON.stringify(env.conflict));
    let caught = null;
    try {
        await m.state('plain:' + s, 'not a note', { multiWriter: true });
    } catch (e) { caught = e; }
    assert(caught && caught.code === 'MEMORY_INPUT_INVALID', 'multiWriter on a plain value was accepted: ' + (caught && caught.code));
    return true;
});

asyncTest('controls: default TTL behavior unchanged; an ordinary forget needs no receipt and returns receipt:null', async () => {
    const m = require('../lib/memory');
    const s = stamp();
    await m.state('note:' + s, { body: 'ordinary' }, { fresh: true, ttl: 600000 });
    const f = await m.forget('note:' + s, { by: 'steward-7', ttl: 600000 });
    assert(f.deleted === true && f.receipt === null,
        'ordinary forget broke shape/receipt law: ' + JSON.stringify(f));
    const tomb = await m.recall('note:' + s, { fresh: true, envelope: true });
    assert(tomb.deleted === true && tomb.receipt === undefined,
        'ordinary tombstone must not grow a receipt: ' + JSON.stringify(tomb));
    return true;
});

(async () => {
    for (const { name, fn } of _asyncTests) {
        try {
            await fn();
            results.passed++;
            console.log(`  ✓ ${name}`);
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
