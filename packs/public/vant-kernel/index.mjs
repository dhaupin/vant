// packs/public/vant-kernel/index.mjs - prove-the-verbs conformance pack.
//
// Per labs/prd-kernel.md sec 6d #5 and vant#250: portability's strongest
// form is a conformance pack, not a spec doc. An adopter (or this repo's
// own suite) proves the kernel by running these shapes against THEIR
// kernel instance - typed refusals required, never raw crashes - reading
// nothing of ours first. Lands in the same pass as K2 (test/kernel.test.js)
// per the same-pass law in vant#250. K3 LANDED (2026-10-25): escrow registered
// as the reference consumer (census of budgets + attest of spend pairs, one
// row, smallest lift), so the pack now carries BOTH halves - the seed
// invariants PLUS the reference-consumer-witness adoption row - and has
// flipped from "proving the seed" to "proving adoption".
//
// Module shape contract (host-owned): ESM, default export carrying
// `name`, `description`, `attacks[]` - same as every pack in this fleet.
// Attacks are FACTORY-BUILT (closure-scoped names, no `this` dependency),
// so any runner may invoke `run` destructured or as a method.
//
// THE ONE LAW: zero sockets, zero wall clock. Every assertion is a pure
// function of the kernel's own return values and its journal (typed codes
// + entry shapes). Isolation has TWO honest paths, chosen per host:
//   1. the seed exports the TEST-ONLY _unwind() seam - when it exists,
//      each row resets to a clean journal first, so all positions are
//      identical every run (determinism across double-runs, and the pin
//      contract test suites rely on);
//   2. a foreign kernel without the seam exercises the no-reset path:
//      rows use unique consumer names, tolerate an already-registered
//      duplicate, and assert by journal-delta scans (never absolute
//      positions). Verdict records never carry absolute seq numbers in
//      their detail/evidence, so both paths are double-run stable.
// The pack NEVER refuses to run just because the seam is missing.
// Expected verdicts are ALL REFUSED (the defenses holding) - an EXPLOITED
// here means a raw crash escaped, an illegal verb succeeded, or a refusal
// went unjournaled. Honest per-row skips: absent kernel module =
// 'skipped: true' (house rule 5: honest absence, never a false positive).

const EXPECTED_CODES = {
    'retire-without-census': 'E_NO_CENSUS',
    'unlisted-retire': 'E_UNLISTED_RETIRE',
    'attest-without-dated-basis': 'E_NO_DATE',
    'succeed-without-attest-chain': 'E_NO_ATTEST_CHAIN',
    'missing-verb-gap-visible': 'E_UNREGISTERED_VERB',
};

// Host-declared module path resolves from the RUN ROOT (cwd), never
// pack-relative - same posture as vant-census's guard-throw-probe. Un-armed
// degrades to skipped-REFUSED (honest absence).
async function loadKernel(ctx) {
    const cfg = (ctx && ctx.config && ctx.config['vant-kernel']) || {};
    const { resolve } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const target = resolve(cfg.kernelModule || 'lib/kernel.js');
    try {
        return await import(pathToFileURL(target).href);
    } catch (_e) {
        return null; // caller degrades to skipped-REFUSED
    }
}

// all-verb dummy implementations pass the registration check; the rows
// then attack the INVARIANTS at the gate layer, not the dummy bodies.
const allVerbsFail = (detail) => ({
    census: () => [],
    attest: () => detail,
    retire: () => detail,
    succeed: () => detail,
});

// Typed-refusal probe: run fn(), catch, classify. Typed = coded error
// naming the norm (KernelError ships one; a foreign kernel keeps a coded
// class of its own) - raw engine crashes (TypeError/RangeError, no code)
// are NOT typed refusals under the house law. Journals are scanned by
// delta from the row's start position, never absolute indexes.
async function probeRefusal(kernel, fn) {
    const before = kernel.journal().length;
    let err = null;
    try {
        fn();
    } catch (e) {
        err = e;
    }
    if (!err) {
        return { typed: false, code: null, rawName: null, journalDelta: kernel.journal().length - before, journaledRefusal: null, silent: true };
    }
    const typed = typeof err.code === 'string' && /^E_/.test(err.code);
    const journalAfter = kernel.journal().slice(before);
    const journaledRefusal = journalAfter.find((j) => j.kind === 'refusal' && j.detail && j.detail.code) || null;
    return {
        typed,
        code: typed ? err.code : `${err.name}: ${err.message}`,
        rawName: typed ? null : err.name,
        journalDelta: journalAfter.length,
        journaledRefusal,
        silent: false,
    };
}

