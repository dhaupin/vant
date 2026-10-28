/**
 * vant-carriers pack — battery slice 1 (per-bucket conversion).
 * Converts the CARRIER LANE LAWS family's native pins onto the run root's
 * `carriers-lane` arm: the REAL lib/carriers.js + lib/traveler.js seams
 * driven in-process with fixed-now mints (the traveler's own determinism
 * law — same payload + same ts = the SAME address). Artifacts and pair
 * passwords stay in-ride; the wire carries neutral facts only (booleans
 * + caught typed codes), never a frame, never a password, never a packet
 * body.
 *
 * House laws: one decision per attack, `skipped: true` marks honest
 * absence; the native test/carriers.test.js retired WHOLE to these rows
 * (2026-10-26) and test/traveler-lib.test.js trimmed to its real-process
 * CLI family (2026-10-27) per the reverse-verification law.
 */

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

async function probeCarriers(harness, ops) {
  let raw;
  try {
    const r = await harness.run('carriers-lane', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; } }
    else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e && e.message))) return null;
    throw e;
  }
  if (!raw) return null;
  let j = null;
  try { j = JSON.parse(raw); } catch { j = null; }
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.filter((x) => x && x.op === n).pop(), all: (n) => arr.filter((x) => x && x.op === n) };
}

async function probePlates(harness, ops) {
  let raw;
  try {
    const r = await harness.run('carriers-plates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; } }
    else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e && e.message))) return null;
    throw e;
  }
  if (!raw) return null;
  let j = null;
  try { j = JSON.parse(raw); } catch { j = null; }
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.filter((x) => x && x.op === n).pop(), all: (n) => arr.filter((x) => x && x.op === n) };
}

function rowErr(detail, ops, evidence) {
  return { verdict: 'EXPLOITED', detail, tookRequests: ops.length, evidence };
}
const rowSkip = skip;
const VOID = () => {};

// ---------------------------------------------------------------------------
// Slice 6 — the traveler-lib battery (pass 255-257 conversion). Rows drive
// lib/traveler (+ its real collaborators: event, scope, escrow, mcp, qos,
// event-types, security-pipeline) DIRECTLY in-process; the pin ledger is the
// brain-scoped real one and every row wipes the store (index + .sha256 pin +
// travelers/ + current file) before and after - per-row disk truth, no
// sockets (mcp.execute is the in-process registry call, not the TCP door).
// The REAL-PROCESS CLI family (bin/traveler.js open/hop/audit via spawnSync)
// stays native under the reverse-verification law - like the guests' socket
// door-integration families, it rides a separate process, not this battery.
// ---------------------------------------------------------------------------

const { default: t_fsMod } = await import('node:fs');
const { createRequire: t_createRequire } = await import('node:module');
const resolve = (await import('node:path')).resolve;
const _tReq = t_createRequire(import.meta.url);
const T = _tReq(resolve('lib/traveler.js'));

function tStore() {
  return {
    ledger: T._ledgerPath(),
    dir: resolve(T._ledgerPath(), '..'),
  };
}

async function tWipe() {
  const s = tStore();
  try { t_fsMod.rmSync(s.ledger, { force: true }); } catch { /* fresh */ }
  try { t_fsMod.rmSync(s.ledger + '.sha256', { force: true }); } catch { /* fresh */ }
  try { t_fsMod.rmSync(resolve(s.dir, 'travelers'), { recursive: true, force: true }); } catch { /* fresh */ }
  try { t_fsMod.rmSync(resolve(s.dir, 'traveler-current.json'), { force: true }); } catch { /* fresh */ }
}

// the mcp registry calls lib-level in-process once per module (auto-wired)
let _mcp = null;
function tMcp() {
  if (!_mcp) _mcp = _tReq(resolve('lib/mcp.js'));
  return _mcp;
}

function throwsTraveler(fn, test) {
  try { fn(); return false; } catch (e) { return test(e); }
}
async function throwsTravelerAsync(fn, test) {
  try { await fn(); return false; } catch (e) { return test(e); }
}

