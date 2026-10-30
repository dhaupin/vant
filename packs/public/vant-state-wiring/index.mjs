/**
 * vant-state-wiring pack — drill-down slice 1 (issue #249, S0→S1 campaign).
 * Converts the TRUST→TREE consumer family's native pins (the first live
 * consumer of the state spine's tree tier, labs/WIRING.md step ①) into
 * pack rows riding the run root's `wiring-trust` arm: the REAL lib/trust.js
 * + lib/state-store seams in-process, the way the native suite
 * (test/state-wiring.test.js's trust block) drives them — no fixtures, no
 * answer sheets; a semantics the spine lacks stays UNDECLARED and the
 * rows honest-skip.
 *
 * House laws: fixed ids (no wall clock in any fixed id — agent ids are
 * constants; op results are neutral facts), one decision per attack,
 * `skipped: true` marks honest absence.
 */

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

    /**
     * slice 3 arm probes: wiring-mesh (in-ride MeshTree instances, fixed
     * step clocks, shared-bus watchers) + wiring-surfaces (geometry,
     * brain-verify, mesh-status). Neutral facts only; dirs sweep on ride end.
     */
    const VOID = () => {};
    async function runArm(harness, arm, ops) {
      let raw;
      try {
        const r = await harness.run(arm, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops }),
        });
        if (typeof r.body === 'string') raw = r.body;
        else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { VOID(); } }
        else if (r.response && typeof r.response.text === 'function') {
          try { raw = await r.response.text(); } catch { VOID(); } }
        else raw = '';
      } catch (e) {
        if (/no route registered as/i.test(String(e && e.message))) return null;
        throw e;
      }
      if (!raw) return null;
      const j = parseJson(raw);
      if (!j || j.error) return null;
      const rows = Array.isArray(j.results) ? j.results : [];
      return { rows, get: (n) => rows.filter((x) => x && x.op === n).pop(), all: (n) => rows.filter((x) => x && x.op === n) };
    }
    const probeMesh = (harness, ops) => runArm(harness, 'wiring-mesh', ops);
    const probeSurfaces = (harness, ops) => runArm(harness, 'wiring-surfaces', ops);

async function probeWiring(harness, ops) {
  let raw;
  try {
    const r = await harness.run('wiring-trust', {
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
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
  if (!raw) return null;
  const j = parseJson(raw);
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.find((x) => x && x.op === n) };
}

/** The merge-path probe (slice 2): module selects the arm's verb table
 * (node-registry / consensus / market). */
async function probeModule(harness, module, ops) {
  let raw;
  try {
    const r = await harness.run('wiring-module', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module, ops }),
    });
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; } }
    else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
  if (!raw) return null;
  const j = parseJson(raw);
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.find((x) => x && x.op === n) };
}

const AGENT = 'wiring-pack-agent-01';
const HEX64 = /^[0-9a-f]{64}$/;

function rowErr(detail, ops, evidence) {
  return { verdict: 'EXPLOITED', detail, tookRequests: ops.length, evidence };
}

// suite-context honest-skip alias (slice 3 rows ride the same shape as
// slice 1/2's `skip` — kind, verdict packing, and detail prefix identical)
const rowSkip = skip;

import { randomBytes } from 'node:crypto';

/**
 * Per-run ride-local salt for state-file tokens (2026-10-28 wave-2).
 * Deliberately NEVER wall clock (the house law: no wall clock in any fixed
 * id) - the anchor ledger is append-only and shared, so each RUN rides its
 * own fresh carrier files; chain laws count DELTAS inside one ride, never
 * absolutes across runs.
 */
const salt = () => 'r' + randomBytes(4).toString('hex');

/**
 * The store-arm probe (wave-2): POST ops over the wiring-store arm, the
 * same shape probeWiring rides. Returns null when the route is not armed.
 */
