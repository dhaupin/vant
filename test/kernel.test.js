#!/usr/bin/env node
/**
 * K2 — the invariant test suite for the vant kernel seed (lib/kernel.js).
 *
 * Per labs/prd-kernel.md and vant#250's same-pass law: this suite and the
 * prove-the-verbs conformance pack (packs/public/vant-kernel/) attack the
 * SAME surface and MUST land together, or the pins and the pack fork.
 * Where the pack proves the invariants adversarially (typed refusals +
 * journaled refusal entries, adopter-facing), THIS suite pins them
 * exactly (regression-facing): every invariant row, the gate return
 * shape, the refusal codes, and the journal entry shapes.
 *
 * Isolation per test group uses the exported TEST-ONLY _unwind() seam
 * (scratch-brain posture; the K4 harness consumer replaces it with real
 * retire semantics later, labs/prd-kernel.md §4).
 *
 * Run: node test/kernel.test.js   (also picked up by test/run-all.js)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function check(name, ok, detail) {
    if (ok) {
        results.passed++;
        console.log(`  ✓ ${name}`);
    } else {
        results.failed++;
        console.log(`  ✗ ${name}: ${detail || 'assertion failed'}`);
    }
}

function expectRefusal(name, fn, expectedCode, expectedVerb) {
    const before = kernel.journal().length;
    let err = null;
    try {
        fn();
    } catch (e) {
        err = e;
    }
    check(`${name}: refused`, !!err, err ? undefined : 'no error thrown (silent success)');
    if (!err) return;
    check(`${name}: typed (KernelError with code)`, err instanceof kernel.KernelError && err.code === expectedCode, `got ${err.name}: ${err.code || err.message}`);
    const delta = kernel.journal().slice(before);
    const refusal = delta.find((j) => j.kind === 'refusal' && j.detail && j.detail.code === expectedCode);
    check(`${name}: refuse journaled itself`, !!refusal, 'no typed refusal entry in the journal delta');
    if (refusal && expectedVerb !== undefined) {
        check(`${name}: refusal entry names verb+consumer`, refusal.verb === expectedVerb && refusal.consumer === 'k2-probe', `verb=${refusal.verb} consumer=${refusal.consumer}`);
    }
}

console.log('\\n⚙️ K2 — KERNEL INVARIANT PINS\\n');

// ---------------------------------------------------------------------------
// Group 0: module shape (the seed's exported contract)
// ---------------------------------------------------------------------------
kernel._unwind();

check('module loads with the exported contract', !!(kernel.VERBS && kernel.KernelError && kernel.register && kernel.census && kernel.gate && kernel.journal && kernel.time && kernel._unwind), 'missing export');

check('verb vocabulary is the locked four, frozen', JSON.stringify([...kernel.VERBS]) === JSON.stringify(['census', 'attest', 'retire', 'succeed']) && Object.isFrozen(kernel.VERBS), JSON.stringify([...kernel.VERBS]));

check('kernel time starts at genesis', kernel.time().seq === 0 && kernel.time().epoch === 'journal', JSON.stringify(kernel.time()));

// ---------------------------------------------------------------------------
// Group 1: the registry (registration honesty)
// ---------------------------------------------------------------------------
kernel._unwind();

let refused = null;
try {
    kernel.register({ name: 'k2-probe', scope: 'k2', verbs: { census: () => [] } });
} catch (e) { refused = e; }
check('register works', !refused, refused && refused.message);

try {
    kernel.register({ name: 'k2-probe', scope: 'k2', verbs: {} });
    check('duplicate register refuses typed', false, 'silent success');
} catch (e) {
    check('duplicate register refuses typed', e instanceof kernel.KernelError && e.code === 'E_DUPLICATE_NAME', e.code || e.message);
}

try {
    kernel.register({ name: 'k2-bad-verb', scope: 'k2', verbs: { nap: () => {} } });
    check('unknown verb refuses at registration', false, 'silent success');
} catch (e) {
    check('unknown verb refuses at registration', e instanceof kernel.KernelError && e.code === 'E_UNKNOWN_VERB', e.code || e.message);
}

try {
    kernel.register({ name: 'k2-bad-fn', scope: 'k2', verbs: { census: 'not-a-function' } });
    check('non-function verb refuses at registration', false, 'silent success');
} catch (e) {
    check('non-function verb refuses at registration', e instanceof kernel.KernelError && e.code === 'E_BAD_VERB', e.code || e.message);
}

const snap = kernel.census();
const probe = snap.consumers.find((c) => c.name === 'k2-probe');
check('census lists the registered consumer', !!probe, 'not listed');
check('census computes the missing-verb gap (invariant 3)', probe && JSON.stringify(probe.missingVerbs) === JSON.stringify(['attest', 'retire', 'succeed']), probe && JSON.stringify(probe.missingVerbs));

// ---------------------------------------------------------------------------
// Group 2: gate-level refusals (unknown verb / unknown consumer)
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: { census: () => [] } });

expectRefusal('unknown verb at the gate', () => kernel.gate('nap', 'k2-probe', {}), 'E_UNKNOWN_VERB', 'nap');
expectRefusal('unknown consumer at the gate', () => kernel.gate('census', 'not-registered', {}), 'E_UNKNOWN_CONSUMER');
expectRefusal('unimplemented verb at the gate', () => kernel.gate('attest', 'k2-probe', {}), 'E_UNREGISTERED_VERB');

// ---------------------------------------------------------------------------
// Group 3: census shape (invariant 3 + E_BAD_CENSUS)
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: {
    census: () => ({ notAnArray: true }) } });

let badCensusErr = null;
const beforeBadCensus = kernel.journal().length;
try {
    kernel.gate('census', 'k2-probe', {});
    check('census with a non-array listing refuses typed', false, 'silent success — E_BAD_CENSUS never fired');
} catch (e) {
    badCensusErr = e;
    check('census with a non-array listing refuses typed', badCensusErr instanceof kernel.KernelError && badCensusErr.code === 'E_BAD_CENSUS', `${badCensusErr.name}: ${badCensusErr.code || badCensusErr.message}`);
}
const badLedger = kernel.journal().slice(beforeBadCensus).filter((j) => j.kind === 'refusal');
check('E_BAD_CENSUS journaled a refusal entry', badLedger.length >= 1 && badLedger[0].detail.code === 'E_BAD_CENSUS', JSON.stringify(badLedger[0] || {}));

// a fresh consumer with a LAWFUL listing passes and returns an array
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: { census: () => [{ id: 'row-1', at: kernel.journal().length }] } });
const goodCensus = kernel.gate('census', 'k2-probe', {});
check('census with a lawful listing passes', !!(goodCensus && goodCensus.ok && Array.isArray(goodCensus.result)), 'lawful census refused');
const censusEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'census').pop();
check('census journaled with a count', censusEntry && censusEntry.detail.count === 1, JSON.stringify(censusEntry && censusEntry.detail));

// ---------------------------------------------------------------------------
// Group 4: attest + the dated-basis invariant (invariant 2)
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: { census: () => [{ id: 'row-1', at: 1 }], attest: () => ({ claimed: true }) } });

expectRefusal('attest without a claim refuses', () => kernel.gate('attest', 'k2-probe', { basis: { at: kernel.journal().length } }), 'E_NO_CLAIM');
expectRefusal('attest without a dated basis refuses (invariant 2)', () => kernel.gate('attest', 'k2-probe', { claim: 'c' }), 'E_NO_DATE');
expectRefusal('attest with a zero-dated basis refuses', () => kernel.gate('attest', 'k2-probe', { claim: 'c', basis: { at: 0 } }), 'E_NO_DATE');
expectRefusal('attest with a future-dated basis refuses', () => kernel.gate('attest', 'k2-probe', { claim: 'c', basis: { at: kernel.journal().length + 99 } }), 'E_NO_DATE');

const okAttest = kernel.gate('attest', 'k2-probe', { claim: 'status:200', basis: { at: kernel.journal().length } });
check('attest with a dated basis passes', !!(okAttest && okAttest.ok), 'gate refused a lawful attest');
check('attest gate result carries the shape { ok, verb, consumer, result, time }', okAttest && okAttest.verb === 'attest' && okAttest.consumer === 'k2-probe' && typeof okAttest.time.seq === 'number', okAttest && JSON.stringify(Object.keys(okAttest)));
const attestEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'attest').pop();
check('attest journaled with claim + basisAt', attestEntry && attestEntry.detail.claim === 'status:200' && typeof attestEntry.detail.basisAt === 'number', JSON.stringify(attestEntry && attestEntry.detail));

// ---------------------------------------------------------------------------
// Group 5: retire + the census-invariant (invariant 1)
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: {
    census: () => [{ id: 'row-1', at: kernel.journal().length }, { id: 'row-2', at: kernel.journal().length }],
    retire: () => ({ tide: true }) } });

const census = kernel.gate('census', 'k2-probe', {});
check('census passes and returns the listing', Array.isArray(census.result) && census.result.length === 2, 'listing shape wrong');

expectRefusal('retire without a census receipt refuses (invariant 1)', () => kernel.gate('retire', 'k2-probe', { ids: ['row-1'], reason: 'tide' }), 'E_NO_CENSUS');
expectRefusal('retire with an unlisted id refuses', () => kernel.gate('retire', 'k2-probe', {
    census: [{ id: 'row-1', at: kernel.journal().length }], ids: ['row-7'], reason: 'tide' }), 'E_UNLISTED_RETIRE');
expectRefusal('retire without a reason refuses', () => kernel.gate('retire', 'k2-probe', {
    census: [{ id: 'row-1', at: kernel.journal().length }], ids: ['row-1'] }), 'E_NO_REASON');

const okRetire = kernel.gate('retire', 'k2-probe', {
    census: [{ id: 'row-1', at: kernel.journal().length }, { id: 'row-2', at: kernel.journal().length }],
    ids: ['row-1', 'row-2'], reason: 'tide' });
check('retire with a listed census receipt passes', !!(okRetire && okRetire.ok), 'lawful retire refused');
const retireEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'retire').pop();
check('retire journal entry carries ids + reason', retireEntry && JSON.stringify(retireEntry.detail.ids) === JSON.stringify(['row-1', 'row-2']) && retireEntry.detail.reason === 'tide', JSON.stringify(retireEntry && retireEntry.detail));

// ---------------------------------------------------------------------------
// Group 6: succeed + the attest-chain invariant
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: {
    census: () => [{ id: 'row-1', at: kernel.journal().length }],
    attest: () => ({}),
    succeed: () => ({ crossed: true }) } });

expectRefusal('succeed without a boundary refuses', () => kernel.gate('succeed', 'k2-probe', { attestChain: [kernel.journal().length] }), 'E_NO_BOUNDARY');
expectRefusal('succeed without an empty attest chain refuses', () => kernel.gate('succeed', 'k2-probe', { boundary: 'session', attestChain: [] }), 'E_NO_ATTEST_CHAIN');
expectRefusal('succeed with a garbage chain refuses', () => kernel.gate('succeed', 'k2-probe', { boundary: 'session', attestChain: [0, 'x'] }), 'E_NO_ATTEST_CHAIN');

const col = kernel.gate('census', 'k2-probe', {});
const att = kernel.gate('attest', 'k2-probe', { claim: 'c', basis: { at: col.time.seq } });
const okSucceed = kernel.gate('succeed', 'k2-probe', { boundary: 'session', attestChain: [col.time.seq, att.time.seq] });
check('succeed with a verifiable chain passes', !!(okSucceed && okSucceed.ok), 'lawful succeed refused');
const succeedEntry = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'succeed').pop();
check('succeed journal entry carries boundary + chain', succeedEntry && succeedEntry.detail.boundary === 'session' && JSON.stringify(succeedEntry.detail.attestChain) === JSON.stringify([col.time.seq, att.time.seq]), JSON.stringify(succeedEntry && succeedEntry.detail));

// ---------------------------------------------------------------------------
// Group 7: consumer failures are also typed + journaled (invariant 4)
// ---------------------------------------------------------------------------
kernel._unwind();
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: {
    census: () => { throw new Error('storage is gone'); } } });

expectRefusal('consumer-fn failure refuses typed (E_CONSUMER_REFUSED)', () => kernel.gate('census', 'k2-probe', {}), 'E_CONSUMER_REFUSED');
const consumerRefusal = kernel.journal().filter((j) => j.kind === 'refusal').pop();
check('consumer-failure refusal carries the underlying error', consumerRefusal && consumerRefusal.detail && String(consumerRefusal.detail.error || '').includes('storage is gone'), JSON.stringify(consumerRefusal && consumerRefusal.detail));

// ---------------------------------------------------------------------------
// Group 8: kernel time (position + content hash, never wall clock)
// ---------------------------------------------------------------------------
kernel._unwind();
const seq0 = kernel.time().seq;
kernel.register({ name: 'k2-probe', scope: 'k2', verbs: { census: () => [] } });
kernel.gate('census', 'k2-probe', {});
const t = kernel.time();
// after _unwind(): register appends 1, the census gate appends 1 — floor is 2
check('kernel time advances with the journal', seq0 === 0 && t.seq === kernel.journal().length && kernel.journal().length >= 2, `seq0=${seq0} t=${JSON.stringify(t)} len=${kernel.journal().length}`);
check('kernel time hash is the content hash of the live edge', typeof t.hash === 'string' && /^[0-9a-f]{64}$/.test(t.hash), 'malformed hash');
const top = kernel.journal()[kernel.journal().length - 1];
check('time() matches the top journal entry', t.seq === top.seq && t.hash === top.time.hash, 'time/journal drift');
check('no entry carries a kernel-stamped wall clock', kernel.journal().every((j) => j.wallClock === undefined), 'wall clock entered without a caller');

// ---------------------------------------------------------------------------

console.log('');
console.log(`  ${results.passed} passed, ${results.failed} failed${results.skipped ? `, ${results.skipped} skipped` : ''}`);
process.exit(results.failed ? 1 : 0);
