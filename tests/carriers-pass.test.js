/**
 * Wave H (vant#341): the carriers pass — discriminating pins.
 *
 * Three asks, pinned: (§1) countersigned station records — carry() emits a
 * per-stage record row { who, templateRow, receiptRef, at, verdict }, a
 * refusal is countersigned typed too, and a template row may make its
 * record BINDING (record: 'required' — a route that skips it is not
 * built, exactly like a reordered stage); (§2) custom-code payload lanes —
 * gdscript and binary are DECLARED-ABSENT on the roster (the roster names
 * its own holes; encode/decode refuse typed until a runner exists — the
 * qr/png precedent verbatim); (§3) party routes — `by` accepts a peer set
 * (a pod): the hold rides the pod, the identity stays individual
 * (`actingBy` acts), the bill declares the hold WHOLE (pod↔pod, solo↔solo).
 *
 * Pre-fix check: pins marked FLIP fail against a lib/carriers.js reverted
 * to record-less / solo-only hold / roster-without-lanes variants.
 */

const assert = require('assert');
const travel = require('../lib/traveler');
const carriers = require('../lib/carriers');

let passed = 0;
let failed = 0;
const failedList = [];

async function pin(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (e) {
        failed++;
        failedList.push(name);
        console.log('  ✗ FAILED: ' + name + ' — ' + (e.message || e));
    }
}

function route(stations, template) {
    return carriers.carry(travel.mint({ to: 'station_alpha', from: 'origin_vant', body: { kind: 'lot', qty: 1 } }),
        template ? { stations, template } : { stations });
}

