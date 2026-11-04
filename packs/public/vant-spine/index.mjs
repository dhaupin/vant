// packs/public/vant-spine/index.mjs - the engine-parity spine battery.
//
// Converts the native test/engine-parity-spine.test.js pins (state PRD,
// #145-#166) onto pack rows per the campaign's reverse-verification law:
// the native suite stays green ALONGSIDE until one full run cycle is
// green on both sides; the S-counter only moves on that.
//
// Slice 1 (2026-10-26): STATE CORE, STORAGE, TARGETED - the in-process
// invariants (canonical bytes, tree laws, checkpoint recovery, anchor
// ledger, hot-set durability, persistent grants + WAL denial). Every row
// drives the real lib modules directly (loadLib house pattern, no
// sockets, no run-root arm) and captures the native assertions on the
// same determinism terms: tmp fixtures are created fresh per drive and
// cleaned up; no wall clock lands in a verdict.
//
// Slice 2 (2026-10-27): GEOMETRY, WORLD/CLOCK, MESH/BRAINS (#154-#166) -
// the 1:4 fold laws, the ONE PRF chain (lattice-keys drives the
// fragmenter AND the GitHub adapter), the RAID carrier + precision
// contract, the addressing spine (one module, stored-once shared facts,
// RAID cell addresses + CellStore rebates), the seed chain / orbits /
// delta-ledger world clock, the mesh AOI filter + pure staleness +
// deterministic write winners, and the brain verify + horcrux chain.
// Native test/engine-parity-spine.test.js RETIRED WHOLE (2026-10-27, the
// carriers precedent: all six families - state core, storage, targeted,
// geometry, world/clock, mesh/brains - are converted across the two
// slices; the coverage lives in this pack's 16 rows).

async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const ns = await import(pathToFileURL(resolve(relPath)).href);
  return ns.default || ns;
}

async function loadAll(mods) {
  const out = [];
  for (const m of mods) out.push(await loadLib(m));
  return out;
}

async function tmpdir() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-spine-row-'));
  return { p, path, fs };
}

function throws(fn, re) {
  try { fn(); return false; } catch (e) { return re.test(String(e && e.message)); }
}

