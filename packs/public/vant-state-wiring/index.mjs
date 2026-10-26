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
  ],
};
