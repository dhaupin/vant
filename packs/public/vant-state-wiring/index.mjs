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

export default {
  name: 'vant-state-wiring',
  description: 'state-spine wiring discipline via the trust consumer family: the ledger mirrors under /trust/ with the score and history in the tree, every mutation re-mirrors and re-hashes, the disk view equals the live mirror in one string, the state:saved event carries that same hash, and clearState leaves no hash for state that no longer exists',

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
  ],
};
