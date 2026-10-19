#!/usr/bin/env node
/**
 * Vant P1 Manufacturing Pilot — the line runs, the record refuses.
 *
 * WHAT THIS IS: a pilot of the certified letter (lib/traveler.js +
 * lib/carriers.js) on a SIMULATED manufacturing line — the P1 gate of
 * labs/prd-automation.md, no real plant needed. It exercises three things
 * against the real code, nothing mocked:
 *
 *   1. THE LINE: one job packet rides a 4-station route (mold → cure →
 *      barcode → ship) via carriers.carry() with a template bill of
 *      stations. Each stage signs off per ISO 9001 8.5.2; parts attach
 *      (rim, hub) inside the content address.
 *   2. THE PLC-DIALECT PLATE: `plc-line` — a carrier lane defined as pure
 *      DATA (carriers.plateDefine), framing the sealed stone envelope in
 *      the PLC's own marker syntax (+JOB ... END). One line, zero crypto,
 *      both tamper walls ride by construction. Defined in the ISOLATED
 *      `pilot` brain so nothing touches your real brain.
 *   3. THE RED TEAM: seven tamper attacks, each of which MUST produce a
 *      TYPED refusal (or an honest walk finding) — carrier damage, content
 *      forgery, wrong-frame traffic, sender-side genesis tamper, a ledger
 *      rewrite, a dropped landing (the GAP), and a reserved-name plate.
 *
 * Run:  node scripts/pilot-mfg-line.js   (idempotent; resets its own pilot brain)
 * Exit: 0 = every wall held and the line rode clean. 1 = a wall failed —
 * that is a REAL bug in the carrier/traveler laws, never a "test flake".
 */

'use strict';

process.env.VANT_BRAIN = 'pilot';   // isolation: the pilot never writes your real brain

const crypto = require('crypto');

const sudo = require('../lib/sudo');
sudo.grant('default', 'write');   // the in-process grant lane (the carriers suite's posture)

const carriers = require('../lib/carriers');
const traveler = require('../lib/traveler');
const teams = require('../lib/teams');

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ← ' + (info || '')));
}
function attempt(fn) { try { return { ran: true, out: fn() }; } catch (e) { return { ran: false, err: e }; } }
function _plcInner(framed) { return framed.slice('+JOB '.length, framed.length - ' END'.length); }
function _plcFrame(inner) { return '+JOB ' + inner + ' END'; }

// Reset ONLY the pilot brain dir (never models/private/vant, nothing else).
const PILOT_DIR = require('path').join('models', 'private', 'pilot');
require('fs').rmSync(PILOT_DIR, { recursive: true, force: true });

console.log('\n🏭 VANT P1 MFG PILOT — simulated line, PLC-dialect plate, tamper red-team\n');

// ==================== ACT I: the PLC-dialect plate ====================
const def = carriers.plateDefine({
    id: 'plc-line',
    carries: 'full-object',
    frame: { prefix: '+JOB ', suffix: ' END' },
    family: 'plc',
    note: 'P1 pilot lane: the plant controller dialect (stone envelope, PLC-framed).'
});
ok('A1. the PLC-dialect plate registered (available on the roster)',
    carriers.list().some((c) => c.id === 'plc-line' && c.available === true));

// ==================== ACT II: the line runs ====================
// Org fixture: the route stages must be a real team member (RLS lineage).
const rp = Date.now().toString(36);
const org = teams.createOrg('p1-o-' + rp);
const dep = teams.createDept('p1-d-' + rp, { org: org.id });
const tm = teams.createTeam('p1-t-' + rp, { dept: dep.id });
const assigned = teams.assign('line-station', { team: tm.id });
ok('B0. the line org fixture assembles (org→dept→team→station)',
    !!(org.id && dep.id && tm && tm.id) && !(assigned && assigned.error));

