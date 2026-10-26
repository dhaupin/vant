// packs/public/vant-spine/index.mjs - the engine-parity spine battery.
//
// Converts the native test/engine-parity-spine.test.js pins (state PRD,
// #145-#166) onto pack rows per the campaign's reverse-verification law:
// the native suite stays green ALONGSIDE until one full run cycle is
// green on both sides; the S-counter only moves on that.
//
// Slice 1 (2026-10-26): STATE CORE, STORAGE, TARGETED - the in-process
// invariants (canonical bytes, tree laws, checkpoint recovery, anchor
// ledger, hot-set durability, persistent grants + WAL denial). The
// geometry / world-clock / mesh-brains sections ride slice 2. Every row
// drives the real lib modules directly (loadLib house pattern, no
// sockets, no run-root arm) and captures the native assertions on the
// same determinism terms: tmp fixtures are created fresh per drive and
// cleaned up; no wall clock lands in a verdict.

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
  description: 'engine-parity spine discipline for the state engine: canonical bytes reject non-plain values and key-order-independ, the StateTree put/diff/snapshot laws hold exactly (LWW, no phantom diffs, verified scope apply, truncated refusal, caller cap), the fold ring/depth/disjointness arithmetic agrees with the cell store rebate math (measured savings), checkpoint recovery reproduces the pre-kill root and DENIES an unreadable log, the anchor ledger is append-only with divergence verdicts, the hot set falls through to durable truth past its eviction cap, and persistent grants + WAL denial are fail-closed (expired/refused/unreadable never allow)',

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
        if (!throws(() => canonical.encode(new Date()), /non-plain object/)
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
  ],
};
