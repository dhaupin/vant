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
 * absence; the native suite (test/carriers.test.js) stays green alongside
 * under the reverse-verification law.
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

function rowErr(detail, ops, evidence) {
  return { verdict: 'EXPLOITED', detail, tookRequests: ops.length, evidence };
}
const rowSkip = skip;
const VOID = () => {};

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
  ],
};