let route = null;
if (org.id) {
    const letter = traveler.mintScoped({
        from: 'line-start',
        slots: { title: 'wheel-0042', lot: 'L-2026-088' },
        scope: { owner: 'team:' + tm.id, visibility: 'scope' }
    });
    route = carriers.carry(letter, {
        template: [
            { op: 'mold', part: 'rim' },
            { op: 'cure', part: 'hub' },
            { op: 'barcode' },
            { op: 'ship', carrier: 'plc-line' }
        ],
        stations: [
            { by: 'line-station', op: 'mold', part: { name: 'rim', alloy: 'al-6061' } },
            { by: 'line-station', op: 'cure', part: { name: 'hub', bearing: 'sealed' } },
            { by: 'line-station', op: 'barcode', carrier: 'nsc9' },
            { by: 'line-station', op: 'ship', carrier: 'plc-line' }
        ]
    });
    ok('B1. the letter routes all 4 stages (certified, BUILT)',
        route.ok === true && route.landed === 4 && route.built === true &&
        route.assembly && route.assembly.rim && route.assembly.hub);
    ok('B2. the PLC lane rode the ship stage (per-stage carrier evidence)',
        route.route[3].carrier === 'plc-line' && route.route[2].carrier === 'nsc9');
}

// THE BRIDGE: the letter re-encodes through the PLC lane (the honest public
// path — the artifact an operator would scan at the dock), then decodes
// back through the dialect plate, then the auditor walk certifies the line.
const shipped = route && route.ok ? carriers.encode(route.letter, 'plc-line').frame : null;
const landed = shipped ? attempt(() => carriers.decode('plc-line', shipped)) : { ran: false, out: null };
ok('B3. the shipped PLC artifact decodes through the dialect plate (same packet back)',
    landed.ran && landed.out && landed.out.traveler && landed.out.traveler.id === route.letter.id,
    landed.ran ? '' : (landed.err && landed.err.message.slice(0, 80)));

const cleanWalk = landed.out ? attempt(() => carriers.replay([landed.out.traveler])) : { ran: false, out: null };
ok('B4. the auditor walk certifies the line (no gaps, no rewrites)',
    cleanWalk.ran && cleanWalk.out && cleanWalk.out.ok === true &&
    cleanWalk.out.gaps.length === 0 && cleanWalk.out.rewrites.length === 0);

// ==================== ACT IIb: the POINTER-QR bridge leg ====================
// The second half of the qr lane (pass 265) in the same run: the station
// SHIPS a pointer mark (the extended vant frame — the full 64-hex content
// address as a scannable QR) and the receiving station RESOLVES it to the
// persisted packet body (persist() lands it during the route's shuttling),
// refusing a body that does not answer to its address. The walk then
// certifies THE RESOLVED letter — the same lineage, both halves of the
// lane, one run.
const ptrArt = route && route.ok ? carriers.encode(route.letter, 'qr', { pointer: true }) : null;
ok('B5. the pointer mark is the extended vant frame (VANT:1:<64-hex address>)',
    ptrArt && ptrArt.kind === 'pointer' && /^VANT:1:[0-9a-f]{64}$/.test(ptrArt.frame) &&
    ptrArt.frame.slice(7) === (route && route.letter && route.letter.id));

// THE HONEST MISS first: before the body is persisted, the resolve is a
// record, not an error (a station can scan ahead of the packet).
const missPtr = ptrArt ? attempt(() => carriers.decode('qr', ptrArt.png)) : { ran: false, out: null };
ok('B6. a scan ahead of the packet is an honest unresolved pointer (not an error)',
    missPtr.ran && missPtr.out && missPtr.out.kind === 'pointer' && missPtr.out.resolved === false);

// persist() = the body lands (the ship stage's filing step), then resolve.
const persisted = route && route.ok && ptrArt ? (() => {
    try { return traveler.persist(route.letter); } catch (e) {
        // A second run already persisted this id (append-only, idempotent
        // refusals): the body still resolves — that IS the honest outcome.
        const fsMod = require('fs');
        const pathMod = require('path');
        const bodyFile = pathMod.join(pathMod.dirname(traveler._ledgerPath()), 'travelers', route.letter.id + '.json');
        try { return { ok: true, id: route.letter.id, already: true, body_exists: fsMod.existsSync(bodyFile) }; }
        catch (e2) { return { ok: false, error: e2.message }; }
    }
})() : null;
ok('B7. the ship stage files the packet body (the resolve target exists)',
    persisted && persisted.ok === true && persisted.body_exists !== false);

