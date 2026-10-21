/**
 * Carrier / Assimilator Pack tests (test/carriers.test.js) — pass 258.
 *
 * The laws under pin (lib/carriers.js header doc, the owner's framing:
 * the traveler object is the INVARIANT, the carrier is a LOCAL INTERFACE):
 *   1. packet invariant — carriers never reshape/refix the packet;
 *      decode re-applies shape + verify (the traveler's own laws)
 *   2. verify at every landing — INCLUDING senders (a tampered packet
 *      cannot be ASSIMILATED into any lane in the first place)
 *   3. continuity is a report, never a repair — replay() walks carrier
 *      landings and reports gaps/rewrites as a typed-named backtrack map
 *   4. typed refusal, not silence — every malformed input is an
 *      E_CARRIER_* VantError; absent carriers are the roster's named holes
 * Separately: the isolation of walls — carrier damage (seal) refusals are
 * distinct from packet tamper (address) refusals.
 */

'use strict';

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name);
}

const carriers = require('../lib/carriers');
const traveler = require('../lib/traveler');

console.log('\n📦 CARRIER PACK (assimilator lanes) TESTS\n');

// ---------------- the roster ----------------
ok('1a. the roster declares nsc9/stone/svg/json available',
    carriers.list().filter((c) => ['nsc9', 'stone', 'svg', 'json'].includes(c.id)).every((c) => c.available === true));
ok('1b. png stays DECLARED-ABSENT with a named blocker; qr is REAL (symbology lane)',
    carriers.list().find((c) => c.id === 'png').available === false &&
    carriers.list().find((c) => c.id === 'png').blocker.length > 10 &&
    carriers.list().find((c) => c.id === 'qr').available === true);
ok('1c. list() carries no overstatements (declared lanes carry blockers)',
    carriers.list().every((c) => c.available === true || (c.available === false && c.blocker)));

// ---------------- NSC-9: the address lane ----------------
const t1 = traveler.mint({ from: 'floor-1', slots: { title: 'wheel' } });
const nsc9Art = carriers.encode(t1, 'nsc9');
ok('2a. the frame is the 12-digit Lane B shape',
    typeof nsc9Art.frame === 'string' && /^9-[0-9]{5}-[0-9]{5}-[0-9]$/.test(nsc9Art.frame));
ok('2b. the frame DETERMINES from the id (same packet, same mark)',
    carriers.encode(t1, 'nsc9').frame === nsc9Art.frame);
ok('2c. matches() self-authenticates a scanned mark against the held packet',
    carriers.nsc9.matches(nsc9Art.frame, t1) === true);
ok('2d. matches() refuses a WRONG mark as false (broken wall vs wrong part)',
    carriers.nsc9.matches('9-00000-00000-0', t1) === false);