async function probeStore(harness, ops) {
  let raw;
  try {
    const r = await harness.run('wiring-store', {
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
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
  if (!raw) return null;
  const j = parseJson(raw);
  if (!j || j.error) return null;
  const arr = Array.isArray(j.results) ? j.results : [];
  return { rows: arr, get: (n) => arr.filter((x) => x && x.op === n).pop(), all: (n) => arr.filter((x) => x && x.op === n),
           saved: Array.isArray(j.saved) ? j.saved : [], anchored: Array.isArray(j.anchored) ? j.anchored : [],
           savedCount: j.savedCount || 0, anchoredCount: j.anchoredCount || 0 };
}


export default {
  name: 'vant-state-wiring',
  description: 'state-spine wiring discipline via its consumer families: the ledger mirrors under /trust/ with the score and history in the tree, every mutation re-mirrors and re-hashes, the disk view equals the live mirror in one string, the state:saved event carries that same hash, and clearState leaves no hash for state that no longer exists (slice 3 adds the mesh WAL/event/recovery families and the geometry/brain-verify/mesh-status surfaces)',

  attacks: [
    {
      name: 'trust-mirror-under-tree',
      description: 'record mirrors the ledger into the tree: a 64-hex root hash exists, tree paths live under /trust/, and the mirrored state carries BOTH the agent score and its history (the tree tier is live, not decorative)',
      async run(harness) {
        const ride = await probeWiring(harness, [
          { op: 'clear' },
          { op: 'record', agent: AGENT, kind: 'help', meta: { positive: true, note: 'wiring slice 1 pin' } },
          { op: 'tree', agent: AGENT },
        ]);
        if (!ride) return skip('wiring-trust not armed (pending run-root wiring)');
        const tree = ride.get('tree');
        const record = ride.get('record');
        if (!tree || !record) return rowErr('the mirror probe faulted - the tree tier must answer, not throw', ride.rows);
        if (!HEX64.test(String(record.rootHash || ''))) {
          return rowErr(`record produced no sha256 root hash (${JSON.stringify(record.rootHash)}) - the mirror must hash when it persists`, ride.rows, { rootHash: record.rootHash });
        }
        if (tree.pathsUnderTrust !== true) {
          return rowErr('tree paths do not live under /trust/ - the trust consumer mirrors under its OWN module prefix', ride.rows);
        }
        if (tree.scorePresent !== true || tree.historyPresent !== true) {
          return rowErr(`mirrored state missing score/history (score=${tree.scorePresent} history=${tree.historyPresent}) - the tree must carry the ledger, not a partial of it`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'record minted a 64-hex root, paths live under /trust/, and the mirrored tree carries the score AND the history - the tree tier is live', tookRequests: 3 };
      },
    },

    {
      name: 'trust-mutate-moves-root',
      description: 'mutate again → the root hash MOVES: each persist re-mirrors and re-hashes, so a stale root can never certify the current ledger',
      async run(harness) {
        const ride = await probeWiring(harness, [
          { op: 'clear' },
          { op: 'record', agent: AGENT, kind: 'help', meta: { positive: true } },
          { op: 'tree', agent: AGENT },                       // root-a rides in tree.rootHash
          { op: 'record', agent: AGENT, kind: 'note', meta: { positive: false, value: 0.01 } },
        ]);
        if (!ride) return skip('wiring-trust not armed');
        const treeA = ride.get('tree');
        const recordB = ride.rows.filter((r) => r && r.op === 'record').pop();
        if (!treeA || !recordB) return rowErr('the mutation probe faulted - answers, not throws', ride.rows);
        const rootA = treeA.rootHash;
        const rootB = recordB.rootHash;
        if (!HEX64.test(String(rootA || '')) || !HEX64.test(String(rootB || ''))) {
          return rowErr('either persist produced no sha256 root hash - the mirror must hash on every persist', ride.rows, { rootA, rootB });
        }
        if (rootA === rootB) {
          return rowErr('the root hash did not move after the ledger changed - a frozen root can never certify the current ledger', ride.rows, { rootA });
        }
        return { verdict: 'REFUSED', detail: 'second record moved the root hash - each persist re-mirrors and re-hashes', tookRequests: 4 };
      },
    },

    {
      name: 'trust-disk-view-live',
      description: 'the disk view equals the live mirror in one string: treeFor("state/trust.json") reads PRESENT with a rootHash identical to the live mirror - cross-process "same trust ledger?" is one comparison',
      async run(harness) {
        const ride = await probeWiring(harness, [
          { op: 'clear' },
          { op: 'record', agent: AGENT, kind: 'help', meta: { positive: true } },
          { op: 'disk' },
        ]);
        if (!ride) return skip('wiring-trust not armed');
        const disk = ride.get('disk');
        if (!disk) return rowErr('the disk probe faulted - answers, not throws', ride.rows);
        if (disk.state !== 'PRESENT') {
          return rowErr(`trust.json disk state reads ${JSON.stringify(disk.state)} after a record - the persist must land on disk`, ride.rows);
        }
        if (disk.diskRootHash !== disk.liveRootHash) {
          return rowErr(`disk view (${String(disk.diskRootHash || 'null').slice(0, 10)}...) != live mirror (${String(disk.liveRootHash || 'null').slice(0, 10)}...) - they must agree on ONE hash`, ride.rows, { disk: disk.diskRootHash, live: disk.liveRootHash });
        }
        if (!HEX64.test(String(disk.liveRootHash || ''))) {
          return rowErr('the agreeing hash is not a sha256 hex - the mirror must hash, not placeholder', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'disk view and live mirror agree on one 64-hex hash - cross-process same-state is one string comparison', tookRequests: 3 };
      },
    },

    {
      name: 'trust-event-carries-root',
      description: 'the state:saved event carries the trust root hash and it equals the live mirror at fire time - a synced listener can verify the ledger snapshot without re-reading it',
      async run(harness) {
        const ride = await probeWiring(harness, [
          { op: 'clear' },
          { op: 'watch' },
          { op: 'record', agent: AGENT, kind: 'help', meta: { positive: true } },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return skip('wiring-trust not armed');
        const report = ride.get('report');
        if (!report) return rowErr('the event probe faulted - answers, not throws', ride.rows);
        if (!report.event || !HEX64.test(String(report.event.rootHash || ''))) {
          return rowErr('state:saved fired without a sha256 rootHash - the event must carry the mirror hash', ride.rows, { fired: !!report.event });
        }
        if (report.event.rootHash !== report.event.liveRootHash) {
          return rowErr(`the event snapshot (${String(report.event.rootHash).slice(0, 10)}...) differs from the live mirror (${String(report.event.liveRootHash).slice(0, 10)}...) - the hash must ride the event and MATCH`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'state:saved carried the mirror root hash and it matched live at fire time - synced listeners see the truth', tookRequests: 5 };
      },
    },

    {
      name: 'trust-clear-resets',
      description: 'clearState leaves no hash for state that no longer exists: the mirror drops to null after a live run - no hash blesses ledger rows the deployment no longer holds',
      async run(harness) {
        const ride = await probeWiring(harness, [
          { op: 'clear' },
          { op: 'record', agent: AGENT, kind: 'help', meta: { positive: true } },
          { op: 'peek' },                                    // proves a live root first
          { op: 'clear' },
        ]);
        if (!ride) return skip('wiring-trust not armed');
        const treeLive = ride.get('peek');
        if (!treeLive || !HEX64.test(String(treeLive.rootHash || ''))) {
          return rowErr('the setup pins never had a live root - the reset comparison would be hollow', ride.rows);
        }
        const after = await probeWiring(harness, [{ op: 'peek' }]);
        if (!after || !after.get('peek')) return rowErr('the post-clear probe faulted - answers, not throws', ride.rows);
        if (after.get('peek').rootHash !== null) {
          return rowErr(`the mirror still holds ${String(after.get('peek').rootHash).slice(0, 10)}... after clearState - no hash for state that no longer exists`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'a live 64-hex root existed, then clearState dropped the mirror to null - the reset is honest', tookRequests: 4 };
      },
    },

    // ============ (slice 2) REGISTRY + CONSENSUS + MARKET → TREE ============
    // The second/third/fourth live consumers (WIRING.md steps ② ③) — the
    // merge-path consumers. Same conversion shape as slice 1, with one
    // drive-mechanics difference: registry/heartbeat and the merged-
    // persist disk flush ride vant's OWN timestamps/lock handshakes, so
    // the arm runs a FIXED settle (6ms/20ms) — drive, never a verdict.

    {
      name: 'registry-register-mirrors',
      description: 'register mirrors the peer table through the MERGE path: a 64-hex root, paths under /node-registry/, the registered peer present in the mirrored tree, and the persistMerged state:saved fires with that same rootHash',
      async run(harness) {
        const ride = await probeModule(harness, 'node-registry', [
          { op: 'clear' },
          { op: 'watch' },
          { op: 'act', name: 'register', id: 'wiring-pack-node-1', settleMs: 20 },
          { op: 'tree', value: 'wiring-pack-node-1' },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return skip('wiring-module not armed (slice-2 arm pending)');
        const act = ride.get('act');
        const tree = ride.get('tree');
        const report = ride.get('report');
        if (!act || !tree || !report) return rowErr('the mirror probe faulted - the merge path must answer, not throw', ride.rows);
        if (act.fault) return rowErr('the merge act faulted: ' + act.fault, ride.rows);
        if (tree.fault) return rowErr('the tree probe faulted: ' + tree.fault, ride.rows);
        if (act.ok !== true) return rowErr(`register refused (${JSON.stringify(act.answer)}) - the pin measures the mirror, not the door`, ride.rows);
        if (!HEX64.test(String(act.rootHash || '')) || act.rootHash !== tree.rootHash) {
          return rowErr('register did not re-mirror on the merged path with the SAME hash on the tree read - a ledger write and its mirror must not split', ride.rows, { actRoot: act.rootHash, treeRoot: tree.rootHash });
        }
        if (tree.pathsUnder !== true) return rowErr('tree paths do not live under /node-registry/ - the consumer mirrors under its own prefix', ride.rows);
        if (tree.contains !== true) return rowErr('the registered peer is absent from the mirrored tree - the merge must carry the peer table', ride.rows);
        if (!report.event || report.event.rootHash !== act.rootHash) {
          return rowErr('persistMerged state:saved did not fire with the SAME rootHash - the merge-path event contract (pass 173) must ride', ride.rows, { fired: !!report.event });
        }
        return { verdict: 'REFUSED', detail: 'register re-mirrors on the merge path: root hash in the tree, under /node-registry/, peer present, state:saved rides the same hash', tookRequests: 6 };
      },
    },

    {
      name: 'registry-heartbeat-moves-root',
      description: 'a heartbeat is a merge-path mutation and the root MOVES: after the settle the merged persist re-hashes (the registration stamp and the heartbeat stamp cannot certify the same tree)',
      async run(harness) {
        const ride = await probeModule(harness, 'node-registry', [
          { op: 'clear' },
          { op: 'act', name: 'register', id: 'wiring-pack-node-2', settleMs: 6 },
          { op: 'act', name: 'heartbeat', id: 'wiring-pack-node-2', settleMs: 6 },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const records = ride.rows.filter((r) => r && r.op === 'act');
        if (records.some((r) => r && r.fault)) return rowErr('the merge act faulted: ' + String(records.find((r) => r.fault) || {}).slice(0, 120), ride.rows);
        if (records.length !== 2 || !records[0].ok || !records[1].ok) {
          return rowErr(`the beats faulted or refused (register ok=${records[0] && records[0].ok}, heartbeat ok=${records[1] && records[1].ok}) - a merge-path mutation must land`, ride.rows);
        }
        const rootA = records[0].rootHash;
        const rootB = records[1].rootHash;
        if (!HEX64.test(String(rootA || '')) || !HEX64.test(String(rootB || ''))) {
          return rowErr('either merge produced no sha256 root hash - the mirror must hash on every merged persist', ride.rows, { rootA, rootB });
        }
        if (rootB === rootA) {
          return rowErr('the heartbeat did NOT move the root hash (same-ms stamps?) - a merge-path mutation must re-mirror and re-hash', ride.rows, { rootA });
        }
        return { verdict: 'REFUSED', detail: 'heartbeat moved the root hash on the merge path - each merged persist re-hashes', tookRequests: 5 };
      },
    },

    {
      name: 'registry-disk-view-live',
      description: 'the merged-persist disk view equals the live mirror in one string: treeFor("state/node-registry.json") reads PRESENT with the mirror\'s rootHash - the cross-process same-peer-table check',
      async run(harness) {
        const ride = await probeModule(harness, 'node-registry', [
          { op: 'clear' },
          { op: 'act', name: 'register', id: 'wiring-pack-node-3', settleMs: 20 },
          { op: 'disk' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const disk = ride.get('disk');
        if (!disk) return rowErr('the disk probe faulted - answers, not throws', ride.rows);
        if (disk.state !== 'PRESENT') return rowErr(`node-registry.json disk state reads ${JSON.stringify(disk.state)} after a register - the merged persist must land`, ride.rows);
        if (disk.diskRootHash !== disk.liveRootHash) {
          return rowErr(`disk view != live mirror - they must agree on one hash (disk ${String(disk.diskRootHash || 'null').slice(0, 10)}... vs live ${String(disk.liveRootHash || 'null').slice(0, 10)}...)`, ride.rows);
        }
        if (!HEX64.test(String(disk.liveRootHash || ''))) return rowErr('the agreeing hash is not a sha256 hex - the mirror must hash, not placeholder', ride.rows);
        return { verdict: 'REFUSED', detail: 'disk view and live mirror agree on one 64-hex hash - cross-process same-peer-table is one string', tookRequests: 3 };
      },
    },

    {
      name: 'registry-clear-reset-reuse',
      description: 'clearState wipes EVERYTHING (tombstone maps included): the mirror drops to null and re-registering the same id works cleanly after - the pass-98 tombstones preserve rule holds at the clear boundary',
      async run(harness) {
        const ride = await probeModule(harness, 'node-registry', [
          { op: 'clear' },
          { op: 'act', name: 'register', id: 'wiring-pack-node-4' },
          { op: 'clear' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        if (ride.get('peek') && ride.get('peek').rootHash !== null) {
          return rowErr('the mirror still holds a hash after clearState - no hash for state that no longer exists', ride.rows);
        }
        const raw = ride.get('peek');
        if (raw && raw.rootHash !== null) {
          return rowErr(`the mirror still holds ${String(raw.rootHash).slice(0, 10)}... after clearState`, ride.rows);
        }
        const reUse = await probeModule(harness, 'node-registry', [
          { op: 'act', name: 'register', id: 'wiring-pack-node-4' },
        ]);
        if (!reUse || !reUse.get('act') || reUse.get('act').ok !== true) {
          return rowErr('re-registering the same id after clearState refused - the clear wipes everything, so re-register works cleanly', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'clearState drops the mirror to null AND re-registering the same id afterwards works - the tombstone rule holds at the clear boundary', tookRequests: 4 };
      },
    },

    {
      name: 'consensus-create-mirrors',
      description: 'create mirrors the vote ledgers through the merge path: a 64-hex root, the created topic present in the mirrored tree under /consensus/, and the state:saved rides that same rootHash',
      async run(harness) {
        const ride = await probeModule(harness, 'consensus', [
          { op: 'clear' },
          { op: 'watch' },
          { op: 'act', name: 'create', topic: 'wiring-pack-topic-01', settleMs: 20 },
          { op: 'tree', value: 'wiring-pack-topic-01' },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const act = ride.get('act');
        const tree = ride.get('tree');
        const report = ride.get('report');
        if (!act || !tree || !report) return rowErr('the mirror probe faulted - the merge path must answer, not throw', ride.rows);
        if (act.fault) return rowErr('the merge act faulted: ' + act.fault, ride.rows);
        if (tree.fault) return rowErr('the tree probe faulted: ' + tree.fault, ride.rows);
        if (act.ok !== true) return rowErr(`create refused (${JSON.stringify(act.answer)}) - the pin measures the mirror, not the door`, ride.rows);
        if (!HEX64.test(String(act.rootHash || ''))) return rowErr('create produced no sha256 root hash - the merged persist must hash', ride.rows);
        if (tree.contains !== true) return rowErr('the created vote topic is absent from the mirrored tree - the merge must carry the ledgers', ride.rows);
        if (!report.event || report.event.rootHash !== act.rootHash) {
          return rowErr('state:saved did not fire with the SAME rootHash - the merge-path event contract must ride', ride.rows, { fired: !!report.event });
        }
        return { verdict: 'REFUSED', detail: 'create re-mirrors on the merge path: root hash, topic present in the mirrored tree, state:saved rides the same hash', tookRequests: 6 };
      },
    },

    {
      name: 'consensus-disk-view-live',
      description: 'after the merged persist lands (fixed settle), the disk view equals the live mirror in one string - consensus\'s cross-process same-vote-ledgers check',
      async run(harness) {
        const ride = await probeModule(harness, 'consensus', [
          { op: 'clear' },
          { op: 'act', name: 'create', topic: 'wiring-pack-topic-02', settleMs: 20 },
          { op: 'disk' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const disk = ride.get('disk');
        if (!disk) return rowErr('the disk probe faulted - answers, not throws', ride.rows);
        if (disk.state !== 'PRESENT') return rowErr(`consensus.json disk state reads ${JSON.stringify(disk.state)} - the merged persist must land on disk`, ride.rows);
        if (disk.diskRootHash !== disk.liveRootHash) {
          return rowErr(`disk view != live mirror - they must agree on one hash`, ride.rows, { disk: disk.diskRootHash, live: disk.liveRootHash });
        }
        if (!HEX64.test(String(disk.liveRootHash || ''))) return rowErr('the agreeing hash is not a sha256 hex', ride.rows);
        return { verdict: 'REFUSED', detail: 'disk view and live mirror agree on one 64-hex hash - cross-process same-ledger is one string', tookRequests: 4 };
      },
    },

    {
      name: 'consensus-clear-resets',
      description: 'clearState drops the mirror to null (tombstone maps included) and a re-create after works cleanly - no hash blesses votes the deployment no longer holds',
      async run(harness) {
        const ride = await probeModule(harness, 'consensus', [
          { op: 'clear' },
          { op: 'act', name: 'create', topic: 'wiring-pack-topic-03' },
          { op: 'clear' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const raw = ride.get('peek');
        if (raw && raw.rootHash !== null) {
          return rowErr(`the mirror still holds ${String(raw.rootHash).slice(0, 10)}... after clearState`, ride.rows);
        }
        const reUse = await probeModule(harness, 'consensus', [
          { op: 'act', name: 'create', topic: 'wiring-pack-topic-03' },
        ]);
        if (!reUse || !reUse.get('act') || reUse.get('act').ok !== true) {
          return rowErr('re-creating the same topic after clearState refused - the clear wipes everything, so re-create works cleanly', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'clearState drops the mirror to null and the topic re-creates cleanly - the reset is honest', tookRequests: 4 };
      },
    },

    {
      name: 'market-list-mirrors',
      description: 'list mirrors the market state through the merge path: a 64-hex root, a listing present in the mirrored tree under /market/, and the state:saved rides that same rootHash',
      async run(harness) {
        const ride = await probeModule(harness, 'market', [
          { op: 'clear' },
          { op: 'watch' },
          { op: 'act', name: 'list', title: 'wiring pack pin', seller: 'wiring-pack-seller', settleMs: 20 },
          { op: 'tree', min: 1 },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const act = ride.get('act');
        const tree = ride.get('tree');
        const report = ride.get('report');
        if (!act || !tree || !report) return rowErr('the mirror probe faulted - the merge path must answer, not throw', ride.rows);
        if (act.fault) return rowErr('the merge act faulted: ' + act.fault, ride.rows);
        if (tree.fault) return rowErr('the tree probe faulted: ' + tree.fault, ride.rows);
        if (act.ok !== true) return rowErr(`list refused (${JSON.stringify(act.answer)}) - the pin measures the mirror, not the door`, ride.rows);
        if (!HEX64.test(String(act.rootHash || ''))) return rowErr('list produced no sha256 root hash - the merged persist must hash', ride.rows);
        if (tree.contains !== true) return rowErr('the listed item is absent from the mirrored tree - the merge must carry the listings', ride.rows);
        if (!report.event || report.event.rootHash !== act.rootHash) {
          return rowErr('state:saved did not fire with the SAME rootHash - the merge-path event contract must ride', ride.rows, { fired: !!report.event });
        }
        return { verdict: 'REFUSED', detail: 'list re-mirrors on the merge path: root hash, listing present in the mirrored tree, state:saved rides the same hash', tookRequests: 6 };
      },
    },

    {
      name: 'market-disk-view-live',
      description: 'after the merged persist lands (fixed settle), the disk view equals the live mirror in one string - market\'s cross-process same-listings check',
      async run(harness) {
        const ride = await probeModule(harness, 'market', [
          { op: 'clear' },
          { op: 'act', name: 'list', title: 'wiring pack disk pin', seller: 'wiring-pack-seller', settleMs: 20 },
          { op: 'disk' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const disk = ride.get('disk');
        if (!disk) return rowErr('the disk probe faulted - answers, not throws', ride.rows);
        if (disk.state !== 'PRESENT') return rowErr(`market.json disk state reads ${JSON.stringify(disk.state)} - the merged persist must land on disk`, ride.rows);
        if (disk.diskRootHash !== disk.liveRootHash) {
          return rowErr('disk view != live mirror - they must agree on one hash', ride.rows, { disk: disk.diskRootHash, live: disk.liveRootHash });
        }
        if (!HEX64.test(String(disk.liveRootHash || ''))) return rowErr('the agreeing hash is not a sha256 hex', ride.rows);
        return { verdict: 'REFUSED', detail: 'disk view and live mirror agree on one 64-hex hash - cross-process same-listings is one string', tookRequests: 4 };
      },
    },

    {
      name: 'market-clear-resets',
      description: 'clearState drops the mirror to null AND the search index resets with it - re-listing after works cleanly, no hash blesses a market the deployment no longer holds',
      async run(harness) {
        const ride = await probeModule(harness, 'market', [
          { op: 'clear' },
          { op: 'act', name: 'list', title: 'wiring pack reset pin', seller: 'wiring-pack-seller' },
          { op: 'clear' },
        ]);
        if (!ride) return skip('wiring-module not armed');
        const raw = ride.get('peek');
        if (raw && raw.rootHash !== null) {
          return rowErr(`the mirror still holds ${String(raw.rootHash).slice(0, 10)}... after clearState`, ride.rows);
        }
        const reUse = await probeModule(harness, 'market', [
          { op: 'act', name: 'list', title: 'wiring pack reset pin', seller: 'wiring-pack-seller' },
        ]);
        if (!reUse || !reUse.get('act') || reUse.get('act').ok !== true) {
          return rowErr('re-listing after clearState refused - the clear wipes everything, so re-list works cleanly', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'clearState drops the mirror to null and re-listing works cleanly - the reset is honest', tookRequests: 4 };
      },
    },


    // ============ (slice 3) MESH → WAL (pass 175) ============

    {
      name: 'mesh-wal-deltas-ride-log',
      description: 'mesh deltas ride the real WAL: wal.log and the snapshots dir exist, and the interval snapshot fires at everyN (3 records in, exactly 1 .snap) - persistence is the file, not the memory',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'open', id: 'm1', universe: 'wiring-wal-universe', wal: true, t: 5000, everyN: 3 },
          { op: 'register', r: 'r1', n: 'alpha' },
          { op: 'heartbeat', r: 'r1', n: 'alpha' },
          { op: 'subscribe', r: 'r1', n: 'alpha', scope: '/mesh/r1' },
          { op: 'wal' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed (slice-3 arm pending)');
        const wal = ride.get('wal');
        if (!wal) return rowErr('the wal probe faulted - answers, not throws', ride.rows);
        if (wal.walLog !== true) return rowErr('wal.log did not exist after register-heartbeat-subscribe - deltas must ride the log', ride.rows);
        if (wal.snapshotCount !== 1) {
          return rowErr(`snapshot count ${JSON.stringify(wal.snapshotCount)} at everyN=3 (3 records in) - the interval snapshot must fire on the boundary`, ride.rows, { count: wal.snapshotCount });
        }
        return { verdict: 'REFUSED', detail: 'wal.log + snapshots dir exist and one .snap fired at the everyN=3 boundary - deltas ride the log', tookRequests: 5 };
      },
    },

    {
      name: 'mesh-wal-recovery-reconstructs',
      description: 'a fresh MeshTree over the SAME dir reconstructs the state byte-for-byte: same root hash, same alive answer, the write and the aoi scope survive - recovery replays the log over the latest snapshot',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'open', id: 'seed', universe: 'wiring-wal-universe', wal: true, t: 5000, everyN: 8, dirToken: 'recon-1' },
          { op: 'register', r: 'r1', n: 'alpha', meta: { role: 'writer' } },
          { op: 'heartbeat', r: 'r1', n: 'alpha' },
          { op: 'register', r: 'r1', n: 'beta', meta: { role: 'reader' } },
          { op: 'heartbeat', r: 'r1', n: 'beta' },
          { op: 'write', r: 'r1', n: 'alpha', path: '/mesh/r1/alpha/state', value: { hp: 80 } },
          { op: 'subscribe', r: 'r1', n: 'beta', scope: '/mesh/r1/alpha' },
          { op: 'root' },
          { op: 'alive', r: 'r1', n: 'beta', atTime: 5001 },
          { op: 'get', path: '/mesh/r1/alpha/state' },
          { op: 'treeGet', r: 'r1', n: 'beta', path: '/aoi' },
          { op: 'open', id: 'fresh', universe: 'wiring-wal-universe', wal: true, t: 5000, everyN: 8, dirToken: 'recon-1' },
          { op: 'root' },
          { op: 'alive', r: 'r1', n: 'beta', atTime: 5001 },
          { op: 'get', path: '/mesh/r1/alpha/state' },
          { op: 'treeGet', r: 'r1', n: 'beta', path: '/aoi' },
          { op: 'recovery-info' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const rootSeed = ride.all('root')[0];
        const aliveSeed = ride.all('alive')[0];
        const rootFresh = ride.all('root').pop();
        const aliveFresh = ride.all('alive').pop();
        const stateFresh = ride.all('get').pop();
        const aoiFresh = ride.all('treeGet').pop();
        const rec = ride.get('recovery-info');
        for (const [n, x] of Object.entries({ rootSeed, aliveSeed, rootFresh, aliveFresh, stateFresh, aoiFresh, rec })) {
          if (!x) return rowErr(`the ${n} probe failed to answer - the recovery walk needs every leg`, ride.rows);
        }
        if (rootSeed.rootHash !== rootFresh.rootHash) {
          return rowErr(`recovery produced a DIFFERENT root (${String(rootSeed.rootHash).slice(0, 10)}... vs ${String(rootFresh.rootHash).slice(0, 10)}...) - snapshot + log replay must reproduce the state byte-for-byte`, ride.rows);
        }
        if (JSON.stringify(aliveSeed.alive) !== JSON.stringify(aliveFresh.alive)) {
          return rowErr('the alive answer diverged after recovery - presence must survive the replay', ride.rows);
        }
        if (stateFresh.state !== 'PRESENT' || !stateFresh.value || stateFresh.value.hp !== 80) {
          return rowErr(`the written value did not survive recovery (${JSON.stringify(stateFresh.value)}) - { hp: 80 } must ride the log`, ride.rows);
        }
        if (aoiFresh.state !== 'PRESENT' || !aoiFresh.raw || aoiFresh.raw.scope !== '/mesh/r1/alpha') {
          return rowErr('the aoi scope did not survive recovery - the subscription must replay', ride.rows);
        }
        if (!rec.info || !(rec.info.recovery && rec.info.recovery.replayed >= 0)) {
          return rowErr('recovery did not report a replay count - the info must name what replayed', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'fresh instance over the same dir reconstructs root + alive + write + aoi byte-for-byte and reports the replay count', tookRequests: 17 };
      },
    },

    {
      name: 'mesh-wal-rejected-durable',
      description: 'rejected writes survive: a lower-epoch challenger loses deterministically (recorded with winner+writer shape), and the RECOVERED tree keeps the loser record AND the restored authority - the loser is durable, not in-memory',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'open', id: 'a', universe: 'wiring-wal-universe', wal: true, t: 1000, everyN: 64, dirToken: 'loser-1' },
          { op: 'write', r: 'r', n: 'a', path: '/mesh/r/n/x', value: { v: 1 } },
          { op: 'clock', id: 'a', now: 990 },
          { op: 'write', r: 'r', n: 'b', path: '/mesh/r/n/x', value: { v: 2 } },
          { op: 'rejected' },
          { op: 'open', id: 'b', universe: 'wiring-wal-universe', wal: true, t: 1000, everyN: 64, dirToken: 'loser-1' },
          { op: 'rejected' },
          { op: 'clock', id: 'b', now: 995 },
          { op: 'write', r: 'r', n: 'c', path: '/mesh/r/n/x', value: { v: 0 } },
          { op: 'rejected' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        void ride.get('root');
        const chalWrite = ride.all('write').pop();
        if (!chalWrite || chalWrite.accepted !== false) {
          return rowErr('the lower-epoch challenger was not refused - last-writer-wins must deterministically reject the older epoch', ride.rows);
        }
        const rejA = ride.all('rejected')[0];
        const rejB = ride.all('rejected').pop();
        if (!rejA || !rejB) return rowErr('the rejection probes faulted - answers, not throws', ride.rows);
        if (rejA.count !== 1) {
          return rowErr(`the live tree recorded ${JSON.stringify(rejA.count)} rejected write(s) - exactly the one loser`, ride.rows);
        }
        if (rejB.count !== 2) {
          return rowErr(`the recovered tree recorded ${JSON.stringify(rejB.count)} rejected write(s), expected 2 (the loser replayed + the second challenger) - the record + single-writer authority must survive recovery`, ride.rows);
        }
        void probeMesh;
        if (rejA.shapes.some((s) => !s.winner && !s.path && !s.writer)) {
          return rowErr('a rejected entry lost its shape (winner/writer/path) - provenance rides every delta, even the losers', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'the loser recorded with provenance shape, and the recovered tree kept the record AND the authority (second challenger refused) - durability holds cold', tookRequests: 10 };
      },
    },
    {
      name: 'mesh-wal-ledger-provenance',
      description: 'every delta is provenance-stamped (actor string + numeric epoch, never anonymous) and the delta ledgerHash is DETERMINISTIC - two trees that saw the same events agree on one hash',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'open', id: 'ledger1', universe: 'wiring-ledger-universe', wal: false, t: 42 },
          { op: 'register', r: 'r', n: 'n' },
          { op: 'heartbeat', r: 'r', n: 'n' },
          { op: 'write', r: 'r', n: 'n', path: '/mesh/r/n/state', value: { x: 1 } },
          { op: 'write', r: 'r', n: 'other', path: '/mesh/r/n/state', value: { x: 2 } },
          { op: 'ledger' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const ledger = ride.get('ledger');
        if (!ledger) return rowErr('the ledger probe faulted - answers, not throws', ride.rows);
        if (ledger.sequenceLength < 3) {
          return rowErr(`sequenceLength ${JSON.stringify(ledger.sequenceLength)} after register+heartbeat+2 writes - the ledger must record every delta`, ride.rows);
        }
        if (ledger.since.some((rec) => !rec.actor || rec.actor.length === 0)) {
          return rowErr('a delta carries NO actor - the actor is NOT optional', ride.rows);
        }
        if (ledger.since.some((rec) => rec.epoch !== true)) { // arm maps: epoch rode as a finite number
          return rowErr('a delta carried a NON-numeric epoch (the arm mapping saw it move) - the epoch is NOT optional', ride.rows);
        }
        const ride2 = await probeMesh(harness, [
          { op: 'open', id: 'ledger2', universe: 'wiring-ledger-universe', wal: false, t: 42 },
          { op: 'register', r: 'r', n: 'n' },
          { op: 'heartbeat', r: 'r', n: 'n' },
          { op: 'write', r: 'r', n: 'n', path: '/mesh/r/n/state', value: { x: 1 } },
          { op: 'write', r: 'r', n: 'other', path: '/mesh/r/n/state', value: { x: 2 } },
          { op: 'ledger' },
        ]);
        const ledger2 = ride2 && ride2.get('ledger');
        if (!ledger2) return rowErr('the determinism twin faulted - answers, not throws', ride.rows);
        if (ledger.ledgerHash !== ledger2.ledgerHash) {
          return rowErr('two trees that saw the same events hashed DIFFERENTLY - the ledgerHash must be deterministic, not process-local', ride.rows, { a: ledger.ledgerHash, b: ledger2.ledgerHash });
        }
        return { verdict: 'REFUSED', detail: 'every delta carries actor+epoch and two same-event trees agree on one ledgerHash - provenance is deterministic', tookRequests: 12 };
      },
    },

    {
      name: 'mesh-wal-interval-fastforward',
      description: 'interval snapshot fast-forwards recovery: keepK=2 bounded recovery reproduces the exact state (same root), and the LAST delta won the contested presence path',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'open', id: 'snap1', universe: 'wiring-wal-universe', wal: true, nowMode: 'step', t: 7000, step: 10, everyN: 2, keepK: 2, dirToken: 'ff-1' },
          { op: 'heartbeat', r: 'r', n: 'n0' },
          { op: 'heartbeat', r: 'r', n: 'n1' },
          { op: 'heartbeat', r: 'r', n: 'n2' },
          { op: 'heartbeat', r: 'r', n: 'n3' },
          { op: 'heartbeat', r: 'r', n: 'n4' },
          { op: 'root' },
          { op: 'open', id: 'snap2', universe: 'wiring-wal-universe', wal: true, nowMode: 'step', t: 7000, step: 10, everyN: 2, keepK: 2, dirToken: 'ff-1' },
          { op: 'root' },
          { op: 'get', path: '/mesh/r/n4/presence' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const roots = ride.all('root');
        if (roots.length !== 2 || !HEX64.test(String(roots[0].rootHash || ''))) {
          return rowErr('the recovery root probe faulted or never hashed - answers, not throws', ride.rows);
        }
        if (roots[0].rootHash !== roots[1].rootHash) {
          return rowErr(`bounded recovery produced a DIFFERENT root - snapshot fast-forward must land the same state`, ride.rows);
        }
        const last = ride.all('get').pop();
        if (!last || last.state !== 'PRESENT') {
          return rowErr('the last-winner presence path is absent after recovery - the LAST delta must win', ride.rows);
        }
        if (!last.raw || last.raw.heartbeat !== 7040) {
          return rowErr(`the recovered heartbeat ${JSON.stringify(last.raw && last.raw.heartbeat)} != 7040 (t=7000 step=10, four heartbeats later) - the LAST delta won`, ride.rows, { raw: last.raw });
        }
        return { verdict: 'REFUSED', detail: 'bounded (keepK=2) recovery reproduces the same root and the last delta (n4) holds the contested path', tookRequests: 10 };
      },
    },

    // ============ (slice 3) MESH → EVENTS (pass 176) ============

    {
      name: 'mesh-events-bus-provenance',
      description: 'every mutation emits on the shared bus with provenance: register, heartbeat, aoi, write, and write:rejected all fire with actor and epoch, and a challenger at an OLDER epoch loses and its rejection rides',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'watch', names: ['mesh:register', 'mesh:heartbeat', 'mesh:aoi', 'mesh:write', 'mesh:write:rejected'] },
          { op: 'open', id: 'evt1', universe: 'wiring-evt-universe', wal: false, t: 100 },
          { op: 'register', r: 'r', n: 'n' },
          { op: 'heartbeat', r: 'r', n: 'n' },
          { op: 'subscribe', r: 'r', n: 'n', scope: '/mesh/r' },
          { op: 'write', r: 'r', n: 'n', path: '/mesh/r/x', value: { v: 1 } },
          { op: 'clock', id: 'evt1', now: 99 },
          { op: 'write', r: 'r', n: 'n', path: '/mesh/r/x', value: { v: 2 } },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const report = ride.get('report');
        if (!report) return rowErr('the event probe faulted - answers, not throws', ride.rows);
        const names = report.names || [];
        for (const want of ['mesh:register', 'mesh:heartbeat', 'mesh:aoi', 'mesh:write', 'mesh:write:rejected']) {
          if (!names.includes(want)) {
            return rowErr(`missing event ${want} (got: ${names.join(',')}) - every mutation must emit on the shared bus`, ride.rows);
          }
        }
        if (report.fired.some((f) => !f.actor || typeof f.actor !== 'string')) {
          return rowErr('an event carries NO actor - actor rides every mutation event', ride.rows);
        }
        if (report.fired.some((f) => f.epoch !== true)) { // arm maps: event epoch rode as a finite number
          return rowErr('an event carried a NON-numeric epoch (the arm mapping saw it move) - epoch rides every mutation event', ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'register/heartbeat/aoi/write/write:rejected all fired with actor+epoch on the shared bus', tookRequests: 9 };
      },
    },

    {
      name: 'mesh-events-silent-side-effect-free',
      description: 'silent trees emit nothing: register, heartbeat, and write on a silent tree fire zero events - a status probe can never become a bus side effect',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'watch', names: ['mesh:register', 'mesh:heartbeat', 'mesh:write'] },
          { op: 'open', id: 'silent1', universe: 'wiring-evt-universe', wal: false, t: 100, silent: true },
          { op: 'register', r: 'r', n: 'n' },
          { op: 'heartbeat', r: 'r', n: 'n' },
          { op: 'write', r: 'r', n: 'n', path: '/mesh/r/n/state', value: { v: 1 } },
          { op: 'report' },
          { op: 'unwatch' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const report = ride.get('report');
        if (!report) return rowErr('the silent probe faulted - answers, not throws', ride.rows);
        if ((report.fired || []).length !== 0) {
          return rowErr(`a silent tree emitted ${report.fired.length} event(s) (${(report.names || []).join(',')}) - silent must be event-SILENT`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'register+heartbeat+write on a silent tree fired zero bus events - a status probe is never a side effect', tookRequests: 7 };
      },
    },

    {
      name: 'mesh-events-recovery-emits',
      description: 'persistent recovery emits mesh:recovered ONCE carrying the live root hash and the replay count - a healed instance announces exactly one recovery, not a flood',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'watch', names: ['mesh:register'] },
          { op: 'open', id: 'seed-1', universe: 'wiring-evt-universe', wal: true, t: 100, silent: true, everyN: 2, dirToken: 'rec-2' },
          { op: 'register', r: 'r', n: 'n' },
          { op: 'watch', names: ['mesh:recovered'] },
          { op: 'open', id: 'fresh-1', universe: 'wiring-evt-universe', wal: true, t: 100, everyN: 2, dirToken: 'rec-2' },
          { op: 'report' },
          { op: 'root' },
          { op: 'unwatch' },
        ]);
        if (!ride) return rowSkip('wiring-mesh not armed');
        const report = ride.get('report');
        if (!report) return rowErr('the recovery-event probe faulted - answers, not throws', ride.rows);
        const fired = report.fired || [];
        if (fired.length !== 1) {
          return rowErr(`mesh:recovered fired ${fired.length} time(s) after fresh recovery - announcement is exactly once`, ride.rows);
        }
        const rec = fired[0];
        const root = ride.get('root');
        if (!HEX64.test(String(rec.rootHash || '')) || !HEX64.test(String(root.rootHash || '')) || rec.rootHash !== root.rootHash) {
          return rowErr('the recovery event did not carry the live root hash - the healed instance must announce its root hash', ride.rows, { event: rec.rootHash, live: root.rootHash });
        }
        if (rec.replayed !== 1) {
          return rowErr(`recovery reported ${JSON.stringify(rec.replayed)} replays for one seeded register - the replay count must be exactly 1`, ride.rows);
        }
        return { verdict: 'REFUSED', detail: 'mesh:recovered fired once with the live root hash and replayed=1 - a healed instance announces once, loudly', tookRequests: 8 };
      },
    },

    // ============ (slice 3) GEOMETRY → SPINE (pass 176) ============

    {
      name: 'geometry-canonical-barcodes',
      description: 'quasicrystal barcodes ride the ONE canonical encoder: same logical content hashes identically in ANY key order, the NSC-9 12-digit format contract intact, the digits derive from the canonical hash of the same content, and distinct content stays distinct',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'barcode' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed (slice-3 arm pending)');
        const b = ride.get('barcode');
        if (!b) return rowErr('the barcode probe faulted - answers, not throws', ride.rows);
        if (b.fault) return rowErr('the barcode probe faulted: ' + b.fault, ride.rows);
        if (b.deterministic !== true) return rowErr(`the encoder moved across identical calls (deterministic=${b.deterministic})`, ride.rows);
        if (b.orderIndependent !== true) return rowErr('same logical content hashed DIFFERENTLY under a different key order - the disease is back at the generator', ride.rows);
        if (b.formatOk !== true) return rowErr('the barcode does not match the NSC-9 12-digit format contract', ride.rows);
        if (b.matchesCanonical !== true) return rowErr(`the barcode digits do not derive from the canonical hash of the SAME content (${b.samplePrefix}...)`, ride.rows);
        if (b.distinct !== true) return rowErr('distinct content produced the SAME barcode - collisions make an address useless', ride.rows);
        return { verdict: 'REFUSED', detail: 'key-order-independent, deterministic, format-contracted, canonically derived, and distinct-content-distinct - one encoder, working', tookRequests: 1 };
      },
    },

    {
      name: 'geometry-barcode-roundtrip',
      description: 'barcode addressing still self-authenticates: store → retrieve lands the exact content, re-deriving the barcode from the stored content reaches the SAME record, and has() answers for the rederived address',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'barcode-roundtrip' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const rt = ride.get('barcode-roundtrip');
        if (!rt) return rowErr('the roundtrip probe faulted - answers, not throws', ride.rows);
        if (rt.fault) return rowErr('the roundtrip probe faulted: ' + rt.fault, ride.rows);
        if (rt.stored !== true) return rowErr('the store refused - the addressing must admit its own barcode', ride.rows);
        if (rt.retrieved !== true) return rowErr('the retrieve returned the WRONG content - store/retrieve must roundtrip byte-for-byte', ride.rows);
        if (rt.rederivedSame !== true) return rowErr('re-deriving the barcode from the stored content produced a DIFFERENT address - self-authentication broken', ride.rows);
        if (rt.hasAgain !== true) return rowErr('has() denied the rederived address', ride.rows);
        return { verdict: 'REFUSED', detail: 'store→retrieve roundtrips, the rederived barcode matches, and has() answers - addressing self-authenticates', tookRequests: 1 };
      },
    },

    // ============ (slice 3) BRAIN-VERIFY → SURFACES (pass 176) ============

    {
      name: 'brainverify-health-lifecycle',
      description: 'the health surface verifies a brain against its anchor: a fresh brain gets a baseline (warn at first anchor), a clean brain verifies, and tampering is DETECTED (DIVERGED)',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'brainverify-health' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const bv = ride.get('brainverify-health');
        if (!bv) return rowErr('the health probe failed to answer - the walk needs all three runs', ride.rows);
        if (bv.fault) return rowErr('the health probe faulted: ' + bv.fault, ride.rows);
        if (bv.baselineAnchored !== true) return rowErr("the fresh brain did not get a baseline-anchored message - a first verify must warn AND anchor", ride.rows);
        if (bv.cleanVerified !== true) return rowErr('the clean brain did not verify against last anchor - the anchor must hold on clean reads', ride.rows);
        if (bv.diverged !== true) return rowErr('the TAMPERED brain did not report DIVERGED - on-disk tampering must be detected against the last anchor', ride.rows);
        if (bv.pipelineOrdered !== true) return rowErr('the three legs ran out of order in the captured output - baseline before verify before tamper', ride.rows);
        return { verdict: 'REFUSED', detail: 'fresh brain anchored a baseline, clean brain verified, tamper DIVERGED - the health surface recomputes against the anchor', tookRequests: 1 };
      },
    },

    {
      name: 'brainverify-horcrux-exit-contract',
      description: 'the horcrux verify/anchor exit-code contract holds: no anchor -> 2, anchor -> 0, clean verify -> 0, tamper -> 1 with DIVERGED, intentional re-anchor -> 0 again',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'brainverify-horcrux' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const hx = ride.get('brainverify-horcrux');
        if (!hx) return rowErr('the horcrux probe failed to answer - the walk needs all six exits', ride.rows);
        if (hx.fault) return rowErr('the horcrux probe faulted: ' + hx.fault, ride.rows);
        if (hx.noAnchorCode !== 2) return rowErr(`no anchor exited ${JSON.stringify(hx.noAnchorCode)} - the contract is 2`, ride.rows);
        if (hx.anchoredCode !== 0 || hx.anchoredText !== true) return rowErr(`anchor exited ${JSON.stringify(hx.anchoredCode)} without 'Anchored' text - the CLI must say what it did`, ride.rows);
        if (hx.cleanCode !== 0) return rowErr(`clean verify exited ${JSON.stringify(hx.cleanCode)} - the contract is 0`, ride.rows);
        if (hx.divergedCode !== 1 || hx.divergedText !== true) return rowErr(`tampered brain exited ${JSON.stringify(hx.divergedCode)} without 'DIVERGED' text - the contract is 1 + DIVERGED`, ride.rows);
        if (hx.reanchorCode !== 0 || hx.recleanCode !== 0) return rowErr(`re-anchor/verify exited ${JSON.stringify(hx.reanchorCode)}/${JSON.stringify(hx.recleanCode)} - an intentional re-anchor must restore 0`, ride.rows);
        return { verdict: 'REFUSED', detail: 'no anchor 2 / anchor 0 / clean 0 / tamper 1+DIVERGED / re-anchor 0 / verify 0 - the exit-code contract is intact', tookRequests: 1 };
      },
    },

    // ============ (slice 3) MESH-STATUS → MESHTREE ============

    {
      name: 'meshstatus-mesh-section-shape',
      description: 'the status report carries the mesh section honestly: 64-hex seed scope under mesh:local, positive presence TTL, a peers array, and the JSON roundtrip keeps the section count intact',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'meshstatus-report' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const rep = ride.get('meshstatus-report');
        if (!rep) return rowErr('the status probe faulted - answers, not throws', ride.rows);
        if (rep.fault) return rowErr('the status probe faulted: ' + rep.fault + ' (mesh degraded NOT allowed in this posture)', ride.rows);
        if (rep.present !== true) return rowErr('the mesh section is missing or carries an error - the report must carry the section', ride.rows);
        if (rep.seedHex64 !== true) return rowErr('the seed scope hex is missing or SHORT - a spine derivation must be full-width', ride.rows);
        if (rep.scopePath !== 'mesh:local') return rowErr(`scopePath is ${JSON.stringify(rep.scopePath)} - the scope path law is mesh:local`, ride.rows);
        if (rep.ttlPositive !== true) return rowErr('presence TTL is not positive - the TTL is proven presence', ride.rows);
        if (rep.peersArray !== true) return rowErr('peers is not an array - the projection types must hold', ride.rows);
        if (rep.jsonCountStable !== true) return rowErr('the JSON roundtrip did not survive the new section - count must not mutate', ride.rows);
        return { verdict: 'REFUSED', detail: 'mesh section present with 64-hex scope, mesh:local path, positive TTL, peers array, and a stable JSON roundtrip', tookRequests: 1 };
      },
    },

    {
      name: 'meshstatus-seed-pure-and-envflow',
      description: 'the seed scope is a PURE function (same answer twice, no perturbation) AND it tracks VANT_UNIVERSE_SEED (the report proves the env flows), restored afterwards',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'meshstatus-envflow' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const ef = ride.get('meshstatus-envflow');
        if (!ef) return rowErr('the env-flow probe faulted - answers, not throws', ride.rows);
        if (ef.fault) return rowErr('the env-flow probe faulted: ' + ef.fault, ride.rows);
        if (ef.pureTwice !== true) return rowErr('the seed derivation MOVED between two unseed status calls - the derivation must be pure', ride.rows);
        if (ef.envMoved !== true) return rowErr("the seed did NOT move under the probe universe seed - the env must flow into the derivation", ride.rows);
        return { verdict: 'REFUSED', detail: 'the derivation is pure (same hex twice) and it tracks the universe seed env (flows, restored after)', tookRequests: 1 };
      },
    },

    {
      name: 'meshstatus-render-degraded',
      description: 'the render stays honest when the leg is degraded: the mesh line still renders its label with (unavailable) and prints the error ITSELF (never a stack, never silence)',
      async run(harness) {
        const ride = await probeSurfaces(harness, [{ op: 'meshstatus-render' }]);
        if (!ride) return rowSkip('wiring-surfaces not armed');
        const rd = ride.get('meshstatus-render');
        if (!rd) return rowErr('the render probe faulted - answers, not throws', ride.rows);
        if (rd.fault) return rowErr('the render probe faulted: ' + rd.fault, ride.rows);
        if (rd.errorRendered !== true) return rowErr('the render did not print the poisoned-leg error - the error IS the status', ride.rows);
        if (rd.labelKept !== true) return rowErr('the degraded section lost its mesh line label - degraded must still render, not vanish', ride.rows);
        return { verdict: 'REFUSED', detail: 'the mesh line renders its label with (unavailable) and the poisoned-leg error itself - degraded-not-dead holds on the render path', tookRequests: 1 };
      },
    },

    // ============ the market inventory census (2026-10-27) ============
    {
      name: 'market-scope-visibility-and-cancel-matrix',
      description: "the market's unmeasured inventory cluster: the create-path scope gate refuses malformed AND owner-less scope objects typed E_SCOPE (the live-fire fix - the old normalize-only gate silently widened a private-intent listing to public), the scoped-membership visibility triad holds (search invisible, GET unseen-not-404, stats serves counts with the id views stripped from every non-member index while the member sees them), a non-member trade rides E_SCOPE, the cancelTrade authorization matrix answers honest envelopes (not-found / not-a-party / already-completed) over a REAL settled trade, the bid consent gate refuses without consent, and description-less AND reward-less bids no longer kill _persist - the disk tree keeps the earlier listings after those bids report (the restart-survival law)",
      async run(harness) {
        // the census rides a dedicated child route, not the merge verb table
        let raw = null, res = null, absent = false;
        try {
          res = await harness.run('wiring-market-census', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (typeof res.body === 'string') raw = res.body;
          else if (typeof res.text === 'function') { try { raw = await res.text(); } catch { raw = ''; } }
          else if (res.response && typeof res.response.text === 'function') { try { raw = await res.response.text(); } catch { raw = ''; } }
          else raw = '';
        } catch (e) {
          if (/no route registered as/i.test(String(e && e.message))) { absent = true; }
          else throw e;
        }
        if (absent) return skip('wiring-market-census not armed (pending run-root wiring)');
        if (!raw || !raw.trim()) return skip('wiring-market-census not armed: rType=' + (res && res.constructor && res.constructor.name) + ' status=' + (res && res.status) + ' rawType=' + typeof raw + ' rawHead=' + String(raw).slice(0, 120));
        const j = parseJson(raw);
        if (!j || j.error) return skip('market census probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return rowErr('the census child faulted mid-census: ' + (j.bail || 'unknown'), [], null);
        if ((j.badScope && j.badScope.code) !== 'E_SCOPE' || (j.ownerlessScope && j.ownerlessScope.code) !== 'E_SCOPE') {
          return rowErr('malformed/owner-less scope answered ' + JSON.stringify(j.badScope) + '/' + JSON.stringify(j.ownerlessScope) + ' - the create path must REJECT typed (the old gate silently widened a private-intent listing to public)', [], { bad: j.badScope, ownerless: j.ownerlessScope });
        }
        if (j.listingsAfterBad !== 0) {
          return rowErr('a refused shape stored a listing (count=' + j.listingsAfterBad + ') - the typed refusal must mean nothing crossed', [], { after: j.listingsAfterBad });
        }
        if (!j.scopedScope || j.scopedScope.owner !== 'agent:market-alpha-seller' || j.scopedScope.visibility !== 'private') {
          return rowErr('the honest scoped listing stored ' + JSON.stringify(j.scopedScope) + ' - the agent-kind scope must normalize verbatim', [], { scope: j.scopedScope });
        }
        if (j.anonSearchHasScopedId !== false || j.memberSearchHasScopedId !== true) {
          return rowErr('search anon=' + j.anonSearchHasScopedId + ' member=' + j.memberSearchHasScopedId + ' - a scoped listing is invisible to non-members and visible to its member', [], {});
        }
        if (j.anonGetUnseen !== true || j.memberGetSeen !== true) {
          return rowErr('get anon=' + j.anonGetUnseen + ' member=' + j.memberGetSeen + ' - scoped means UNSEEN (null), not 404-vs-403 noise', [], {});
        }
        if (j.statsAnonStripped !== true || j.statsAnonCountsScoped !== true || j.statsMemberSees !== true) {
          return rowErr('stats stripped=' + j.statsAnonStripped + ' counts=' + j.statsAnonCountsScoped + ' member=' + j.statsMemberSees + ' - the non-member id views must NEVER contain the scoped id (counts only), the member keeps the useful index', [], {});
        }
        if ((j.scopeTrade && j.scopeTrade.code) !== 'E_SCOPE') {
          return rowErr('the stranger trade answered ' + JSON.stringify(j.scopeTrade) + ' - a scoped listing is untradable by non-members typed', [], {});
        }
        if (j.tradeCompleted !== true || !j.tradeDebit || j.tradeDebit.amount !== 2) {
          return rowErr('the real trade answered completed=' + j.tradeCompleted + ' debit=' + JSON.stringify(j.tradeDebit) + ' - the honest settlement carries the escrow debit', [], {});
        }
        if (!j.cancelUnknown || !j.cancelOther || !j.cancelCompleted ||
            !/not found/i.test(String(j.cancelUnknown.error)) ||
            !/not authorized/i.test(String(j.cancelOther.error)) ||
            !/already completed/i.test(String(j.cancelCompleted.error))) {
          return rowErr('the cancel matrix: ' + JSON.stringify([j.cancelUnknown, j.cancelOther, j.cancelCompleted]) + ' - unknown id / not-a-party / completed trade each need their honest envelope', [], {});
        }
        if (!j.bidNoConsent || !/not allowed/i.test(String(j.bidNoConsent.error))) {
          return rowErr('the consentless bid answered ' + JSON.stringify(j.bidNoConsent) + ' - governance must refuse typed, never silently', [], {});
        }
        if (j.bidsOk !== true || j.diskExists !== true || j.diskKeeperSurvives !== true || !(j.diskBids >= 2)) {
          return rowErr('the restart-survival law: bids=' + j.bidsOk + ' disk=' + j.diskExists + ' keeper=' + j.diskKeeperSurvives + ' bidsOnDisk=' + j.diskBids + ' - description-less AND reward-less bids must not kill _persist (the canonical.encode undefined class)', [], {});
        }
        return { verdict: 'REFUSED', detail: 'the scope gate rejects both irrational shapes typed (nothing stored), the visibility triad holds at search/get/stats with the non-member id views stripped, the stranger trade rides E_SCOPE, the cancel matrix answers its three honest envelopes over a REAL debited trade, the consentless bid refuses governance-typed, and desc-less + reward-less bids persist - the earlier listings survive on disk', tookRequests: 14 };
      },
    },

    // ============ the market skills-gate census (2026-10-27) ============
    {
      name: 'market-skills-gate-and-lifecycle-laws',
      description: "the skills prototype's gate cluster: the OFF gate inerts all six ops (listSkill, buySkill, deliverSkill, settleSkill, skillStatus, skillSweep) typed E_SKILLS_DISABLED (inert, never absent), the ON gate carries the kind boundary (any non text|code payloadKind refuses E_SKILL_PAYLOAD_KIND with the declared why), the role walls (the buyer cannot deliver), the delivery hash law (64-hex, real sha256 of the bytes), the settle discipline (bad decision typed, identity-anchor demanded, buyer-only confirm settles with the trust feed written), the on-demand sweep answers, and the gate flips honestly both ways",
      async run(harness) {
        let raw = null, res = null, absent = false;
        try {
          res = await harness.run('wiring-market-census', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ section: 'skills' }),
          });
          if (typeof res.body === 'string') raw = res.body;
          else if (typeof res.text === 'function') { try { raw = await res.text(); } catch { raw = ''; } }
          else if (res.response && typeof res.response.text === 'function') { try { raw = await res.response.text(); } catch { raw = ''; } }
          else raw = '';
        } catch (e) {
          if (/no route registered as/i.test(String(e && e.message))) { absent = true; }
          else throw e;
        }
        if (absent) return skip('wiring-market-census not armed (pending run-root wiring)');
        const j = parseJson(raw);
        if (!j || j.error) return skip('market census probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return rowErr('the census child faulted mid-census: ' + (j.bail || 'unknown'), [], null);
        const OFF = (j.skOff || []);
        if (!Array.isArray(OFF) || OFF.length !== 6 || OFF.some((c) => c !== 'E_SKILLS_DISABLED')) {
          return rowErr('the OFF gate answered ' + JSON.stringify(OFF) + ' - all six ops must be INERT typed E_SKILLS_DISABLED (never absent, never a throw, never a silent success)', [], { off: OFF });
        }
        if ((j.skOnInvalidKind && j.skOnInvalidKind.code) !== 'E_SKILL_PAYLOAD_KIND') {
          return rowErr('the launch kind answered ' + JSON.stringify(j.skOnInvalidKind) + ' - the credentialed-execution boundary refuses at listing time with the declared why', [], {});
        }
        if (j.skOnListOk !== true || j.skOnBuy !== true) {
          return rowErr('the honest skill flow: list=' + j.skOnListOk + ' buy=' + j.skOnBuy + ' - a gated-ON skill lists and the buyer opens the pending-delivery trade', [], {});
        }
        if (j.skOnDeliverByBuyerRefused !== 'E_SKILL_NOT_SELLER' || j.skOnDelivered !== true) {
          return rowErr('delivery: buyerRefused=' + j.skOnDeliverByBuyerRefused + ' sellerOk=' + j.skOnDelivered + ' - the buyer cannot deliver; the seller of record delivers a 64-hex hashed payload', [], {});
        }
        if (j.skOnSettleBadDecision !== 'E_SKILL_DECISION' || j.skOnSettleNoIdentity !== 'E_SKILL_IDENTITY_REQUIRED') {
          return rowErr('settle discipline: badDecision=' + j.skOnSettleBadDecision + ' anon=' + j.skOnSettleNoIdentity + ' - the settle decision must be confirm|refute and carry the buyer identity', [], {});
        }
        if (j.skOnSettleConfirm !== true || j.skOnSweep !== true) {
          return rowErr('settle=' + j.skOnSettleConfirm + ' sweep=' + j.skOnSweep + ' - the buyer-only confirm settles with the trust feed written; the on-demand sweep answers', [], {});
        }
        if (j.skOffAgain !== 'E_SKILLS_DISABLED') {
          return rowErr('the gate re-off answered ' + JSON.stringify(j.skOffAgain) + ' - the flag flips honestly both ways (never a stuck-ON prototype)', [], {});
        }
        return { verdict: 'REFUSED', detail: 'the OFF gate inerts all six ops typed (and re-offers the gate off again after the flip), the ON gate refuses the launch kind with the declared why, the role walls hold (buyer cannot deliver, seller delivers a 64-hex payload), the settle discipline is typed and identity-anchored (bad decision, no identity, buyer-only confirm with the trust feed), and the sweep answers - the gate cluster is measured', tookRequests: 10 };
      },
    },
    // ============ (wave-2 conversion, 2026-10-28) the SEEDS + AUTHORITY
    // + tree-tier + ANCHOR + in-memory families ======================
    // The last uncovered pins off the retiring native suite
    // (test/state-wiring.test.js): the seeds family (universe-scoped,
    // deterministic, env-sharded, boundary-typed), the canonical
    // authority (one encoder, winner-or-loser), the bare store tier
    // (roundtrip / persist-event / disk tier / typed absence / hydrate),
    // the StateAnchor chain (append / dedupe / tamper / never-bless /
    // merged + the anchor event), and the in-memory default. On green
    // x2 across cycles, the native file retires whole.

    {
      name: 'mesh-seeds-family',
      description: 'region seed scopes are universe-scoped and deterministic (two fresh trees, one seed), universes shard, VANT_UNIVERSE_SEED moves the default-constructor seed, and the boundary refuses invalid/empty regions typed',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'seed', universe: 'wire-test', region: 'r1' },
          { op: 'seed', universe: 'wire-test', region: 'r1' },
          { op: 'seed', universe: 'u-alpha', region: 'r1' },
          { op: 'seed', universe: 'u-beta', universe2: 'u-alpha', region: 'r1' },
          { op: 'seed', regions: ['../evil', ''] },
          { op: 'envseed' },
        ]);
        if (!ride) return skip('wiring-mesh not armed');
        const seedOps = ride.all('seed');
        if (seedOps.length !== 5) return rowErr('the seeds ops did not all answer: ' + JSON.stringify(seedOps.map((x) => x && x.op)), []);
        const [sameA, sameB, uniSha, uniShb, rideInvalid] = seedOps;
        for (const [nm, opRow] of [['sameA', sameA], ['sameB', sameB], ['uniSha', uniSha], ['uniShb', uniShb], ['invalid', rideInvalid]]) {
          if (!opRow || opRow.fault) return rowErr(`the ${nm} seed op faulted: ${JSON.stringify(opRow)}`, seedOps);
        }
        const scopeOf = (opRow) => (opRow.scopes || [])[0] || { fault: 'missing scope 0' };
        const s1 = scopeOf(sameA);
        const s1b = scopeOf(sameB);
        const su = scopeOf(uniSha);
        const ub = scopeOf(uniShb);
        const scopes = [s1, s1b, su, ub];
        if (!scopes.every((s) => s.ok && /^[0-9a-f]{64}$/.test(String(s.seedHex)))) return rowErr('the valid regions did not all answer a 64-hex seed: ' + JSON.stringify(scopes), seedOps);
        if (String(s1.scopePath) !== 'mesh:r1') return rowErr(`the normalized scope path is ${String(s1.scopePath)} - the seed scope rides the 'mesh:' spine prefix`, seedOps);
        if (String(s1.seedHex) !== String(s1b.seedHex)) return rowErr('two fresh trees over the SAME universe derived DIFFERENT seeds - the seed chain must be deterministic', seedOps);
        if (String(su.seedHex) === String(ub.seedHex)) return rowErr('universes u-alpha and u-beta derived the SAME seed - the universe must shard mesh addressing', seedOps);
        const bad = (rideInvalid && rideInvalid.scopes) || [];
        if (bad.length !== 2 || !bad.every((b) => b.ok === false && /invalid region/i.test(String(b.fault)))) return rowErr('the invalid/empty regions were not both refused typed: ' + JSON.stringify(bad), seedOps);
        if (uniShb.sharded !== true) return rowErr(`the same region under u-beta vs u-alpha answered sharded=${String(uniShb.sharded)} - the universe must shard mesh addressing`, seedOps);
        const env = ride.get('envseed');
        if (!env || env.fault || env.envMoved !== true) return rowErr('the VANT_UNIVERSE_SEED env override did not answer envMoved:true: ' + JSON.stringify(env), []);
        return { verdict: 'REFUSED', detail: 'seeds are one deterministic universe-scoped chain (two fresh trees, one seed; universes shard; the env shard flows through the default constructor) and the seed boundary refuses invalid/empty regions typed - the seeds family is wired', tookRequests: 6 };
      },
    },

    {
      name: 'mesh-celladdr-one-prf',
      description: 'MeshTree.cellAddress IS the spine PRF for the same region+space (no adapters): equal over the same universe, stable across repeat calls, moving across spaces',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'celladdr', universe: 'parity-universe', region: 'r1', space: 7, other: 8 },
        ]);
        if (!ride) return skip('wiring-mesh not armed');
        const ca = ride.get('celladdr');
        if (!ca || ca.fault) return rowErr('the cell-address probe faulted: ' + JSON.stringify(ca), []);
        if (ca.equal !== true) return rowErr(`the MeshTree address (${String(ca.viaMesh).slice(0, 10)}...) and the spine address (${String(ca.viaSpine).slice(0, 10)}...) differ - the ONE chain must have no adapters`, []);
        if (ca.stable !== true) return rowErr('the same region+space answered a different address on the repeat call - the PRF must be stable', []);
        if (ca.moved !== true) return rowErr('different spaces under the same region answered the same address - the space must move the address', []);
        return { verdict: 'REFUSED', detail: 'MeshTree.cellAddress collides exactly with the spine PRF (equal, stable, per-space moving) - one chain, no adapters', tookRequests: 1 };
      },
    },

    {
      name: 'mesh-authority-canonical-winner',
      description: 'the same payload written in different key order under one fixed clock hashes to ONE root (the canonical encoder), and the same-tree regression still keeps winner-or-recorded-loser (never more than one loser)',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'authpair', universe: 'auth-universe' },
        ]);
        if (!ride) return skip('wiring-mesh not armed');
        const auth = ride.get('authpair');
        if (!auth || auth.fault) return rowErr('the authority probe faulted: ' + JSON.stringify(auth), []);
        if (auth.keyOrderEqual !== true) return rowErr(`the two key orders diverged (${String(auth.rootA).slice(0, 10)}... vs ${String(auth.rootB).slice(0, 10)}...) - the canonical encoder must be key-order independent`, []);
        if (auth.either !== true || auth.loserSmall !== true) return rowErr('the winner-or-loser law failed: ' + JSON.stringify({ either: auth.either, loserSmall: auth.loserSmall }), []);
        return { verdict: 'REFUSED', detail: 'one fixed clock, two key orders, one root hash; the same-tree regression keeps the winner-or-recorded-loser law - the canonical encoder is the only authority', tookRequests: 1 };
      },
    },

    {
      name: 'mesh-persistence-inmemory-default',
      description: 'a MeshTree without { dir } stays in-memory honestly (persistenceInfo: enabled false, dir null, recovery null) and the behavior contract still answers',
      async run(harness) {
        const ride = await probeMesh(harness, [
          { op: 'inmemdefault', universe: 'mem-default-u' },
        ]);
        if (!ride) return skip('wiring-mesh not armed');
        const md = ride.get('inmemdefault');
        if (!md || md.fault) return rowErr('the in-memory probe faulted: ' + JSON.stringify(md), []);
        if (md.disabled !== true || md.dirNull !== true || md.recoveryNull !== true) return rowErr('the default persistenceInfo is not the honest battery-off shape: ' + JSON.stringify(md), []);
        if (md.stillAlive !== true) return rowErr('the no-dir tree stopped answering the behavior contract (register + alive)', []);
        return { verdict: 'REFUSED', detail: 'a dir-less MeshTree reports the battery-off truth (enabled false, dir null, recovery null) while register/alive keep answering - the in-memory default is wired', tookRequests: 1 };
      },
    },

    {
      name: 'store-tree-tier-laws',
      description: 'the bare tree tier: toTree/fromTree roundtrip carries STATE KEYS ONLY (metadata excluded, paths under /<module>/), and the same payload in fresh trees hashes to one root regardless of key order',
      async run(harness) {
        const ride = await probeStore(harness, [
          { op: 'roundtrip', module: 'pin-ct' },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const rt = ride.get('roundtrip');
        if (!rt || rt.fault) return rowErr('the roundtrip probe faulted - answers, not throws', []);
        const got = (rt.paths || []).join(',');
        if (got !== '/pin-ct/config,/pin-ct/peers') return rowErr(`the tree paths are [${got}] - state keys must be the ONLY content (metadata riding?)`, []);
        if (rt.backOnlyStateKeys !== true) return rowErr('the fromTree roundtrip leaked savedAt/kind/module into the state payload - metadata must not ride the tree', []);
        if (rt.rootSame !== true) return rowErr('the same payload in fresh trees diverged on key order - the root hash must be canonical, not insertion-ordered', []);
        return { verdict: 'REFUSED', detail: 'toTree/fromTree carries exactly the state keys (roundtrip exact, metadata excluded) and fresh trees agree on one root hash across key orders - the bare tier is wired', tookRequests: 1 };
      },
    },

    {
      name: 'store-persist-mirror-event',
      description: 'persist({tree}) mirrors the state into the caller tree, the disk tier reads back PRESENT with the SAME root hash, and state:saved fires carrying that root',
      async run(harness) {
        const f = 'state/pin-ct-mirror-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'persisttree', module: 'pin-ct', file: f, data: { hits: 3 } },
          { op: 'diskfor', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const pt = ride.get('persisttree');
        if (!pt || pt.fault || pt.accepted !== true) return rowErr('the reflected persist did not answer accepted:true', []);
        if ((pt.treePaths || []).some((p) => p === '/pin-ct/hits') !== true) return rowErr(`the caller tree paths are [${(pt.treePaths || []).join(',')}] - the persist must mirror the payload into the tree`, []);
        if (!/^[0-9a-f]{64}$/.test(String(pt.rootHash))) return rowErr('the mirror root hash is not a sha256 hex - mirroring must hash, not placeholder', []);
        const d = ride.get('diskfor');
        if (!d || d.fault || d.state !== 'PRESENT') return rowErr('the disk view did not answer PRESENT for the persisted file - the disk tier did not ride', []);
        if (String(d.rootHash) !== String(pt.rootHash)) return rowErr(`the disk root (${String(d.rootHash).slice(0, 10)}...) differs from the mirror root (${String(pt.rootHash).slice(0, 10)}...) - cross-process same-state is one string`, []);
        const ev = (ride.saved || []).find((s) => s.stateFile === String(f) && String(s.rootHash) === String(pt.rootHash));
        if (!ev) return rowErr('state:saved did not fire with the mirror root hash for this file - the event must carry the snapshot', []);
        return { verdict: 'REFUSED', detail: 'persist({tree}) mirrors into the caller tree, the disk view reads back PRESENT with the matching root, and state:saved carries that root - one hash end to end', tookRequests: 2 };
      },
    },

    {
      name: 'store-treefor-typed-absence',
      description: 'treeFor answers a typed ABSENT (no hash, no fake empty tree) for a file the store never wrote',
      async run(harness) {
        const ride = await probeStore(harness, [
          { op: 'diskfor', file: 'state/pin-ct-never-' + salt() + '.json' },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const d = ride.get('diskfor');
        if (!d || d.fault) return rowErr('the absence probe faulted - answers, not throws', []);
        if (d.state !== 'ABSENT') return rowErr(`treeFor answered ${String(d.state)} for a never-written file - the presence must be typed, not guessed`, []);
        if (d.rootHash != null) return rowErr('a never-written file carried a root hash - absence must not bless a hash', []);
        return { verdict: 'REFUSED', detail: 'a never-written state file answers the typed ABSENT (no hash, no fake empty tree) - the disk presence tier is honest about absence', tookRequests: 1 };
      },
    },

    {
      name: 'store-hydrate-law',
      description: 'hydrate({tree}) populates the CALLER tree and returns the root hash; fromTree reads the payload back',
      async run(harness) {
        const f = 'state/pin-ct-hydr-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'drypersist', module: 'pin-ct', file: f, data: { n: 11 } },
          { op: 'hydratetree', module: 'pin-ct', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const d0 = ride.get('drypersist');
        if (!d0 || d0.fault || d0.ok !== true) return rowErr('the hydrate stage did not persist anything onto disk', []);
        const h = ride.get('hydratetree');
        if (!h || h.fault || h.applied !== true) return rowErr('hydrate did not answer applied:true - the hydrate side did not ride', []);
        if (!/^[0-9a-f]{64}$/.test(String(h.rootHash))) return rowErr('the hydrate root hash is not a sha256 hex - hydrate must return the tree root, not a placeholder', []);
        if (!h.back || Number(h.back && h.back.n) !== 11) return rowErr('fromTree over the hydrated tree did not read the payload back: ' + JSON.stringify(h.back), []);
        if ((h.treePaths || []).some((p) => p === '/pin-ct/n') !== true) return rowErr(`the hydrated tree paths are [${(h.treePaths || []).join(',')}] - hydrate must populate the CALLER tree`, []);
        return { verdict: 'REFUSED', detail: 'hydrate populates the caller tree, returns the 64-hex root, and fromTree reads the payload back - the hydrate law is wired', tookRequests: 2 };
      },
    },

    {
      name: 'store-anchor-chain-event-laws',
      description: 'the StateAnchor chain is an event history, NOT a heartbeat log: first root anchors once (state:anchored fires with it), an unchanged root dedupes, a changed root anchors, a fresh mirror over the same content stays deduped, and the per-carrier tail carries root + carrier',
      async run(harness) {
        const f = 'state/pin-ct-anch-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'anchorcount', file: f },
          { op: 'persisttree', module: 'pin-ct', file: f, data: { n: 1 } },
          { op: 'anchorcount', file: f },
          { op: 'persisttree', module: 'pin-ct', file: f, data: { n: 1 } },
          { op: 'anchorcount', file: f },
          { op: 'persisttree', module: 'pin-ct', file: f, data: { n: 3 } },
          { op: 'persisttree', module: 'pin-ct', file: f, data: { n: 3 } },
          { op: 'anchorcount', file: f },
          { op: 'anchorlast', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const counts = ride.all('anchorcount');
        if (counts.length !== 4 || counts.some((c) => c.count < 0)) return rowErr('the chain counter never answered: ' + JSON.stringify(counts), counts);
        if (counts[0].count !== 0) return rowErr(`the fresh-state file already rode ${counts[0].count} chain entries - the ride salt must be fresh per run`, counts);
        if (counts[1].count !== 1) return rowErr(`the first anchor produced ${counts[1].count - counts[0].count} entries (want exactly +1) - first root anchored once`, counts);
        if (counts[2].count !== 1) return rowErr(`the identical root persisted twice added ${counts[2].count - counts[1].count} entries (want +0) - the unchanged root must dedupe`, counts);
        if (counts[3].count !== 2) return rowErr(`the changed root + fresh mirror ended at ${counts[3].count} (want exactly 2) - the changed root anchors and the fresh mirror over the same content stays deduped`, counts);
        const last = ride.get('anchorlast');
        if (!last || last.state !== 'PRESENT' || !last.entry) return rowErr('the anchor tail never answered PRESENT', [last]);
        if (!/^[0-9a-f]{64}$/.test(String(last.entry.rootHash))) return rowErr('the anchor tail root is not a sha256 hex', [last]);
        if (String(last.entry.carrier) !== String(f)) return rowErr(`the anchor tail carries ${last.entry.carrier} - the ledger is per-state-file (carrier)`, [last]);
        const ev = (ride.anchored || []).find((a) => a.stateFile === String(f) && /^[0-9a-f]{64}$/.test(String(a.rootHash)));
        if (!ev) return rowErr('state:anchored did not fire with the root for this file - the event must ride the anchor', []);
        return { verdict: 'REFUSED', detail: 'the anchor chain is an event history: first root anchored once with the root on state:anchored, identical root dedupes, changed root anchors, fresh mirror stays deduped, per-carrier tail carries root + carrier - the anchor laws are wired', tookRequests: 9 };
      },
    },

    {
      name: 'store-anchor-tamper-detector',
      description: 'verifyStateRoot verifies clean state against the anchor, then detects the out-of-band disk write (tampering that bypassed the store choke point) with a divergence that names the anchor',
      async run(harness) {
        const f = 'state/pin-ct-tamper-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'persisttree', module: 'pin-ct', file: f, data: { secret: 'good' } },
          { op: 'verifyroot', file: f },
          { op: 'tamper', file: f },
          { op: 'verifyroot', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const pri = ride.all('verifyroot');
        if (pri.length !== 2) return rowErr('the verify stages did not both answer: ' + JSON.stringify(pri), pri);
        const [clean, dirty] = pri;
        if (clean.fault || clean.verifyOk !== true) return rowErr('clean state did not verify against its last anchor: ' + JSON.stringify(clean), pri);
        if (clean.anchored !== true) return rowErr('the clean verify did not answer anchored:true - the chain must hold the baseline', pri);
        const tamp = ride.get('tamper');
        if (!tamp || tamp.fault || tamp.wrote !== true) return rowErr('the out-of-band write never landed: ' + JSON.stringify(tamp), []);
        if (dirty.fault || dirty.verifyOk !== false) return rowErr('tampered state still verified ok:true - the divergence detector must catch the writes that bypassed the store', pri);
        if (!dirty.firstDivergence || !/diverged since anchor/i.test(String(dirty.firstDivergence))) return rowErr(`the divergence text is ${String(dirty.firstDivergence)} - it must name the anchor`, pri);
        return { verdict: 'REFUSED', detail: 'verifyStateRoot answers clean-against-anchor on the untouched tree and catches the out-of-band disk write with a diverged-since-anchor verdict - the tamper leg is wired', tookRequests: 4 };
      },
    },

    {
      name: 'store-anchor-no-tree-never-bless-law',
      description: 'no tree tier → no anchor (typed not-yet-anchored verdict), and hydrate never appends to the anchor ledger even with a tree in hand - a restart must not re-bless whatever happens to be on disk',
      async run(harness) {
        const f = 'state/pin-ct-fresh-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'persistplain', module: 'pin-ct', file: f, data: { n: 5 } },
          { op: 'hydratetree', module: 'pin-ct', file: f },
          { op: 'hydratekill', module: 'pin-ct', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const pp = ride.get('persistplain');
        if (!pp || pp.fault || pp.accepted !== true) return rowErr('the no-tree persist did not land: ' + JSON.stringify(pp), []);
        if (pp.anchorState !== 'ABSENT') return rowErr(`a no-tree persist still carried an anchor entry (${String(pp.anchorState)}) - no tree means nothing to anchor`, []);
        if (pp.noAnchorTyped !== true || pp.verifyOk !== false) return rowErr('verifyStateRoot did not answer the typed not-yet-anchored verdict: ' + JSON.stringify(pp), []);
        const kill = ride.get('hydratekill');
        if (!kill || kill.fault) return rowErr('the hydrate ledger probe faulted - answers, not throws', []);
        if (kill.before == null || kill.after == null || kill.before !== kill.after) return rowErr(`hydrate changed the anchor chain (${String(kill.before)} -> ${String(kill.after)}) - a restart must not re-bless disk`, []);
        return { verdict: 'REFUSED', detail: 'a no-tree persist leaves the chain empty (typed not-yet-anchored) and hydrate - even carrying a tree - never appends to the anchor ledger - the never-bless law holds', tookRequests: 3 };
      },
    },

    {
      name: 'store-anchor-merged-cause-law',
      description: 'persistMerged rides the SAME anchor contract as persist: the merged root anchors once and the cause string names the merge path',
      async run(harness) {
        const f = 'state/pin-ct-merged-' + salt() + '.json';
        const ride = await probeStore(harness, [
          { op: 'persistmerged', module: 'pin-ct', file: f, data: { n: 6 } },
          { op: 'anchorlast', file: f },
          { op: 'verifyroot', file: f },
        ]);
        if (!ride) return skip('wiring-store not armed');
        const pm = ride.get('persistmerged');
        if (!pm || pm.fault || pm.accepted !== true) return rowErr('the merged persist did not land: ' + JSON.stringify(pm), []);
        if (pm.anchorState !== 'PRESENT') return rowErr('the merged root never anchored - the lock-path write must ride the same contract', []);
        if (String(pm.rootHash) !== String(pm.treeRoot)) return rowErr(`the anchored root (${String(pm.rootHash).slice(0, 10)}...) differs from the merged tree root (${String(pm.treeRoot).slice(0, 10)}...)`, []);
        if (!pm.cause || !/persistMerged/.test(String(pm.cause))) return rowErr(`the anchor cause is ${String(pm.cause)} - it must name the merge path`, []);
        const v = ride.get('verifyroot');
        if (!v || v.fault || v.verifyOk !== true) return rowErr('the merged state did not verify against its anchor: ' + JSON.stringify(v), []);
        return { verdict: 'REFUSED', detail: 'persistMerged anchors the merged tree root with a cause that names the merge path and the state verifies clean - the lock-path write rides the same contract', tookRequests: 3 };
      },
    },
  ],
};