const resolvedPtr = ptrArt ? attempt(() => carriers.decode('qr', ptrArt.png)) : { ran: false, out: null };
ok('B8. the receiving station RESOLVES the pointer to the persisted packet (same lineage)',
    resolvedPtr.ran && resolvedPtr.out && resolvedPtr.out.resolved === true &&
    resolvedPtr.out.traveler && resolvedPtr.out.traveler.id === (route && route.letter && route.letter.id) &&
    resolvedPtr.out.traveler.seq === (route && route.letter && route.letter.seq));

// The pure-pointer option: a forwarding-only node skips the resolve read.
const fwd = ptrArt ? attempt(() => carriers.decode('qr', ptrArt.png, { pointerOnly: true })) : { ran: false, out: null };
ok('B9. a forwarding-only node takes the pure pointer (no fetch, the mark alone rides)',
    fwd.ran && fwd.out && fwd.out.kind === 'pointer' && fwd.out.resolved === false && fwd.out.frame === (ptrArt && ptrArt.frame));

const ptrWalk = resolvedPtr.out && resolvedPtr.out.traveler ? attempt(() => carriers.replay([resolvedPtr.out.traveler])) : { ran: false, out: null };
ok('B10. the walk certifies the RESOLVED letter (the lineage crossed the gap intact)',
    ptrWalk.ran && ptrWalk.out && ptrWalk.out.ok === true &&
    ptrWalk.out.gaps.length === 0 && ptrWalk.out.rewrites.length === 0);

// ==================== ACT III: the tamper red team ====================
console.log('\n  RED TEAM (every attack below must be REFUSED or EXPOSED)\n');

const victim = landed.out && landed.out.traveler ? landed.out.traveler : (route && route.letter);

// Attack 1 — CARRIER DAMAGE: a byte flipped in the envelope body (a noisy
// scan, dirty paper, failing head). The STONE SEAL must catch it.
const a1 = attempt(() => {
    const parts = _plcInner(carriers.encode(victim, 'plc-line').frame).split(':');
    const ctext = parts[3];
    const flipped = ctext.slice(0, 10) + (ctext[10] === 'A' ? 'B' : 'A') + ctext.slice(11);
    return carriers.decode('plc-line', _plcFrame([parts[0], parts[1], parts[2], flipped].join(':')));
});
ok('A1. carrier damage (byte-flip) → typed E_CARRIER_TAMPER (the seal wall)',
    !a1.ran && a1.err.code === 'E_CARRIER_TAMPER', a1.ran ? 'NOT refused!' : a1.err.message.slice(0, 80));

// Attack 2 — CONTENT FORGERY: an attacker rebuilds the packet with a new
// payload and RE-SEALS the envelope (the seal algorithm is public). The
// PACKET law (address does not derive) must catch it.
const a2 = attempt(() => {
    const forged = JSON.parse(JSON.stringify(victim));
    forged.slots.title = 'counterfeit-hub';
    const evilCtext = Buffer.from(JSON.stringify(forged)).toString('base64');
    const evilSeal = crypto.createHash('sha256').update('stone|' + evilCtext).digest('hex');
    return carriers.decode('plc-line', _plcFrame(['VSTN', '1', evilSeal, evilCtext].join(':')));
});
ok('A2. resealed forgery → typed E_CARRIER_TAMPER (the packet wall)',
    !a2.ran && a2.err.code === 'E_CARRIER_TAMPER', a2.ran ? 'NOT refused!' : a2.err.message.slice(0, 80));

// Attack 3 — WRONG-FRAME TRAFFIC: some other lane's text shoved into the
// PLC lane (or a hand-edited marker). The FRAME law must refuse it typed.
const a3 = attempt(() => carriers.decode('plc-line', '§JOB:VSTN:1:0000:AAAA END'));
ok('A3. foreign/nonsense frame → typed E_CARRIER_SHAPE (the frame wall)',
    !a3.ran && a3.err.code === 'E_CARRIER_SHAPE', a3.ran ? 'NOT refused!' : a3.err.message.slice(0, 80));