async function main() {

    // ---------------- §2 the declared-absent payload lanes -------------------

    await pin('FLIP: the roster names its payload holes — gdscript + binary declared, encode/decode refuse typed', () => {
        const lanes = carriers.list();
        const gd = lanes.find((l) => l.id === 'gdscript');
        const bin = lanes.find((l) => l.id === 'binary');
        assert.ok(gd && bin, 'both lanes on the roster');
        assert.strictEqual(gd.available, false);
        assert.strictEqual(gd.family, 'payload');
        assert.strictEqual(gd.carries, 'code-gdscript');
        assert.ok(/runner/i.test(gd.blocker), 'the blocker names the missing runner (nothing pretends)');
        assert.strictEqual(bin.family, 'payload');
        assert.strictEqual(bin.carries, 'payload-binary');
        // the refusal is typed, verbal and honest on every verb
        for (const lane of ['gdscript', 'binary']) {
            assert.throws(() => carriers.encode(travel.mint({ to: 'x', from: 'y', body: {} }), lane),
                (e) => e.code === 'E_CARRIER_CARRIER' && /runner|absent/i.test(e.message));
            assert.throws(() => carriers.get(lane).decode('AAAA'),
                (e) => e.code === 'E_CARRIER_CARRIER');
            assert.throws(() => carriers.get(lane).matches(travel.mint({ to: 'x', from: 'y', body: {} })),
                (e) => e.code === 'E_CARRIER_CARRIER');
        }
    });

    await pin('the roster stays honest BESIDE the new lanes (built-ins untouched, no over-reach)', () => {
        const lanes = carriers.list();
        assert.ok(lanes.some((l) => l.id === 'nsc9' && l.available));
        assert.ok(lanes.some((l) => l.id === 'stone' && l.available));
        assert.ok(lanes.some((l) => l.id === 'svg' && l.available));
        assert.ok(lanes.some((l) => l.id === 'json' && l.available));
        assert.ok(lanes.some((l) => l.id === 'qr' && l.available));
        assert.ok(lanes.some((l) => l.id === 'png' && !l.available), 'png still absent');
        void lanes;
    });

    // ---------------- §1 the countersigned station records -------------------

    await pin('FLIP: every landed stage is countersigned — { who, templateRow, receiptRef, at, verdict }', () => {
        const rep = route([{ by: 'dock_hand' }, { by: 'weigh_team', op: 'inspect' }]);
        assert.strictEqual(rep.ok, true);
        assert.strictEqual(rep.records.length, 2);
        const r1 = rep.records[0];
        assert.strictEqual(r1.who, 'dock_hand');                 // identity stays individual
        assert.ok(r1.templateRow && r1.templateRow.op === '*', 'the bill row mirror: undeclared op named as "*"');
        // the receipt anchors the SEED letter's root id: rootId:seq, unique per stage
        assert.ok(typeof r1.receiptRef === 'string' && /^[^:]+:[0-9]+$/.test(r1.receiptRef), 'the receipt is rootId:seq');
        assert.ok(rep.records.every((r) => r.receiptRef.split(':')[0] === r1.receiptRef.split(':')[0]), 'every ref names the same root letter');
        void rep.letter;
        assert.ok(Number.isFinite(r1.at), 'dated');
        assert.strictEqual(r1.verdict, 'pass');
    });

    await pin('FLIP: a refusal is countersigned typed (every refusal datable, mid-route too)', () => {
        // a privileged stage with no single-use approval refuses INSIDE the walk
        // (the RISK lane) — the refusal is mid-loop, so the record is the typed copy
        const rep = carriers.carry(
            travel.mint({ to: 'station_alpha', from: 'origin_vant', body: {} }),
            { stations: [{ by: 'dock_hand' }, { by: 'weigh_team', privileged: true }] });
        assert.strictEqual(rep.ok, false);
        assert.ok(rep.refused && rep.refused.code, 'typed refusal rides the report');
        assert.strictEqual(rep.refused.stage, 2, 'the refusal names its stage');
        const recRefused = rep.records.find((r) => r.stage === rep.refused.stage);
        assert.ok(recRefused, 'the refused stage has its own record row');
        assert.strictEqual(recRefused.verdict, rep.refused.code, 'the verdict IS the typed refusal');
        assert.strictEqual(rep.records.filter((r) => r.verdict === 'pass').length, 1, 'only the landing before it passed');
        void rep;
    });

    await pin('FLIP: record: required is BINDING — a satisfied bill builds, a skipped one refuses', () => {
        const good = route(
            [{ by: 'dock_hand' }, { by: 'weigh_team', op: 'inspect' }],
            [{ by: 'dock_hand', record: 'required' }, { by: 'weigh_team', op: 'inspect', record: 'required' }]);
        assert.strictEqual(good.built, true, 'both required countersigns passed');
        void good;

        // a required station never reached (route breaks first) => not built, stages named
        const bad = carriers.carry(
            travel.mint({ to: 'station_alpha', from: 'origin_vant', body: {} }),
            { stations: [{ by: 'dock_hand' }, { by: 'weigh_team', privileged: true }],
              template: [{ op: '*' }, { by: 'weigh_team', record: 'required' }] });
        assert.strictEqual(bad.ok, false);
        assert.strictEqual(bad.built, false, 'a skipped required record is not built');
        assert.deepStrictEqual(bad.unbuiltRecords, [2], 'the unbuilt required stations are named');
        void bad;
    });

    await pin('the receipt reference is the metering hook — unique per stage, anchored to the seed letter', () => {
        const seed = travel.mint({ to: 'station_alpha', from: 'origin_vant', body: { lot: 'M2' } });
        const rep = carriers.carry(seed, { stations: [{ by: 'dock_hand' }, { by: 'weigh_team' }, { by: 'stow_crew' }] });
        const refs = rep.records.map((r) => r.receiptRef);
        assert.strictEqual(new Set(refs).size, refs.length, 'refs are per-stage unique');
        assert.ok(refs.every((r) => r.startsWith(seed.id + ':')), "every ref anchors to the seed letter's root id");
        assert.ok(refs.every((r) => { const parts = r.split(':'); return parts.length === 2 && Number.isFinite(Number(parts[1])); }), 'ref = rootId:seq');
    });

    // ---------------- §3 the party (pod) routes -------------------------------

    await pin('FLIP: a pod hold rides the pod, acts through one member — identity individual on the wire', () => {
        const rep = route([{ by: ['alice', 'bob'], actingBy: 'bob' }]);
        assert.strictEqual(rep.ok, true);
        assert.strictEqual(rep.route[0].by, 'bob', 'the ledger step rides the ACTING member');
        assert.deepStrictEqual(rep.route[0].heldBy, ['alice', 'bob'], 'the hold rides the pod');
        assert.strictEqual(rep.letter.steps.at(-1).by, 'bob', 'the packet ledger names the individual');
        assert.strictEqual(rep.records[0].who, 'bob');
        assert.deepStrictEqual(rep.records[0].heldBy, ['alice', 'bob']);
        assert.strictEqual(rep.walk.ok, true, 'the continuity walk integrates the pod stage');
    });

    await pin('a pod hold with no acting member refuses typed (a pod does not act by itself)', () => {
        const rep = route([{ by: ['alice', 'bob'] }]);
        assert.strictEqual(rep.ok, false);
        assert.strictEqual(rep.refused.code, 'E_CARRIER_SHAPE');
        assert.ok(/actingBy/.test(rep.refused.error));
    });

    await pin('a pod hold whose actingBy is OUTSIDE the pod refuses' , () => {
        const rep = route([{ by: ['alice', 'bob'], actingBy: 'mallory' }]);
        assert.strictEqual(rep.ok, false);
        assert.strictEqual(rep.refused.code, 'E_CARRIER_SHAPE');
        void rep;
    });

    await pin('FLIP: the bill declares the hold WHOLE — pod↔pod matches as a SET, solo↔pod refuses', () => {
        const ok = route([{ by: ['alice', 'bob'], actingBy: 'alice' }, { by: 'crew_c' }],
                         [{ by: ['bob', 'alice'] }, { by: '*' }]);
        assert.strictEqual(ok.ok, true, 'bill pod (order-insensitive) met the stage pod');
        void ok;

        assert.throws(() => route([{ by: ['alice', 'bob'], actingBy: 'alice' }],
                                  [{ by: ['alice', 'bob', 'carol'] }]),
            (e) => e.code === 'E_CARRIER_TEMPLATE' && /pod/.test(e.message),
            'a bigger pod does not match');

        assert.throws(() => route([{ by: ['alice', 'bob'], actingBy: 'alice' }],
                                  [{ by: 'alice' }]),
            (e) => e.code === 'E_CARRIER_TEMPLATE',
            'a declared solo is never met by a pod hold');

        assert.throws(() => route([{ by: 'alice' }],
                                  [{ by: ['alice', 'bob'] }]),
            (e) => e.code === 'E_CARRIER_TEMPLATE',
            'a declared pod is never met by a solo hold');
    });

    await pin('empty pod members refuse (identity stays individual, every member named)', () => {
        const rep = route([{ by: ['alice', ''], actingBy: 'alice' }]);
        assert.strictEqual(rep.ok, false);
        assert.strictEqual(rep.refused.code, 'E_CARRIER_SHAPE');
    });

    // ---------------- regression parity (the letter laws ride) ----------------

    await pin('a template-less route mirrors the wildcards in its station records (nothing half-declared)', () => {
        const rep = route([{ by: 'dock_hand' }]);
        assert.deepStrictEqual(rep.records[0].templateRow, { by: '*', op: '*' }, 'no bill: the mirror is the house wildcard');
    });

    await pin('a record-less solo template route is byte-shaped as before (pass-260 parity)', () => {
        const rep = route(
            [{ by: 'dock_hand' }, { by: 'weigh_team', op: 'inspect' }],
            [{ by: 'dock_hand' }, { op: 'inspect' }]);
        assert.strictEqual(rep.ok, true);
        assert.strictEqual(rep.built, true);
        assert.strictEqual(rep.route[0].heldBy, undefined, 'solo holds ride without a heldBy key');
        assert.strictEqual(rep.records[0].heldBy, undefined);
        assert.deepStrictEqual(rep.records[0].templateRow, { by: 'dock_hand', op: '*' }, 'the mirror names declared fields only');
        assert.strictEqual(rep.records[0].record === undefined ? rep.records[0].templateRow.record === undefined : false, true);
    });

    await pin('multi-stage mixed route: pod + solo + records all in one certified letter', () => {
        const rep = carriers.carry(
            travel.mint({ to: 'station_alpha', from: 'origin_vant', body: { lot: 'A7' } }),
            { template: [{ by: ['alice', 'bob'], record: 'required' }, { by: 'weigh_team', op: 'inspect', record: 'required' }, { op: '*' }],
              stations: [{ by: ['alice', 'bob'], actingBy: 'alice' }, { by: 'weigh_team', op: 'inspect' }, { by: 'stow_crew' }] });
        assert.strictEqual(rep.ok, true);
        assert.strictEqual(rep.built, true, 'both required countersigns passed');
        assert.strictEqual(rep.landed, 3);
        assert.deepStrictEqual(rep.records.map((r) => r.who), ['alice', 'weigh_team', 'stow_crew']);
        assert.strictEqual(rep.walk.ok, true);
        void carriers;
    });

    console.log('\nPassed:  ' + passed + '\nFailed:  ' + failed);
    if (failed) {
        console.log('Failures: ' + failedList.join(', '));
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('suite crashed:', e);
    process.exit(1);
});