export default {
  name: 'vant-carriers',
  description: 'carrier lane discipline: the roster overstates nothing, the NSC-9 frame self-authenticates and reads through GS1, the stone lane owns two DISTINCT walls (carrier seal vs packet address), the svg lane keeps the airgap law minting once, the json ERP form rides verbatim, a tampered packet cannot assimilate into ANY lane, capacity names itself instead of truncating, and the wall codes never share a name',

  attacks: [
    // ============ the roster (1a-1c) ============
    {
      name: 'carriers-roster-honesty',
      description: 'the roster overstates nothing: nsc9/stone/svg/json answer available:true, png stays DECLARED-ABSENT with a named blocker, qr is a REAL symbology lane, and every absent entry names its blocker',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'roster' }]);
        if (!ride) return rowSkip('carriers-lane not armed (battery slice 1 arm pending)');
        const r = ride.get('roster');
        if (!r) return rowErr('the roster probe failed to answer', [{ op: 'roster' }]);
        if (r.fault) return rowErr('the roster probe faulted: ' + r.fault, [{ op: 'roster' }]);
        for (const id of ['nsc9', 'stone', 'svg', 'json']) {
          if (!r.real || !r.real[id]) return rowErr(`a declared lane ${id} did NOT answer available:true`, [{ op: 'roster' }]);
        }
        if (r.pngAvailable !== false) return rowErr('png claimed availability - the absent lane must stay DECLARED-ABSENT', [{ op: 'roster' }]);
        if (r.pngNamed !== true) return rowErr('png carries no named blocker - absence must be NAMED, never silent', [{ op: 'roster' }]);
        if (r.qrReal !== true) return rowErr('qr is not a real lane - the symbology lane must be REAL', [{ op: 'roster' }]);
        if (r.noOverstatements !== true) return rowErr('the roster overstates: an available lane exists without its backing, or an absent one without a named blocker', [{ op: 'roster' }]);
        return { verdict: 'REFUSED', detail: 'four lanes available, png declared-absent with a named blocker, qr real, no overstatements - the roster never lies about its lanes', tookRequests: 1 };
      },
    },

    // ============ NSC-9: the address lane (2a-2f) ============
    {
      name: 'carriers-nsc9-frame-law',
      description: 'the NSC-9 address lane holds: the frame is the 12-digit Lane B shape, the mark DETERMINES from the packet address (same packet, same mark), matches() self-authenticates the held mark, a WRONG mark answers false (never throws), and malformed marks refuse typed E_CARRIER_SHAPE at decode and at the facility gate',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'encode', lane: 'nsc9', token: 'p0' },
          { op: 'matches', token: 'p0', artifactToken: 'nsc9:p0', variant: 'right' },
          { op: 'matches', token: 'p0', artifactToken: 'nsc9:p0', variant: 'wrong' },
          { op: 'matches', token: 'p0', artifactToken: 'nsc9:p0', variant: 'badFacility' },
          { op: 'decode', lane: 'nsc9', shape: 'rawString', payload: '9-abcde-12345-99' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const enc = ride.get('encode');
        const right = ride.all('matches')[0];
        const wrong = ride.all('matches')[1];
        const badFac = ride.get('matches');
        const malformed = ride.all('decode').pop();
        for (const [n, x] of Object.entries({ enc, right, wrong, badFac, malformed })) {
          if (!x) return rowErr(`the ${n} probe failed to answer - the frame law walk needs every leg`, ride.rows);
        }
        if (enc.frame12 !== true) return rowErr('the frame is NOT the 12-digit Lane B shape', ride.rows);
        if (right.answer !== true) return rowErr('matches() did not self-authenticate the held mark', ride.rows);
        if (wrong instanceof Object && wrong.answer !== false) return rowErr('a WRONG mark did not answer false - the wall must refuse the SIGN, never throw at the caller', ride.rows);
        if (badFac.caught !== 'E_CARRIER_SHAPE') return rowErr(`a malformed facility field answered ${JSON.stringify(badFac.caught)} - it must refuse typed E_CARRIER_SHAPE`, ride.rows);
        if (malformed.caught !== 'E_CARRIER_SHAPE') return rowErr(`a malformed mark at decode answered ${JSON.stringify(malformed.caught)} - it must refuse typed E_CARRIER_SHAPE`, ride.rows);
        return { verdict: 'REFUSED', detail: '12-digit frame law, deterministic marks, self-authentication true / wrong mark false / four-digit + decode walls typed E_CARRIER_SHAPE', tookRequests: 6 };
      },
    },

    // ============ NSC-9: the GS1 GIAI read-through (3a-3c) ============
    {
      name: 'carriers-nsc9-giai-readthrough',
      description: 'the address lane reads through GS1: giai() yields the AI-8004 form, fromGiai() strips the wrapper back to the SAME frame (round-trip identity), and a hostile GIAI refuses typed E_CARRIER_SHAPE',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'encode', lane: 'nsc9', token: 'p0' },
          { op: 'giai', token: 'p0', artifactToken: 'nsc9:p0' },
          { op: 'fromGiai', payload: '(8004)9123' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        void ride.all('encode');
        const g = ride.get('giai');
        const hostile = ride.get('fromGiai');
        if (!g || !hostile) return rowErr('the GIAI walk failed to answer both legs', ride.rows);
        void VOID;
        if (g.formAi8004 !== true) return rowErr('giai() is not the AI-8004 form', ride.rows);
        if (g.stripBack !== true) return rowErr('fromGiai() did not strip back to the SAME frame - the read-through must round-trip', ride.rows);
        if (hostile.caught !== 'E_CARRIER_SHAPE') return rowErr(`a hostile GIAI answered ${JSON.stringify(hostile.caught)} - it must refuse typed E_CARRIER_SHAPE`, ride.rows);
        return { verdict: 'REFUSED', detail: 'AI-8004 read-through round-trips to the frame and hostile GIAI refuses typed E_CARRIER_SHAPE', tookRequests: 4 };
      },
    },

    // ============ stone: the packet lane + its two walls (4a-4f) ============
    {
      name: 'carriers-stone-two-walls',
      description: 'the stone lane: the envelope is the VSTN:1:<64hex-seal>:<payload> grammar, the packet round-trips id/seq/steps byte-for-byte, a byte-flipped envelope refuses on the SEAL (typed E_CARRIER_TAMPER, and NOT the address-do-not-derive wording), a RESEALED forgery whose address no longer derives refuses typed TAMPER too, and a nonsense grammar string refuses SHAPE - the two walls STAY DISTINCT',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'encode', lane: 'stone', token: 'p0' },
          { op: 'decode', lane: 'stone', from: 'artifact', artifactToken: 'stone:p0', token: 'p0' },
          { op: 'decode', lane: 'stone', shape: 'carrierDamage', artifactToken: 'stone:p0' },
          { op: 'tamper', token: 'p0', title: 'forged' },
          { op: 'decode', lane: 'stone', shape: 'resealForged', token: 'p1' },
          { op: 'decode', lane: 'stone', shape: 'nonsense' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const enc = ride.all('encode')[0];
        const back = ride.all('decode')[0];
        const damaged = ride.all('decode')[1];
        const resealed = ride.all('decode')[2];
        const nonsense = ride.all('decode').pop();
        for (const [n, x] of Object.entries({ enc, back, damaged, resealed, nonsense })) {
          if (!x) return rowErr(`the ${n} leg failed to answer - the two-wall walk needs every leg`, ride.rows);
        }
        if (enc.vstnGrammar !== true) return rowErr('the envelope is NOT the VSTN:1:<64hex-seal>:<payload> grammar', ride.rows);
        if (back.idMatch !== true || back.seqMatch !== true || back.stepsMatch !== true) {
          return rowErr(`the stone round-trip lost the packet (id=${back.idMatch} seq=${back.seqMatch} steps=${back.stepsMatch}) - it must return the SAME packet, ledger included`, ride.rows);
        }
        if (damaged.caught !== 'E_CARRIER_TAMPER') {
          return rowErr(`a byte-flipped envelope answered ${JSON.stringify(damaged.caught)} - carrier damage must refuse on the SEAL, typed E_CARRIER_TAMPER`, ride.rows);
        }
        if (damaged.msgHas && damaged.msgHas.addressDerive) {
          return rowErr('the carrier wall answered with the PACKET-wall wording - the two walls must stay DISTINCT (the seal fires first, its own name)', ride.rows);
        }
        if (resealed.caught !== 'E_CARRIER_TAMPER') {
          return rowErr(`a resealed forgery answered ${JSON.stringify(resealed.caught)} - the packet wall must refuse it typed E_CARRIER_TAMPER`, ride.rows);
        }
        if (nonsense.caught !== 'E_CARRIER_SHAPE') {
          return rowErr(`a nonsense grammar string answered ${JSON.stringify(nonsense.caught)} - the grammar wall must refuse it typed E_CARRIER_SHAPE`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'grammar holds, round-trip intact, seal damage and resealed forgery both refuse typed E_CARRIER_TAMPER (distinct wording), nonsense refuses SHAPE', tookRequests: 7 };
      },
    },

    // ============ svg: the encrypted visual lane (5a-5g) ============
    {
      name: 'carriers-svg-airgap',
      description: 'the svg lane keeps the airgap law: the artifact is ENCRYPTED (no plaintext envelope or marker in the body), an unattended caller mints a pair password ONCE and long enough, the surface names the packet honestly (id fragment), the round-trip returns the SAME packet, an explicit caller password mints NOTHING, and a WRONG password refuses typed E_CARRIER_TAMPER',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'encode', lane: 'svg', token: 'p0', storeKey: 'svg:minted' },
          { op: 'decode', lane: 'svg', from: 'artifact', artifactToken: 'svg:minted', token: 'p0' },
          { op: 'encode', lane: 'svg', token: 'p0', pw: 'floor-passphrase', storeKey: 'svg:explicit' },
          { op: 'decode', lane: 'svg', shape: 'wrongPw', artifactToken: 'svg:explicit', pw: 'wrong-pass' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const minted = ride.all('encode')[0];
        const back = ride.all('decode')[0];
        const explicit = ride.all('encode')[1];
        const wrongPw = ride.get('decode');
        for (const [n, x] of Object.entries({ minted, back, explicit, wrongPw })) {
          if (!x) return rowErr(`the ${n} leg failed to answer - the airgap walk needs every leg`, ride.rows);
        }
        if (minted.encrypted !== true || minted.noPlainText !== true) {
          return rowErr(`the svg artifact leaked (encrypted=${minted.encrypted} plaintext=${minted.noPlainText}) - the stone must stay ENCRYPTED inside the artifact body`, ride.rows);
        }
        if (minted.minted24 !== true) return rowErr('the unattended caller did not get a long enough minted pair password', ride.rows);
        if (minted.namesId !== true) return rowErr('the artifact surface does not name the packet (id fragment) - the tag must be findable on the floor', ride.rows);
        if (back.idMatch !== true || back.seqMatch !== true) {
          return rowErr(`the svg round-trip lost the packet (id=${back.idMatch} seq=${back.seqMatch})`, ride.rows);
        }
        if (explicit.explicitPwNoMint !== true) return rowErr('an explicit caller password minted a SECOND secret - no secret is minted twice', ride.rows);
        if (wrongPw.caught !== 'E_CARRIER_TAMPER') {
          return rowErr(`a wrong password answered ${JSON.stringify(wrongPw.caught)} - the airgap law refuses typed E_CARRIER_TAMPER`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'encrypted body, long minted-once password, honest id fragment, clean round-trip, no second mint for an explicit password, wrong password typed E_CARRIER_TAMPER', tookRequests: 5 };
      },
    },

    // ============ json: the ERP lane (6a-6c) ============
    // ============ the pointer qr (pass 265) + its body wall ============
    {
      name: 'carriers-pointer-address-law',
      description: 'the pointer qr lane holds: the extended VANT:1:<64hex> frame (71 chars, MORE than the 12-digit doorway, id-suffixed), a legal pointer with NO local body is an honest unresolved record (no-body, not an error), the persisted body answers to its address, the pure-pointer option skips the resolve read, and the full-object qr round-trip stays intact beside the pointer path',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'ptr-station', now: 5000, slots: { title: 'pointer-address-law' } },
          { op: 'qrPointer', token: 'p0' },
          { op: 'decode', lane: 'qr', from: 'artifact', artifactToken: 'qrp:p0', token: 'p0' },
          { op: 'decode', lane: 'qr', shape: 'pointerOnly', artifactToken: 'qrp:p0', token: 'p0' },
          { op: 'persist', token: 'p0' },
          { op: 'decode', lane: 'qr', from: 'artifact', artifactToken: 'qrp:p0', token: 'p0' },
          { op: 'decode', lane: 'qr', from: 'artifact', artifactToken: 'qrf:p0', token: 'p0' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const ptr = ride.get('qrPointer');
        const miss = ride.all('decode')[0];
        const pure = ride.all('decode')[1];
        const resolved = ride.all('decode')[2];
        const plain = ride.get('decode');
        for (const [n, x] of Object.entries({ ptr, miss, pure, resolved, plain })) {
          if (!x) return rowErr(`the ${n} leg failed to answer - the pointer walk needs every leg`, ride.rows);
        }
        void VOID;
        if (ptr.kind !== 'pointer' || ptr.frameGrammar !== true || ptr.frameLen71 !== true || ptr.idSuffix !== true) {
          return rowErr(`the pointer frame broke the extended grammar (kind=${ptr.kind} grammar=${ptr.frameGrammar} len71=${ptr.frameLen71} idSuffix=${ptr.idSuffix})`, ride.rows);
        }
        if (miss.resolved !== false || miss.reason !== 'no-body') {
          return rowErr(`an un-oiled pointer answered resolved=${JSON.stringify(miss.resolved)} reason=${JSON.stringify(miss.reason)} - absence is an honest UNRESOLVED record, not an error`, ride.rows);
        }
        if (pure.resolved !== false || pure.frameSame !== true) {
          return rowErr(`the pure-pointer option resolved=${JSON.stringify(pure.resolved)} frameSame=${JSON.stringify(pure.frameSame)} - the scan ruling must skip the resolve read`, ride.rows);
        }
        if (resolved.resolved !== true || resolved.idMatch !== true) {
          return rowErr(`the persisted body did not answer to its address (resolved=${resolved.resolved} idMatch=${resolved.idMatch})`, ride.rows);
        }
        if (plain.kind !== 'packet' || plain.idMatch !== true) {
          return rowErr(`the full-object qr round-trip broke beside the pointer path (kind=${JSON.stringify(plain.kind)} idMatch=${plain.idMatch})`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'VANT:1: grammar holds, no-body is honest-unresolved, pure-pointer skips resolve, persisted body answers, full-object roundtrip intact', tookRequests: 7 };
      },
    },

    {
      name: 'carriers-pointer-body-wall',
      description: 'the pointer resolve re-applies the packet wall: a tampered body under the address refuses typed E_CARRIER_TAMPER, and the record is RESTORED byte-for-byte after - the wall holds wherever the body came from',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'ptr-station', now: 5000, slots: { title: 'pointer-body-wall' } },
          { op: 'persist', token: 'p0' },
          { op: 'qrPointer', token: 'p0' },
          { op: 'tamperBody', token: 'p0', artifactToken: 'qrp:p0' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const tamper = ride.get('tamperBody');
        if (!tamper) return rowErr('the body-wall probe failed to answer', ride.rows);
        if (tamper.refused !== true || tamper.caught !== 'E_CARRIER_TAMPER') {
          return rowErr(`the tampered body resolved ${JSON.stringify(tamper.refused)}/${JSON.stringify(tamper.caught)} - the packet wall must refuse on resolve, typed E_CARRIER_TAMPER`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'a tampered on-disk body refused typed E_CARRIER_TAMPER at resolve, restored byte-identical after', tookRequests: 4 };
      },
    },

    // ============ the wire hook (pass 267) ============
    {
      name: 'carriers-wire-hook-failclosed',
      description: 'the wire hook is fail-closed at every seam: a non-function hook refuses the setter typed E_CARRIER_SHAPE, found:false on the wire is an honest UNRESOLVED record (reason unreachable), and a hook that THROWS is the same honest unreachable - never a partial resolve, never a crash',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'wire-station', now: 5000, slots: { title: 'wire-failclosed' } },
          { op: 'qrPointer', token: 'p0' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'badType' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'missing' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'throwing' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const bad = ride.all('wireCase')[0];
        const missing = ride.all('wireCase')[1];
        const throwing = ride.all('wireCase').pop();
        for (const [n, x] of Object.entries({ bad, missing, throwing })) {
          if (!x) return rowErr(`the ${n} leg failed to answer`, ride.rows);
        }
        void VOID;
        if (bad.setupCaught !== 'E_CARRIER_SHAPE') return rowErr(`the setter accepted a non-function (setupCaught=${JSON.stringify(bad.setupCaught)}) - the seam never fakes`, ride.rows);
        for (const [n, x] of Object.entries({ missing, throwing })) {
          if (x.resolved !== false || x.reason !== 'unreachable') {
            return rowErr(`a failing wire arm (${n}) answered resolved=${JSON.stringify(x.resolved)} reason=${JSON.stringify(x.reason)} - the wire is fail-closed, not an error and never a partial`, ride.rows);
          }
        }
        return { verdict: 'REFUSED', detail: 'non-function refuses typed at the setter, found:false and a throwing door are both honest unreachable records', tookRequests: 5 };
      },
    },

    {
      name: 'carriers-wire-hook-walls',
      description: 'the wire hook re-applies the walls cross-node: a good hook brings the body home (resolved + fetched + id match), a SWAPPED body and a FORGED body both refuse typed E_CARRIER_TAMPER, a cleared hook restores the classic no-body record, and the hook never short-circuits a LOCAL body (the local store wins, un-fetched)',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'wire-station', now: 5000, slots: { title: 'wire-hook-walls' } },
          { op: 'mint', from: 'wire-other', now: 5001, slots: { title: 'not-this-one' } },
          { op: 'qrPointer', token: 'p0' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'good' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'swapped', otherToken: 'p1' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'forged' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        // reset rides an UNPERSISTED token: the hookless posture vs a body that
        // is actually absent locally, not vs a local body that wins anyway
        const ride2 = await probeCarriers(harness, [
          { op: 'mint', from: 'ptr-station', now: 5000, slots: { title: 'wire-reset-leg' } },
          { op: 'qrPointer', token: 'p0' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'reset' },
        ]);
        const ride3 = await probeCarriers(harness, [
          { op: 'mint', from: 'ptr-station', now: 5000, slots: { title: 'wire-local-wins' } },
          { op: 'persist', token: 'p0' },
          { op: 'qrPointer', token: 'p0' },
          { op: 'wireCase', token: 'p0', artifactToken: 'qrp:p0', kind: 'badLocal' },
        ]);
        if (!ride || !ride2 || !ride3) return rowSkip('carriers-lane not armed');
        const good = ride.all('wireCase')[0];
        const swapped = ride.all('wireCase')[1];
        const forged = ride.get('wireCase');
        const reset = ride2.get('wireCase');
        const badLocal = ride3.get('wireCase');
        for (const [n, x] of Object.entries({ good, swapped, forged, reset, badLocal })) {
          if (!x) return rowErr(`the ${n} leg failed to answer`, ride.rows);
        }
        if (good.resolved !== true || good.fetched !== true || good.idMatch !== true) {
          return rowErr(`a good hook did not bring the body home (resolved=${good.resolved} fetched=${good.fetched} idMatch=${good.idMatch})`, ride.rows);
        }
        for (const [n, x] of Object.entries({ swapped, forged })) {
          if (x.caught === null || x.caught === undefined) {
            const decoded = x.resolved;
            return rowErr(`the ${n} wire body did not refuse (resolved=${JSON.stringify(decoded)}, caught=${JSON.stringify(x.caught)}) - a swapped or forged body must hit the packet wall, typed E_CARRIER_TAMPER`, ride.rows);
          }
          if (x.caught !== 'E_CARRIER_TAMPER') return rowErr(`a ${n} body carried ${JSON.stringify(x.caught)} - the packet wall is E_CARRIER_TAMPER`, ride.rows);
        }
        if (reset.resolved !== false || reset.reason !== 'no-body') {
          return rowErr(`a cleared hook answered resolved=${JSON.stringify(reset.resolved)} reason=${JSON.stringify(reset.reason)} - the hookless posture is exactly the classic no-body record`, ride.rows);
        }
        if (badLocal.localBodyWins !== true || badLocal.resolved !== true || badLocal.fetched !== undefined) {
          return rowErr(`the wire hook short-circuited a LOCAL body (resolved=${badLocal.resolved} fetched=${JSON.stringify(badLocal.fetched)}) - the local store wins first`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'good hook brings it home, swapped/forged hit the wall typed, cleared restores no-body, local wins un-fetched', tookRequests: 10 };
      },
    },

    {
      name: 'carriers-json-erp',
      description: 'the ERP lane: the artifact is the VERBATIM traveler object, the round-trip re-enters shape+verify (same packet back), and a tampered bag refuses typed E_CARRIER_TAMPER',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'encode', lane: 'json', token: 'p0' },
          { op: 'decode', lane: 'json', from: 'artifact', artifactToken: 'json:p0', token: 'p0' },
          { op: 'tamper', token: 'p0', title: 'forged' },
          { op: 'decode', lane: 'json', shape: 'tamperPacket', token: 'p1' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const enc = ride.get('encode');
        const back = ride.all('decode')[0];
        const tampered = ride.get('decode');
        if (!enc || !back || !tampered) return rowErr('the ERP walk failed to answer its legs', ride.rows);
        if (enc.verbatim !== true) return rowErr('the ERP artifact is NOT the verbatim traveler object', ride.rows);
        if (back.idMatch !== true) return rowErr('the json round-trip lost the packet - it must re-enter shape+verify and return the SAME packet', ride.rows);
        if (tampered.caught !== 'E_CARRIER_TAMPER') {
          return rowErr(`a tampered bag answered ${JSON.stringify(tampered.caught)} - the packet wall must refuse it typed E_CARRIER_TAMPER`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'verbatim ERP form, verify re-applied on the way back, tampered bag typed E_CARRIER_TAMPER', tookRequests: 5 };
      },
    },

    // ============ verify at every landing, incl. senders (7) ============
    {
      name: 'carriers-sender-side-verify',
      description: 'a tampered packet cannot ASSIMILATE into any lane in the first place: nsc9, stone, svg, and json all refuse the sender typed E_CARRIER_TAMPER - verify at every landing INCLUDING the door it enters through',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'mint', from: 'floor-1', now: 5000, slots: { title: 'wheel' } },
          { op: 'tamper', token: 'p0', title: 'forged' },
          { op: 'senderVerify', token: 'p1', lanes: ['nsc9', 'stone', 'svg', 'json'] },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const sv = ride.get('senderVerify');
        if (!sv) return rowErr('the sender-verify probe failed to answer', ride.rows);
        for (const lane of ['nsc9', 'stone', 'svg', 'json']) {
          const entry = sv.lanes && sv.lanes[lane];
          if (!entry || entry.tamper !== true) {
            return rowErr(`the ${lane} lane accepted or misrefused a tampered packet (${JSON.stringify(entry)}) - no lane assimilates a bag whose address does not derive`, ride.rows);
          }
        }
        return { verdict: 'REFUSED', detail: 'all four lanes refused the tampered sender typed E_CARRIER_TAMPER - verify at every landing, senders included', tookRequests: 3 };
      },
    },

    // ============ slice 5: assembly + template (A1-A6, B1-B7, C1-C4) ============
    {
      name: 'carriers-assembly-parts-accumulate',
      description: 'parts accumulate into slots.assembly (inside the content address) and the sign-off NAMES the part it attached (the who-added-what law)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'part' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the part probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the part probe faulted: ' + r.fault, ride.rows);
        if (r.accumulated !== true) return rowErr('parts did NOT accumulate into slots.assembly with their shape intact', ride.rows);
        if (r.signoffNames !== true) return rowErr('the sign-off did not name the part it attached', ride.rows);
        return { verdict: 'REFUSED', detail: 'assembly accumulates (rim + hub) and each step names its part', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-assembly-append-only',
      description: 'a filled slot never overwrites (append-only assembly: a redo of an attached part refuses) and an empty part refuses (a shell is not a part)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'appendOnly' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the append-only probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the append-only probe faulted: ' + r.fault, ride.rows);
        if (r.redoRefused !== true || r.redoCode !== 'E_TRAVELER_STEP') return rowErr(`redoing an attached part answered ${JSON.stringify(r.redoCode)} - filled slots must refuse overwrite typed`, ride.rows);
        if (r.emptyRefused !== true || r.emptyCode !== 'E_TRAVELER_STEP') return rowErr(`an empty part answered ${JSON.stringify(r.emptyCode)} - a shell is not a part`, ride.rows);
        return { verdict: 'REFUSED', detail: 'redo refuses; empty part refuses; both typed E_TRAVELER_STEP', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-assembly-address-law',
      description: 'editing an attached part breaks the address (verify refuses at the landing) and a plain sign-off (no part) still rides and verifies',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'addressLaw' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the address-law probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the address-law probe faulted: ' + r.fault, ride.rows);
        if (r.editedBreaks !== true) return rowErr('an edited attached part STILL verified - the assembly must live inside the address', ride.rows);
        if (r.plainRides !== true) return rowErr('a plain sign-off did not ride and verify (view stations must stay legal)', ride.rows);
        return { verdict: 'REFUSED', detail: 'tampered assembly refuses verify; part-less sign-off rides and verifies', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-template-line-builds',
      description: 'the mfg line rides its template and BUILDS (built flag + assembly returned), route rows carry the part evidence, the walk certifies the built line, and a wildcard row (by:*, op:*) admits the caller identity at that stage',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'line' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the line probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the line probe faulted: ' + r.fault, ride.rows);
        if (r.builds !== true) return rowErr('the mfg line did not BUILD (built flag + assembly returned)', ride.rows);
        if (r.partEvidence !== true) return rowErr('the route rows did not carry the part evidence (stage: op+part)', ride.rows);
        if (r.walkCert !== true) return rowErr('the walk did not certify the built line (walkedTo 4)', ride.rows);
        if (r.wildcardAdmits !== true) return rowErr('the wildcard row did not admit the caller identity at its stage', ride.rows);
        return { verdict: 'REFUSED', detail: 'template rides, builds, evidences parts, walk certifies, wildcard admits by', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-template-bill-walls',
      description: 'the bill of stations is enforced: a REORDERED stage, a truncated/padded bill, and an unplanned EXTRA station all refuse typed E_CARRIER_TEMPLATE (the bill is followed whole)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'billWalls' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the bill-walls probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the bill-walls probe faulted: ' + r.fault, ride.rows);
        for (const [n, code] of [['reordered', r.reordered], ['truncated', r.truncated], ['extra', r.extra]]) {
          if (code !== 'E_CARRIER_TEMPLATE') return rowErr(`a ${n} bill answered ${JSON.stringify(code)} - the template wall must refuse typed E_CARRIER_TEMPLATE`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'reorder, truncation, and extra stations all refuse typed E_CARRIER_TEMPLATE', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-template-digital-line',
      description: 'the digital project line builds the same way (four parts, in order: api, routes, contract, ui) and the built letter verifies - the assembly is INSIDE the address',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'digital' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the digital-line probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the digital-line probe faulted: ' + r.fault, ride.rows);
        if (r.fourInOrder !== true) return rowErr('the digital line did not build exactly [api, routes, contract, ui] in order', ride.rows);
        if (r.letterVerifies !== true) return rowErr('the built letter did NOT verify - the assembly must be inside the address', ride.rows);
        return { verdict: 'REFUSED', detail: 'four parts in order; the built letter verifies', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-template-unfilled-honest',
      description: 'an honest build verdict: a template with an unfilled part-slot reports built:false and NAMES the unfilled slot (never a fake build)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'template', case: 'unfilled' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('template');
        if (!r) return rowErr('the unfilled probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the unfilled probe faulted: ' + r.fault, ride.rows);
        if (r.honestVerdict !== true) return rowErr('an unfilled part-slot reported built:true - a template with a hole is NOT built', ride.rows);
        if (r.namesHub !== true) return rowErr('the verdict did not name the unfilled slot(s)', ride.rows);
        return { verdict: 'REFUSED', detail: 'built:false verdict with the unfilled slot named (hub)', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-template-enterprise-line',
      description: 'the enterprise line composes template + RLS lineage: built inside scope, and the built letter keeps the team owner',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'enterprise', key: 'rtorg' }]);
        if (!ride) return rowSkip('carriers-lane not armed (slice 3 route fixture arm pending)');
        const r = ride.get('route');
        if (!r) return rowErr('the enterprise-line probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the enterprise-line probe faulted: ' + r.fault, ride.rows);
        if (r.composed !== true) return rowErr('template + RLS lineage did NOT compose (built flag)', ride.rows);
        if (r.scopeKept !== true) return rowErr('the built letter did not keep the team owner - scope must survive the build', ride.rows);
        return { verdict: 'REFUSED', detail: 'enterprise line builds inside scope with the owner kept', tookRequests: 1 };
      },
    },

    // ============ slice 4: the carrier plates family (M1-M16) ============
    {
      name: 'carriers-plate-persist-roster',
      description: 'plateDefine persists the plate as DATA (brain store + sha256-pinned sidecar) and the plate rides the roster immediately (available, plate:true)',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate' , case: 'persist' }]);
        if (!ride) return rowSkip('carriers-plates not armed (battery slice 4 arm pending)');
        const r = ride.get('plate');
        if (!r) return rowErr('the plate persist probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the plate persist probe faulted: ' + r.fault, ride.rows);
        if (r.store !== 'true') return rowErr('the plate did NOT persist to the brain store', ride.rows);
        if (r.sidecar !== 'true') return rowErr('the plate store has NO sha256-pinned sidecar', ride.rows);
        if (r.roster !== 'true,true') return rowErr('the plate did not ride the roster immediately (plate:true available)', ride.rows);
        return { verdict: 'REFUSED', detail: 'registered plate = persisted data + sidecar + immediate roster ride', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-plate-framed-walls',
      description: 'a plate artifact is the stone envelope FRAMED (definer owns the marker, lib owns the crypto); it round-trips BOTH walls by construction, carrier damage inside the frame refuses on the SEAL, and a foreign marker refuses the frame law typed',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate', case: 'framed' }]);
        if (!ride) return rowSkip('carriers-plates not armed');
        const r = ride.get('plate');
        if (!r) return rowErr('the framed artifact probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the framed artifact probe faulted: ' + r.fault, ride.rows);
        if (r.marker !== 'true') return rowErr('the plate artifact is not the framed stone envelope (MTG/..VSTN:../END)', ride.rows);
        if (r.roundtrip !== 'true') return rowErr('the plate did not round-trip by construction (id/seq/carrier)', ride.rows);
        if (r.seal !== 'true,E_CARRIER_TAMPER') return rowErr(`carrier damage inside the frame answered ${JSON.stringify(r.seal)} - the built-in seal wall must ride the plate`, ride.rows);
        if (r.foreign !== 'true,E_CARRIER_SHAPE') return rowErr(`a foreign marker answered ${JSON.stringify(r.foreign)} - the frame law must refuse typed, never repair`, ride.rows);
        return { verdict: 'REFUSED', detail: 'framed envelope round-trips; seal wall and frame law both ride the plate', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-plate-pointer-lite',
      description: 'a pointer plate rides the NSC-9 frame (a 12-digit coin tag under the maker marker) and reads back through the built-in frame law (same facility, same wire)',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate', case: 'pointer' }]);
        if (!ride) return rowSkip('carriers-plates not armed');
        const r = ride.get('plate');
        if (!r) return rowErr('the pointer plate probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the pointer plate probe faulted: ' + r.fault, ride.rows);
        if (r.pinShape !== 'true') return rowErr('the pointer plate did not ride the NSC-9 12-digit shape', ride.rows);
        if (r.roughSame !== 'true') return rowErr('the pointer plate did not read back through the built-in frame law (facility mismatch)', ride.rows);
        return { verdict: 'REFUSED', detail: 'the lite lane is the REAL frame under a maker marker, not a fake of it', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-plate-definition-gates',
      description: 'the definition gates: reserved ids refuse (nothing shadows the built-in roster), malformed ids/frames/carries refuse typed, and a plate frame may not embed the stone grammar (VSTN: is sacred)',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate', case: 'gates' }]);
        if (!ride) return rowSkip('carriers-plates not armed');
        const r = ride.get('plate');
        if (!r) return rowErr('the gates probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the gates probe faulted: ' + r.fault, ride.rows);
        if (r.reserved !== 'true,E_CARRIER_CARRIER') return rowErr(`a reserved id answered ${JSON.stringify(r.reserved)} - nothing shadows the built-in roster`, ride.rows);
        const parts = String(r.malformed || '').split(',');
        if (parts.length !== 6 || parts[0] !== 'true' || parts[2] !== 'true' || parts[4] !== 'true' || parts[1] !== 'E_CARRIER_SHAPE' || parts[3] !== 'E_CARRIER_SHAPE' || parts[5] !== 'E_CARRIER_SHAPE') {
          return rowErr(`the malformed-definition cluster answered ${JSON.stringify(r.malformed)} - all three must refuse typed E_CARRIER_SHAPE`, ride.rows);
        }
        if (r.grammar !== 'true,E_CARRIER_SHAPE') return rowErr(`a VSTN: frame answered ${JSON.stringify(r.grammar)} - the stone grammar is sacred to the plate layer`, ride.rows);
        return { verdict: 'REFUSED', detail: 'reserved ids, malformed shapes, and the VSTN: grammar wall all refuse typed', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-plate-hydrate-restart',
      description: 'the mycelium spreads across a FRESH registration: a plate whose in-memory registry entry is dropped HYDRATES from the brain store and decodes the SAME artifact (the lane is stable across restarts)',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate', case: 'hydrate' }]);
        if (!ride) return rowSkip('carriers-plates not armed');
        const r = ride.get('plate');
        if (!r) return rowErr('the hydrate probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the hydrate probe faulted: ' + r.fault, ride.rows);
        if (r.registry !== 'true') return rowErr('the dropped plate did NOT hydrate from the brain store (define once, everywhere)', ride.rows);
        if (r.stable !== 'true') return rowErr('the hydrated plate did NOT decode the same artifact - the lane is not stable across restarts', ride.rows);
        return { verdict: 'REFUSED', detail: 'plate hydrates from the store and decodes identically after the restart', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-plate-code-carrier',
      description: 'code carriers wrap the packet gate: encode refuses a tampered packet, a decode returning a PACKET gets verify re-applied on the definer\'s own return, and code carriers NEVER persist (code is not data)',
      async run(harness) {
        const ride = await probePlates(harness, [{ op: 'plate', case: 'code' }]);
        if (!ride) return rowSkip('carriers-plates not armed');
        const r = ride.get('plate');
        if (!r) return rowErr('the code-carrier probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the code-carrier probe faulted: ' + r.fault, ride.rows);
        if (r.tamper !== 'true,E_CARRIER_TAMPER') return rowErr(`a code carrier encoded a tampered packet: ${JSON.stringify(r.tamper)} - the packet gate must wrap customer code`, ride.rows);
        if (r.packet !== 'true,E_CARRIER_TAMPER') return rowErr(`a code carrier's tampered packet return answered ${JSON.stringify(r.packet)} - verify must re-apply on decode returns`, ride.rows);
        if (r.ephemeral !== 'true') return rowErr('the code carrier PERSISTED to the plate store - code is not data', ride.rows);
        return { verdict: 'REFUSED', detail: 'customer code is gated in and out, and never becomes data', tookRequests: 1 };
      },
    },

    // ============ slice 3: the certified-letter route family (R0-R12) ============
    {
      name: 'carriers-route-org-fixture',
      description: 'the route laws ride a REAL org model: org -> dept -> team assemble and the route station lands as a real team member (scope lineage admits only known members, fail-closed)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'org', key: 'rtorg' }]);
        if (!ride) return rowSkip('carriers-lane not armed (battery slice 1 arm pending)');
        const r = ride.get('route');
        if (!r) return rowErr('the org fixture probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the org fixture probe faulted: ' + r.fault, ride.rows);
        if (r.teamOk !== true) return rowErr('the route org fixture did NOT assemble (org -> dept -> team)', ride.rows);
        if (r.stationOnTeam !== true) return rowErr('the route station did NOT land as a real team member', ride.rows);
        return { verdict: 'REFUSED', detail: 'org -> dept -> team assembled; the station is a real team member', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-route-letter-routes',
      description: 'the certified letter routes ALL stages: 3 landed stations with per-stage evidence (seq + op + verdict), the nsc9 lane rides its stage, and the walk certifies the route continuity with zero gaps and zero rewrites',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'letter', key: 'rtorg' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('route');
        if (!r) return rowErr('the letter probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the letter probe faulted: ' + r.fault, ride.rows);
        if (r.routedAll !== true) return rowErr('the letter did NOT route all stages with its terminal seq (a certified letter stops being certified if stages drop)', ride.rows);
        if (r.evidence !== true) return rowErr('a landed row carries no stage evidence (seq/op/verdict) - landings must be legible', ride.rows);
        if (r.nsc9Rode !== true) return rowErr('the nsc9 carrier lane did NOT ride its stage - per-stage lanes must ride', ride.rows);
        if (r.walkCert !== true) return rowErr('the walk did not certify the route continuity (gaps or rewrites present) - law 3 holds the route', ride.rows);
        return { verdict: 'REFUSED', detail: '3 stages landed with evidence, nsc9 rode stage 2, the walk certifies continuity (no gaps, no rewrites)', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-route-outsider-drop',
      description: 'the CHECK gate is RLS lineage: an outsider station drops the letter fail-closed with a typed stage+code, the dropped walk stays birth-only, and it walks strictly shorter than the certified letter',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'drop', key: 'rtorg' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('route');
        if (!r) return rowErr('the drop probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the drop probe faulted: ' + r.fault, ride.rows);
        if (r.letterFounded !== true) return rowErr('the in-scope control letter did not route - the comparison leg died', ride.rows);
        if (r.refusedTyped !== true) return rowErr('the outsider station did NOT drop the packet with typed stage+code - the CHECK gate must refuse clearly', ride.rows);
        if (r.walkBirthOnly !== true) return rowErr('the dropped letter walk did not stop birth-only - continuity must stop where the record stops', ride.rows);
        if (r.walkShorter !== true) return rowErr('the dropped walk is not strictly shorter than the certified walk', ride.rows);
        return { verdict: 'REFUSED', detail: 'outsider dropped fail-closed (typed stage+code), birth-only walk, strictly shorter', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-route-risk-gate',
      description: 'the RISK gate: a privileged hop refuses without an approval, admits holding a live single-use one, and the approval is BURNED after its ride (the escrow op-bind law rides the route)',
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'risk', key: 'rtorg' }]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const r = ride.get('route');
        if (!r) return rowErr('the risk probe failed to answer', ride.rows);
        if (r.fault) return rowErr('the risk probe faulted: ' + r.fault, ride.rows);
        if (r.noApprRefused !== true) return rowErr('the RISK gate ADMITTED a privileged hop without an approval - privilege must refuse closed', ride.rows);
        if (r.approvalMinted !== true) return rowErr('the escrow route approval did not mint', ride.rows);
        if (r.withApprOk !== true) return rowErr('the RISK gate did NOT admit a privileged hop holding a live approval', ride.rows);
        if (r.burned !== true) return rowErr('the approval survived its ride - single-use means BURNED (the #204 law rides the route)', ride.rows);
        return { verdict: 'REFUSED', detail: 'no-approval refused, live approval allowed, approval burned single-use', tookRequests: 1 };
      },
    },

    {
      name: 'carriers-route-stageless-forged',
      description: 'the route shape walls: a stageless route refuses typed E_CARRIER_SHAPE (routing without stages is not a letter) and a route never starts from a tampered packet (E_CARRIER_TAMPER)',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'route', case: 'stageless', key: 'rtorg' },
          { op: 'route', case: 'forged', key: 'rtorg' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const stageless = ride.all('route')[0];
        const forged = ride.all('route')[1];
        for (const [n, x] of Object.entries({ stageless, forged })) {
          if (!x) return rowErr(`the ${n} probe failed to answer`, ride.rows);
        }
        if (stageless.caught !== 'E_CARRIER_SHAPE') return rowErr(`a stageless route answered ${JSON.stringify(stageless.caught)} - it must refuse typed E_CARRIER_SHAPE`, ride.rows);
        if (forged.caught !== 'E_CARRIER_TAMPER') return rowErr(`a tampered start answered ${JSON.stringify(forged.caught)} - the route wall must refuse typed E_CARRIER_TAMPER`, ride.rows);
        return { verdict: 'REFUSED', detail: 'stageless -> E_CARRIER_SHAPE; tampered start -> E_CARRIER_TAMPER', tookRequests: 2 };
      },
    },

    // ============ capacity named, never truncated (9) + wall codes (11a) ============
    {
      name: 'carriers-capacity-and-codes',
      description: 'the walls have names and limits: a 400KB blob through the stone lane refuses E_CARRIER_SHAPE naming STONE_CAP (never truncates), and the typed codes stay DISTINCT (E_CARRIER_TAMPER vs E_CARRIER_SHAPE vs E_CARRIER_GAP)',
      async run(harness) {
        const ride = await probeCarriers(harness, [
          { op: 'capacity', blobLen: 400000 },
          { op: 'codes' },
        ]);
        if (!ride) return rowSkip('carriers-lane not armed');
        const cap = ride.get('capacity');
        const codes = ride.get('codes');
        for (const [n, x] of Object.entries({ cap, codes })) {
          if (!x) return rowErr(`the ${n} probe failed to answer`, ride.rows);
        }
        if (cap.caught !== 'E_CARRIER_SHAPE') {
          return rowErr(`an oversized packet answered ${JSON.stringify(cap.caught)} - capacity must refuse typed, not truncate`, ride.rows);
        }
        if (!(cap.msgHas && cap.msgHas.stoneCap)) {
          return rowErr('the capacity refusal did not NAME the limit (STONE_CAP) - the caller must hear why', ride.rows);
        }
        if (codes.tamper !== 'E_CARRIER_TAMPER' || codes.shape !== 'E_CARRIER_SHAPE' || codes.gap !== 'E_CARRIER_GAP') {
          return rowErr('the typed wall codes drifted from their names', ride.rows);
        }
        if (codes.distinct !== true) return rowErr('two wall codes collided - carrier damage and shape damage must never share a name', ride.rows);
        return { verdict: 'REFUSED', detail: 'STONE_CAP named on the 400KB refusal, and TAMPER/SHAPE/GAP stay distinct typed names', tookRequests: 2 };
      },
    },
    {
      name: 'traveler-content-address-law',
      description: '(pass 256 slice 6) the auditable pin law, backend: same content + same ts mints the SAME id, ANY edit re-addresses (a new id is born, seq rides), the honest packet verifies, a slot tamper refuses typed E_TRAVELER_ADDRESS (never re-written, ISO 8.5.2), and a forged ledger step breaks the address loudly',
      async run(_harness) {
        try {
          const FIXED_NOW = 1700000000001;
          const t1 = T.mint({ from: 'pack-A-station', slots: { job: 'x1' }, now: FIXED_NOW });
          const t1b = T.mint({ from: 'pack-A-station', slots: { job: 'x1' }, now: FIXED_NOW });
          if (t1.id !== t1b.id) {
            return { verdict: 'EXPLOITED', detail: 'same content with the same canonical ts minted DIFFERENT addresses (determinism is the whole law)', tookRequests: 1 };
          }
          const t2 = T.advance(t1, { op: 'pick', by: 'pack-B-station', detail: { bin: 'B7' } });
          if (!(t2.id !== t1.id && t2.seq === 2)) {
            return { verdict: 'EXPLOITED', detail: 'an edit did NOT re-address (id stayed or seq drifted)', tookRequests: 2 };
          }
          if (T.verify(t2).ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'the honest packet failed to verify', tookRequests: 3 };
          }
          const tampered = JSON.parse(JSON.stringify(t2));
          tampered.slots.job = 'x999';
          const vt = T.verify(tampered);
          if (!(vt.ok === false && vt.code === 'E_TRAVELER_ADDRESS')) {
            return { verdict: 'EXPLOITED', detail: 'a tampered packet verified or refused without its typed name: ' + JSON.stringify(vt).slice(0, 120), tookRequests: 4 };
          }
          const forged = JSON.parse(JSON.stringify(t2));
          forged.steps.push({ seq: 3, op: 'forge', by: 'typosquat', ts: 0 });
          if (T.verify(forged).ok !== false) {
            return { verdict: 'EXPLOITED', detail: 'a forged step injection verified - the ledger is the content', tookRequests: 5 };
          }
          return { verdict: 'REFUSED', detail: 'the address law holds: same content = same id, every edit re-addresses, honest packets verify, tamper refuses typed E_TRAVELER_ADDRESS (ISO 8.5.2: refuse, never rewrite), and a forged ledger step breaks the address loudly', tookRequests: 5 };
        } finally {
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-ledger-law-and-ceiling',
      description: '(pass 256 slice 6) the ledger law: a frozen-stamp mismatch refuses STEP, a gapped ledger refuses STEP, and the 512-step ceiling refuses STEP - shape refusals name their clause, they are never silent re-writes',
      async run(_harness) {
        try {
          const FIXED_NOW = 1700000000002;
          const t2 = T.advance(T.mint({ from: 'pack-B-station', slots: { job: 'x2' }, now: FIXED_NOW }), { op: 'pick', by: 'pack-B2', detail: {} });
          const bad = Object.assign({}, t2, { seq: 99 });
          if (!((T.shapeRefusalFor(bad) || {}).code === 'E_TRAVELER_STEP')) {
            return { verdict: 'EXPLOITED', detail: 'a frozen-stamp mismatch did not refuse STEP: ' + JSON.stringify(T.shapeRefusalFor(bad)).slice(0, 90), tookRequests: 1 };
          }
          const gapped = Object.assign({}, t2, { steps: [{ seq: 9, op: 'x', by: 'y', ts: 1 }] });
          if (!((T.shapeRefusalFor(gapped) || {}).code === 'E_TRAVELER_STEP')) {
            return { verdict: 'EXPLOITED', detail: 'a gapped ledger did not refuse STEP', tookRequests: 2 };
          }
          const big = { tr: 'tr/1', id: 'a'.repeat(64), from: 'x', seq: 513, slots: {}, steps: Array.from({ length: 513 }, (_, i) => ({ seq: i + 1, op: 's', by: 'b', ts: 0 })) };
          if (!((T.shapeRefusalFor(big) || {}).code === 'E_TRAVELER_STEP')) {
            return { verdict: 'EXPLOITED', detail: 'the 512-step ceiling did not refuse STEP (a 513-step ledger walked through)', tookRequests: 3 };
          }
          return { verdict: 'REFUSED', detail: 'the ledger law holds: frozen-stamp mismatch, gap-jump and the 512-step ceiling all refuse typed E_TRAVELER_STEP - shape damage names its clause', tookRequests: 3 };
        } finally {
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-persistence-append-only',
      description: '(pass 255 slice 6) the pin ledger: persist lands the packet body BY ADDRESS under the brain-scoped store, a same-id re-persist refuses typed E_TRAVELER_STEP (append-only, never re-written), and the body verifies at re-load (the station handoff law)',
      async run(_harness) {
        try {
          const t3 = T.mint({ from: 'pack-C-station', slots: { job: 'persist-me' } });
          T.persist(t3);
          const bodyFile = (await import('node:path')).join(tStore().dir, 'travelers', t3.id + '.json');
          if (!t_fsMod.existsSync(bodyFile)) {
            return { verdict: 'EXPLOITED', detail: 'the packet body never landed by address at ' + bodyFile, tookRequests: 1 };
          }
          const readBack = JSON.parse(t_fsMod.readFileSync(bodyFile, 'utf8'));
          if (T.verify(readBack).ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'the persisted body failed its re-load verification (the handoff would be blind)', tookRequests: 2 };
          }
          const dup = throwsTraveler(() => { T.persist(t3); }, (e) => e.code === 'E_TRAVELER_STEP');
          if (!dup) {
            return { verdict: 'EXPLOITED', detail: 'a same-id re-persist overwrote or was not refused typed - append-only is the ledger law', tookRequests: 3 };
          }
          return { verdict: 'REFUSED', detail: 'persistence is honest: the body lands by address and verifies at re-load, and the ledger refuses a same-id re-persist typed (append-only)', tookRequests: 3 };
        } finally {
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-schema-rizer-law',
      description: '(pass 255 slice 6) the schema-rizer: tr/0 migrates forward WITH the stamp and the migration RIDES the ledger (an appended rize step, never a rewrite), and an unknown FUTURE version refuses typed E_TRAVELER_SCHEMA (never guesses)',
      async run(_harness) {
        try {
          const legacy = { tr: 'tr/0', id: 'a'.repeat(32), from: 'old', slots: { k: 1 }, steps: [{ seq: 1, op: 'open', by: 'old', ts: 0 }], seq: 1 };
          const rized = T.schemaRize(legacy);
          if (!(rized.tr === 'tr/1' && rized.rized && rized.rized.from === 'tr/0')) {
            return { verdict: 'EXPLOITED', detail: 'the legacy packet lost its stamp or its provenance: ' + JSON.stringify({ tr: rized.tr, rized: rized.rized }).slice(0, 110), tookRequests: 1 };
          }
          if (!(rized.steps.length === 2 && rized.steps[1].op === 'rize')) {
            return { verdict: 'EXPLOITED', detail: 'the migration rewrote instead of appending the rize step', tookRequests: 2 };
          }
          const futureOk = throwsTraveler(
            () => { T.schemaRize({ tr: 'tr/7', id: 'a'.repeat(32), slots: {}, steps: [], seq: 0 }); },
            (e) => e.code === 'E_TRAVELER_SCHEMA'
          );
          if (!futureOk) {
            return { verdict: 'EXPLOITED', detail: 'an unknown future version did not refuse typed - a guesser would stamp WRONG truth forever', tookRequests: 3 };
          }
          return { verdict: 'REFUSED', detail: 'the rizer migrates tr/0 forward with the stamp riding an appended rize step, and a future tr/7 refuses typed E_TRAVELER_SCHEMA (never guesses)', tookRequests: 3 };
        } finally {
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-audit-verbatim',
      description: '(pass 255 slice 6) the auditor copy: the report names clause 8.5.2, EVERY station line rides (one numbered line per step, verbatim), and the integrity line states VERIFIED',
      async run(_harness) {
        try {
          const FIXED_NOW = 1700000000003;
          const t2 = T.advance(T.mint({ from: 'pack-E-station', slots: { job: 'x3' }, now: FIXED_NOW }), { op: 'pick', by: 'pack-E2', detail: {} });
          const rep = T.auditReport(t2);
          if (!rep.includes('8.5.2')) {
            return { verdict: 'EXPLOITED', detail: 'the audit record did not name its ISO clause', tookRequests: 1 };
          }
          const stationLines = rep.split('\n').filter((l) => /^\s*\d+\./.test(l)).length;
          if (stationLines !== t2.steps.length) {
            return { verdict: 'EXPLOITED', detail: 'the station lines drifted from the ledger (had ' + stationLines + ' of ' + t2.steps.length + ') - the copy must be verbatim', tookRequests: 2 };
          }
          if (!rep.includes('VERIFIED')) {
            return { verdict: 'EXPLOITED', detail: 'the integrity line did not state VERIFIED', tookRequests: 3 };
          }
          return { verdict: 'REFUSED', detail: 'the auditor copy is verbatim and integrity-labelled: clause named, every station line rode, VERIFIED stated', tookRequests: 3 };
        } finally {
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-door-verbs-carried',
      description: '(pass 255-261 slice 6) the door verbs in-process: traveler_open opens + persists, traveler_hop advances + re-addresses, traveler_status answers the stations, traveler_audit returns the verbatim record, traveler_carry routes the template (built + walk ok) and a template REORDER refuses typed E_CARRIER_TEMPLATE (the bill of stations is the boulder), traveler_replay walks landing rows read-class, and carriers_list serves the honesty roster (nsc9/stone/svg/json/qr up; png named-absent)',
      async run(_harness) {
        try {
          const mcp = tMcp();
          const opened = await mcp.execute('traveler_open', { title: 'pack door job', slots: { lane: 'pack-slice' } });
          if (!(opened && opened.opened === true && /^[0-9a-f]{64}$/.test(opened.id || ''))) {
            return { verdict: 'EXPLOITED', detail: 'traveler_open did not open + persist: ' + JSON.stringify(opened).slice(0, 110), tookRequests: 1 };
          }
          const hopped = await mcp.execute('traveler_hop', { op: 'qa', by: 'pack-agent', detail: { ok: 1 } });
          if (!(hopped && hopped.hopped === true && hopped.readdressed === true)) {
            return { verdict: 'EXPLOITED', detail: 'traveler_hop did not advance + re-address: ' + JSON.stringify(hopped).slice(0, 110), tookRequests: 2 };
          }
          const stat = await mcp.execute('traveler_status', { last: 10 });
          if (!(stat && stat.seen === true && Array.isArray(stat.stations) && stat.stations.length >= 2)) {
            return { verdict: 'EXPLOITED', detail: 'traveler_status answered short: ' + JSON.stringify(stat && { seen: stat.seen, n: stat.stations && stat.stations.length }).slice(0, 110), tookRequests: 3 };
          }
          const aud = await mcp.execute('traveler_audit', {});
          if (!(aud && typeof aud.report === 'string' && aud.report.includes('8.5.2'))) {
            return { verdict: 'EXPLOITED', detail: 'traveler_audit did not return the verbatim record', tookRequests: 4 };
          }
          const carried = await mcp.execute('traveler_carry', { id: hopped.id, stations: [
            { by: 'pack-mold', op: 'mold', part: { name: 'rim', alloy: 'al' } },
            { by: 'pack-qa', op: 'inspect' },
          ], template: [
            { op: 'mold', part: 'rim' },
            { op: 'inspect', by: '*', op: '*' },
          ] });
          if (!(carried && carried.ok === true && carried.built === true && carried.letter && carried.letter.assembly && carried.letter.assembly.rim && carried.walk && carried.walk.ok === true)) {
            return { verdict: 'EXPLOITED', detail: 'traveler_carry did not build + walk the letter: ' + JSON.stringify(carried && carried.refused).slice(0, 130), tookRequests: 5 };
          }
          const reordered = await throwsTravelerAsync(
            () => mcp.execute('traveler_carry', { id: carried.letter.id, stations: [
              { by: 'a', op: 'inspect' }, { by: 'b', op: 'mold' },
            ], template: [{ op: 'mold' }, { op: 'inspect' }] }).catch((e) => { throw Object.assign(new Error(e.message || String(e)), { code: e.code }); }),
            (e) => e.code === 'E_CARRIER_TEMPLATE' || /bill of stations/.test(e.message)
          );
          if (!reordered) {
            return { verdict: 'EXPLOITED', detail: 'a template reorder did NOT refuse typed E_CARRIER_TEMPLATE', tookRequests: 6 };
          }
          const roster = await mcp.execute('carriers_list', {});
          if (!(roster && roster.carriers && roster.carriers.some((x) => x.id === 'nsc9' && x.available)
            && roster.carriers.some((x) => x.id === 'qr' && x.available === true)
            && roster.carriers.some((x) => x.id === 'png' && x.available === false && x.blocker))) {
            return { verdict: 'EXPLOITED', detail: 'the honesty roster drifted: ' + JSON.stringify(roster && roster.carriers && roster.carriers.map((x) => [x.id, x.available])).slice(0, 130), tookRequests: 7 };
          }
          const repWalk = await mcp.execute('traveler_replay', { arrivals: [{ seq: 1 }, { seq: 2 }] });
          if (!(repWalk && repWalk.ok === true && repWalk.stations === 2)) {
            return { verdict: 'EXPLOITED', detail: 'traveler_replay did not walk the landing rows: ' + JSON.stringify(repWalk && { ok: repWalk.ok, stations: repWalk.stations }).slice(0, 110), tookRequests: 8 };
          }
          return { verdict: 'REFUSED', detail: 'the door verbs carried: open/hop/status/audit hold their contracts built on the ledger, carry routes the template and a reorder refuses typed E_CARRIER_TEMPLATE, replay walks read-class, carriers_list serves the honesty roster', tookRequests: 8 };
        } finally {
          await tWipe();
        }
      },
    },
    {
      name: 'traveler-os-integration',
      description: '(pass 256 slice 6) the OS seams surface: the security-pipeline scanner sees traveler WIRED through the wall layers (sandbox/vaf/qos) with audit adjacency informational, refusals are typed VantErrors (zero raw throws), persistence is audible on the shared event bus, the QoS lane rate-limits the door surface typed (E_TRAVELER_RATE past the window), and a step carries its crew/team attribution lanes',
      async run(_harness) {
        let _busLegs = [];
        try {
          const pipeline = _tReq(resolve('lib/security-pipeline.js'));
          const report = pipeline.scan(resolve('lib'));
          const classified = report.modules.find((m) => m.name === 'traveler') || { layers: {}, wired: [] };
          if (!(classified.wired.includes('sandbox') && classified.wired.includes('vaf') && classified.wired.includes('qos'))) {
            return { verdict: 'EXPLOITED', detail: 'the pipeline scanner did NOT travel through the wall layers: ' + JSON.stringify(classified.layers).slice(0, 120), tookRequests: 1 };
          }
          if (classified.layers.audit !== true) {
            return { verdict: 'EXPLOITED', detail: 'the audit adjacency never recorded (informational layer missing)', tookRequests: 2 };
          }
          const errores = _tReq(resolve('lib/error.js'));
          // identity by NAME, not instanceof: the sandbox may load lib/error.js
          // through two require paths (two classes, one name) — the law being
          // graded is 'typed, not a raw throw', not cross-instance identity
          const isVantErr = (e) => e instanceof errores.VantError || (e && (e.name === 'VantError' || e.constructor && e.constructor.name === 'VantError'));
          const refuseErr = throwsTraveler(
            () => T.advance({ tr: 'tr/99', id: '00', slots: {}, steps: [{ seq: 1, op: 'x', by: 'y', ts: 1 }], seq: 1 }),
            (e) => isVantErr(e) && /^E_TRAVELER_/.test(e.code || '')
          );
          if (!refuseErr) {
            return { verdict: 'EXPLOITED', detail: 'a refusal escaped as a RAW throw (or lost its VantError identity)', tookRequests: 3 };
          }
          // subscribe on the singularity the EMIT lands on: a foreign
          // sandbox may materialize lib/event.js at TWO paths (that exact
          // census was taken in-pack), so the listener rides both and the
          // law stays 'persistence is audible', not 'one path instance'
          const busRepo = _tReq(resolve('lib/event.js'));
          const reqTravelerTree = t_createRequire(_tReq.resolve(resolve('lib/traveler.js')));
          const busTree = reqTravelerTree('./event.js');
          // the REPO-root copy: the harness's pre-arming phase requires the
          // shared libs from the IMPORT TREE (the pack file's own root),
          // while cwd is the tmp sandbox - that instance emits there and
          // still writes the cwd-relative store (the same files) - third yes
          // (file -> vant-carriers -> public -> packs -> ROOT: four ups)
          const { fileURLToPath: _t_f2p } = await import('node:url');
          const tRepoRoot = resolve(_t_f2p(import.meta.url), '..', '..', '..', '..');
          let busRoot3 = null;
          try { busRoot3 = _tReq(resolve(tRepoRoot, 'lib/event.js')); } catch { busRoot3 = null; }
          // bus audibility is graded via the shared SINK (the bounded
          // observability contract of the same bus - foreign-sandbox layouts
          // materialize lib/event.js at multiple require paths, so a direct
          // module-instance listener cannot know WHICH one travels the emit;
          // the sink catches every leg). Enable on each instance, persist,
          // then find the traveler:persisted record carrying the id.
          const busInstances = [busRepo, busTree, busRoot3].filter(Boolean);
          _busLegs = busInstances;
          for (const inst of busInstances) { try { inst.sinkEnable(); } catch { /* best effort */ } }
          const tH = T.mint({ from: 'pack-H-station', slots: { job: 'bus' } });
          T.persist(tH);
          let audible = null;
          for (const inst of busInstances) {
            try {
              const tail = inst.sinkTail({ max: 50, nameFilter: 'traveler:persisted' }) || {};
              const hit = (tail.events || []).find((r) => r.type === 'traveler:persisted' && r.data && r.data.id === tH.id);
              if (hit) audible = hit;
            } catch { /* race */ }
            try { inst.sinkDisable(); } catch { /* best effort */ }
          }
          if (!audible) {
            return { verdict: 'EXPLOITED', detail: 'persistence was NOT audible through the shared event bus sink across ' + busInstances.length + ' bus instance(s) (id ' + String(tH && tH.id).slice(0, 16) + ' did not ride)', tookRequests: 4 };
          }
          // the rate lane: burst past the door ceiling (bounded, 6200 checks)
          let limited = 0;
          for (let i = 0; i < 6200; i++) {
            try { await T.gateCheck('pack-rate-pin', 'hop'); } catch (e) { if (e.code === 'E_TRAVELER_RATE') limited++; }
          }
          if (limited <= 0) {
            return { verdict: 'EXPLOITED', detail: 'the door lane absorbed the whole burst untyped (rate ceiling never bit)', tookRequests: 5 };
          }
          const t6 = T.advance(tH, { op: 'crew-qa', by: 'agent-zeta', team: 'qa-crew' });
          if (t6.steps[t6.steps.length - 1].team !== 'qa-crew') {
            return { verdict: 'EXPLOITED', detail: 'the step did not carry its team attribution lane', tookRequests: 6 };
          }
          return { verdict: 'REFUSED', detail: 'the OS seams all surface typed: pipeline-wired wall layers, VantError refusals, bus-audible persistence, a rate-limited door lane, and crew attribution riding the ledger', tookRequests: 6 };
        } finally {
          for (const _inst of _busLegs) { try { _inst.sinkDisable(); } catch { /* raced */ } }
          await tWipe();
        }
      },
    },

    {
      name: 'traveler-scope-escrow-durability',
      description: '(pass 257 slice 6) identity + durability in-process: a scoped mint stamps the canonical RLS lineage (canAccess inside true / outside false, outside landing refused typed), a PRIVILEGED hop refuses without a live approval, a MINTED approval id authorizes exactly ONE hop (single-use, disk-coherent), the .sha256 pin verifies the on-disk index, and the event-types catalogue declares the traveler channels',
      async run(_harness) {
        try {
          const scope = _tReq(resolve('lib/scope.js'));
          const escrow = _tReq(resolve('lib/escrow.js'));
          // --- RLS lineage
          const scoped = T.mintScoped({ from: 'pack-qa-station', slots: { job: 'rls-job' }, scope: { owner: 'agent:aria', visibility: 'private' } });
          if (!(scoped.scope && scoped.scope.owner === 'agent:aria' && scoped.scope.visibility === 'private' && scope.canAccess(scoped, 'aria') === true && scope.canAccess(scoped, 'bod') === false)) {
            return { verdict: 'EXPLOITED', detail: 'the scoped mint lost its canonical lineage: ' + JSON.stringify({ scope: scoped.scope, aria: scope.canAccess(scoped, 'aria'), bod: scope.canAccess(scoped, 'bod') }).slice(0, 140), tookRequests: 1 };
          }
          const rlsRefused = throwsTraveler(
            () => T.advance(scoped, { op: 'land', by: 'bod' }),
            (e) => /RLS:/.test(e.message) && /^E_TRAVELER_/.test(e.code || '')
          );
          if (!rlsRefused) {
            return { verdict: 'EXPLOITED', detail: 'an OUTSIDE actor landed (or the refusal lost its RLS/typed identity)', tookRequests: 2 };
          }
          const owned = T.advance(scoped, { op: 'land', by: 'aria' });
          if (owned.seq !== 2) {
            return { verdict: 'EXPLOITED', detail: 'the in-scope actor could not ride its own traveler', tookRequests: 3 };
          }
          // --- the escrow approval lane
          const escrowLane = escrow.create({ approvalRequired: ['traveler deploy'] });
          const req = escrowLane.requestApproval('traveler deploy', 'pack-257');
          escrowLane.approve(req.approvalId, 'operator-lane');
          escrowLane.save();
          const tH = T.mint({ from: 'pack-I-station', slots: { job: 'approvals' } });
          const noApproval = throwsTraveler(
            () => T.advance(tH, { op: 'deploy', by: 'op-station', privileged: true }),
            (e) => e.code === 'E_TRAVELER_STEP' && /privileged/.test(e.message)
          );
          if (!noApproval) {
            return { verdict: 'EXPLOITED', detail: 'a privileged hop rode WITHOUT a live approval', tookRequests: 4 };
          }
          const burn = tH.seq;
          const ride = (() => { try { return T.advance(tH, { op: 'deploy', by: 'op-station', privileged: true, approvalId: req.approvalId }); } catch (e) { return e; } })();
          if (!ride || typeof ride.seq !== 'number' || ride.seq !== burn + 1) {
            return { verdict: 'EXPLOITED', detail: 'a minted approval id failed to authorize its planned hop: ' + String(ride && ride.message).slice(0, 120), tookRequests: 5 };
          }
          const reused = throwsTraveler(
            () => T.advance(tH, { op: 'deploy', by: 'op-station', privileged: true, approvalId: req.approvalId }),
            (e) => e.code === 'E_TRAVELER_STEP' && /privileged/.test(e.message)
          );
          if (!reused) {
            return { verdict: 'EXPLOITED', detail: 'the SAME approval id authorized a second hop (single-use broken, #204)', tookRequests: 6 };
          }
          // --- durability: sha pin
          const tI = T.mint({ from: 'pack-I-station', slots: { job: 'durable' } });
          T.persist(tI);
          const crypto = (await import('node:crypto')).default;
          const pinHash = t_fsMod.readFileSync(T._ledgerPath() + '.sha256', 'utf8').trim().split(/\s+/)[0];
          if (crypto.createHash('sha256').update(t_fsMod.readFileSync(T._ledgerPath())).digest('hex') !== pinHash) {
            return { verdict: 'EXPLOITED', detail: 'the .sha256 pin did NOT verify the on-disk index (atomic contract torn)', tookRequests: 7 };
          }
          // --- event-types catalogue
          const et = _tReq(resolve('lib/event-types.js'));
          if (!(et.familyFor('traveler:persisted') === 'work'
            && et.describe('traveler:persisted').emitters.includes('lib/traveler.js')
            && !!et.describe('traveler:refused'))) {
            return { verdict: 'EXPLOITED', detail: 'the traveler channels never landed in the event-types catalogue', tookRequests: 8 };
          }
          return { verdict: 'REFUSED', detail: 'identity + durability hold in-process: RLS refuses outside actors and rides the owned, privileged hops refuse un-approved, a minted approval authorizes exactly one hop then dies, the .sha256 pin verifies the durable index, and the traveler channels are catalogued', tookRequests: 8 };
        } finally {
          await tWipe();
        }
      },
    },

    // ============ slice 7 (2026-10-27): the WIRE seam ============
    {
      name: 'carriers-wire-seam-letter-through-door',
      description: "the certified letter crosses INTO the pod's own relay door: a REAL org-scoped carry() output posts over a REAL loopback mount (the r/2 bridge face's HMAC lane verifies the body bytes) and lands THROUGH the brain_write door slot id-named - the traveler slot law re-verifies the ADDRESS at the receiving node and lands through the traveler lib's OWN append-only store (ledger row + the body beside it, what the mesh door serves); a gapped mid-route tamper refuses E_TRAVELER_STEP, a sneak id refuses E_TRAVELER_ADDRESS, a RE-LAND of the same letter refuses E_TRAVELER_STEP (append-only), and NO refused packet rides the door (zero landing growth)",
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'letterWire', key: 'rtwire' }]);
        if (!ride) return skip('carriers-lane not armed (run-root arm)');
        const r = ride.get('route');
        if (!r) return rowErr('the wire-seam probe failed to answer', [{ op: 'route', case: 'letterWire' }]);
        if (r.fault) return rowErr('the wire-seam probe faulted: ' + r.fault, [{ op: 'route', case: 'letterWire' }]);
        if (r.wireCase !== true) return rowErr('the route arm answered a non-wire case shape', [{ op: 'route', case: 'letterWire' }]);
        if (r.carryOk !== true) return rowErr('the REAL carry did not route: ' + String(r.door || 'unknown'), [{ op: 'route', case: 'letterWire' }]);
        if (r.walkCert !== true) return rowErr('the certified walk did not hold (stages/gaps)', [{ op: 'route', case: 'letterWire' }]);
        if (r.doorOk !== true) return rowErr('the letter did not ack through the REAL relay door: ' + String(r.door || ''), [{ op: 'route', case: 'letterWire' }]);
        if (r.doorLandedIdNamed !== true || r.oneLanding !== true || r.slotCarriesLetter !== true) {
          return rowErr('the door landing was not exactly the letter, id-named in the traveler store (doorOk=' + (r.doorOk === true) + ' landed=' + (r.doorLandedIdNamed === true) + ' oneLanding=' + (r.oneLanding === true) + ' slotCarriesLetter=' + (r.slotCarriesLetter === true) + ')', [{ op: 'route', case: 'letterWire' }]);
        }
        if (r.gappedRefused !== true) return rowErr('a gapped mid-route tamper did not refuse E_TRAVELER_STEP at the door', [{ op: 'route', case: 'letterWire' }]);
        if (r.sneakRefused !== true) return rowErr('a sneak id did not refuse E_TRAVELER_ADDRESS at the door', [{ op: 'route', case: 'letterWire' }]);
        if (r.relandRefused !== true) return rowErr('a RE-LAND of the same letter did not refuse E_TRAVELER_STEP (append-only died at the door)', [{ op: 'route', case: 'letterWire' }]);
        if (r.zeroRefusedGrowth !== true) return rowErr('a REFUSED packet rode the door anyway (landings grew)', [{ op: 'route', case: 'letterWire' }]);
        return { verdict: 'REFUSED', detail: 'the certified letter crossed into the relay door: ' + r.letterSteps + ' steps landed id-named through the brain_write slot as ONE landing in the traveler append-only store (the slot re-verified at the door and the body landed beside the ledger index), the gapped tamper refused E_TRAVELER_STEP, the sneak id refused E_TRAVELER_ADDRESS, the re-land refused E_TRAVELER_STEP (append-only), and zero refused growth - carriers and the wire meet at one honest door', tookRequests: 4 };
      },
    },

    // ============ slice 8 (2026-10-27): the MESH serving wall ============
    {
      name: 'carriers-mesh-serving-wall-on-real-landings',
      description: "the mesh doors stop riding captured shims: ONE packet lands through the brain_write door slot law, then traveler_fetch serves found + re-verified, traveler_stamp derives the VANT:1 frame and a REAL scannable raster, an absent id answers found:false honestly at BOTH verbs, a swapped store refuses identically at both, an exact-byte restore re-arms the wall, the pointer loop decodes the REAL raster through an mcp-door-backed fetch, and the whole serving ride grows the store by ZERO",
      async run(harness) {
        const ride = await probeCarriers(harness, [{ op: 'route', case: 'meshServe', key: 'rtmesh' }]);
        if (!ride) return skip('carriers-lane not armed (run-root arm)');
        const r = ride.get('route');
        if (!r) return rowErr('the mesh probe failed to answer', [{ op: 'route', case: 'meshServe' }]);
        if (r.fault) return rowErr('the mesh probe faulted: ' + r.fault, [{ op: 'route', case: 'meshServe' }]);
        if (r.meshCase !== true) return rowErr('the route arm answered a non-mesh case shape', [{ op: 'route', case: 'meshServe' }]);
        if (r.landed !== true) return rowErr('the door slot did not land via the traveler store (' + (r.fault || 'unknown') + ')', [{ op: 'route', case: 'meshServe' }]);
        if (r.found !== true || r.reverify !== true) return rowErr('traveler_fetch did not serve found + re-verified', [{ op: 'route', case: 'meshServe' }]);
        if (r.frame !== true || r.png !== true) return rowErr('traveler_stamp did not derive the VANT:1 frame + a real raster', [{ op: 'route', case: 'meshServe' }]);
        if (r.pointerLoop !== true) return rowErr('the pointer decode did not resolve the REAL raster through the door-backed fetch', [{ op: 'route', case: 'meshServe' }]);
        if (r.honestMiss !== true || r.honestMissStamp !== true) return rowErr('an absent id was not answered found:false honestly at both door faces', [{ op: 'route', case: 'meshServe' }]);
        if (r.swapRefused !== true) return rowErr('a swapped store did not refuse typed and identically at both door faces', [{ op: 'route', case: 'meshServe' }]);
        if (r.restored !== true) return rowErr('the exact-byte restore did not re-arm the wall', [{ op: 'route', case: 'meshServe' }]);
        if (r.zeroServingGrowth !== true) return rowErr('the serving ride grew the store (census moved)', [{ op: 'route', case: 'meshServe' }]);
        return { verdict: 'REFUSED', detail: 'the wall at the serving node holds on a REAL landing: found + re-verified, the VANT:1 frame and a scannable raster from the verified body, honest found:false misses at both verbs, a swapped store refuses identically at both, restore re-arms, the pointer loop resolves the real raster through the door (zero growth throughout) - the wire and the mesh share one store', tookRequests: 9 };
      },
    },

    // ============ slice 9 (2026-10-27): the TRAVELERS census ============
    {
      name: 'travelers-status-span-ceiling-census',
      description: 'the travelers census pass closes the lib inventory: T.status() is the pin-through query (seen + ledgerRows for a landed packet, honest seen:false for a foreign one, stations verbatim), the trace-span RELATION rides advance (step.span carried through, not duplicated), and the 512KiB state ceiling is now ONE LAW TWO FACES - the working lib refuses oversized slots typed E_TRAVELER_SHAPE with the kit wording verbatim (the kit already did; the lib exported the constant and enforced nothing)',
      async run(_harness) {
        try {
          const FIXED_NOW = 1700000000055;
          await tWipe();
          // (1) the span RELATION: a station may carry a trace span id
          // (lib/trace execution moments) in step.span - advance() carries
          // it through verbatim, relationally
          const t1 = T.mint({ from: 'pack-census-station', slots: { job: 'census' }, now: FIXED_NOW });
          const t2 = T.advance(t1, { op: 'engrave', by: 'pack-census-2', span: 'span-trace-42', detail: {} });
          const spanRode = t2.steps[1] && t2.steps[1].span === 'span-trace-42';
          if (!spanRode) {
            return { verdict: 'EXPLOITED', detail: 'a station trace span did NOT ride advance (' + JSON.stringify(t2.steps[1]).slice(0, 100) + ') - the span relation is the documented ledger field', tookRequests: 1 };
          }
          if (T.verify(t2).ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'a span-carrying packet failed to verify - the span rides inside the address law, relationally, without breaking the address', tookRequests: 2 };
          }
          // (2) T.status(): the pin-through query
          T.persist(t2);
          const st = T.status(t2);
          if (st.seen !== true || !Array.isArray(st.ledgerRows) || st.ledgerRows.length !== 1) {
            return { verdict: 'EXPLOITED', detail: 'the landed packet answered seen=' + (st && st.seen) + ' rows=' + (st && st.ledgerRows && st.ledgerRows.length) + ' - status() is the pin-through query over the frozen ledger', tookRequests: 3 };
          }
          if (!Array.isArray(st.stations) || st.stations.length !== 2 || st.stations[0].op !== t2.steps[0].op || String(st.stations[1].by) !== 'pack-census-2') {
            return { verdict: 'EXPLOITED', detail: 'status().stations drifted from the ledger steps - the query answers verbatim, not summarically', tookRequests: 3 };
          }
          const foreign = T.status(T.mint({ from: 'pack-census-station', slots: { job: 'never-landed' }, now: FIXED_NOW + 7 }));
          if (foreign.seen !== false || (foreign.ledgerRows && foreign.ledgerRows.length)) {
            return { verdict: 'EXPLOITED', detail: 'a never-landed packet answered seen=' + foreign.seen + ' - the honest miss is a record with no rows, never an error and never a fabricated row', tookRequests: 4 };
          }
          // (3) the state ceiling, one law two faces: the working lib NOW
          // refuses what the kit's shape law refused all along (the kit
          // wording verbatim), typed E_TRAVELER_SHAPE, at the shape-checked
          // paths (persist; the kit at the r/2 face)
          const big = 'x'.repeat(T.TRAVEL_MAX_CTEXT); // stringify length > ceiling by the wrapper bytes
          const travBad = JSON.parse(JSON.stringify(t2));
          travBad.slots = { job: 'flooded', context: big };
          const shape = T.shapeRefusalFor(travBad);
          if (!shape || shape.code !== 'E_TRAVELER_SHAPE' || String(shape.message).indexOf(String(T.TRAVEL_MAX_CTEXT)) === -1) {
            return { verdict: 'EXPLOITED', detail: 'an oversized-slots packet answered ' + (shape ? shape.code : 'NO refusal') + ' - the 512KiB state ceiling must refuse typed with the ceiling NAMED', tookRequests: 5 };
          }
          const persistedRefused = throwsTraveler(() => { T.persist(travBad); }, (e) => e.code === 'E_TRAVELER_SHAPE');
          if (!persistedRefused) {
            return { verdict: 'EXPLOITED', detail: 'an oversized-slots packet PERSISTED - the capture path is a shape-checked path and must refuse with the shape law', tookRequests: 6 };
          }
          if (T.TRAVEL_KNOWN.join(',') !== 'tr/1,tr/0' || T.TRAVEL_STEP_MAX !== 512) {
            return { verdict: 'EXPLOITED', detail: 'the exported constants drifted - the census pins the version vocabulary and step ceiling alongside the state ceiling', tookRequests: 6 };
          }
          return { verdict: 'REFUSED', detail: 'the span relation rides advance without breaking the address, status() answers seen + rows + verbatim stations with honest seen:false on a miss, and the 512KiB state ceiling refuses typed E_TRAVELER_SHAPE at persist (kit wording verbatim) - the lib and the r/2 face now speak the same ceiling', tookRequests: 6 };
        } finally {
          await tWipe();
        }
      },
    },
  ],
};