// Attack 4 — SENDER-SIDE GENESIS: tamper BEFORE encode. No lane may
// assimilate a packet whose address does not derive (verify at both ends).
const a4 = attempt(() => {
    const forged = JSON.parse(JSON.stringify(victim));
    forged.slots.lot = 'L-FAKE';
    return carriers.encode(forged, 'plc-line');
});
ok('A4. sender-side tamper → the lane refuses to assimilate (E_CARRIER_TAMPER)',
    !a4.ran && a4.err.code === 'E_CARRIER_TAMPER', a4.ran ? 'NOT refused!' : a4.err.message.slice(0, 80));

// Attack 5 — LEDGER REWRITE: station 2's record re-arrives with different
// content under a legal address. The WALK must expose it (never repair).
const a5 = attempt(() => {
    const s2x = traveler.advance(
        traveler.mint({ from: 'line-start', slots: { title: 'wheel-0042', lot: 'L-2026-088' }, now: victim.steps[0] && victim.steps[0].ts }),
        { op: 'forged-cure', by: 'line-station', ts: victim.steps[1] && victim.steps[1].ts }
    );
    return carriers.replay([victim, s2x]);
});
ok('A5. ledger rewrite → the walk reports it (REWRITE finding, evidence pair)',
    a5.ran && a5.out && a5.out.ok === false && a5.out.rewrites.length >= 1 &&
    a5.out.rewrites[0].seq === 2);

// Attack 6 — THE DROPPED LANDING: a station's record silently missing
// (paperwork skipped). The WALK must name the missing seqs (GAP finding).
const a6 = attempt(() => carriers.replay([{ seq: 1 }, { seq: 2 }, { seq: 4 }]));
ok('A6. dropped landing → the walk names the GAP (missing: [3])',
    a6.ran && a6.out && a6.out.ok === false && a6.out.gaps.length === 1 &&
    JSON.stringify(a6.out.gaps[0].missing) === '[3]');

// Attack 7 — SHADOWED ROSTER: the plate cannot take a built-in lane's name.
const a7 = attempt(() => carriers.plateDefine({ id: 'stone', carries: 'full-object', frame: { prefix: 'X' } }));
ok('A7. reserved roster names cannot be plateed (typed E_CARRIER_CARRIER)',
    !a7.ran && a7.err.code === 'E_CARRIER_CARRIER');

// ==================== THE AUDITOR'S COPY ====================
console.log('\n  ISO 8.5.2 AUDITOR COPY (the line, verbatim)\n');
if (route && route.ok) {
    let rep = null;
    try { rep = traveler.auditReport(route.letter); } catch (e) { rep = { error: e.message }; }
    const text = typeof rep === 'string' ? rep : (rep && typeof rep.report === 'string' ? rep.report : JSON.stringify(rep, null, 2));
    for (const line of text.split('\n').slice(0, 22)) console.log('  ' + line);
}

// teardown: the org fixture it created, nothing else
if (org.id) {
    try { teams.unassign('line-station'); } catch (e) { /* already gone */ }
    try { teams.deleteTeam(tm.id); } catch (e) { /* sink */ }
    try { teams.deleteDept(dep.id); } catch (e) { /* sink */ }
    try { teams.deleteOrg(org.id); } catch (e) { /* sink */ }
}

// verdict
console.log('\n--- PILOT VERDICT ---');
console.log('  Pins held:  ' + pass.length + ' passed, ' + fail.length + ' failed');
console.log(fail.length === 0
    ? '  ✅ THE LINE RAN. THE RECORD REFUSED. P1 REALITY: the certified letter survives a full red team on live carrier lanes — and both halves of the qr lane ride in one run (the PLC plate ships the packet; the pointer-QR bridges the gap and resolves to the same lineage).'
    : '  ❌ WALL BREACH — a tamper landed or a clean run failed. This is a real finding; do not bury it.');
process.exit(fail.length === 0 ? 0 : 1);