const refusedRecord = (detail, evidence) => ({ verdict: 'REFUSED', detail, tookRequests: 0, evidence });
const exploitedRecord = (detail, evidence) => ({ verdict: 'EXPLOITED', detail, tookRequests: 0, evidence });
const skipRecord = () => ({ verdict: 'REFUSED', skipped: true, detail: 'not armed: no kernel module resolved from the run root', tookRequests: 0 });

// Isolation path 1: the seed's TEST-ONLY unwind seam. Silent when absent
// (path 2 covers it). Re-registered duplicates are tolerated via
// ensureConsumer, so a double-run never trips the row.
function safeReset(kernel) {
    try {
        if (typeof kernel._unwind === 'function') kernel._unwind();
    } catch (_e) { /* path 2 still holds */ }
}

// Isolation path 2: register, but a coded duplicate refusal means the
// consumer is already on the roster from a previous run - which is FINE
// here (unique names per row make the shared consumer identical to the
// wanted shape). A raw re-throw propagates loudly.
function ensureConsumer(kernel, name, verbs) {
    try {
        kernel.register({ name, scope: 'conformance', verbs });
    } catch (e) {
        if (typeof e.code === 'string' && /^E_/.test(e.code) && e.code !== 'E_UNKNOWN_VERB' && e.code !== 'E_BAD_VERB') {
            return; // already registered by a previous run of this row
        }
        throw e;
    }
}

// Factory: closure-scoped name -> no `this` dependency in any runner.
function row(name, description, run) {
    return { name, description, run };
}

function requireCode(probe, expected) {
    if (probe.silent) return 'silent';
    if (!probe.typed) return `raw:${probe.rawName}`;
    if (probe.code !== expected) return `code:${probe.code}`;
    if (!probe.journaledRefusal) return 'unjournaled';
    return null; // defense held
}