ok('2e. a malformed mark refuses typed at decode',
    (() => { try { carriers.decode('nsc9', '9-abcde-12345-99'); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('2f. malformed {facility 4 digits} refuses typed',
    (() => { try { carriers.nsc9.matches('9-1234-12345-1', t1); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// Lane A: GS1 GIAI read-through
const giai = carriers.nsc9.giai(t1);
ok('3a. giai() yields the AI 8004 form',
    /^\(8004\)9\d{11}$/.test(giai));
ok('3b. fromGiai() strips the GS1 wrapper back to the same frame',
    carriers.nsc9.fromGiai(giai) === nsc9Art.frame);
ok('3c. a hostile GIAI refuses typed',
    (() => { try { carriers.nsc9.fromGiai('(8004)9123'); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// ---------------- stone: the packet lane ----------------
const stoneArt = carriers.encode(t1, 'stone');
ok('4a. the envelope is the VSTN:1:<seal64hex>:<base64> grammar',
    stoneArt.envelope.startsWith('VSTN:1:') && /^[0-9a-f]{64}$/.test(stoneArt.envelope.split(':')[2]));
const stoneBack = carriers.decode('stone', stoneArt.envelope);
ok('4b. stone round-trip returns THE SAME packet (id + full ledger)',
    stoneBack.traveler.id === t1.id && stoneBack.traveler.seq === t1.seq &&
    JSON.stringify(stoneBack.traveler.steps) === JSON.stringify(t1.steps));

// carrier wall vs packet wall
const parts = stoneArt.envelope.split(':');
const seal = parts[2], ctext = parts[3];
const damaged = 'VSTN:1:' + seal + ':' + ctext.slice(0, 10) + (ctext[10] === 'A' ? 'B' : 'A') + ctext.slice(11);
ok('4c. CARRIER wall: a byte-flipped envelope refuses on the SEAL (typed TAMPER)',
    (() => { try { carriers.decode('stone', damaged); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
ok('4d. the DAMAGED envelope is NOT the packet-wall condition (seal fires first)',
    (() => { try { carriers.decode('stone', damaged); return false; } catch (e) { return !/address does not derive/.test(e.message); } })());
const evil = JSON.parse(JSON.stringify(t1)); evil.slots.title = 'forged';
const evilCtext = Buffer.from(JSON.stringify(evil)).toString('base64');
const evilEnv = 'VSTN:1:' + require('crypto').createHash('sha256').update('stone|' + evilCtext).digest('hex') + ':' + evilCtext;
ok('4e. PACKET wall: a resealed packet whose ADDRESS no longer derives refuses typed TAMPER',
    (() => { try { carriers.decode('stone', evilEnv); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
ok('4f. grammar wall: a nonsense VSTN-shaped string refuses SHAPE',
    (() => { try { carriers.decode('stone', 'VSTN:1:notahexseal:ctext'); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// ---------------- SVG: the encrypted visual lane ----------------
const svgArt = carriers.encode(t1, 'svg');
ok('5a. the stone is ENCRYPTED (no plaintext envelope in the artifact body)',
    svgArt.encrypted === true && !svgArt.svg.includes('BRN:') && !svgArt.svg.includes('VSTN:'));
ok('5b. an UNATTENDED caller gets a minted pair password, ONCE',
    typeof svgArt.stonePassword === 'string' && svgArt.stonePassword.length >= 24);
ok('5c. artifact surface names the packet honestly (visible id fragment)',
    svgArt.svg.includes(t1.id.slice(0, 12)));
const svgBack = carriers.decode('svg', svgArt.svg, svgArt.stonePassword);
ok('5d. svg round-trip returns the SAME packet',
    svgBack.traveler.id === t1.id && svgBack.traveler.seq === t1.seq);
const svgEnc = carriers.encode(t1, 'svg', { password: 'floor-passphrase' });
ok('5e. explicit caller password: no secret is MINTED',
    !('stonePassword' in svgEnc));
ok('5f. explicit-password round trip',
    carriers.decode('svg', svgEnc.svg, 'floor-passphrase').traveler.id === t1.id);
ok('5g. WRONG password refuses typed (the airgap law)',
    (() => { try { carriers.decode('svg', svgEnc.svg, 'wrong-pass'); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());

// ---------------- JSON: the ERP lane ----------------
const jsonArt = carriers.encode(t1, 'json');
ok('6a. the ERP form is the VERBATIM traveler object',
    JSON.stringify(jsonArt.json) === JSON.stringify(t1));
ok('6b. json round-trip: the packet re-enters shape+verify',
    carriers.decode('json', jsonArt.json).traveler.id === t1.id);
const evilJson = JSON.parse(JSON.stringify(t1)); evilJson.slots.title = 'forged';
ok('6c. json decode refuses a tampered bag typed',
    (() => { try { carriers.decode('json', evilJson); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());

// ---------------- verify at every landing (incl. senders) ----------------
const tampered = JSON.parse(JSON.stringify(t1)); tampered.slots.title = 'forged';
for (const lane of ['nsc9', 'stone', 'svg', 'json']) {
    ok('7. sender-side verify: ' + lane + ' refuses to ASSIMILATE a tampered packet',
        (() => { try { carriers.encode(tampered, lane); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
}

// ---------------- the POINTER qr (pass 265, the extended vant frame) ----------------
const tPtr = traveler.mint({ from: 'ptr-station', slots: { title: 'pointer-test' } });
const ptrArt = carriers.encode(tPtr, 'qr', { pointer: true });
ok('P1. the pointer frame is the extended vant grammar (VANT:1:<64-hex>)',
    ptrArt.kind === 'pointer' && /^VANT:1:[0-9a-f]{64}$/.test(ptrArt.frame) && ptrArt.frame.slice(7) === tPtr.id);
ok('P2. the pointer mark carries MORE than the NSC-9 doorway (64-hex, not 12 digits)',
    ptrArt.frame.length === 71);
const miss = carriers.decode('qr', ptrArt.png);
ok('P3. a legal pointer with NO body here is an honest unresolved (not an error)',
    miss.kind === 'pointer' && miss.resolved === false && miss.reason === 'no-body' && miss.id === tPtr.id);
traveler.persist(tPtr);
const resolved = carriers.decode('qr', ptrArt.png);
ok('P4. pointer resolve-to-packet: the persisted body answers to its address',
    resolved.resolved === true && resolved.traveler && resolved.traveler.id === tPtr.id && resolved.traveler.seq === tPtr.seq);
const pure = carriers.decode('qr', ptrArt.png, { pointerOnly: true });
ok('P5. the pure-pointer option skips the resolve read (scan ruling)',
    pure.kind === 'pointer' && pure.resolved === false && pure.frame === ptrArt.frame);
ok('P6. full-object QR round-trip still intact beside the pointer path',
    (() => { const a = carriers.encode(tPtr, 'qr'); const b = carriers.decode('qr', a.png); return b.traveler.id === tPtr.id && b.kind === 'packet' || (b.traveler && b.traveler.id === tPtr.id); })());
ok('P7. a body that does not answer to its address refuses typed (the packet wall on resolve)',
    (() => {
        const fs = require('fs');
        const pathMod = require('path');
        const bodyFile = pathMod.join(pathMod.dirname(traveler._ledgerPath()), 'travelers', tPtr.id + '.json');
        const real = JSON.parse(fs.readFileSync(bodyFile, 'utf8'));
        const evil = JSON.parse(JSON.stringify(real));
        evil.slots.title = 'forged-on-resolve';
        fs.writeFileSync(bodyFile, JSON.stringify(evil));
        try { carriers.decode('qr', ptrArt.png); return false; }
        catch (e) { return e.code === 'E_CARRIER_TAMPER'; }
        finally { fs.writeFileSync(bodyFile, JSON.stringify(real)); }
    })());
ok('P8. a foreign decoded mark (neither grammar) refuses typed through the REAL qr door',
    (() => {
        // Build a REAL png of a foreign string (the lane's own deps), then
        // hand it to the qr lane: the decoded mark speaks neither VSTN: nor
        // VANT:1: — the lane must refuse typed (foreign traffic, no guess).
        const qrcode = require('qrcode-generator');
        const jsqr = require('jsqr');
        const zlib = require('zlib');
        const qr = qrcode(0, 'L');
        qr.addData('hello plain url qr', 'Byte');
        qr.make();
        const n = qr.getModuleCount();
        const scale = 4, margin = 4;
        const size = (n + margin * 2) * scale;
        const px = Buffer.alloc(size * size, 255);
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            if (!qr.isDark(r, c)) continue;
            for (let dy = 0; dy < scale; dy++) px.fill(0, ((r + margin) * scale + dy) * size + (c + margin) * scale, ((r + margin) * scale + dy) * size + (c + margin) * scale + scale);
        }
        // minimal PNG encoder (same shape the lane emits: filter-none rows)
        const raw = Buffer.alloc(size * (size + 1));
        for (let y = 0; y < size; y++) px.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
        const deflated = zlib.deflateSync(raw);
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0;
        const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(deflated.length);
        const png = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
            Buffer.concat([Buffer.from([0,0,0,13]), Buffer.from('IHDR'), ihdr, Buffer.from('CRC!')]),
            Buffer.concat([lenBuf, Buffer.from('IDAT'), deflated, Buffer.from('CRC!')]),
            Buffer.concat([Buffer.from([0,0,0,0]), Buffer.from('IEND'), Buffer.from('CRC!')])
        ]);
        void jsqr;   // decode happens INSIDE the lane; construction is the test's job
        try { carriers.decode('qr', png); return false; }
        catch (e) { return e.code === 'E_CARRIER_SHAPE' && /neither lane grammar/.test(e.message); }
    })());

// ---------------- the WIRE HOOK (pass 267, cross-node pointer fetch) ----------------
// A resolving node whose LOCAL store misses reaches the packet through the
// hook it wired (setPointerFetch) — the traveler_fetch door's own JSON
// shape rides it. The walls apply wherever the body came from: address
// law, full packet wall, fail-closed on an unreachable wire.
const tWire = traveler.mint({ from: 'wire-station', slots: { title: 'wire-test' } });
const wireArt = carriers.encode(tWire, 'qr', { pointer: true });
ok('W1. the setter refuses a non-function hook typed (the seam never fakes)',
    (() => { try { carriers.setPointerFetch('fake'); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('W2. found:false on the wire is an honest UNRESOLVED record (fail-closed, not an error)',
    (() => { carriers.setPointerFetch(() => ({ found: false }));
        const r = carriers.decode('qr', wireArt.png);
        return r.resolved === false && r.reason === 'unreachable' && r.id === tWire.id; })());
ok('W3. a hook that THROWS is the same honest unreachable record (never a partial resolve)',
    (() => { carriers.setPointerFetch(() => { throw new Error('door died'); });
        const r = carriers.decode('qr', wireArt.png);
        return r.resolved === false && r.reason === 'unreachable'; })());
ok('W4. the wire hook resolves cross-node: wall re-applied, the fetched body comes home',
    (() => { carriers.setPointerFetch((id) => id === tWire.id ? { found: true, traveler: tWire } : { found: false });
        const r = carriers.decode('qr', wireArt.png);
        return r.resolved === true && r.fetched === true && r.traveler && r.traveler.id === tWire.id && r.traveler.seq === tWire.seq; })());
ok('W5. a SWAPPED wire body (a different packet under the mark) refuses typed E_CARRIER_TAMPER',
    (() => { const other = traveler.mint({ from: 'wire-other', slots: { title: 'not-this-one' } });
        carriers.setPointerFetch(() => ({ found: true, traveler: other }));
        try { carriers.decode('qr', wireArt.png); return false; }
        catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
ok('W6. a FORGED wire body (same id, edited content) refuses typed at the packet wall',
    (() => { const evil = JSON.parse(JSON.stringify(tWire)); evil.slots.title = 'wire-counterfeit';
        carriers.setPointerFetch(() => ({ found: true, traveler: evil }));
        try { carriers.decode('qr', wireArt.png); return false; }
        catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
ok('W7. a cleared hook restores the classic no-body record (the hookless posture is exactly pass 265)',
    (() => { carriers.setPointerFetch(null);
        const r = carriers.decode('qr', wireArt.png);
        return r.resolved === false && r.reason === 'no-body'; })());
ok('W8. the wire hook never short-circuits a LOCAL body (the local store wins first)',
    (() => { carriers.setPointerFetch((id) => id === tPtr.id ? { found: true, traveler: { id: 'bad' } } : { found: false });
        const r = carriers.decode('qr', ptrArt.png);   // ptrArt's body IS persisted here (P4)
        return r.resolved === true && r.fetched === undefined && r.traveler.id === tPtr.id; })());
carriers.setPointerFetch(null);   // a hook must never linger past its pin block

// ---------------- declared-absent lanes ----------------
ok('8a. png encode refuses typed (named absence, never a stub)',
    (() => { try { carriers.encode(t1, 'png'); return false; } catch (e) { return e.code === 'E_CARRIER_CARRIER'; } })());
ok('8a-qr. the qr lane round-trips a REAL symbology artifact (render -> decode back)',
    (() => {
        const art = carriers.encode(t1, 'qr');
        if (!Buffer.isBuffer(art.png) || !art.moduleCount) return false;
        const back = carriers.decode('qr', art.png);
        return back.traveler.id === t1.id && back.traveler.seq === t1.seq;
    })());
ok('8a-qr2. a non-PNG buffer refuses typed SHAPE (the raster gate)',
    (() => { try { carriers.decode('qr', Buffer.from('not a png at all')); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('8a-qr3. a non-square raster refuses typed (the raster gate)',
    (() => { const b = require('crypto').randomBytes(64); b.writeUInt32BE(10, 16); b.write('PNG', 1, 'ascii');
        try { carriers.decode('qr', b); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('8b. png decode refuses typed',
    (() => { try { carriers.decode('png', 'whatever'); return false; } catch (e) { return e.code === 'E_CARRIER_CARRIER'; } })());
ok('8c. an unknown carrier id refuses typed with the roster named',
    (() => { try { carriers.encode(t1, 'carrier-x'); return false; } catch (e) { return e.code === 'E_CARRIER_CARRIER' && e.message.includes('known:'); } })());

// ---------------- capacity law ----------------
const big = traveler.mint({ from: 'big', slots: { title: 'big', blob: 'X'.repeat(400000) } });
ok('9. the stone lane names its capacity (STONE_CAP) instead of truncating',
    (() => { try { carriers.encode(big, 'stone'); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE' && /STONE_CAP/.test(e.message); } })());

// ---------------- continuity + backtrack (replay) ----------------
const boot = traveler.mint({ from: 'st-1', slots: { title: 'silverball' }, now: 1000 });
const s2 = traveler.advance(boot, { op: 'load', by: 'st-2', ts: 1100 });
// same-first-arrival lineage for the diff laws
const bootMatch = traveler.mint({ from: 'st-1', slots: { title: 'silverball' }, now: 1000 });
ok('10a. boot determinism (the compare base survives the walk)',
    bootMatch.id === boot.id);

const rClean = carriers.replay([boot, s2]);
ok('10b. clean walk: same-lineage arrivals = ok, all stations, no findings',
    rClean.ok && rClean.stations === 2 && rClean.walkedTo === 2 && rClean.gaps.length === 0 && rClean.rewrites.length === 0);

// GAP: row arrival that skips the boundary
const rGap = carriers.replay([boot, { seq: 2, from: 'st-2' }, { seq: 4, from: 'st-4' }]);
ok('10c. GAP: a boundary skip is reported with the missing seqs named',
    !rGap.ok && rGap.gaps.length === 1 && JSON.stringify(rGap.gaps[0].missing) === '[3]');

// 10d. REDELIVERY: a rewind that AGREES with canon is continuity, not an event
const rRe = carriers.replay([s2, boot]);
ok('10d. an agreeing rewind (re-delivery of a carried prefix) stays CLEAN',
    rRe.ok && rRe.rewrites.length === 0 && rRe.walkedTo === 2);

// REWRITE via a legitimate-legal packet (plausible tamper: ops re-ordered
// under a NEW address - the laws allow fresh packets, the WALK still
// catches a collision on already-walked seq content):
const s2x = traveler.advance(boot, { op: 'forged-load', by: 'st-2', ts: 1100 });
const rRe2 = carriers.replay([s2, s2x]);
ok('10e. REWRITE catches a legal packet whose step content CONFLICTS with canon',
    !rRe2.ok && rRe2.rewrites.length >= 1);
ok('10e2. the REWRITE finding carries the canon-vs-arrived evidence pair (backtrack evidence)',
    rRe2.rewrites[0].seq === 2 && rRe2.rewrites[0].canon.by === 'st-2' &&
    rRe2.rewrites[0].arrived && rRe2.rewrites[0].arrived.by === 'st-2' &&
    rRe2.rewrites[0].canon.op === 'load' && rRe2.rewrites[0].arrived.op === 'forged-load');

// rows-only walk (the pin-ledger lane)
const rRows = carriers.replay([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
ok('10f. rows-only walk (the pin-ledger landing receipt)',
    rRows.ok && rRows.stations === 3 && rRows.walkedTo === 3);

// malformed replay inputs
ok('10g. empty arrival list refuses typed',
    (() => { try { carriers.replay([]); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('10h. an arrival that is neither packet nor row refuses typed',
    (() => { try { carriers.replay(['junk']); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// ---------------- isolation: the two walls have DIFFERENT names ----------------
ok('11a. carrier wall (seal) and packet wall (verify) carry distinct typed codes',
    carriers.CODES.TAMPER !== carriers.CODES.SHAPE &&
    carriers.CODES.TAMPER === 'E_CARRIER_TAMPER' && carriers.CODES.GAP === 'E_CARRIER_GAP');

// ---------------- results ----------------
console.log('\n--- ROUTE (certified letter) TESTS ---\n');

const fs = require('fs');
const os = require('os');
const path = require('path');
// The route laws need a REAL org model (scope lineage admits only known
// members, fail-closed — the OS posture). Grants are per-process (the
// house documented posture: 'vant org grant in the SAME process'); the
// suite grants exactly what it needs in its own process and tears the
// org model down after, touching nothing it did not create.
const teams = require('../lib/teams');
const sudo = require('../lib/sudo');
sudo.grant('default', 'write');   // the in-process grant lane (CAP_TO_SCOPE.canWrite)

const rp = Date.now().toString(36);
const org = teams.createOrg('rt-o-' + rp);
const dep = teams.createDept('rt-d-' + rp, { org: org.id });
const tm = teams.createTeam('rt-t-' + rp, { dept: dep.id });
const teamOk = !!(org.id && dep.id && tm && tm.id);
ok('R0. the route org fixture assembles (org -> dept -> team)', teamOk);

if (teamOk) {
    const assigned = teams.assign('rt-st-1', { team: tm.id });
    ok('R1. the route station is a real team member', !(assigned && assigned.error));

    const tR = traveler.mintScoped({ from: 'origin', slots: { title: 'warrant' }, scope: { owner: 'team:' + tm.id, visibility: 'scope' } });
    const rep = carriers.carry(tR, { stations: [
        { by: 'rt-st-1', op: 'inspect' },
        { by: 'rt-st-1', op: 'test', carrier: 'nsc9' },
        { by: 'rt-st-1', op: 'release' }
    ] });
    ok('R2. the certified letter routes all stages (check per stage)',
        rep.ok && rep.landed === 3 && rep.stations === 3 && rep.letter.seq === 4);
    ok('R3. every landed row carries its stage evidence (seq, op, verdict)',
        rep.route.every((r) => r.verdict === 'landed' && typeof r.seq === 'number' && typeof r.op === 'string'));
    ok('R4. the per-stage carrier lane rides (nsc9 assimilation at stage 2)',
        rep.route[1].carrier === 'nsc9');
    ok('R5. the walk certifies the ROUTE continuity (law 3)',
        rep.walk && rep.walk.ok === true && rep.walk.stations === 4 && rep.walk.gaps.length === 0 && rep.walk.rewrites.length === 0);

    // CHECK refusal: an outsider station drops the packet, fail-closed
    const repO = carriers.carry(tR, { stations: [{ by: 'rt-outsider', op: 'poke' }] });
    ok('R6. the CHECK gate (RLS lineage) drops the letter at the refusing stage',
        !repO.ok && repO.refused && typeof repO.refused.stage === 'number' && typeof repO.refused.code === 'string');
    ok('R7. the dropped letter walk stays birth-only (continuity stops where the record stops)',
        repO.walk && repO.walk.ok === true && repO.walk.walkedTo === 1 && rep.walk.stations > repO.walk.stations);

    // RISK lane: a privileged hop needs a live single-use escrow approval.
    // The privilege family the route consumes is `traveler <op>` (lib/
    // traveler.approvalFor); a route stage without an explicit op defaults
    // to `carry`, so the mint is for exactly `traveler carry` (the escrow
    // op-bind law: an approval minted for one family never spends on
    // another — verified R10 below).
    const escrow = require('../lib/escrow');
    const eR = escrow.create({ approvalRequired: ['traveler carry'] });
    const noAppr = carriers.carry(traveler.mintScoped({ from: 'origin', slots: { title: 'x' }, scope: { owner: 'team:' + tm.id } }), { stations: [{ by: 'rt-st-1', privileged: true }] });
    ok('R8. the RISK gate refuses a privileged hop without an approval', !noAppr.ok);
    // mint + approve + disk-bridge in one call (the route-facing lane, so
    // the fresh-instance consumer used by approvalFor() sees the approval)
    const appr = traveler.approvalForRoute(eR, 'traveler carry', 'route payload');
    void eR;
    const withAppr = carriers.carry(traveler.mintScoped({ from: 'origin', slots: { title: 'y' }, scope: { owner: 'team:' + tm.id } }), { stations: [{ by: 'rt-st-1', privileged: true, approvalId: appr.approvalId }] });
    ok('R9. the RISK gate admits a privileged hop holding a live approval', withAppr.ok);
    ok('R10. the approval is BURNED single-use (the #204 law rides the route)',
        escrow.consumeApproval(appr.approvalId, 'traveler carry').approved === false);

    ok('R11. a stageless route refuses (routing without stages is not a letter)',
        (() => { try { carriers.carry(tR, {}); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
    ok('R12. a route never starts from a tampered packet',
        (() => { const bad = JSON.parse(JSON.stringify(tR)); bad.slots.title = 'forged'; try { carriers.carry(bad, { stations: [{ by: 'rt-st-1' }] }); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());

    // C-block: the enterprise line composes template + RLS lineage
    // (the same fixture, still alive at this point)
    const tE = traveler.mintScoped({ from: 'rt-st-1', slots: { title: 'enterprise-line' }, scope: { owner: 'team:' + tm.id } });
    const repE = carriers.carry(tE, {
        template: [
            { op: 'mold', part: 'rim' },
            { op: 'publish', by: 'rt-st-1' }
        ],
        stations: [
            { by: 'rt-st-1', op: 'mold', part: { name: 'rim', alloy: 'al' } },
            { by: 'rt-st-1', op: 'publish' }
        ]
    });
    ok('C4. the enterprise line: template + RLS lineage compose (built inside scope)',
        repE.ok && repE.built === true && repE.letter.scope && repE.letter.scope.owner === 'team:' + tm.id);

    // teardown: the fixture it created, nothing else
    try { teams.unassign('rt-st-1'); } catch (e) { /* already gone */ }
    try { teams.deleteTeam(tm.id); } catch (e) { /* sink */ }
    try { teams.deleteDept(dep.id); } catch (e) { /* sink */ }
    try { teams.deleteOrg(org.id); } catch (e) { /* sink */ }
}

// ---------------- ASSEMBLY + TEMPLATE (pass 260) ----------------
console.log('\n--- ASSEMBLY + TEMPLATE TESTS ---\n');

// THE PART: station assimilates a part + signs off, in one landing
let tp = traveler.mint({ from: 'frame', slots: { title: 'wheel' } });
tp = traveler.advance(tp, { op: 'mold', by: 'st-1', part: { name: 'rim', alloy: 'al-6061' } });
tp = traveler.advance(tp, { op: 'cure', by: 'st-2', part: { name: 'hub', bearing: 'sealed' } });
ok('A1. parts accumulate into slots.assembly (inside the content address)',
    tp.slots.assembly.rim.alloy === 'al-6061' && tp.slots.assembly.hub.bearing === 'sealed');
ok('A2. the sign-off NAMES the part it attached (the 8.5.2 who-added-what)',
    tp.steps[1].part === 'rim' && tp.steps[2].part === 'hub');
ok('A3. a filled slot never overwrites (append-only assembly)',
    (() => { try { traveler.advance(tp, { op: 'redo', by: 'st-1', part: { name: 'hub', spoil: true } }); return false; } catch (e) { return e.code === 'E_TRAVELER_STEP'; } })());
ok('A4. an empty part refuses (a shell is not a part)',
    (() => { try { traveler.advance(tp, { op: 'x', by: 's', part: { name: 'void' } }); return false; } catch (e) { return e.code === 'E_TRAVELER_STEP'; } })());
ok('A5. editing an attached part breaks the address (verify refuses at the landing)',
    (() => { const evil = JSON.parse(JSON.stringify(tp)); evil.slots.assembly.rim.alloy = 'tin'; return traveler.verify(evil).ok === false; })());
ok('A6. a plain sign-off (no part) still rides (view/inspect stations)',
    (() => { const v = traveler.advance(tp, { op: 'inspect', by: 'qa' }); return v.seq === 4 && v.steps[3].part === undefined && traveler.verify(v).ok; })());

// THE TEMPLATE: the bill of stations, enforced in order — super flex parts,
// super strict order
const tLine = traveler.mint({ from: 'line-start', slots: { title: 'wheel-0042' } });
const repT = carriers.carry(tLine, {
    template: [
        { op: 'mold', part: 'rim' },
        { op: 'cure', part: 'hub' },
        { op: 'inspect', by: '*', op: '*' }
    ],
    stations: [
        { by: 'mold-station', op: 'mold', part: { name: 'rim', alloy: 'al-6061' } },
        { by: 'cure-station', op: 'cure', part: { name: 'hub', bearing: 'sealed' } },
        { by: 'qa-1', op: 'inspect' }
    ]
});
ok('B1. the mfg line rides its template and BUILDS (built flag + assembly returned)',
    repT.ok && repT.built === true && repT.assembly && repT.assembly.rim && repT.assembly.hub);
ok('B2. the route rows carry the part evidence (stage:op+part)',
    repT.route[0].part === 'rim' && repT.route[1].part === 'hub' && repT.route[2].part === undefined);
ok('B3. the walk certifies the built line',
    repT.walk && repT.walk.ok && repT.walk.walkedTo === 4);

ok('B4. a REORDERED stage refuses typed E_CARRIER_TEMPLATE',
    (() => { try { carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), {
        template: [{ op: 'mold' }, { op: 'cure' }],
        stations: [{ by: 'a', op: 'cure' }, { by: 'b', op: 'mold' }]
    }); return false; } catch (e) { return e.code === 'E_CARRIER_TEMPLATE'; } })());
ok('B5. a truncated/padded bill refuses (template length must match the route)',
    (() => { try { carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), {
        template: [{ op: 'mold' }],
        stations: [{ by: 'a', op: 'mold' }, { by: 'b', op: 'cure' }]
    }); return false; } catch (e) { return e.code === 'E_CARRIER_TEMPLATE'; } })());
ok('B6. an unplanned EXTRA station refuses (the bill is followed whole)',
    (() => { try { carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), {
        template: [{ op: 'mold' }, { op: 'cure' }],
        stations: [{ by: 'a', op: 'mold' }, { by: 'b', op: 'cure' }, { by: 'c', op: 'ship' }]
    }); return false; } catch (e) { return e.code === 'E_CARRIER_TEMPLATE'; } })());
ok('B7. a wildcard row (by:*, op:*) admits the caller identity at that stage',
    repT.route[2].by === 'qa-1');

// THE DIGITAL LINE: open -> backend -> api -> framing -> frontend
const tProj = traveler.mint({ from: 'pm-1', slots: { title: 'project-x' } });
const repP = carriers.carry(tProj, {
    template: [
        { op: 'backend', part: 'api' },
        { op: 'api', part: 'routes' },
        { op: 'framing', part: 'contract' },
        { op: 'frontend', part: 'ui' }
    ],
    stations: [
        { by: 'be-1', op: 'backend', part: { name: 'api', endpoints: 4 } },
        { by: 'be-1', op: 'api', part: { name: 'routes', shell: 'express' } },
        { by: 'fe-1', op: 'framing', part: { name: 'contract', types: 'ts' } },
        { by: 'fe-1', op: 'frontend', part: { name: 'ui', pages: 3 } }
    ]
});
ok('C1. the digital project line builds the same way (four parts, in order)',
    repP.ok && repP.built === true && JSON.stringify(Object.keys(repP.assembly)) === JSON.stringify(['api', 'routes', 'contract', 'ui']));
ok('C2. the built letter verifies (the assembly is INSIDE the address)',
    traveler.verify(repP.letter).ok);

// an honest build verdict: a template with an unfilled part-slot is NOT built
const repU = carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), {
    template: [{ op: 'mold', part: 'rim' }, { op: 'cure', part: 'hub' }],
    stations: [{ by: 'a', op: 'mold', part: { name: 'rim', alloy: 'x' } }, { by: 'b', op: 'cure' }]
});
ok('C3. a template with an unfilled part-slot reports built:false + names it',
    repU.ok && repU.built === false && JSON.stringify(repU.unfilled) === JSON.stringify(['hub']));

console.log('\n--- CARRIER PLATES (pass 262, the mycelium touch) ---\n');

// The plate store must not pollute the repo tree: plate tests run in a
// scratch cwd whose brain path resolves there.
// (pass 287 de-coupling, same seam as era/genesis pass 282/281): the
// plate store pins below must target the ACTIVE brain (VANT_BRAIN env >
// state.json stack head > 'vant') resolved BEFORE the chdir — the
// hardcoded 'vant' ENOENTed on any install whose active brain differs
// (this workspace's stack head is 'pairing-ride-pilot'), level-failing
// M1/M16 while everything else passed.
const ROOT2 = process.cwd(); // repo root captured before the scratch chdir
const PLATE_ACTIVE_BRAIN = (() => {
    if (process.env.VANT_BRAIN) return process.env.VANT_BRAIN;
    try {
        const state = JSON.parse(fs.readFileSync(path.join(ROOT2, 'models', 'state.json'), 'utf8'));
        const pick = typeof state.currentBrain === 'string' && state.currentBrain
            ? state.currentBrain
            : (Array.isArray(state.stack) && state.stack[0] ? state.stack[0] : null);
        if (pick && /^[a-zA-Z0-9._-]+$/.test(pick)) return pick;
    } catch (_e) { /* fall through: no state.json yet */ }
    return 'vant';
})();
const plateCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-plates-'));
process.chdir(plateCwd);

// ---- the declarative plate (data, not code) ----
// t1 (from pass 258's roster tests) is the working packet: minted, verified.
const tDeep = t1;
const fullPacket = t1;
const persisted = carriers.plateDefine({
    id: 'mfg-tag',
    carries: 'full-object',
    frame: { prefix: 'MTG/', suffix: '/END' },
    family: 'tag',
    note: 'the plant floor tag lane'
});
ok('M1. plateDefine persists the plate (brain store, sha256-pinned)',
    persisted.id === 'mfg-tag' && fs.existsSync(path.join('models', 'private', PLATE_ACTIVE_BRAIN, 'state', 'carrier-plates.json'))
    && fs.existsSync(path.join('models', 'private', PLATE_ACTIVE_BRAIN, 'state', 'carrier-plates.json.sha256')));
ok('M2. the plate rides the roster immediately (available, plate:true)',
    carriers.get('mfg-tag').plate === true && carriers.list().some((c) => c.id === 'mfg-tag' && c.available));

const tagArt = carriers.encode(tDeep, 'mfg-tag');
ok('M3. the plate artifact is the stone envelope FRAMED (definer owns the marker, lib owns the crypto)',
    typeof tagArt.frame === 'string' && tagArt.frame.startsWith('MTG/') && tagArt.frame.endsWith('/END')
    && tagArt.frame.includes('VSTN:'));
const tagBack = carriers.decode('mfg-tag', tagArt.frame);
ok('M4. the plate round-trips BOTH walls by construction (seal + packet law re-applied after unframe)',
    tagBack.traveler.id === tDeep.id && tagBack.traveler.seq === tDeep.seq && tagBack.carrier === 'mfg-tag');

const damagedTag = tagArt.frame.slice(0, -5) + (tagArt.frame.slice(-5, -4) === 'X' ? 'Y' : 'X') + tagArt.frame.slice(-4);
ok('M5. carrier damage inside a plate frame refuses on the SEAL (the built-in wall rides the plate)',
    (() => { try { carriers.decode('mfg-tag', damagedTag); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
const wrongFrame = 'WRONG/' + tagArt.frame.slice(5);
ok('M6. a foreign marker refuses the plate frame law typed (refuse, never repair)',
    (() => { try { carriers.decode('mfg-tag', wrongFrame); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// ---- the pointer plate (lite lane: hobbyists tag without the full packet) ----
carriers.plateDefine({
    id: 'hobby-coin',
    carries: 'id-pointer',
    frame: { prefix: 'HC~' },
    family: 'coin',
    note: 'a 12-digit coin tag on a keyring'
});
const coin = carriers.encode(tDeep, 'hobby-coin');
ok('M7. a pointer plate rides the NSC-9 frame (12 digits under the maker marker)',
    /^HC~9-\d{5}-\d{5}-\d$/.test(coin.frame));
ok('M8. the pointer plate reads back through the built-in frame law',
    carriers.decode('hobby-coin', coin.frame).pointer.facility === carriers.decode('nsc9', coin.frame.slice(3)).facility);

// ---- the definition gates ----
ok('M9. reserved ids refuse (nothing shadows the built-in roster)',
    (() => { try { carriers.plateDefine({ id: 'stone', carries: 'full-object', frame: { prefix: 'X/' } }); return false; } catch (e) { return e.code === 'E_CARRIER_CARRIER'; } })());
ok('M10. malformed ids/frames/carries refuse typed',
    (() => { try { carriers.plateDefine({ id: 'Bad_Id', carries: 'full-object', frame: { prefix: 'X/' } }); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })()
    && (() => { try { carriers.plateDefine({ id: 'ok-id', carries: 'full-object' }); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })()
    && (() => { try { carriers.plateDefine({ id: 'ok-id2', carries: 'carrier-less', frame: { prefix: 'X/' } }); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());
ok('M11. a plate frame may not embed the stone grammar (VSTN: is sacred)',
    (() => { try { carriers.plateDefine({ id: 'imposter', carries: 'full-object', frame: { prefix: 'VSTN:' } }); return false; } catch (e) { return e.code === 'E_CARRIER_SHAPE'; } })());

// ---- persistence: the mycelium spreads across a FRESH registration ----
// (simulate a restart: drop the in-memory registry entry, re-hydrate)
delete carriers._registry['mfg-tag'];
carriers._hydratePlates();
ok('M12. a plate HYDRATES from the brain store on a fresh process (define once, everywhere)',
    carriers.get('mfg-tag').plate === true);
const afterHydrate = carriers.decode('mfg-tag', tagArt.frame);
ok('M13. the hydrated plate decodes the SAME artifact (the lane is stable across restarts)',
    afterHydrate.traveler.id === tDeep.id);

// ---- the code carrier (process-lifetime, never persisted) ----
const custom = carriers.define({
    id: 'edi-lane',
    family: 'integration',
    note: 'the EDI lane a plant already speaks',
    encode(t) { return { carrier: 'edi-lane', body: 'EDI*830*0*' + t.id }; },
    decode(_a) {
        const goodPacket = JSON.parse(JSON.stringify(fullPacket));
        return { carrier: 'edi-lane', traveler: goodPacket };   // a packets return re-enters the law
    }
});
ok('M14. a code carrier wraps the packet gate (assimilation refuses a tampered packet)',
    (() => { try { custom.encode(tampered); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; } })());
ok('M15. a code carrier returning a PACKET gets verify re-applied on decode',
    (() => {
        // the last decode call returns whatever the test's tampered packet
        // claims to ride: the wrapper must refuse it even though the
        // definer's own decode "succeeded"
        const custom2 = carriers.define({
            id: 'edi-bad',
            encode(_t) { return { carrier: 'edi-bad', body: 'X' }; },
            decode() { return { carrier: 'edi-bad', traveler: tampered }; }   // a definer leaning on a tampered return
        });
        try { custom2.decode({}); return false; } catch (e) { return e.code === 'E_CARRIER_TAMPER'; }
    })());
ok('M16. code carriers NEVER persist (code is not data)',
    !JSON.stringify(fs.readFileSync(path.join('models', 'private', PLATE_ACTIVE_BRAIN, 'state', 'carrier-plates.json'), 'utf8')).includes('edi-lane'));

// teardown the scratch (the plate store lives in the tmp brain)
process.chdir(ROOT2);
fs.rmSync(plateCwd, { recursive: true, force: true });

console.log('\n--- RESULTS ---');
console.log('  Passed:  ' + pass.length);
console.log('  Failed:  ' + fail.length);
console.log('  Total:   ' + (pass.length + fail.length));
if (fail.length) {
    for (const f of fail) console.log('  ✗ ' + f.name + (f.info ? ' :: ' + f.info : ''));
}
process.exit(fail.length ? 1 : 0);