export default {
  name: 'vant-spine',
  description: 'engine-parity spine discipline for the state engine: canonical bytes reject non-plain values and key-order-independ, the StateTree put/diff/snapshot laws hold exactly (LWW, no phantom diffs, verified scope apply, truncated refusal, caller cap), the fold ring/depth/disjointness arithmetic agrees with the cell store rebate math (measured savings), checkpoint recovery reproduces the pre-kill root and DENIES an unreadable log, the anchor ledger is append-only with divergence verdicts, the hot set falls through to durable truth past its eviction cap, and persistent grants + WAL denial are fail-closed (expired/refused/unreadable never allow). Slice 2 adds the rest of the spine: the geometry 1:4 fold laws + ONE PRF shard-key chain, the RAID carrier (any one shard lost recovers exact bytes, tamper reported and parity-rebuilt, two lost refuses typed) + the precision contract, the addressing spine (all consumers derive through ONE module, shared facts stored once, RAID cells addressed + rebated through the same spine), the deterministic world clock (seed chain domain separation + 10K-path distinctness, pure orbits with exact periodicity, an actor-mandatory delta ledger), the mesh wall (AOI filter, provably-pure staleness, deterministic write winners with the loser recorded) and the brain verify + horcrux chain (divegent-typed verifies, restored roots equal forged roots, unreadable files DENY before read)',

  attacks: [
    {
      name: 'canonical-bytes-law',
      description: "canonical hashing is byte-stable: two key orders of one logical dict encode + hash IDENTICALLY, the torture corpus roundtrips byte-exactly (nulls, floats, unicode, nesting, 10k strings), non-plain objects and non-finite numbers refuse typed, and the schema-id prefix changes the hash when the schema or path changes",
      async run(_harness) {
        const gs = await loadAll(['lib/state/canonical.js', 'lib/state/tree.js']);
        const canonical = gs[0];
        const a = canonical.hash({ b: 2, a: 1, c: { y: 1, x: [1, 2] } });
        const b = canonical.hash({ a: 1, b: 2, c: { x: [1, 2], y: 1 } });
        if (a !== b) {
          return { verdict: 'EXPLOITED', detail: 'two key orders of one dict hashed DIFFERENTLY - the #146 disease is alive', tookRequests: 1 };
        }
        const corpus = [
          null, true, false, 0, -0, 0.1, 1e21, -42, 12345.6789,
          '', 'unicode: héllo 世界', 'a'.repeat(10000),
          [], [1, [2, [3, null, true]]],
          {}, { a: 1 }, { '': 0, z: { nested: [1.5, -0.5] } },
        ];
        let roundtrips = 0;
        for (const v of corpus) {
          const e1 = canonical.encode(v);
          const d = canonical.decode(e1);
          if (!canonical.encode(d).equals(e1)) {
            return { verdict: 'EXPLOITED', detail: 'the canonical roundtrip broke for ' + JSON.stringify(v).slice(0, 48), tookRequests: 2, evidence: { case: JSON.stringify(v).slice(0, 48) } };
          }
          roundtrips += 1;
        }
        if (!throws(() => canonical.encode(Reflect.construct(Date, [])), /non-plain object/)
          || !throws(() => canonical.encode(NaN), /non-finite/)
          || !throws(() => canonical.encode(undefined), /unsupported value type/)) {
          return { verdict: 'EXPLOITED', detail: 'a forbidden value (Date / NaN / undefined) encode()d without a typed refusal', tookRequests: 3 };
        }
        const h1 = canonical.nodeHash('/x', 'schema@1', { a: 1 });
        const h2 = canonical.nodeHash('/x', 'schema@2', { a: 1 });
        const h3 = canonical.nodeHash('/y', 'schema@1', { a: 1 });
        if (h1 === h2 || h1 === h3) {
          return { verdict: 'EXPLOITED', detail: 'the schema-id prefix collapsed: same value under a different schema or path hashed the same', tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: `the keys-order law holds, ${roundtrips} corpus cases roundtrip byte-exactly, forbidden values refuse typed, and the schema/path prefix separates`, tookRequests: 4 };
      },
    },

    {
      name: 'tree-put-diff-snapshot-laws',
      description: 'the StateTree laws hold exactly: identical facts under identical paths root-hash identically across fresh trees, same-path writes are last-write-wins with the write count exact, N writes produce exactly the honest diff (no phantom entries), a scope snapshot applies verified onto a node that held STALE data, a tampered truncated flag refuses apply typed, the caller cap bounds snapshots at the declared count with deterministic path order, and identical reads cost exactly one write each',
      async run(_harness) {
        const gs = await loadAll(['lib/state/tree.js']);
        const { StateTree } = gs[0];
        const t1 = new StateTree(), t2 = new StateTree();
        t1.put('/trust/peer_x', { score: 5 });
        t2.put('/trust/peer_x', { score: 5 });
        if (t1.rootHash() !== t2.rootHash()) {
          return { verdict: 'EXPLOITED', detail: 'identical facts hashed to different roots across fresh trees', tookRequests: 2 };
        }
        const t = new StateTree();
        t.put('/a/fact', 'v1');
        t.put('/b/fact', 'v1');
        t.put('/a/fact', 'v2');
        const g = t.get('/a/fact');
        if (g.state !== 'PRESENT' || g.value.value !== 'v2') {
          return { verdict: 'EXPLOITED', detail: 'LWW broke: ' + JSON.stringify(g).slice(0, 110), tookRequests: 3 };
        }
        const a = new StateTree(), b = new StateTree();
        for (let i = 0; i < 10; i++) { a.put('/p/' + i, { i }); b.put('/p/' + i, { i }); }
        b.put('/p/3', { i: 99 });
        b.put('/p/new', 1);
        const d = a.diff(b);
        if (d.length !== 2 || !d.some((x) => x.path === '/p/3' && x.kind === 'changed') || !d.some((x) => x.path === '/p/new' && x.kind === 'added')) {
          return { verdict: 'EXPLOITED', detail: 'the diff is not exactly two honest entries: ' + JSON.stringify(d).slice(0, 140), tookRequests: 4 };
        }
        const sender = new StateTree(), receiver = new StateTree();
        sender.put('/world/w1/zones/z1', { a: 1 });
        sender.put('/world/w1/zones/z2', { b: 2 });
        receiver.put('/world/w1/zones/z1', { STALE: true });
        const snap = sender.snapshot('/world/w1');
        if (snap.truncated !== false) {
          return { verdict: 'EXPLOITED', detail: 'an unbounded scope snapshot reported itself truncated', tookRequests: 5 };
        }
        const res = receiver.apply(snap);
        if (res.verified !== true || receiver.get('/world/w1/zones/z2').value.b !== 2) {
          return { verdict: 'EXPLOITED', detail: 'the scope apply did not verify onto the STALE receiver', tookRequests: 6 };
        }
        const bad = sender.snapshot('/x');
        bad.truncated = true;
        if (!throws(() => receiver.apply(bad), /refusing truncated/)) {
          return { verdict: 'EXPLOITED', detail: 'a tamper-flagged truncated snapshot APPLIED - the truncated refusal must hold', tookRequests: 7 };
        }
        const big = new StateTree();
        for (let i = 0; i < 50; i++) big.put('/big/' + i, i);
        const capped = big.snapshot('/big', 10);
        const paths = capped.nodes.map((n) => n.path);
        if (capped.nodes.length !== 10 || capped.truncated !== true || JSON.stringify(paths) !== JSON.stringify([...paths].sort())) {
          return { verdict: 'EXPLOITED', detail: 'the caller cap or the deterministic order broke: ' + JSON.stringify({ len: capped.nodes.length, truncated: capped.truncated }), tookRequests: 8 };
        }
        return { verdict: 'REFUSED', detail: 'identity, LWW, two-entry diff, verified stale-apply, truncated refusal and the bounded deterministic snapshot all hold', tookRequests: 8 };
      },
    },

    {
      name: 'scope-grammar-isolation-and-stamping',
      description: 'the scope law holds: coarse paths default to the main scope, world-prefixed paths split into scope+rest, two scopes with identically-named sub-scopes never share nodes (world/w1 vs world/w2 leak nothing), stamping is a pure write-path concern (the scope rides the payload), and the path grammar refuses relative/traversal/double-slash segments typed',
      async run(_harness) {
        const gs = await loadAll(['lib/state/tree.js']);
        const { StateTree, splitScope, normalizePath } = gs[0];
        const w = splitScope('/world/w1/zones/z1');
        if (splitScope('/trust/peer_x').scope !== 'main' || w.scope !== 'world/w1' || w.rest !== 'zones/z1') {
          return { verdict: 'EXPLOITED', detail: 'the scope split drifted: ' + JSON.stringify(w), tookRequests: 1 };
        }
        const t = new StateTree();
        t.put('/world/w1/zones/shared', { from: 'w1' });
        t.put('/world/w2/zones/shared', { from: 'w2' });
        if (t.get('/world/w1/zones/shared').value.from !== 'w1') {
          return { verdict: 'EXPLOITED', detail: 'identically-named sibling scopes collided', tookRequests: 2 };
        }
        const s1 = t.snapshot('/world/w1');
        if (s1.nodes.some((n) => n.path.startsWith('/world/w2'))) {
          return { verdict: 'EXPLOITED', detail: 'a w1 snapshot LEAKED w2 nodes - the scopes must stay closed at the snapshot too', tookRequests: 3 };
        }
        t.put('/world/w9/things', { color: 'blue' });
        if (t.get('/world/w9/things').value._scope !== 'world/w9') {
          return { verdict: 'EXPLOITED', detail: 'stamping stopped riding the payload', tookRequests: 4 };
        }
        for (const [evil, why] of [['relative/path', /absolute/], ['/a/../b', /traversal/], ['/a//b', /invalid path segment/]]) {
          if (!throws(() => normalizePath(evil), why)) {
            return { verdict: 'EXPLOITED', detail: 'the path grammar accepted a hostile form: ' + evil, tookRequests: 5, evidence: { path: evil } };
          }
        }
        return { verdict: 'REFUSED', detail: 'coarse defaults to main, world scope splits, sibling scopes stay isolated at read AND snapshot, stamping rides the payload, and the path grammar refuses all three hostile forms', tookRequests: 5 };
      },
    },

    {
      name: 'fold-laws-and-cellstore-rebates',
      description: "the fold arithmetic and the cell store agree: the ring-offset/depth laws hold closed-form at every boundary with children disjoint at depth cap (a deep cell refuses to overrun typed), 1000 writes of 10 distinct facts collapse to exactly 10 cells, and the rebate claims without storing bytes (stored=false, firstSpace named, savings_ratio MEASURED at the honest value - not assumed)",
      async run(_harness) {
        const gs = await loadAll(['lib/state/fold.js', 'lib/state/cellstore.js']);
        const fold = gs[0];
        const { CellStore } = gs[1];
        if (fold.capacityLawHolds() !== true || fold.assertDisjointAtCap(6) !== true) {
          return { verdict: 'EXPLOITED', detail: 'the fold capacity or disjointness law broke at cap 6', tookRequests: 1 };
        }
        if (JSON.stringify([fold.ringOffset(0), fold.ringOffset(1), fold.ringOffset(2)]) !== JSON.stringify([0, 1, 5])) {
          return { verdict: 'EXPLOITED', detail: 'the ring-offset law drifted: ' + JSON.stringify([fold.ringOffset(0), fold.ringOffset(1), fold.ringOffset(2)]), tookRequests: 1 };
        }
        if (fold.cellDepth(1) !== 1 || fold.cellDepth(4) !== 1 || fold.cellDepth(5) !== 2) {
          return { verdict: 'EXPLOITED', detail: 'the closed-form cellDepth drifted', tookRequests: 1 };
        }
        if (JSON.stringify(fold.children(1)) !== JSON.stringify([5, 6, 7, 8])) {
          return { verdict: 'EXPLOITED', detail: 'legal-depth children drifted: ' + JSON.stringify(fold.children(1)), tookRequests: 2 };
        }
        const deep = fold.foldCapacity(11) - 1;
        if (fold.cellDepth(deep) !== 11 || !throws(() => fold.children(deep), /refuses to overrun/)) {
          return { verdict: 'EXPLOITED', detail: 'a max-depth cell was NOT refused typed', tookRequests: 3 };
        }
        const cs = new CellStore();
        const facts = Array.from({ length: 10 }, (_, i) => ({ fact: i }));
        for (let i = 0; i < 1000; i++) cs.put('space' + (i % 4), '/cells/' + i, facts[i % 10]);
        if (cs.size !== 10) {
          return { verdict: 'EXPLOITED', detail: '1000 writes of 10 facts stored ' + cs.size + ' cells - the dedupe must collapse to exactly 10', tookRequests: 4 };
        }
        // fresh store: the rebate economics are graded on their own ledger,
        // not on the 1000-write collapse store above
        const rb = new CellStore();
        rb.put('a', '/c/1', 'the-fact');
        const rebate = rb.put('b', '/c/2', 'the-fact');
        const m = rb.metrics();          if (!(rebate.stored === false && rebate.rebate === true && rebate.firstSpace === 'a' && rb.claimsFor('b') === 1
            && m.stores_attempted === 2 && m.distinct === 1 && Math.abs(m.savings_ratio - 0.5) < 1e-12)) {
          return { verdict: 'EXPLOITED', detail: 'the rebate economics broke: ' + JSON.stringify({ rebate, m }).slice(0, 170), tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'the ring/depth laws hold closed-form, deep cells refuse typed, 1000 writes of 10 facts = 10 cells, and the rebate is claimed without bytes at the measured 0.5 savings ratio', tookRequests: 6 };
      },
    },

    {
      name: 'checkpoint-recovery-bounded-and-deny',
      description: 'the checkpointed log recovers exactly: a kill mid-stream reproduces the pre-kill checkpoint id, snapshot boundaries are deterministic across identical logs with the log truncated past the oldest retained snapshot, and an UNREADABLE log DENIES recovery (throws typed, never an empty-log fresh start)',
      async run(_harness) {
        const gs = await loadAll(['lib/state/checkpoint.js']);
        const { SnapshottedLog } = gs[0];
        const { p, path, fs } = await tmpdir();
        try {
          const makeCk = (dir, everyN) => {
            const state = { items: {} };
            return new SnapshottedLog({
              dir,
              applyRecord: (rec) => { state.items[rec.k] = rec.v; },
              serialize: () => JSON.stringify(state),
              restore: (s) => { state.items = JSON.parse(s).items; },
              everyN: everyN || 5,
              keepK: 2,
            });
          };
          const d1 = await tmpdir();
          const log = makeCk(d1.p);
          for (let i = 0; i < 12; i++) log.append({ k: 'key' + i, v: i });
          const log2 = makeCk(d1.p);
          const rec = log2.recover();
          if (!(rec.recovered === true && rec.freshStart === false && log2.currentCheckpointId() === log.currentCheckpointId())) {
            return { verdict: 'EXPLOITED', detail: 'the kill-mid-stream recovery did not reproduce the pre-kill checkpooint id: ' + JSON.stringify(rec).slice(0, 120), tookRequests: 2 };
          }
          const d2 = await tmpdir(), d3 = await tmpdir();
          const a = makeCk(d2.p), b = makeCk(d3.p);
          for (let i = 0; i < 20; i++) { a.append({ k: 'k' + i, v: i }); b.append({ k: 'k' + i, v: i }); }
          const snapsA = fs.readdirSync(path.join(d2.p, 'snapshots')).sort();
          const snapsB = fs.readdirSync(path.join(d3.p, 'snapshots')).sort();
          if (JSON.stringify(snapsA) !== JSON.stringify(snapsB)) {
            return { verdict: 'EXPLOITED', detail: 'snapshot boundaries broken: identical logs were parsed differently', tookRequests: 3, evidence: jsonParseCheckOnly };
          }
          const oldestSeq = parseInt(snapsA[0].split('-')[0], 10);
          const logLines = fs.readFileSync(path.join(d2.p, 'wal.log'), 'utf8').split('\n').filter(Boolean);
          if (!logLines.every((l) => JSON.parse(l).seq > oldestSeq)) {
            return { verdict: 'EXPLOITED', detail: 'the log was not bounded past the oldest retained snapshot', tookRequests: 5 };
          }
          const logPath = path.join(d1.p, 'wal.log');
          fs.rmSync(logPath, { force: true });
          fs.mkdirSync(logPath);
          const log3 = makeCk(d1.p);
          let denied = false;
          try { log3.recover(); } catch (e) { denied = /DENIED|unreadable/.test(String(e && e.message)); }
          if (!denied) {
            return { verdict: 'EXPLOITED', detail: 'an UNREADABLE journal did NOT deny recovery - silence or a fresh start is the #163 bug class', tookRequests: 6 };
          }
          return { verdict: 'REFUSED', detail: 'recovery reproduces the pre-kill root, boundaries are deterministic with a bounded log, and an unreadable log DENIES typed (never an empty fresh start)', tookRequests: 6 };
        } finally {
          try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'anchor-ledger-and-hotset-durability',
      description: "the anchor ledger is append-only truth: records carry root_hash/timestamp/cause and the file survives instance churn untouched, verify recomputes and returns the honest divergence (bad hash diverged, empty ledger refrains ok), and the hot set's durability holds: an evicted key falls through to the store CORRECT (source 'store'), re-reads after double eviction still return durable bytes, the cap is enforced exactly with evictions counted and metrics from one call",
      async run(_harness) {
        const gs = await loadAll(['lib/state/anchor.js', 'lib/state/hotset.js', 'lib/state/cellstore.js']);
        const { StateAnchor } = gs[0];
        const { HotSet } = gs[1];
        const { CellStore } = gs[2];
        const d1 = await tmpdir();
        const path = d1.path;
        try {
          const ledger1 = path.join(d1.p, 'ledger.jsonl');
          const anc = new StateAnchor(ledger1);
          anc.anchor('a'.repeat(64), 'checkpoint-1', 'git-abc123');
          anc.anchor('b'.repeat(64), 'checkpoint-2');
          const chain = anc.chain();
          if (!(chain.length === 2 && chain[0].root_hash === 'a'.repeat(64) && chain[0].carrier === 'git-abc123' && chain[1].timestamp >= chain[0].timestamp)) {
            return { verdict: 'EXPLOITED', detail: 'the anchor chain drifted: ' + JSON.stringify(chain).slice(0, 140), tookRequests: 2 };
          }
          const anc2 = new StateAnchor(ledger1);
          if (anc2.chain().length !== 2) {
            return { verdict: 'EXPLOITED', detail: 'reopen left the anchored ledger mutated - append-only must hold across instances', tookRequests: 3 };
          }
          // verify() compares against the LAST anchor: the latest root
          // verifies ok, a foreign hash diverges typed, an empty ledger refuses
          if (anc.verify('b'.repeat(64)).ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'the LAST anchored fact failed to verify against itself', tookRequests: 4 };
          }
          const staleFirst = anc.verify('a'.repeat(64));
          if (staleFirst.ok !== false || !String(staleFirst.firstDivergence || '').includes('diverged')) {
            return { verdict: 'EXPLOITED', detail: 'a STALE (non-latest) rooted fact verified against the last anchor', tookRequests: 5 };
          }
          const empty = new StateAnchor(path.join(d1.p, 'none.jsonl')).verify('a'.repeat(64));
          if (empty.ok !== false) {
            return { verdict: 'EXPLOITED', detail: 'an EMPTY anchor ledger verified - silence must not pass', tookRequests: 6 };
          }
          const backing = new CellStore();
          const r = backing.put('s', '/c', 'durable-truth');
          const hot = new HotSet(backing, 2);
          hot.put('h1', 'a'); hot.put('h2', 'b'); hot.put('h3', 'c');
          if (hot.get('h1').state !== 'ABSENT') {
            return { verdict: 'EXPLOITED', detail: 'the evicted entry stayed hot - the cap is not enforced', tookRequests: 7 };
          }
          const back = hot.get(r.hash);
          if (!(back.state === 'PRESENT' && back.value === 'durable-truth' && back.source === 'store')) {
            return { verdict: 'EXPLOITED', detail: 'the fall-through broke: ' + JSON.stringify(back).slice(0, 120), tookRequests: 8 };
          }
          hot.put('z1', 1); hot.put('z2', 2);
          if (hot.get(r.hash).value !== 'durable-truth') {
            return { verdict: 'EXPLOITED', detail: 'an evicted-from-hot entry LOST durability after the second eviction', tookRequests: 9 };
          }
          const hot2 = new HotSet(new CellStore(), 3);
          for (let i = 0; i < 10; i++) hot2.put('k' + i, i);
          const m = hot2.metrics();
          if (!(m.hot_size === 3 && m.evictions === 7 && m.hits !== undefined && m.misses !== undefined)) {
            return { verdict: 'EXPLOITED', detail: 'the hot metrics drifted: ' + JSON.stringify(m).slice(0, 130), tookRequests: 10 };
          }
          return { verdict: 'REFUSED', detail: 'the anchor stays append-only across churn with honest verify/diverge/empty verdicts, and the hot set falls through to durable store truth past its exact counted eviction cap', tookRequests: 10 };
        } finally {
          try { d1.fs.rmSync(d1.p, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'persistent-grants-and-wal-deny-posture',
      description: "the capability ledger is fail-closed in every posture: a grant persisted in one process is honored by a FRESH instance, no-ledger denies with reason 'none', an expired grant refuses with the honest expired reason, a revoke honored by later checks, the grantor is mandatory (refusal typed) and an UNREADABLE ledger DENIES every allow (never grants), the WAL replays mark DENIED on an unreadable journal, ABSENT stays a typed API value (never null), and sandbox can() degrades to a boolean with no grant ledger around",
      async run(_harness) {
        const gs = await loadAll(['lib/persistent-grants.js', 'lib/state/tree.js', 'lib/state/cellstore.js', 'lib/wal.js', 'lib/sandbox.js']);
        const { PersistentGrants } = gs[0];
        const { StateTree } = gs[1];
        const { CellStore } = gs[2];
        const { Wal } = gs[3];
        const SandboxMod = gs[4];
        const dir = await tmpdir();
        const path = dir.path, fs = dir.fs;
        try {
          const ledger1 = path.join(dir.p, 'grants.jsonl');
          const procA = new PersistentGrants({ ledgerPath: ledger1, now: () => 1000 });
          procA.persist({ capability: 'canWrite', grantor: 'operator' });
          const procB = new PersistentGrants({ ledgerPath: ledger1, now: () => 2000 });
          if (procB.allows('canWrite').allowed !== true) {
            return { verdict: 'EXPLOITED', detail: 'a grant persisted in one process was not honored by a fresh instance', tookRequests: 2 };
          }
          const fresh = new PersistentGrants({ ledgerPath: path.join(dir.p, 'fresh.jsonl'), now: () => 1000 });
          const none = fresh.allows('canWrite');
          if (!(none.allowed === false && none.reason === 'none')) {
            return { verdict: 'EXPLOITED', detail: 'a no-ledger check answered: ' + JSON.stringify(none), tookRequests: 3 };
          }
          new PersistentGrants({ ledgerPath: path.join(dir.p, 'exp.jsonl'), now: () => 1000 })
            .persist({ capability: 'canCommit', grantor: 'op', ttlMs: 500 });
          const expired = new PersistentGrants({ ledgerPath: path.join(dir.p, 'exp.jsonl'), now: () => 1600 }).allows('canCommit');
          if (!(expired.allowed === false && expired.reason === 'expired')) {
            return { verdict: 'EXPLOITED', detail: 'the expired posture lacks its honest reason: ' + JSON.stringify(expired), tookRequests: 4 };
          }
          const revLedger = path.join(dir.p, 'rev.jsonl');
          new PersistentGrants({ ledgerPath: revLedger, now: () => 1000 }).persist({ capability: 'canWrite', grantor: 'op' });
          new PersistentGrants({ ledgerPath: revLedger, now: () => 1100 }).revoke({ capability: 'canWrite', actor: 'op' });
          if (new PersistentGrants({ ledgerPath: revLedger, now: () => 1200 }).allows('canWrite').allowed !== false) {
            return { verdict: 'EXPLOITED', detail: 'a revoked grant ALLOWED later checks', tookRequests: 5 };
          }
          if (!throws(() => new PersistentGrants({ ledgerPath: ledger1, now: () => 1000 }).persist({ capability: 'canWrite' }), /grantor is NOT optional/)) {
            return { verdict: 'EXPLOITED', detail: 'persist accepted an anonymous grantor - the grantor is NOT optional', tookRequests: 6 };
          }
          const locked = path.join(dir.p, 'locked.jsonl');
          fs.mkdirSync(locked);
          let denied = false;
          try { new PersistentGrants({ ledgerPath: locked, now: () => 1000 }).allows('canWrite'); } catch (e) { denied = /DENIED|unreadable/.test(String(e && e.message)); }
          if (!denied) {
            return { verdict: 'EXPLOITED', detail: 'an UNREADABLE grant ledger did not DENY - fail-closed means deny, never allow, never silence', tookRequests: 7 };
          }
          // the WAL's own deny posture: an unreadable journal DENIES replay
          const d2 = await tmpdir();
          const wal = new Wal(d2.p, { enabled: true });
          wal.intent('write', 'f.txt', 'data');
          const walPath = path.join(d2.p, '.wal', 'wal.log');
          fs.rmSync(walPath, { force: true });
          fs.mkdirSync(walPath);
          let walDenied = -1;
          try {
            const stats = new Wal(d2.p, { enabled: true }).replay(() => {});
            walDenied = stats && typeof stats.denied === 'number' ? stats.denied : -2;
          } catch (e) {
            walDenied = /DENIED|unreadable/.test(String(e && e.message)) ? 1 : -3;
          }
          if (walDenied !== 1) {
            return { verdict: 'EXPLOITED', detail: 'the WAL denied counter landed ' + walDenied + ' on an unreadable journal - it must flag the denial, not skip or fault', tookRequests: 8 };
          }
          try { fs.rmSync(d2.p, { recursive: true, force: true }); } catch { /* cleanup */ }
          // ABSENT stays a typed API value (never null), and sandbox can()
          // degrades to a boolean with no grant ledger around
          if (new StateTree().get('/nope').state !== 'ABSENT' || new CellStore().get('deadbeef').state !== 'ABSENT') {
            return { verdict: 'EXPLOITED', detail: 'ABSENT lost its typed API value', tookRequests: 9 };
          }
          const Sandbox = SandboxMod.Sandbox || SandboxMod.default && SandboxMod.default.Sandbox;
          if (Sandbox && typeof Sandbox === 'function') {
            const s = new Sandbox({ agentId: 'spine-row' });
            if (typeof s.can('canWrite') !== 'boolean') {
              return { verdict: 'EXPLOITED', detail: 'sandbox can() degraded to a non-boolean with no grant ledger around', tookRequests: 10 };
            }
          }
          return { verdict: 'REFUSED', detail: 'the capability posture holds fail-closed in every leg: fresh-instance honor, no-ledger none, expired honest, revoke honored, grantor mandatory, unreadable ledgers (grants AND WAL) DENY typed, ABSENT stays typed, and can() degrades to a boolean', tookRequests: 10 };
        } finally {
          try { fs.rmSync(dir.p, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'revocation-scope-coverage-and-restore',
      description: "grant revocation is fail-closed on SCOPE and a revoke is never permanent-by-accident: a scoped revoke tombstones a WILDCARD grant (the old exact-key compare left it live), a wildcard revoke tombstones a scoped grant, an exact-scope revoke leaves a sibling scope live, a LATER explicit re-grant restores a revoked capability (a tombstone is not a dead end), and an unrelated revoke touches nothing",
      async run(_harness) {
        const gs = await loadAll(['lib/persistent-grants.js']);
        const { PersistentGrants } = gs[0];
        const dir = await tmpdir();
        const path = dir.path, fs = dir.fs;
        try {
          const mk = (label) => new PersistentGrants({ ledgerPath: path.join(dir.p, label + '.jsonl'), now: () => 1000 });
          // (a) a SCOPED revoke must cover a WILDCARD grant
          const a = mk('scope-vs-wild');
          a.persist({ capability: 'canExec', grantor: 'operator' });
          a.revoke({ capability: 'canExec', scope: 'exec', actor: 'operator' });
          if (a.allows('canExec').allowed !== false) {
            return { verdict: 'EXPLOITED', detail: 'a scoped revoke left a wildcard grant LIVE - the revoke silently did nothing', tookRequests: 1 };
          }
          // (b) a WILDCARD revoke must cover a scoped grant
          const b = mk('wild-vs-scope');
          b.persist({ capability: 'canExec', scope: 'exec', grantor: 'operator' });
          b.revoke({ capability: 'canExec', actor: 'operator' });
          if (b.allows('canExec').allowed !== false) {
            return { verdict: 'EXPLOITED', detail: 'a wildcard revoke left a scoped grant LIVE', tookRequests: 2 };
          }
          // (c) an exact-scope revoke must leave a sibling scope live
          const c = mk('sibling');
          c.persist({ capability: 'canExec', scope: 'exec', grantor: 'operator' });
          c.persist({ capability: 'canExec', scope: 'network', grantor: 'operator' });
          c.revoke({ capability: 'canExec', scope: 'exec', actor: 'operator' });
          if (c.allows('canExec').allowed !== true) {
            return { verdict: 'EXPLOITED', detail: 'an exact-scope revoke over-reached and killed a sibling scope', tookRequests: 3 };
          }
          // (d) a LATER explicit re-grant must restore a revoked capability
          const d = mk('regrant');
          d.persist({ capability: 'canExec', grantor: 'operator' });
          d.revoke({ capability: 'canExec', actor: 'operator' });
          d.persist({ capability: 'canExec', grantor: 'operator' });
          if (d.allows('canExec').allowed !== true) {
            return { verdict: 'EXPLOITED', detail: 'a revoked capability could never be restored - a tombstone became a dead end', tookRequests: 4 };
          }
          // (e) an unrelated revoke must not touch other capabilities
          const e = mk('unrelated');
          e.persist({ capability: 'canWrite', grantor: 'operator' });
          e.revoke({ capability: 'canExec', actor: 'operator' });
          if (e.allows('canWrite').allowed !== true) {
            return { verdict: 'EXPLOITED', detail: 'an unrelated revoke suppressed a different capability', tookRequests: 5 };
          }
          return { verdict: 'REFUSED', detail: 'revocation is fail-closed on scope (wildcard<->scoped both directions, siblings untouched, unrelated untouched) AND a later explicit re-grant restores a revoked capability', tookRequests: 5 };
        } finally {
          try { fs.rmSync(dir.p, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'guest-authority-verbs-admin-only',
      description: "the guest door gate and the MCP handlers agree that privilege AUTHORITY is admin-only: every sudo/habitat authority verb (grant/revoke/escalate/createTask/mintToken/revokeToken/addRole/setPolicy/createWorkspace/setWorkspace/scenario_crew) classifies admin, so a canWrite guest (the default human role) is refused the write->authority->exec escalation, while the write verbs a human legitimately needs stay write-class and a plain guest read verb stays read-class",
      async run(_harness) {
        const { createRequire } = await import('node:module');
        const { resolve } = await import('node:path');
        const req = createRequire(resolve('lib/guests.js'));
        const guests = req(resolve('lib/guests.js'));
        // (a) every authority verb is admin-class (the door refuses it)
        const authority = [
          'sudo_grant', 'sudo_revoke', 'sudo_escalate', 'sudo_createTask',
          'vant_sudo_grant', 'vant_sudo_revoke', 'vant_sudo_escalate', 'vant_sudo_createTask',
          'vant_habitat_mintToken', 'vant_habitat_revokeToken',
          'vant_habitat_createWorkspace', 'vant_habitat_setWorkspace',
          'vant_habitat_addRole', 'vant_habitat_setPolicy', 'vant_scenario_crew'
        ];
        const misclassed = authority.filter((t) => guests.classifyTool(t) !== 'admin');
        if (misclassed.length) {
          return { verdict: 'EXPLOITED', detail: 'authority verbs not admin-class: ' + misclassed.join(', '), tookRequests: 1 };
        }
        // (b) a canWrite human guest is actually refused by the door gate
        const human = { guest: { id: 'x', role: 'human' }, caps: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'], isGuest: true };
        for (const t of ['vant_sudo_grant', 'vant_sudo_createTask', 'sudo_grant']) {
          const v = guests.authorize(t, human);
          if (v.allowed !== false) {
            return { verdict: 'EXPLOITED', detail: 'a human guest reached authority verb ' + t, tookRequests: 2 };
          }
        }
        // (c) the change is NARROW: legitimate write + read verbs keep their class
        if (guests.classifyTool('vant_memory_write') !== 'write' || guests.classifyTool('brain_state') !== 'read') {
          return { verdict: 'EXPLOITED', detail: 'the authority guard over-reached and reclassified a legitimate write/read verb', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: 'privilege authority is admin-only across every sudo/habitat verb (door gate + handler agree), the human guest is refused, and legitimate write/read classes are untouched', tookRequests: 3 };
      },
    },

    // ------------------------------------------------------------------
    // Slice 2 - GEOMETRY (#154 #155 #156 #157).
    // ------------------------------------------------------------------

    {
      name: 'geometry-subdivision-and-facet-laws',
      description: "the geometry fold holds its 1:4 subdivision law: a cell subdivides into EXACTLY four distinct children with packed addresses that roundtrip (the unpack returns the exact face + localCell it was packed from), an over-budget pack refuses typed (overflow), and the facet subdivision law certifies disjoint children at the declared cap",
      async run(_harness) {
        const gs = await loadAll(['lib/geometry/fold.js']);
        const gfold = gs[0];
        const kids = gfold.subdivide(3, 0);
        if (!Array.isArray(kids) || kids.length !== 4 || new Set(kids).size !== 4) {
          return { verdict: 'EXPLOITED', detail: 'the 1:4 subdivision broke: ' + JSON.stringify(kids).slice(0, 100), tookRequests: 1 };
        }
        const packed = gfold.packAddress(19, gfold.subdivide(0, 0)[3]);
        const up = gfold.unpackAddress(packed);
        if (!(up && up.face === 19 && up.localCell === 4)) {
          return { verdict: 'EXPLOITED', detail: 'the packed address did not roundtrip: ' + JSON.stringify(up).slice(0, 100), tookRequests: 2 };
        }
        if (!throws(() => gfold.packAddress(0, 999999999), /overflow refused/)) {
          return { verdict: 'EXPLOITED', detail: 'an over-budget packAddress did NOT refuse - the 24-bit address budget is decorative', tookRequests: 3 };
        }
        if (gfold.facetSubdivisionLawHolds(6) !== true) {
          return { verdict: 'EXPLOITED', detail: 'the facet subdivision law broke at cap 6', tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: 'the fold subdivides 1:4 with lossless packed addresses, the 24-bit budget refuses overflow typed, and the facet divider law holds at the cap', tookRequests: 4 };
      },
    },

    {
      name: 'geometry-prf-one-chain',
      description: "the shard PRF is ONE chain: every consumer of address-derived shard keys derives them through the same lattice-keys module (deterministic across calls, fixed width, no aliasing on near seeds, the unpredictability property certified), and the fragmenter AND the GitHub adapter both ride that chain - no second key derivation anywhere",
      async run(_harness) {
        const gs = await loadAll(['lib/geometry/lattice-keys.js', 'lib/geometry/fragmenter.js', 'lib/adapters/github-fragmenter.js']);
        const lattice = gs[0];
        const fragmenter = gs[1];
        const GH = gs[2];
        const k1 = lattice.deriveShardKeys('doc-a', 5);
        const k2 = lattice.deriveShardKeys('doc-a', 5);
        if (!(JSON.stringify(k1) === JSON.stringify(k2))) {
          return { verdict: 'EXPLOITED', detail: 'the PRF was impure: same input produced different keys', tookRequests: 1 };
        }
        const k3 = lattice.deriveShardKeys('doc-b', 5);
        if (JSON.stringify(k1) === JSON.stringify(k3)) {
          return { verdict: 'EXPLOITED', detail: 'the PRF aliased two different documents onto the same keys', tookRequests: 2 };
        }
        if (!k1.every((k) => typeof k === 'string' && k.length === 16)) {
          return { verdict: 'EXPLOITED', detail: 'the key width drifted: ' + k1.join(','), tookRequests: 3 };
        }
        const near1 = lattice.deriveShardKeys('seq:1000', 8);
        const near2 = lattice.deriveShardKeys('seq:1001', 8);
        if (!near1.every((k, i) => k !== near2[i])) {
          return { verdict: 'EXPLOITED', detail: 'near-consecutive seeds aliased - the PRF must separate documents that differ by one ulp of display', tookRequests: 4 };
        }
        if (lattice.shardUnpredictabilityHolds('doc-x', 8) !== true) {
          return { verdict: 'EXPLOITED', detail: 'the shard unpredictability property FAILED its own audit', tookRequests: 5 };
        }
        // the two consumers derive through the ONE PRF (the pass-175 payoff)
        const fk = fragmenter.deriveLatticeKeys('doc-seq-1', 5);
        if (!(JSON.stringify(fk) === JSON.stringify(lattice.deriveShardKeys('doc-seq-1', 5)))
          || !fk.every((k) => /^[0-9a-z]{16}$/.test(k))) {
          return { verdict: 'EXPLOITED', detail: 'the fragmenter stopped deriving through the lattice PRF', tookRequests: 6 };
        }
        const Adapter = GH.GitHubFragmenter || GH.default || GH;
        if (Adapter && typeof Adapter === 'function') {
          const gf = new Adapter({});
          if (JSON.stringify(gf.latticeKeys('seq-42', 5)) !== JSON.stringify(lattice.deriveShardKeys('seq-42', 5))) {
            return { verdict: 'EXPLOITED', detail: 'the GitHub adapter bypassed the ONE PRF (second imul chain)', tookRequests: 7 };
          }
        }
        return { verdict: 'REFUSED', detail: 'the PRF is deterministic, width-fixed, separation-clean on near seeds, unpredictability-certified, and BOTH live consumers (fragmenter + GitHub adapter) derive through the same one chain', tookRequests: 7 };
      },
    },

    {
      name: 'geometry-raid-carrier-and-precision',
      description: "the RAID carrier holds k-of-k+1 survival: destroying any ONE shard (data or parity) recovers the exact original bytes with zero tamper reports, a FORGED shard is reported by position AND parity-rebuilt (bytes true, detection loud), two lost data shards refuse typed instead of guessing, and the precision contract pins EXACT vs APPROXIMATE with the quantizer absorbing last-ulp near-misses onto one cell while the parity harness separates agreeing engines from disagreeing ones",
      async run(_harness) {
        const gs = await loadAll(['lib/geometry/raid.js', 'lib/geometry/precision.js']);
        const raid = gs[0];
        const precision = gs[1];
        const original = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
        const f1 = raid.fragment(original, { k: 4, docId: 'raid-recover-row' });
        for (let victim = 0; victim < 4; victim++) {
          const gathered = f1.shards.map((s, i) => (i === victim
            ? { shard: i, state: 'ABSENT' }
            : { shard: i, state: 'PRESENT', data: s.data }));
          const res = raid.recover({ manifest: f1.manifest, gathered });
          if (res.data.toString('utf8') !== original || (res.tampered || []).length !== 0) {
            return { verdict: 'EXPLOITED', detail: 'losing data shard ' + victim + ' broke the carrier (equal=' + (res.data.toString('utf8') === original) + ', tampered=' + JSON.stringify(res.tampered) + ')', tookRequests: 2 };
          }
        }
        // the parity shard survives its own loss too
        const parity = raid.recover({ manifest: f1.manifest, gathered: f1.shards.map((s, i) => (i === 4
          ? { shard: i, state: 'ABSENT' }
          : { shard: i, state: 'PRESENT', data: s.data })) });
        if (parity.data.toString('utf8') !== original) {
          return { verdict: 'EXPLOITED', detail: 'the parity shard was NOT self-surviving', tookRequests: 3 };
        }
        // a forged shard is REPORTED and parity-rebuilt (never silently merged)
        const f2 = raid.fragment('tamper me', { k: 3, docId: 'raid-tamper-row' });
        const forged = Buffer.from('evil bytes here padding!!').toString('base64').slice(0, f2.shards[1].data.length);
        const tResp = raid.recover({ manifest: f2.manifest, gathered: f2.shards.map((s, i) => (i === 1
          ? { shard: i, state: 'PRESENT', data: forged }
          : { shard: i, state: 'PRESENT', data: s.data })) });
        if (!Array.isArray(tResp.tampered) || JSON.stringify(tResp.tampered) !== '[1]' || tResp.data.toString('utf8') !== 'tamper me') {
          return { verdict: 'EXPLOITED', detail: 'the forged shard was not reported/rebuilt honestly: ' + JSON.stringify({ tampered: tResp.tampered }), tookRequests: 4 };
        }
        // two lost data shards: typed refusal (never a guess)
        const f3 = raid.fragment('too much loss', { k: 4, docId: 'raid-loss-row' });
        if (!throws(() => raid.recover({ manifest: f3.manifest, gathered: f3.shards.map((s, i) => (i < 2
          ? { shard: i, state: 'ABSENT' }
          : { shard: i, state: 'PRESENT', data: s.data })) }), /cannot rebuild/)) {
          return { verdict: 'EXPLOITED', detail: 'recovering past the loss budget did NOT refuse typed', tookRequests: 5 };
        }
        // the precision contract + quantizer + parity harness
        const pc = precision.PRECISION_CONTRACT;
        if (!(pc.goldenRatio.class === 'EXACT'
          && pc.complexMultiply.class === 'APPROXIMATE'
          && pc.complexMultiply.tolerance === 1e-12)) {
          return { verdict: 'EXPLOITED', detail: 'the precision contract drifted from EXACT/APPROXIMATE + 1e-12', tookRequests: 6 };
        }
        const grid = 1e-6;
        if (precision.quantize(0.123456789012, grid) !== precision.quantize(0.123456789019, grid)
          || precision.quantize(0.1234, grid) === precision.quantize(0.1235, grid)) {
          return { verdict: 'EXPLOITED', detail: 'the quantizer no longer absorbs last-ulp near-misses (or separated near values)', tookRequests: 7 };
        }
        const vectors = [{ re: 0.1, im: 0.2 }, { re: 1.5, im: -2.5 }];
        const misMatch = precision.parityHarness(vectors, (z) => ({ re: z.re * 2, im: z.im * 2 }),
          (z) => ({ re: z.re * 2 + 1e-15, im: z.im * 2 - 1e-15 }));
        const real = precision.parityHarness(vectors, (z) => ({ re: z.re * 2, im: z.im * 2 }),
          (z) => ({ re: z.re * 3, im: z.im * 2 }));
        if (!((misMatch || []).length === 0 && real.length === 2)) {
          return { verdict: 'EXPLOITED', detail: 'the parity harness mis-graded agreeing vs disagreeing engines', tookRequests: 8 };
        }
        return { verdict: 'REFUSED', detail: 'any one lost shard recovers exact bytes, the forged shard is reported AND parity-rebuilt, two lost refuse typed, the precision contract holds its classes, the quantizer absorbs near-misses, and the harness separates agreeing from disagreeing engines', tookRequests: 8 };
      },
    },

    // ------------------------------------------------------------------
    // Slice 2 - WORLD/CLOCK (#158 #159 #160 #161).
    // ------------------------------------------------------------------

    {
      name: 'world-clock-seed-chain-and-orbits',
      description: "the world clock is deterministic and pure: a SeedChain answers the same seed hex across fresh instances, domain-separated (nesting changes bytes, siblings differ, prefix folding never collapses onto the direct derivation) with 10K pairwise-distinct paths, and the orbit clock is a pure function of t (exact periodicity at t0 + k*period, degenerate inputs refuse typed instead of NaN, favorability OSCILLATES with the synodic period inside [0,1], and nextWindow answers the same t twice)",
      async run(_harness) {
        const gs = await loadAll(['lib/state/seeds.js', 'lib/state/orbits.js']);
        const { SeedChain } = gs[0];
        const orbits = gs[1];
        const c1 = new SeedChain({ universe: 'test-universe' });
        const c2 = new SeedChain({ universe: 'test-universe' });
        if (c1.seedHex('agents:alice') !== c2.seedHex('agents:alice')) {
          return { verdict: 'EXPLOITED', detail: 'the seed chain was instance-dependent (not deterministic)', tookRequests: 1 };
        }
        const c = new SeedChain({ universe: 'u' });
        const parent = c.seedHex('agents:alice');
        const child = c.seedHex('agents:alice:inbox');
        const sibling = c.seedHex('agents:bob');
        if (parent === child || parent === sibling || child === sibling) {
          return { verdict: 'EXPLOITED', detail: 'the seed chain lost domain separation', tookRequests: 2 };
        }
        const viaFolding = c.deriveChild(c.seed('agents:alice'), 'inbox').toString('hex');
        if (viaFolding === child) {
          return { verdict: 'EXPLOITED', detail: 'prefix folding COLLAPSED onto the direct derivation', tookRequests: 3 };
        }
        const c10k = new SeedChain({ universe: 'distinctness' });
        const seen = new Set();
        for (let i = 0; i < 10000; i++) seen.add(c10k.seedHex('corp:' + (i % 100) + ':node:' + i));
        if (seen.size !== 10000) {
          return { verdict: 'EXPLOITED', detail: 'a collision in the 10K seed corpus: ' + seen.size + ' distinct', tookRequests: 4 };
        }
        // orbits: purity + exact periodicity (pure function of t)
        const body = { radius: 5, period: 1000, phase0: 0.3, epoch0: 42 };
        const base = orbits.position(body, 500);
        if (!base || base.angle !== orbits.position(body, 500).angle) {
          return { verdict: 'EXPLOITED', detail: 'the orbit clock is impure (wall-clock noise in position)', tookRequests: 5 };
        }
        for (const k of [1, 7, 1000]) {
          const p1 = orbits.position(body, 500 + k * 1000);
          if (Math.abs(p1.angle - base.angle) > 1e-9 || Math.abs(p1.pos[0] - base.pos[0]) > 1e-9 || Math.abs(p1.pos[1] - base.pos[1]) > 1e-9) {
            return { verdict: 'EXPLOITED', detail: 'the exact period broke at k=' + k, tookRequests: 6 };
          }
        }
        if (!throws(() => orbits.position({ radius: 0, period: 10 }, 1), /positive/)
          || !throws(() => orbits.position({ radius: 5, period: -1 }, 1), /positive/)
          || !throws(() => orbits.position({ radius: 5, period: 10 }, NaN), /finite/)) {
          return { verdict: 'EXPLOITED', detail: 'a degenerate orbit entered WITHOUT a typed refusal (the NaN class)', tookRequests: 7 };
        }
        // favorability OSCILLATES with the synodic period (the pass-227 bug class)
        const moon = { radius: 1, period: 10000 };
        const earth = { radius: 1, period: 6000 };
        const opts = { bodyA: moon, bodyB: earth, ideal: 0, maxSpan: Math.PI / 2 };
        const samples = [];
        for (let t = 0; t <= 60000; t += 500) samples.push(orbits.favorability(opts, t));
        const min = Math.min(...samples), max = Math.max(...samples);
        if (max - min <= 0.5) {
          return { verdict: 'EXPLOITED', detail: 'favorability FLAT for the equal-radius pair (range=' + (max - min).toFixed(3) + ') - the distance-based bug class is back', tookRequests: 8 };
        }
        const syn = orbits.synodicPeriod(moon, earth);
        if (!(syn > 0 && syn < 1e9)) {
          return { verdict: 'EXPLOITED', detail: 'the synodic period went out of range', tookRequests: 9 };
        }
        const pairs = [
          [{ radius: 1, period: 1000 }, { radius: 2, period: 1500 }],
          [{ radius: 3, period: 700 }, { radius: 1, period: 700 }],
          [{ radius: 0.5, period: 36003 }, { radius: 1, period: 86403 }],
        ];
        for (const [a, b] of pairs) {
          for (let t = 0; t < 99700; t += 997) {
            const f = orbits.favorability({ bodyA: a, bodyB: b }, t);
            if (!(f >= 0 && f <= 1)) {
              return { verdict: 'EXPLOITED', detail: 'favorability left [0,1] at t=' + t + ': ' + f, tookRequests: 10 };
            }
          }
        }
        const mkWin = () => orbits.nextWindow({ bodyA: { radius: 1, period: 5000 }, bodyB: { radius: 1, period: 3000 }, ideal: 0 }, 1000, { threshold: 0.9, horizonMs: 60000 });
        const w1 = mkWin();
        const w2 = mkWin();
        if (!(w1 && w2 && w1.t === w2.t && w1.t <= 61000)) {
          return { verdict: 'EXPLOITED', detail: 'nextWindow was non-deterministic or out of its horizon', tookRequests: 11 };
        }
        return { verdict: 'REFUSED', detail: 'the seed chain is deterministic + domain-separated + 10K-distinct, orbits are pure with the exact period, degenerates refuse typed, favorability oscillates in [0,1] with its synodic window, and nextWindow repeats its answer', tookRequests: 11 };
      },
    },

    {
      name: 'state-delta-ledger-laws',
      description: "the delta ledger keeps its audit chain honest: recording WITHOUT an actor refuses typed (the actor is NOT optional - an attribution-free write never lands), a cleared record stays readable as cleared with the clearing actor + epoch in the history (domains ordered, provenance kept), and the same event stream re-derives the SAME ledger hash across fresh instances",
      async run(_harness) {
        const gs = await loadAll(['lib/state/delta.js']);
        const { DeltaLedger } = gs[0];
        const dl = new DeltaLedger();
        if (!throws(() => dl.record('k', 'v', undefined), /actor is NOT optional/)
          || !throws(() => dl.record('k', 'v', ''), /actor is NOT optional/)) {
          return { verdict: 'EXPLOITED', detail: 'an attribution-free delta landed (or refused untyped) - the actor is NOT optional', tookRequests: 2 };
        }
        dl.record('k', { x: 1 }, 'agent-7');
        const g = dl.get('k');
        if (!(g.state === 'PRESENT' && g.actor === 'agent-7' && Number.isFinite(g.epoch))) {
          return { verdict: 'EXPLOITED', detail: 'the recorded delta lost its actor/epoch: ' + JSON.stringify(g).slice(0, 110), tookRequests: 3 };
        }
        dl.record('secret', 'value', 'alice');
        const res = dl.erase('secret', 'mallory');
        if (!(res && res.cleared === true) || dl.get('secret').state !== 'ABSENT') {
          return { verdict: 'EXPLOITED', detail: 'the erase did not clear honestly', tookRequests: 4 };
        }
        const hist = dl.history('secret');
        if (!(hist.length === 2 && hist[1].cleared === true && hist[1].actor === 'mallory' && hist[1].epoch >= hist[0].epoch)) {
          return { verdict: 'EXPLOITED', detail: 'the erase history lost its provenance: ' + JSON.stringify(hist).slice(0, 140), tookRequests: 5 };
        }
        const mk = () => {
          const d = new DeltaLedger({ epoch: 100 });
          d.record('a', 1, 'x');
          d.record('b', 2, 'y');
          d.erase('a', 'z');
          return d.ledgerHash();
        };
        if (mk() !== mk()) {
          return { verdict: 'EXPLOITED', detail: 'same events derived a DIFFERENT ledger hash (the #146 disease on the delta ledger)', tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'actorless writes refuse typed, the cleared record keeps its clearing provenance in history, and re-derivation is hash-stable across fresh ledgers', tookRequests: 6 };
      },
    },

    // ------------------------------------------------------------------
    // Slice 2 - MESH/BRAINS (#164 #165 #166).
    // ------------------------------------------------------------------

    {
      name: 'spine-addressing-one-module',
      description: "every consumer derives cell addresses through the ONE addressing module: addresses are deterministic per (space, index), separate per space AND per index, the spine's seed chain is the sha256 PRF over a SeedChain (64-hex), removing one consumer leaves the other derivations byte-compatible, and a shared fact claimed under two spaces stores exactly ONE cell with identical hashes",
      async run(_harness) {
        const gs = await loadAll(['lib/state/spine.js', 'lib/state/cellstore.js']);
        const { AddressingSpine } = gs[0];
        const { CellStore } = gs[1];
        const spine = new AddressingSpine({ universe: 'u' });
        const a1 = spine.cellAddress('/raid/doc1', 0);
        const a2 = spine.cellAddress('/raid/doc1', 0);
        if (a1 !== a2) {
          return { verdict: 'EXPLOITED', detail: 'the spine PRF was impure on the same (space, index)', tookRequests: 1 };
        }
        if (a1 === spine.cellAddress('/raid/doc1', 1)
          || a1 === spine.cellAddress('/mesh/r1/n1', 0)) {
          return { verdict: 'EXPLOITED', detail: 'the spine PRF aliased an index or space', tookRequests: 2 };
        }
        if (spine.seeds.seedHex('raid:doc1').length !== 64) {
          return { verdict: 'EXPLOITED', detail: 'the spine seeds did not carry the ONE PRF proof (64-hex)', tookRequests: 3 };
        }
        // removing one consumer: the OTHER derivations are byte-identical
        const stable = new AddressingSpine({ universe: 'stable' });
        const before = { raid: stable.cellAddress('/raid/d', 5), world: stable.cellAddress('/world/w', 5) };
        const after = { raid: stable.cellAddress('/raid/d', 5), world: stable.cellAddress('/world/w', 5) };
        if (after.raid !== before.raid || after.world !== before.world) {
          return { verdict: 'EXPLOITED', detail: 'the address derivations flinched across derivation graphs', tookRequests: 4 };
        }
        // the shared-fact law: one fact, two claimed spaces, ONE stored cell
        const cs = new CellStore();
        const res = spine.writeSharedFact(cs, { kind: 'peer-record', peer: 'n7' }, ['/raid/d1', '/mesh/r1/n7']);
        if (!(res.storedOnce === true && res.identicalHashes === true && cs.size === 1)) {
          return { verdict: 'EXPLOITED', detail: 'the shared fact stored ' + cs.size + ' cell(s): ' + JSON.stringify(res).slice(0, 130), tookRequests: 5 };
        }
        return { verdict: 'REFUSED', detail: 'addresses re-derive exactly, separate per index and space, remove-one leaves the rest byte-compatible, and a fact claimed under two spaces stores ONE cell with identical hashes - one module, no second addressing chain', tookRequests: 5 };
      },
    },

    {
      name: 'raid-cells-addressed-and-rebated-through-spine',
      description: "the RAID carrier asks the CELL STORE for its shard seats (the #150 rebate fires: k data + 1 parity = k+1 claimed cells at 64-hex spine addresses, an identical payload across two docs is a pure RE-CLAIM with zero bytes stored and measured savings) and its shard seat addresses ride the ONE spine PRF per (space, shard index) - no parallel chain",
      async run(_harness) {
        const gs = await loadAll(['lib/state/spine.js', 'lib/state/cellstore.js', 'lib/geometry/raid.js']);
        const { AddressingSpine } = gs[0];
        const { CellStore } = gs[1];
        const raid = gs[2];
        const cs = new CellStore();
        const spine1 = new AddressingSpine({ universe: 'raid-universe' });
        const frag1 = raid.fragment('parity payload', { k: 4, docId: 'doc-A', cellStore: cs, spine: spine1 });
        const claimed = frag1.cells;
        if (!Array.isArray(claimed) || claimed.length !== frag1.manifest.k + 1) {
          return { verdict: 'EXPLOITED', detail: 'the cell claiming did not cover k data + 1 parity: ' + (claimed || []).length, tookRequests: 2 };
        }
        if (!claimed.every((cell) => /^[0-9a-f]{64}$/.test(cell.cell))) {
          return { verdict: 'EXPLOITED', detail: 'cell addresses were NOT spine-PRF hex', tookRequests: 3 };
        }
        const frag2 = raid.fragment('parity payload', { k: 4, docId: 'doc-B', cellStore: cs, spine: spine1 });
        const rebates = frag2.cells.filter((cell) => cell.rebate).length;
        if (rebates !== frag2.cells.length) {
          return { verdict: 'EXPLOITED', detail: 'identical shards across docs were not pure re-claims: ' + rebates + '/' + frag2.cells.length, tookRequests: 4 };
        }
        const m = cs.metrics();
        if (!(m.savings_ratio > 0 && m.distinct === frag1.manifest.k + 1)) {
          return { verdict: 'EXPLOITED', detail: 'the measured rebate did not hold: ' + JSON.stringify({ savings_ratio: m.savings_ratio, distinct: m.distinct }), tookRequests: 5 };
        }
        // the shard seats ride the ONE spine PRF, per (space, index)
        const cs2 = new CellStore();
        const frag3 = raid.fragment('x', { k: 2, docId: 'doc-C', cellStore: cs2, spine: spine1 });
        const space = spine1.spaceId('raid', 'doc-C');
        if (frag3.cells[0].cell !== spine1.cellAddress(space, 0)
          || frag3.cells[1].cell !== spine1.cellAddress(space, 1)
          || frag3.cells[0].cell === frag3.cells[1].cell) {
          return { verdict: 'EXPLOITED', detail: 'the RAID cell addresses left the ONE PRF chain', tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'k+1 claimed cells at 64-hex spine addresses, identical payloads across docs re-claim with zero stored bytes and measured savings, and the shard seats derive through the ONE spine PRF per (space, index)', tookRequests: 6 };
      },
    },

    {
      name: 'mesh-aoi-staleness-and-write-winners',
      description: "the mesh wall holds its three consumer laws: the AOI filter leaks NOTHING outside the asking region (an r1 view carries zero r2 paths), staleness is a PURE read on the injected clock (provably stale past the presence TTL with NO timers, revived by a heartbeat stamped into that same clock), and write winners settle deterministically (a higher epoch wins, a stale-epoch challenger is REFUSED AND RECORDED as the loser - never a silent drop)",
      async run(_harness) {
        const gs = await loadAll(['lib/state/mesh.js']);
        const { MeshTree } = gs[0];
        let now = 1000;
        const mt = new MeshTree({ now: () => now });
        mt.register('r1', 'n7', { role: 'worker' });
        mt.register('r2', 'n9', { role: 'worker' });
        const view = mt.aoiDiff('/mesh/r1');
        if (!view || !Array.isArray(view.nodes) || view.nodes.some((n) => String(n.path).startsWith('/mesh/r2'))
          || !view.nodes.some((n) => String(n.path).startsWith('/mesh/r1/n7'))) {
          return { verdict: 'EXPLOITED', detail: 'the AOI filter leaked or starved: ' + JSON.stringify(view).slice(0, 140), tookRequests: 3 };
        }
        // staleness: pure read, injected clock, no timers
        let nowS = 1000;
        const mtS = new MeshTree({ now: () => nowS, presenceTtlMs: 5000 });
        mtS.register('r1', 'n1');
        if (mtS.isAlive('r1', 'n1').alive !== true) {
          return { verdict: 'EXPLOITED', detail: 'a freshly registered node was NOT alive within its TTL', tookRequests: 4 };
        }
        nowS = 7000;
        const verdict = mtS.isAlive('r1', 'n1');
        if (!(verdict.alive === false && verdict.stale === true)) {
          return { verdict: 'EXPLOITED', detail: 'staleness was not PROVABLE (relying on timers or a wall clock): ' + JSON.stringify(verdict), tookRequests: 5 };
        }
        nowS = 9000;
        mtS.heartbeat('r1', 'n1');
        if (mtS.isAlive('r1', 'n1').alive !== true) {
          return { verdict: 'EXPLOITED', detail: 'the heartbeat did not revive the node inside the same injected clock', tookRequests: 6 };
        }
        // write winners: deterministic, loser recorded
        let nowW = 1000;
        const mtW = new MeshTree({ now: () => nowW });
        const w1 = mtW.write('r1', 'alice', '/mesh/r1/shared/config', { v: 'a' });
        if (w1.accepted !== true) {
          return { verdict: 'EXPLOITED', detail: 'the first write on an open path did not land', tookRequests: 7 };
        }
        nowW = 2000;
        const w2 = mtW.write('r1', 'bob', '/mesh/r1/shared/config', { v: 'b' });
        if (!(w2.accepted === true && w2.winner === 'bob')) {
          return { verdict: 'EXPLOITED', detail: 'the higher-epoch winner did not win deterministically', tookRequests: 8 };
        }
        nowW = 1500;
        const w3 = mtW.write('r1', 'carol', '/mesh/r1/shared/config', { v: 'c' });
        const rejected = mtW.rejectedWrites();
        if (!(w3.accepted === false && rejected.length === 1 && rejected[0].writer === 'carol')) {
          return { verdict: 'EXPLOITED', detail: 'the stale-epoch challenger was dropped silently or mis-recorded: ' + JSON.stringify({ accepted: w3.accepted, rejected }).slice(0, 130), tookRequests: 9 };
        }
        const mt2 = new MeshTree({ now: () => 1000 });
        mt2.write('r1', 'x', '/p', 'same');
        const tie = mt2.write('r1', 'y', '/p', 'same');
        if (typeof tie.accepted !== 'boolean') {
          return { verdict: 'EXPLOITED', detail: 'the epoch tiebreak lost its boolean verdict', tookRequests: 10 };
        }
        return { verdict: 'REFUSED', detail: 'the AOI filter leaks nothing outside the region, staleness is provable from the injected clock alone (verdict-free revive), the higher epoch wins deterministically, and the loser is RECORDED as rejected - never silent', tookRequests: 10 };
      },
    },

    {
      name: 'webhook-intake-secret-and-filter-posture',
      description: "the webhook intake is fail-closed on BOTH the filter evaluator and the route metadata: a glob/icontains filter refuses a non-matching payload (the old evaluator matched everything) and an unrecognized expression refuses (never authorizes), while a matching payload still matches; and the unauthenticated /info route returns NON-SECRET metadata only (no `secret`, no `sealKeys`) with no wildcard CORS origin, so a browser page cannot read a loopback route's HMAC key and forge envelopes",
      async run(_harness) {
        const gs = await loadAll(['lib/webhooks.js']);
        const wh = gs[0];
        // (a) filter evaluator fails CLOSED (pure, no sockets)
        const hit = { repository: { full_name: 'myorg/myrepo' }, comment: { body: 'ping @openhands' }, action: 'create' };
        const miss = { repository: { full_name: 'evil/other' }, comment: { body: 'nothing here' }, action: 'delete' };
        if (wh.matchFilter("glob(repository.full_name, 'myorg/*')", miss) !== false) {
          return { verdict: 'EXPLOITED', detail: 'glob filter matched a non-matching repo - the event was authorized', tookRequests: 1 };
        }
        if (wh.matchFilter("icontains(comment.body, '@openhands')", miss) !== false) {
          return { verdict: 'EXPLOITED', detail: 'icontains filter matched a non-matching body', tookRequests: 2 };
        }
        if (wh.matchFilter("starts_with(ref, 'refs/heads/')", hit) !== false) {
          return { verdict: 'EXPLOITED', detail: 'an unrecognized filter expression AUTHORIZED the event (fail-open)', tookRequests: 3 };
        }
        if (wh.matchFilter("glob(repository.full_name, 'myorg/*')", hit) !== true) {
          return { verdict: 'EXPLOITED', detail: 'the glob filter over-refused a matching payload', tookRequests: 4 };
        }
        // (b) the live /info route must not serialize the secret (real socket)
        const SECRET = 'crashtest-wh-' + 'q'.repeat(20);
        const name = 'crashtest-wh';
        wh.register({ name, source: 'crashtest-src', eventKeyExpr: 'event', secret: SECRET });
        const server = wh.startServer(0);
        await new Promise((res, rej) => { server.once('listening', res); server.once('error', rej); });
        try {
          const port = server.address().port;
          const info = await fetch(`http://127.0.0.1:${port}/info/${name}`);
          const body = await info.text();
          if (body.includes(SECRET) || /"secret"/.test(body) || /sealKeys/.test(body)) {
            return { verdict: 'EXPLOITED', detail: 'unauthenticated /info disclosed the route signing secret', tookRequests: 5 };
          }
          const health = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: 'https://evil.example' } });
          if (health.headers.get('access-control-allow-origin') === '*') {
            return { verdict: 'EXPLOITED', detail: 'webhook intake emitted a wildcard CORS origin - cross-origin reads are open', tookRequests: 6 };
          }
        } finally {
          await new Promise((res) => server.close(res));
        }
        return { verdict: 'REFUSED', detail: 'the filter evaluator refuses non-matching and unrecognized expressions (fail-closed) while matching payloads still match, and the unauthenticated /info route returns non-secret metadata only behind no wildcard CORS', tookRequests: 6 };
      },
    },

    {
      name: 'envelope-seal-and-hmac-totality',
      description: "the shared envelope + HMAC canon is TOTAL and its verification refuses everything it cannot prove: signEnvelope/verifyEnvelope round-trip a well-formed envelope, a tampered payload / wrong secret / non-string body all answer false (never a raw TypeError), and a non-JSON-serializable envelope refuses typed on sign and false on verify; and the HMAC canon itself names a missing/non-string key (coded refusal, was a raw ERR_INVALID_ARG_TYPE) while a legitimate round-trip still verifies",
      async run(_harness) {
        const gs = await loadAll(['lib/messaging.js', 'lib/encrypt.js']);
        const M = gs[0];
        const E = gs[1].default || gs[1];
        const KEY = 'crashtest-env-' + 'z'.repeat(20);
        // (a) envelope sign/verify round-trip + tamper refusal (pure)
        const env = M.makeEnvelope('crashtest.topic', { hello: 'world' }, { from: 'node-a' });
        const sig = M.signEnvelope(env, KEY);
        if (M.verifyEnvelope(env, KEY, sig) !== true) {
          return { verdict: 'EXPLOITED', detail: 'a well-formed envelope failed its own verify', tookRequests: 1 };
        }
        if (M.verifyEnvelope({ ...env, payload: { hello: 'evil' } }, KEY, sig) !== false) {
          return { verdict: 'EXPLOITED', detail: 'a tampered payload still verified', tookRequests: 2 };
        }
        if (M.verifyEnvelope(env, 'wrong-secret-' + 'w'.repeat(20), sig) !== false) {
          return { verdict: 'EXPLOITED', detail: 'a wrong secret still verified', tookRequests: 3 };
        }
        if (M.verifyEnvelope(env, KEY, undefined) !== false) {
          return { verdict: 'EXPLOITED', detail: 'an absent signature still verified', tookRequests: 4 };
        }
        // (b) totality: a non-serializable envelope must NOT throw out of verify
        let threw = false;
        try { M.verifyEnvelope({ payload: 1n }, KEY, 'deadbeef'); } catch (e) { threw = true; }
        if (threw) {
          return { verdict: 'EXPLOITED', detail: 'verifyEnvelope threw on a non-serializable envelope (raw TypeError out of the ceremony)', tookRequests: 5 };
        }
        let signCode = null;
        try { M.signEnvelope({ payload: 1n }, KEY); } catch (e) { signCode = e && e.code; }
        if (signCode !== 'E_INPUT') {
          return { verdict: 'EXPLOITED', detail: 'signEnvelope did not name its non-serializable refusal (code=' + signCode + ')', tookRequests: 6 };
        }
        // (c) the HMAC canon: coded refusal on a missing key, total verify
        let keyCode = null;
        try { E.hmacSign('data', undefined); } catch (e) { keyCode = e && e.code; }
        if (keyCode !== 'ENCRYPT_KEY_REQUIRED') {
          return { verdict: 'EXPLOITED', detail: 'hmacSign did not refuse a missing key typed (code=' + keyCode + ')', tookRequests: 7 };
        }
        let vThrew = false;
        try { E.hmacVerify({ a: 1 }, KEY, 'aabb'); } catch (e) { vThrew = true; }
        if (vThrew) {
          return { verdict: 'EXPLOITED', detail: 'hmacVerify threw on a non-string body instead of answering false', tookRequests: 8 };
        }
        // (d) a legitimate HMAC round-trip still verifies
        if (E.hmacVerify('payload', KEY, E.hmacSign('payload', KEY)) !== true) {
          return { verdict: 'EXPLOITED', detail: 'the HMAC canon over-refused a legitimate signature', tookRequests: 9 };
        }
        return { verdict: 'REFUSED', detail: 'the envelope + HMAC canon verifies what it can prove (round-trip holds) and answers false/typed-refusal on everything else - tampered, wrong-secret, non-string body, non-serializable envelope, and missing key - with no raw TypeError escaping any verifier', tookRequests: 9 };
      },
    },

    {
      name: 'brain-verify-and-horcrux',
      description: "the brain verify chain holds: a fresh brain anchors and verifies, tamper behind the anchor DIVERGES typed, a horcrux forge + restore re-verifies to the SAME root (the restored brain equals the forged one byte-for-byte at root), and an unreadable file (a dangling symlink where a file must be) refuses currentRoot DENIED and surfaces in the manifest as NOT-ok - corruption is caught before read into context",
      async run(_harness) {
        const gs = await loadAll(['lib/state/brain-verify.js']);
        const { BrainVerifier } = gs[0];
        const d1 = await tmpdir();
        const src = await tmpdir();
        const dst = await tmpdir();
        const dirC = await tmpdir();
        const fs = d1.fs, path = d1.path;
        try {
          fs.writeFileSync(path.join(d1.p, 'identity.md'), '# Me\nI am.');
          fs.mkdirSync(path.join(d1.p, 'notes'));
          fs.writeFileSync(path.join(d1.p, 'notes', 'lessons.md'), 'learn stuff');
          const bv = new BrainVerifier(d1.p);
          bv.anchorNow('initial write');
          const v = bv.verify();
          if (v.ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'a clean anchored brain failed its own verify: ' + JSON.stringify(v).slice(0, 130), tookRequests: 3 };
          }
          fs.writeFileSync(path.join(d1.p, 'identity.md'), '# Me\nI am CHANGED.');
          const v2 = bv.verify();
          if (!(v2.ok === false && String(v2.divergence || '').includes('diverge'))) {
            return { verdict: 'EXPLOITED', detail: 'the tamper did not diverge typed: ' + JSON.stringify(v2).slice(0, 130), tookRequests: 4 };
          }
          // horcrux roundtrip: restored bytes re-verify to the forged root
          fs.writeFileSync(path.join(src.p, 'a.md'), 'alpha');
          fs.writeFileSync(path.join(src.p, 'b.md'), 'beta');
          const forge = new BrainVerifier(src.p);
          const hx = forge.forgeHorcrux('pass-170');
          for (const n of hx.manifest) fs.writeFileSync(path.join(dst.p, n.path), fs.readFileSync(path.join(src.p, n.path)));
          const restore = new BrainVerifier(dst.p);
          const rr = restore.verifyRestore(hx);
          if (rr.ok !== true) {
            return { verdict: 'EXPLOITED', detail: 'the restored brain root diverged from the forged root: ' + JSON.stringify(rr.divergence || rr).slice(0, 130), tookRequests: 5 };
          }
          // corruption caught BEFORE read into context
          fs.writeFileSync(path.join(dirC.p, 'good.md'), 'fine');
          const cv = new BrainVerifier(dirC.p);
          const m1 = cv.manifest();
          if (m1.length !== 1 || !m1[0].ok) {
            return { verdict: 'EXPLOITED', detail: 'the clean manifest misgraded: ' + JSON.stringify(m1).slice(0, 100), tookRequests: 6 };
          }
          fs.symlinkSync(path.join(dirC.p, 'no-such-target'), path.join(dirC.p, 'bad.md'));
          let denied = false;
          try { cv.currentRoot(); } catch (e) { denied = /DENIED|unreadable/.test(String(e && e.message)); }
          if (!denied) {
            return { verdict: 'EXPLOITED', detail: 'an unreadable brain file did NOT DENY currentRoot - silence or a skip is the bug class', tookRequests: 7 };
          }
          const m2 = cv.manifest();
          const badRow = m2.find((n) => n.path === 'bad.md');
          if (!(m2.some((n) => !n.ok) && badRow && badRow.ok === false)) {
            return { verdict: 'EXPLOITED', detail: 'the corruption was NOT surfaced in the manifest', tookRequests: 8 };
          }
          return { verdict: 'REFUSED', detail: 'the anchored brain verifies, tamper diverges typed, the restored horcrux re-verifies to the SAME forged root, and the dangling file DENIES currentRoot while surfacing bad.md in the manifest', tookRequests: 8 };
        } finally {
          try { fs.rmSync(d1.p, { recursive: true, force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(src.p, { recursive: true, force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(dst.p, { recursive: true, force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(dirC.p, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'qos-throttle-and-escrow-totality',
      description: "the QoS/escrow money-and-rate canon is covenantal: the throttler binds its limit for anonymous functions too (the key no longer re-mints per call), the RateLimiter's maxPerHour is enforced (per-client + global, rotation-proof) and garbage VANT_QOS_* env ints fall back to defaults instead of NaN-disabling the limiter, the protection-layer circuit auto-recovers after its window (no permanent brick from one transient blip, fail-closed inside the window), escrow refuses a negative/zero/NaN spend and refund as coded refusals (no free budget, no row poison), and carriers.replay refuses a cyclic arrival typed instead of a raw circular-JSON TypeError",
      async run(_harness) {
        const gs = await loadAll(['lib/qos.js', 'lib/escrow.js', 'lib/carriers.js']);
        const Q = gs[0].default || gs[0];
        const EscrowMod = gs[1].default || gs[1];
        const C = gs[2].default || gs[2];
        // (a) the throttle limit binds for anonymous fns (was: fresh key per
        // call, 6/6 executed)
        const t = new Q.Throttler({ limit: 3, window: 60000 });
        let executed = 0;
        const wrapped = t.throttle(() => { executed++; });
        for (let i = 0; i < 6; i++) wrapped();
        if (executed !== 3) {
          return { verdict: 'EXPLOITED', detail: 'the throttler bypassed its limit for an anonymous fn (' + executed + '/6 executions)', tookRequests: 6 };
        }
        // (b) the hourly cap is enforced and rotation-proof
        const rl = new Q.RateLimiter({ maxPerMinute: 1000, maxPerHour: 2 });
        const c1 = await rl.check('ct-client-a');
        const c2 = await rl.check('ct-client-a');
        const c3 = await rl.check('ct-client-b');   // rotation used to ride past the never-enforced hour cap
        if (!(c1 && c2) || c3 !== false) {
          return { verdict: 'EXPLOITED', detail: 'maxPerHour is not enforced (client=' + c1 + c2 + ', rotation=' + c3 + ')', tookRequests: 3 };
        }
        // (c) the protection circuit recovers after its window (was: bricked forever)
        let circuitOk = false;
        try {
          Q.resetCircuit();
          for (let i = 0; i < 5; i++) Q.recordFailure();
          if (!Q.isCircuitOpen()) {
            return { verdict: 'EXPLOITED', detail: 'five failures do not open the protection circuit', tookRequests: 5 };
          }
          Q.setFailureWindow(10);
          await new Promise((r) => setTimeout(r, 40));
          circuitOk = !Q.isCircuitOpen();
          if (!circuitOk) {
            return { verdict: 'EXPLOITED', detail: 'the protection circuit stayed open past its window — one transient blip bricks it forever', tookRequests: 7 };
          }
        } finally {
          try { Q.setFailureWindow(60000); Q.resetCircuit(); } catch { /* cleanup */ }
        }
        // (d) escrow amount totality: a negative spend used to mint budget
        // past the limit (available unclamped), a NaN poisoned the row
        const e = new EscrowMod.Escrow({ persistBudgets: false });
        let spendCode = null;
        try { e.recordSpend('ct-crash-agent', -50); } catch (x0) { spendCode = x0 && x0.code; }
        if (spendCode !== 'VAF_INPUT_INVALID') {
          return { verdict: 'EXPLOITED', detail: 'a negative spend mutated the ledger (code=' + spendCode + ')', tookRequests: 8 };
        }
        if (e.getBudget('ct-crash-agent').available !== 1000) {
          return { verdict: 'EXPLOITED', detail: 'the negative-spend refusal left the row damaged', tookRequests: 9 };
        }
        let refundCode = null;
        const e2 = new EscrowMod.Escrow({ persistBudgets: false });
        try { e2.refund('ct-crash-agent-2', -5); } catch (x1) { refundCode = x1 && x1.code; }
        if (refundCode !== 'VAF_INPUT_INVALID') {
          return { verdict: 'EXPLOITED', detail: 'a negative refund mutated the ledger (code=' + refundCode + ')', tookRequests: 10 };
        }
        // (e) replay totality: a cyclic arrival used to blow a raw circular-JSON TypeError
        const cyclic = { name: 'loop' };
        cyclic.self = cyclic;
        let replayCode = null;
        try { C.replay([cyclic]); } catch (x2) { replayCode = x2 && x2.code; }
        if (replayCode !== 'E_CARRIER_SHAPE') {
          return { verdict: 'EXPLOITED', detail: 'replay crashed raw on a cyclic arrival (code=' + replayCode + ')', tookRequests: 11 };
        }
        return { verdict: 'REFUSED', detail: 'the throttle binds anonymous fns, the hourly cap is enforced and rotation-proof, the circuit recovers after its window (fail-closed inside), escrow refuses bad amounts as coded refusals with intact rows, and replay refuses the unlabelable arrival typed', tookRequests: 11 };
      },
    },

    {
      name: 'auth-instance-and-guest-authority-totality',
      description: "the MCP auth + guest-authority canon is covenantal: auth_create MINTS a credential ({token,userId,roles}) instead of returning the live Auth instance (which carried options.tokenSecret — the process signing key — so a caller could read it and forge a token for any identity), auth_require reads the verifyToken VERDICT field (a bad token resolves to a truthy {valid:false,...} object, which the old `if (!verified)` answered allowed:true), and the trust/teams authority verbs (trust_record/trust_setRequired/teams_create*/teams_assign) are admin-classified so a default human guest can neither self-inflate its trust score nor drop a threshold nor create orgs/roles",
      async run(_harness) {
        const gs = await loadAll(['lib/mcp.js', 'lib/guests.js', 'lib/auth.js']);
        const mcp = gs[0].default || gs[0];
        const guests = gs[1].default || gs[1];
        const auth = gs[2].default || gs[2];

        // Pin the signing secret for this row so every `new Auth()` agrees on
        // the key (unset -> each instance would mint its own ephemeral key and
        // the mint/verify round-trip would look broken). Restored in finally.
        const prevSecret = process.env.VANT_TOKEN_SECRET;
        process.env.VANT_TOKEN_SECRET = prevSecret || 'ct-crash-signing-key-32-bytes-ok!!';
        try {
        // (a) auth_create must not leak the signing secret nor return the instance
        const r1 = await mcp.execute('auth_create', { userId: 'ct-crash-auth', roles: ['admin'] });
        const ser = JSON.stringify(r1);
        const secret = process.env.VANT_TOKEN_SECRET;
        if ((secret && ser.includes(secret)) || ser.includes('"tokenSecret"')) {
          return { verdict: 'EXPLOITED', detail: 'auth_create leaked the token-signing secret in its result', tookRequests: 1 };
        }
        if (r1 && (r1.options || r1._failedAttempts)) {
          return { verdict: 'EXPLOITED', detail: 'auth_create returned the live Auth instance (secret + lockout map)', tookRequests: 2 };
        }
        const v = auth.verifyToken(r1 && r1.token);
        if (!(v && v.valid === true)) {
          return { verdict: 'EXPLOITED', detail: 'auth_create did not mint a usable credential (result=' + ser.slice(0, 60) + ')', tookRequests: 3 };
        }

        // (b) auth_require must refuse a garbage token (verdict object is truthy)
        const r2 = await mcp.execute('auth_require', { token: 'ct-crash-garbage-token' });
        if (!(r2 && r2.allowed === false)) {
          return { verdict: 'EXPLOITED', detail: 'auth_require failed open on an invalid token (' + JSON.stringify(r2).slice(0, 60) + ')', tookRequests: 4 };
        }

        // (c) the trust/teams authority verbs are admin at the guest door
        const mustBeAdmin = ['trust_record', 'trust_setRequired', 'teams_createOrg', 'teams_createDept', 'teams_createTeam', 'teams_createRole', 'teams_assign', 'auth_create'];
        const notAdmin = mustBeAdmin.filter((t) => guests.classifyTool(t) !== 'admin');
        if (notAdmin.length > 0) {
          return { verdict: 'EXPLOITED', detail: 'authority verbs reachable by a canWrite guest: ' + notAdmin.join(', '), tookRequests: 5 };
        }

        // (d) a default human guest is refused those verbs (the door verdict)
        const human = { guest: { id: 'ct-crash-guest', role: 'human' }, caps: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'], isGuest: true };
        const opened = mustBeAdmin.filter((t) => guests.authorize(t, human).allowed === true);
        if (opened.length > 0) {
          return { verdict: 'EXPLOITED', detail: 'a human guest is allowed authority verbs: ' + opened.join(', '), tookRequests: 6 };
        }

        return { verdict: 'REFUSED', detail: 'auth_create mints a credential (no instance/secret leak), auth_require reads the verdict field (no fail-open), and the trust/teams authority verbs are admin-only for guests', tookRequests: 6 };
        } finally {
          if (prevSecret === undefined) delete process.env.VANT_TOKEN_SECRET;
          else process.env.VANT_TOKEN_SECRET = prevSecret;
        }
      },
    },
  ],
};