const attacks = [
    row('retire-without-census',
        'no retire without a census entry naming what died (invariant 1) - illegal verb must be refused TYPED and journaled, never a raw crash',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-retire-no-census';
            safeReset(kernel);
            ensureConsumer(kernel, name, allVerbsFail({}));
            const probe = await probeRefusal(kernel, () => kernel.gate('retire', name, { ids: ['ghost'], reason: 'conformance: no census' }));
            const fail = requireCode(probe, EXPECTED_CODES['retire-without-census']);
            if (fail === 'silent') return exploitedRecord('retire without a census succeeded silently - invariant 1 has no teeth', { rows: 'silent' });
            if (fail && fail.startsWith('raw:')) return exploitedRecord(`retire without a census escaped as a raw crash (${fail.slice(4)}) - typed refusal required`, { raw: fail.slice(4) });
            if (fail && fail.startsWith('code:')) return exploitedRecord(`retire refusal typed with wrong code ${fail.slice(5)} (expected ${EXPECTED_CODES['retire-without-census']}) - id space drifted`, { got: fail.slice(5) });
            if (fail === 'unjournaled') return exploitedRecord(`${probe.code} refused but the journal holds no refusal entry naming it - fail-closed went fail-silent (invariant 4)`, { delta: probe.journalDelta });
            return refusedRecord(`invariant 1 holds: ${probe.code} typed + journaled (journal delta ${probe.journalDelta})`, { code: probe.code });
        }),
    row('unlisted-retire',
        'retiring an id NOT listed in the census receipt is a finding, not background (invariant 1) - E_UNLISTED_RETIRE typed + journaled',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-unlisted-retire';
            safeReset(kernel);
            ensureConsumer(kernel, name, allVerbsFail({}));
            // A dated census seq: register() appended one journal entry, so
            // the journal's top edge at probe time IS that position - kernel
            // time from the journal, never a wall clock.
            const censusSeq = kernel.journal().length;
            const probe = await probeRefusal(kernel, () => kernel.gate('retire', name, {
                census: [{ id: 'listed-thing', at: censusSeq }],
                ids: ['unlisted-ghost'],
                reason: 'conformance: unlisted retire',
            }));
            const fail = requireCode(probe, EXPECTED_CODES['unlisted-retire']);
            if (fail === 'silent') return exploitedRecord('unlisted-id retire succeeded silently - an unlisted thing retired as background', { rows: 'silent' });
            if (fail && fail.startsWith('raw:')) return exploitedRecord(`unlisted retire escaped as raw crash (${fail.slice(4)}) - typed refusal required`, { raw: fail.slice(4) });
            if (fail && fail.startsWith('code:')) return exploitedRecord(`unlisted retire typed with wrong code ${fail.slice(5)} (expected ${EXPECTED_CODES['unlisted-retire']})`, { got: fail.slice(5) });
            if (fail === 'unjournaled') return exploitedRecord(`${probe.code} typed but unjournaled - invariant 4 gap`, { delta: probe.journalDelta });
            return refusedRecord(`unlisted-id retire refused: ${probe.code} typed + journaled (the ghost leaves a receipt naming it)`, { code: probe.code });
        }),
    row('attest-without-dated-basis',
        'no attest without a dated census entry behind it (invariant 2) - E_NO_DATE typed + journaled; a zero-dated basis must not pass',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-attest-no-basis';
            safeReset(kernel);
            ensureConsumer(kernel, name, allVerbsFail({}));
            const probe = await probeRefusal(kernel, () => kernel.gate('attest', name, { claim: 'conformance-claim', basis: { at: 0 } }));
            const fail = requireCode(probe, EXPECTED_CODES['attest-without-dated-basis']);
            if (fail === 'silent') return exploitedRecord('attest with a zero-dated basis succeeded silently - invariant 2 bypassed', { rows: 'silent' });
            if (fail && fail.startsWith('raw:')) return exploitedRecord(`zero-dated attest escaped raw (${fail.slice(4)})`, { raw: fail.slice(4) });
            if (fail && fail.startsWith('code:')) return exploitedRecord(`attest refusal typed with wrong code ${fail.slice(5)} (expected ${EXPECTED_CODES['attest-without-dated-basis']})`, { got: fail.slice(5) });
            if (fail === 'unjournaled') return exploitedRecord(`${probe.code} typed but unjournaled - invariant 4 gap`, { delta: probe.journalDelta });
            return refusedRecord(`invariant 2 holds: attest without a dated basis refused ${probe.code} typed + journaled`, { code: probe.code });
        }),
    row('succeed-without-attest-chain',
        'no succeed without the verifiable attest chain it inherits - E_NO_ATTEST_CHAIN typed + journaled; an empty chain must not pass',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-succeed-no-chain';
            safeReset(kernel);
            ensureConsumer(kernel, name, allVerbsFail({}));
            const probe = await probeRefusal(kernel, () => kernel.gate('succeed', name, { boundary: 'session', attestChain: [] }));
            const fail = requireCode(probe, EXPECTED_CODES['succeed-without-attest-chain']);
            if (fail === 'silent') return exploitedRecord('succeed with an empty attest chain succeeded silently - the boundary was crossed on nothing', { rows: 'silent' });
            if (fail && fail.startsWith('raw:')) return exploitedRecord(`empty-chain succeed escaped raw (${fail.slice(4)})`, { raw: fail.slice(4) });
            if (fail && fail.startsWith('code:')) return exploitedRecord(`succeed refusal typed with wrong code ${fail.slice(5)} (expected ${EXPECTED_CODES['succeed-without-attest-chain']})`, { got: fail.slice(5) });
            if (fail === 'unjournaled') return exploitedRecord(`${probe.code} typed but unjournaled - invariant 4 gap`, { delta: probe.journalDelta });
            return refusedRecord(`invariant: the chain gate holds - ${probe.code} typed + journaled`, { code: probe.code });
        }),
    row('refusals-journal-themselves',
        'invariant 4: every refusal is a typed journal entry (kind, verb, consumer, code) - fail-closed is never fail-silent',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-refusal-journal';
            safeReset(kernel);
            ensureConsumer(kernel, name, allVerbsFail({}));
            await probeRefusal(kernel, () => kernel.gate('unknown-verb', name, {}));
            const journal = kernel.journal();
            const refusal = journal.filter((j) => j.kind === 'refusal').pop();
            if (!refusal) {
                return exploitedRecord('gate refused the unknown verb but the journal carries NO refusal entry - fail-closed went fail-silent', { entries: journal.length });
            }
            const shapeOk = refusal.verb === 'unknown-verb'
                && refusal.consumer === name
                && refusal.detail && refusal.detail.code === 'E_UNKNOWN_VERB';
            if (!shapeOk) {
                return exploitedRecord(`refusal entry shape drifted: verb=${refusal.verb} consumer=${refusal.consumer} code=${refusal.detail && refusal.detail.code} - the clerk-of-the-record contract moved`, {
                    entry: { verb: refusal.verb, consumer: refusal.consumer, code: refusal.detail && refusal.detail.code },
                });
            }                return refusedRecord('invariant 4 holds: the unknown-verb refusal journaled itself (kind/verb/consumer/code all named)', { entry: { kind: refusal.kind, code: refusal.detail.code, hasConsumer: !!refusal.consumer, hasSeq: typeof refusal.seq === 'number' } });
        }),
    row('missing-verb-gap-visible',
        'invariant 3: missing verbs are census-visible gaps, never silent - a census-only consumer shows the gap, and gate() refuses it typed',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-missing-verb-gap';
            safeReset(kernel);
            ensureConsumer(kernel, name, { census: () => [] });
            const snapshot = kernel.census();
            const snap = snapshot.consumers.find((c) => c.name === name);
            if (!snap) return exploitedRecord('post-register census does not list the consumer - the registry and the census drifted', { consumers: snapshot.consumers.length });
            const gapOk = ['attest', 'retire', 'succeed'].every((v) => snap.missingVerbs.includes(v)) && snap.verbs.includes('census');
            if (!gapOk) {
                return exploitedRecord(`census gap drifted: verbs ${JSON.stringify(snap.verbs)} missingVerbs ${JSON.stringify(snap.missingVerbs)} - census-visible no more`, { row: snap });
            }
            const probe = await probeRefusal(kernel, () => kernel.gate('attest', name, { claim: 'x', basis: { at: kernel.journal().length } }));
            const fail = requireCode(probe, EXPECTED_CODES['missing-verb-gap-visible']);
            if (fail === 'silent') return exploitedRecord('gate() ran attest for a consumer that never implemented it - silent gap, invariant 3 dead', { rows: 'silent' });
            if (fail && fail.startsWith('raw:')) return exploitedRecord(`unregistered-verb gate escaped raw (${fail.slice(4)})`, { raw: fail.slice(4) });
            if (fail && fail.startsWith('code:')) return exploitedRecord(`gap refusal typed with wrong code ${fail.slice(5)} (expected ${EXPECTED_CODES['missing-verb-gap-visible']})`, { got: fail.slice(5) });
            return refusedRecord(`invariant 3 holds: the census gap is listed (missingVerbs ${JSON.stringify(snap.missingVerbs)}) AND gate() refuses it typed (${probe.code})`, { missingVerbs: snap.missingVerbs });
        }),
    row('reference-consumer-witness',
        'the adoption half (K3): an armed reference consumer must register through the gate (escrow: census of budgets + attest of spend pairs, retire/succeed as the census-visible gap) AND attest a real spend pair, dated, journaled - self-healing after an external reset',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            // The adoption module is HOST-ARMED (ctx.config['vant-kernel'].adoptionModule,
            // default lib/escrow.js from the run root). A foreign kernel instance with
            // no reference consumer ships none - honest skip, never a false positive.
            const cfg = (ctx && ctx.config && ctx.config['vant-kernel']) || {};
            if (cfg.adoptionModule === null) {
                return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no reference consumer on this kernel instance (adoptionModule: null)', tookRequests: 0 };
            }
            const { resolve } = await import('node:path');
            const { pathToFileURL } = await import('node:url');
            const target = resolve(cfg.adoptionModule || 'lib/escrow.js');
            let adopterNs;
            try {
                adopterNs = await import(pathToFileURL(target).href);
            } catch (_e) {
                return { verdict: 'REFUSED', skipped: true, detail: `not armed: no adoption module at ${cfg.adoptionModule || 'lib/escrow.js'} (foreign kernel - reference consumer skipped honestly)`, tookRequests: 0 };
            }
            // CJS-ESM interop: a CommonJS adoption module rides the namespace's
            // `default` export; a native-ESM adopter exposes its doors directly.
            const adopter = (adopterNs.default && (adopterNs.default.kernelWitnessStatus || adopterNs.default.kernelWitnessSpend)) ? adopterNs.default : adopterNs;
            if (typeof adopter.kernelWitnessStatus !== 'function' || typeof adopter.kernelWitnessSpend !== 'function') {
                return { verdict: 'REFUSED', skipped: true, detail: 'not armed: adoption module exports no kernelWitnessStatus/kernelWitnessSpend doors (adopters differ - census-visible absence, not a finding)', tookRequests: 0 };
            }

            // 1. Registration becomes VISIBLE (the pack's rows reset the kernel's
            // ...    registry via the seed's test-only seam; a live adopter must heal)
            safeReset(kernel);
            const status = adopter.kernelWitnessStatus();
            if (!status || status.registered !== true) {
                return exploitedRecord('the armed reference consumer did not (re-)register after the probe reset - adoption is registration, and this one vanished', { status });
            }
            if (JSON.stringify([...(status.verbs || [])].sort()) !== JSON.stringify(['attest', 'census'])) {
                return exploitedRecord(`reference consumer verbs drifted: [${(status.verbs || []).join(', ')}] - the §3 map wired census + attest first`, { verbs: status.verbs });
            }
            const gapOk = ['retire', 'succeed'].every((v) => (status.missingVerbs || []).includes(v));
            if (!gapOk) {
                return exploitedRecord(`census gap drifted: missingVerbs [${(status.missingVerbs || []).join(', ')}] - visible absence is the invariant; silent partial adoption is fraud`, { missingVerbs: status.missingVerbs });
            }
            const snapshot = kernel.census();
            const mine = snapshot.consumers.find((c) => c.name === 'escrow');
            if (!mine) {
                return exploitedRecord('kernel.census() does not list the registered reference consumer - registry and census drifted', { consumers: snapshot.consumers.length });
            }

            // 2. Spend pairs attest through the gate: dated, journaled, kernel-time
            const before = kernel.journal().length;
            const witness = adopter.kernelWitnessSpend('pack-pair-probe', 1);
            if (!witness || witness.witnessed !== true) {
                return exploitedRecord(`the reference consumer could not attest a lawful spend pair through the gate (${(witness && witness.code) || 'no result'})`, { witness });
            }
            const delta = kernel.journal().slice(before);
            const attest = delta.find((j) => j.kind === 'verb' && j.verb === 'attest');
            if (!attest) {
                return exploitedRecord('the spend pair attested but the journal holds no attest entry - the clerk stopped taking minutes', { delta: delta.length });
            }
            if (!attest.detail || !/^spend:pack-pair-probe:1$/.test(String(attest.detail.claim))) {
                return exploitedRecord(`attest claim drifted: ${attest.detail && attest.detail.claim} - the spend-pair identity moved`, { claim: attest.detail && attest.detail.claim });
            }
            if (typeof attest.detail.basisAt !== 'number' || attest.detail.basisAt < 1) {
                return exploitedRecord('attest carries no dated basis (invariant 2) - the kernel took an undated witness', { detail: attest.detail });
            }
            // 3. The self-heal leg: reset again, one more lawful pair must witness
            safeReset(kernel);
            const healed = adopter.kernelWitnessSpend('pack-pair-probe', 2);
            if (!healed || healed.witnessed !== true) {
                return exploitedRecord('the reference consumer lost adoption after a second reset - the self-heal path is fiction', { healed });
            }
            return refusedRecord('adoption proven: escrow registers through the gate (census+attest, gap self-named), spend pairs attest dated + journaled, self-heal holds after reset', { verbs: status.verbs, missingVerbs: status.missingVerbs });
        }),
    row('gate-happy-path',
        'the full verb chain census -> attest -> retire -> succeed must pass in this order, each leg ok with kernel time flowing, each leg journaled as a verb entry',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const name = 'probe-happy-path';
            const arm = { legit: 'surface' };
            safeReset(kernel);
            ensureConsumer(kernel, name, {
                census: () => [{ id: 'seed-row-1', at: kernel.journal().length }],
                attest: () => arm,
                retire: () => arm,
                succeed: () => arm,
            });
            const before = kernel.journal().length;
            const legs = [];
            try {
                const c = kernel.gate('census', name, {});
                if (!(c && c.ok && Array.isArray(c.result))) throw new Error('census leg not ok');
                legs.push(c);
                const a = kernel.gate('attest', name, { claim: 'conformance', basis: { at: legs[0].time.seq } });
                if (!(a && a.ok && a.time.seq > legs[0].time.seq)) throw new Error('attest leg not ok/time');
                legs.push(a);
                const r = kernel.gate('retire', name, { census: c.result, ids: ['seed-row-1'], reason: 'conformance: happy-path tide' });
                if (!(r && r.ok && r.time.seq > legs[1].time.seq)) throw new Error('retire leg not ok/time');
                legs.push(r);
                const s = kernel.gate('succeed', name, { boundary: 'session', attestChain: [legs[0].time.seq, legs[1].time.seq] });
                if (!(s && s.ok && s.time.seq > legs[2].time.seq)) throw new Error('succeed leg not ok/time');
                legs.push(s);
            } catch (e) {
                return exploitedRecord(`happy-path chain broke at leg ${legs.length + 1}: ${e.message} - a kernel that cannot carry its own lawful flow is not the kernel`, { legs: legs.length });
            }
            const verbEntries = kernel.journal().slice(before).filter((j) => j.kind === 'verb');
            const verbsLogged = verbEntries.map((j) => j.verb);
            const orderOk = verbsLogged.length === 4
                && verbsLogged[0] === 'census' && verbsLogged[1] === 'attest'
                && verbsLogged[2] === 'retire' && verbsLogged[3] === 'succeed';
            if (!orderOk) {
                return exploitedRecord(`journal is missing the verb entries: got [${verbsLogged.join(', ')}] - the clerk stopped taking minutes`, { verbsLogged });
            }
            return refusedRecord('the full chain holds: census -> attest -> retire -> succeed, four verb entries journaled in order', { verbsLogged });
        }),
    row('roster-adoption-witness',
        'the K6-K9 adoption roster (pipeline/prune/docs-gates/pass-log): each armed adopter census-carryes kernel-dated entries, is visible on kernel.census(), and self-heals after a probe reset - adoption GENERALIZES beyond the escrow reference consumer',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const cfg = (ctx && ctx.config && ctx.config['vant-kernel']) || {};
            if (cfg.rosterModules === null) {
                return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no adoption roster on this kernel instance (rosterModules: null)', tookRequests: 0 };
            }
            // Host-armable roster; the repo defaults resolve from the RUN ROOT.
            // Adopters differ (the §3 law), so each carries its own door shape.
            const roster = (
                cfg.rosterModules || [
                    { name: 'pipeline', path: 'lib/pipeline-kernel-witness.js', census: 'kernelCensusSteps', censusKey: 'steps' },
                    { name: 'prune', path: 'lib/prune.js', census: 'kernelCensusPrunable', censusKey: 'entries' },
                    { name: 'docs-gates', path: 'lib/kernel-ledger.js', census: 'docsGatesCensus', censusKey: 'entries' },
                    { name: 'pass-log', path: 'lib/pass-ledger.js', census: 'ledgerCensus', censusKey: null }, // pass-log census returns the entries array itself
                ]
            );
            const { resolve } = await import('node:path');
            const { pathToFileURL } = await import('node:url');
            const armed = [];
            for (const spec of roster) {
                try {
                    const ns = await import(pathToFileURL(resolve(spec.path)).href);
                    const mod = (ns && ns.default) ? ns.default : ns;
                    const fn = mod && mod[spec.census];
                    if (typeof fn === 'function') armed.push({ ...spec, fn });
                } catch (_e) { /* honest absence: a foreign run root ships fewer adopters */ }
            }
            if (armed.length === 0) {
                return { verdict: 'REFUSED', skipped: true, detail: `not armed: none of the roster modules resolved (${roster.map((r) => r.path).join(', ')})`, tookRequests: 0 };
            }

            safeReset(kernel);
            const problems = [];
            for (const adopter of armed) {
                const rows = adopter.fn();
                const entries = Array.isArray(rows) ? rows : (rows && rows[adopter.censusKey || 'entries']);
                if (!Array.isArray(entries) || !entries.every((e) => typeof e.id === 'string' && Number.isInteger(e.at) && e.at > 0)) {
                    problems.push(`${adopter.name}: census carry is not kernel-dated ${JSON.stringify(entries && entries[0]).slice(0, 60)}`);
                    continue;
                }
                const snap = kernel.census();
                if (!snap || !Array.isArray(snap.consumers) || !snap.consumers.some((c) => c.name === adopter.name)) {
                    problems.push(`${adopter.name}: invisible on kernel.census() after carrying dated entries - registry and census drifted`);
                }
                // The self-heal leg: reset, the next census must not be wedged
                safeReset(kernel);
                const healed = adopter.fn();
                const healedRows = Array.isArray(healed) ? healed : (healed && healed[adopter.censusKey || 'entries']);
                if (!Array.isArray(healedRows)) {
                    problems.push(`${adopter.name}: lost its census after the probe reset - self-heal is fiction`);
                }
            }
            safeReset(kernel);
            if (problems.length) {
                return exploitedRecord(`roster adoption drifted: ${problems.join(' | ')}`, { problems });
            }
            return refusedRecord(`adoption generalizes: ${armed.length} roster consumer(s) (${armed.map((a) => a.name).join(', ')}) carry kernel-dated census entries, stay visible on kernel.census(), and self-heal across resets`, { armed: armed.map((a) => a.name) });
        }),
    row('sudo-public-surface-census',
        'the sudo witness must enumerate through the PUBLIC surface only (listTasks/getGrants/getHealthChecks) - census carry is kernel-dated, succeed lands across ops with an elevation-audit boundary, and a census of an UNKNOWN consumer is refused typed, never raw',
        async (_harness, ctx) => {
            const kernel = await loadKernel(ctx);
            if (!kernel) return skipRecord();
            const cfg = (ctx && ctx.config && ctx.config['vant-kernel']) || {};
            if (cfg.sudoModule === null) {
                return { verdict: 'REFUSED', skipped: true, detail: 'not armed: no sudo witness on this kernel instance (sudoModule: null)', tookRequests: 0 };
            }
            const { resolve } = await import('node:path');
            const { pathToFileURL } = await import('node:url');
            let sudoNS;
            try {
                sudoNS = await import(pathToFileURL(resolve(cfg.sudoModule || 'lib/sudo-kernel-witness.js')).href);
            } catch (_e) {
                return { verdict: 'REFUSED', skipped: true, detail: `not armed: no sudo witness module at ${cfg.sudoModule || 'lib/sudo-kernel-witness.js'}`, tookRequests: 0 };
            }
            const sudoW = (sudoNS.default) ? sudoNS.default : sudoNS;
            if (typeof sudoW.sudoCensus !== 'function' || typeof sudoW.sudoWitnessSucceed !== 'function') {
                return { verdict: 'REFUSED', skipped: true, detail: 'not armed: sudo witness exports no sudoCensus/sudoWitnessSucceed doors (adopter differs - census-visible absence)', tookRequests: 0 };
            }
            safeReset(kernel);
            const census = sudoW.sudoCensus();
            if (!census || !Array.isArray(census.entries) || !census.entries.every((e) => typeof e.id === 'string' && Number.isInteger(e.at) && e.at > 0 && typeof e.kind === 'string')) {
                return exploitedRecord(`sudo census carry is not kernel-dated: ${JSON.stringify(census && census.entries && census.entries[0]).slice(0, 80)}`, { census: census && census.code });
            }
            // succeed across ops: elevation-audit boundary, typed result, journaled
            const before = kernel.journal().length;
            const witnessed = sudoW.sudoWitnessSucceed({ action: 'pack-probe-elevation', taskId: 'pack-task' });
            if (!witnessed || witnessed.witnessed !== true) {
                return exploitedRecord(`sudo succeed refused a lawful elevation witness (${(witnessed && witnessed.code) || 'no result'})`, { witnessed });
            }
            const delta = kernel.journal().slice(before);
            const succeedEntry = delta.find((j) => j.kind === 'verb' && j.verb === 'succeed');
            if (!succeedEntry) {
                return exploitedRecord('sudo succeed landed but the journal holds no succeed entry - the clerk stopped taking minutes', { delta: delta.length });
            }
            // unknown-consumer refuse: typed + journaled, never raw
            const probe = await probeRefusal(kernel, () => kernel.gate('census', 'no-such-sudo-adopter', {}));
            if (probe.silent) return exploitedRecord('gate() ran census for an UNKNOWN consumer - the roster is not the roster', { rows: 'silent' });
            if (!probe.typed) return exploitedRecord(`unknown-consumer census escaped as a raw crash (${probe.rawName}) - typed refusal required`, { raw: probe.rawName });
            return refusedRecord(`sudo witness holds: census enumerates public-surface-dated, succeed across ops lands + journaled (boundary elevation-audit), unknown consumers refuse typed (${probe.code})`, { entries: census.entries.length, code: probe.code });
        }),
];
export default {
    name: 'vant-kernel',
    description: 'Prove-the-verbs conformance rows: kernel invariants refuse TYPED with a journaled refusal entry, illegal verbs are census-visible gaps',
    attacks,
};
