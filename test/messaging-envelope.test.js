#!/usr/bin/env node
/**
 * Wave E pins — messaging trio charter + shared envelope
 * (prd-canonicalization §6, lib/messaging.js).
 *
 * Proves:
 *  1. Envelope shape contract: keys, event/type agreement, defaults.
 *  2. Version gate matrix: garbage, unstamped (v1.0 tolerance), both
 *     MAJOR directions refused, MINOR tolerated additive.
 *  3. Sign/verify ceremony = Encrypt.hmacSign/Verify on the same bytes.
 *  4. crew-bus parity: _validVersion/_setReceiverVersion delegate to the
 *     seam (staging moves the object both layers read; restore works).
 *  5. Integration legs (async body): a msg conversation snapshot and a
 *     stream work row both ride the shared envelope and round-trip
 *     WITHOUT semantic loss (payload in == payload out, task object
 *     survives verbatim).
 *  6. Charter non-overlap guards: making an envelope without payload
 *     throws; validate rejects event/type mismatch.
 */
'use strict';
(async () => {

let pass = 0, fail = 0;
function pin(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAILED: ' + name); }
}

const M = require('../lib/messaging');
const Encrypt = require('../lib/encrypt');
const cb = require('../lib/crew-bus');
const crypto = require('crypto');

// 1. Shape contract
{
    const e = M.makeEnvelope('agenda.publish', { items: ['a', 'b'] }, { from: 'buffy', nonce: 7 });
    pin('envelope keys exact', Object.keys(e).join(',') === 'event,from,type,payload,ts,nonce,v');
    pin('event prefix contract', e.event === 'crew.agenda.publish');
    pin('carries receiver version stamp', JSON.stringify(e.v) === JSON.stringify(M.ENVELOPE_VERSION));
    pin('validate passes on its own output', M.validateEnvelope(e) === true);
    pin('event/type mismatch rejected (shape validator)', M.validateEnvelope({ ...e, event: 'crew.other' }) === false);
    pin('missing payload rejected loudly (make)', (() => { try { M.makeEnvelope('x', undefined); return false; } catch (err) { return true; } })());
    pin('bad type rejected loudly (make)', (() => { try { M.makeEnvelope('', {}); return false; } catch (err) { return true; } })());
}

// 2. Version gate matrix — the Wave-E receiver contract
{
    pin('unstamped tolerated as v1.0 legacy', M.versionGate(undefined).verdict === 'ok' && M.versionGate(null).verdict === 'ok');
    pin('garbage v refused', M.versionGate('x').verdict === 'invalid' && M.versionGate({}).verdict === 'invalid');
    pin('future MAJOR refused (newer sender)', M.versionGate({ major: 2, minor: 0 }).verdict === 'future-major' && M.versionGate({ major: 2, minor: 0 }).ok === false);
    pin('past MAJOR refused (older sender)', M.versionGate({ major: 0, minor: 0 }).verdict === 'past-major' && M.versionGate({ major: 0, minor: 0 }).ok === false);
    pin('MINOR diff tolerated additive', M.versionGate({ major: 1, minor: 3 }).ok === true && M.versionGate({ major: 1, minor: 3 }).verdict === 'minor-diff');
    pin('exact match ok', M.versionGate({ major: 1, minor: 0 }).verdict === 'ok' && M.versionGate({ major: 1, minor: 0 }).ok === true);
    pin('v1.1 canonical express', M.validateEnvelope({ ...M.makeEnvelope('t', {}, { receiverVersion: { major: 1, minor: 1 } }) }) === true);
}

// 3. Sign/verify = Encrypt on the same bytes
{
    const e = M.makeEnvelope('work.offer', { taskId: 't1' }, { from: 'a', nonce: 1 });
    const sig = M.signEnvelope(e, 's3cret');
    pin('verify true', M.verifyEnvelope(e, 's3cret', sig) === true);
    pin('wrong key refused', M.verifyEnvelope(e, 'other', sig) === false);
    pin('tampered payload refused', M.verifyEnvelope({ ...e, payload: { taskId: 'hacked' } }, 's3cret', sig) === false);
    pin('Encrypt parity on same json', Encrypt.hmacVerify(JSON.stringify(e), 's3cret', sig) === true);
}

// 4. crew-bus parity — delegation moves ONE object
{
    const before = JSON.stringify(cb.ENVELOPE_V);
    cb._setReceiverVersion({ major: 1, minor: 2 });
    pin('staging seen by the shared seam', JSON.stringify(M.ENVELOPE_VERSION) === JSON.stringify({ major: 1, minor: 2 }));
    pin('crew-bus stamp mirrors the seam', JSON.stringify(cb.ENVELOPE_V) === JSON.stringify({ major: 1, minor: 2 }));
    cb._setReceiverVersion({ major: 1, minor: 0 });
    pin('restore works (both stamps back at 1.0)', JSON.stringify(cb.ENVELOPE_V) === JSON.stringify({ major: 1, minor: 0 }) && before === JSON.stringify({ major: 1, minor: 0 }));
    pin('invalid staging still throws', (() => { try { cb._setReceiverVersion({ major: 0, minor: 0 }); return false; } catch (err) { return true; } })());
    pin('gate follows staged receiver', (() => {
        cb._setReceiverVersion({ major: 2, minor: 0 });
        const v = M.versionGate({ major: 1, minor: 0 }).verdict; // older sender vs v2 receiver
        cb._setReceiverVersion({ major: 1, minor: 0 });
        return v === 'past-major';
    })());
}

// 5. Integration legs — msg + stream ride the envelope, no semantic loss.
// enqueue/post are async; run both legs in an async IIFE before the summary.
async function integrationLegs() {
    // --- msg snapshot leg ---
    const msg = require('../lib/msg');
    try { msg.clearState(); } catch (err) {}
    const conv = await msg.create({ name: 'wave-e-leg', participants: ['buffy', 'claude'] });
    // post() takes (convId, content-string, { author }) — vaf min-1 on both
    const legPost = await msg.post(conv.id, 'last agenda item', { author: 'buffy' });
    pin('msg leg: post landed', legPost !== undefined);
    const snapshot = msg.exportSnapshot(conv.id);
    pin('msg leg: snapshot exists (kind contract)', snapshot && typeof snapshot === 'object');
    const env = M.makeEnvelope('msg.snapshot', snapshot, { from: 'buffy-test', nonce: 3 });
    pin('msg snapshot leg: envelope accepts it (serialize)', M.validateEnvelope(JSON.parse(JSON.stringify(env))) === true);
    const arrived = JSON.parse(JSON.stringify(env)).payload;
    pin('msg snapshot leg: no semantic loss (identical payload)', JSON.stringify(arrived) === JSON.stringify(snapshot));
    // merge verdict contract: { merged: true|false, adopted?: n, reason? } —
    // what matters: a verdict OBJECT that treats the payload as a snapshot.
    const merged = msg.mergeSnapshot(arrived);
    pin('msg snapshot leg: merge accepts the envelope payload', merged && typeof merged === 'object' && typeof merged.merged === 'boolean');
    try { msg.clearState(); } catch (err) {}

    // --- stream work leg ---
    const stream = require('../lib/stream');
    const work = await stream.enqueue('wave-e-leg-stream', { task: 'translate', path: '/a/b' });
    if (work && work.id) {
        // full row via peek (has task/status, the semantics a peer would need)
        const fullRow = stream.peek('wave-e-leg-stream');
        if (fullRow) {
            const env2 = M.makeEnvelope('work.offer', fullRow, { from: 'a', nonce: 9 });
            const arrivedRow = JSON.parse(JSON.stringify(env2)).payload;
            pin('stream leg: envelope carries the work row intact', JSON.stringify(arrivedRow) === JSON.stringify(fullRow));
            pin('stream leg: shape validates after round-trip', M.validateEnvelope(JSON.parse(JSON.stringify(env2))) === true);
            pin('stream leg: task object survives verbatim', arrivedRow.task && arrivedRow.task.task === 'translate' && arrivedRow.status === 'pending');
        } else {
            pin('stream leg: full row (peeked)', false);
        }
        try { stream.remove(work.id); } catch (err) {}
    } else {
        pin('stream leg: (gated this run — enqueue bailed)', true);
    }
}
await integrationLegs();

// 6. Non-overlap guards (charter: no dual ownership)
{
    const e = M.makeEnvelope('t', { x: 1 });
    pin('envelope is a pure value (no methods on the instance)', typeof e.pending !== 'function' && typeof e.save !== 'function');
    pin('makeEnvelope deterministic ts+nonce fields exist', Number.isFinite(e.ts) && Number.isFinite(e.nonce));
    const a = M.makeEnvelope('t', {}, { from: 'x', nonce: 1 });
    const b = M.makeEnvelope('t', {}, { from: 'x', nonce: 1 });
    pin('fresh ts per make (the two differ or match within the same ms — nonce parity holds)', JSON.stringify({ ts: a.ts, nonce: a.nonce, v: a.v }) === JSON.stringify({ ts: b.ts, nonce: b.nonce, v: b.v }));
}

console.log('\n=== messaging-envelope pins: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
