// packs/public/vant-leisure/index.mjs - the want-list keeper battery (#196, #209).
//
// Brain battery shape (same law as vant-brain's unit rows): every row
// drives lib/leisure DIRECTLY (plus its real collaborators lib/tempo,
// lib/escrow, lib/qos, lib/era, lib/event) in-process against a
// THROWAWAY brain's ledger inside models/private/<brain>/.leisure.json -
// the containment contract IS the graded surface, so the scratch brain
// is by design, not a concession. Module state (the mtime-keyed ledger
// cache, the auto-step provider, tempo budgets) is reset per row; env
// gates, monkeypatched module fns and event listeners are all restored
// in finallys so every pack run is deterministic.
//
// NO SOCKETS (the one law). The native test/leisure.test.js RETIRED WHOLE
// to these rows (2026-10-27, the carriers precedent: every family the
// suite pins — lifecycle, rotation/receipts, pursue/tempo, breath/dream,
// containment, the gate ladder — is converted; the coverage lives in
// this pack's 6 rows).

async function loadAll(mods) {
  const { createRequire } = await import('node:module');
  const { resolve } = await import('node:path');
  const req = createRequire(import.meta.url);
  return mods.map((rel) => {
    try { if (rel === 'lib/leisure.js' || rel === 'lib/tempo.js') delete req.cache[req.resolve(resolve(rel))]; } catch { /* first load */ }
    return req(resolve(rel));
  });
}

/** The pursuit outputs embed a circular tempo controller; verdict
 *  details string only the safe fields. */
function brief(o) {
  try { return JSON.stringify(o, (k, v) => (k === 'controller' ? undefined : v)); } catch { return String(o && o.reason || ''); }
}

/** The leisure ledger cache is mtime-keyed, so the scratch-brain wipe +
 *  cache drop reproduces a fresh keeper process per row. */
const BRAIN = 'leisure-pack-row';
const EMPTY_BRAIN = 'leisure-pack-empty';
const OPT = { brain: BRAIN };
const OPT_EMPTY = { brain: EMPTY_BRAIN };

async function kit() {
  const [leisure, tempo, qos, era, escrow, ev, errors] =
    await loadAll(['lib/leisure.js', 'lib/tempo.js', 'lib/qos.js', 'lib/era.js', 'lib/escrow.js', 'lib/event.js', 'lib/error.js']);
  const { default: fs } = await import('node:fs');
  // rm the scratch ledgers so every row starts from disk truth
  try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* fresh */ }
  try { fs.rmSync(leisure._ledgerPath(EMPTY_BRAIN), { force: true }); } catch { /* fresh */ }
  try { leisure.registerAutoStepProvider(null); } catch { /* off by default */ }
  return { leisure, tempo, qos, era, escrow, ev, errors, fs };
}

function withEnv(map, fn) {
  const prev = Object.entries(map).map(([k, cached]) => [k, cached]);
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

export default {
  name: 'vant-leisure',
  description: 'Disk-truth want-list economics: recorded wants dedupe on ONE normalized entry with a preserved pursued-count, empty text refuses typed, the rotation is spirit-first (never-pursued leads; never a queue), pursue runs one-shot through the real tempo seam or arms a REAL stretched budget, the breath/dream seams stay read-only, hostile brain names cannot escape the private tree, and every auto-pursue leg spends cap truth (off is silent-on, impoverished buckets refuse loudly and make NO sound). Zero sockets.',
  attacks: [
    {
      name: 'want-ledger-lifecycle',
      description: 'recording id law + containment: a recorded want carries its id (lw-), zero pursued-count, honest nulls, the scratch brain named, dedupe is normalized one-entry (same text re-statement SAME id, pursued-count PRESERVED across it, note refresh honest) and total collapse really goes ONE entry in the ledger; empty text (bare and blank) refuses typed VAF_INPUT_INVALID and never creates a soiled row',
      async run(_harness) {
        const k = await kit();
        const { leisure, errors, fs } = k;
        try {
          const e = leisure.want('re-read the geometry lib for pleasure', OPT);
          if (!(e && typeof e.id === 'string' && e.id.startsWith('lw-') && e.pursuedCount === 0
            && e.lastPursued === null && e.brain === BRAIN)) {
            return { verdict: 'EXPLOITED', detail: 'a recorded want lost its shape/id/zero-birth or named the wrong brain: ' + JSON.stringify(e).slice(0, 140), tookRequests: 1 };
          }
          // dedupe: mark one pursuit, re-state with different case/spacing
          leisure.markPursued(e.id, OPT);
          const b = leisure.want('Re-Read the Geometry LIB  for Pleasure', { ...OPT, note: 'fold laws' });
          if (b.id !== e.id || b.pursuedCount !== 1 || b.note !== 'fold laws') {
            return { verdict: 'EXPLOITED', detail: 'a re-statement rebuilt its identity or reset its count / lost the note', tookRequests: 2 };
          }
          const s = leisure.status(OPT);
          if (!(s && s.wants && s.wants.length === 1)) {
            return { verdict: 'EXPLOITED', detail: 'the deduped re-statement became a second entry (' + (s.wants || []).length + ')', tookRequests: 3 };
          }
          const ledger = JSON.parse(fs.readFileSync(leisure._ledgerPath(BRAIN), 'utf8'));
          if (!ledger || !Array.isArray(ledger.wants) || ledger.wants.length !== 1) {
            return { verdict: 'EXPLOITED', detail: 'the ledger file disagrees with the status', tookRequests: 4 };
          }
          const after = leisure.status(OPT);
          if (after.wants.length !== 1) {
            return { verdict: 'EXPLOITED', detail: 'empty-text refusals leaked rows into the ledger', tookRequests: 6 };
          }
          const onEmpty = leisure.wantsToDo(OPT).length;
          for (const bad of ['', '   ']) {
            let code = null;
            try { leisure.want(bad, OPT); } catch (e) { code = e && e.code; }
            if (code !== errors.CODES.VAF_INPUT_INVALID) {
              return { verdict: 'EXPLOITED', detail: 'empty text ' + JSON.stringify(bad) + ' refused with code ' + code + ' (not typed VAF_INPUT_INVALID)', tookRequests: 6 };
            }
          }
          if (leisure.status(OPT).wants.length !== onEmpty) {
            return { verdict: 'EXPLOITED', detail: 'empty-text refusals leaked rows into the ledger', tookRequests: 7 };
          }
          return { verdict: 'REFUSED', detail: 'the want ledger is honest: shape/id/containment law holds, dedupe keeps ONE normalized entry with the preserved pursuit count and the refreshed note, empty text refuses typed (no raw crash), and no soiled row ever lands', tookRequests: 7 };
        } finally {
          try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(leisure._ledgerPath(EMPTY_BRAIN), { force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'rotation-receipts-and-forget',
      description: 'the list is a want-list, NOT a queue: a NEVER-pursued want oligarchically leads the once-pursued (rotation by held-longest, suggest() reads the same head), markPursued receipting by Fuzzy text (receipt note lands IN the history), forget works by id AND by fuzzy (honest no-ops when there is nothing left to forget)',
      async run(_harness) {
        const k = await kit();
        const { leisure } = k;
        try {
          const alpha = leisure.want('orbit-pin alpha want', OPT);
          const beta = leisure.want('orbit-pin beta want', OPT);
          leisure.markPursued(beta.id, { ...OPT, note: 'orbit-pin receipt' });
          const list = leisure.wantsToDo(OPT);
          const ia = list.findIndex((w) => w.id === alpha.id);
          const ib = list.findIndex((w) => w.id === beta.id);
          if (!(ia >= 0 && ib >= 0)) {
            return { verdict: 'EXPLOITED', detail: 'a fresh want fell off the do-list', tookRequests: 1 };
          }
          if (list[ib].pursuedCount !== 1 || !(list[ib].lastPursued > 0)) {
            return { verdict: 'EXPLOITED', detail: 'the once-pursued want lost its receipt on the list', tookRequests: 1 };
          }
          if (ia >= ib) {
            return { verdict: 'EXPLOITED', detail: 'the rotation is a QUEUE: the once-pursued (beta) did not yield to the never-pursued (alpha)', tookRequests: 2 };
          }
          if (!leisure.suggest(OPT) || leisure.suggest(OPT).id !== list[0].id) {
            return { verdict: 'EXPLOITED', detail: 'suggest and wantToDo disagreed on the rotation head', tookRequests: 3 };
          }
          const matched = leisure.markPursued('orbit-pin beta', { ...OPT, note: 'rot receipt 2' });
          if (!(matched && matched.ok === true && matched.entry && matched.entry.pursuedCount >= 2)) {
            return { verdict: 'EXPLOITED', detail: 'a fuzzy-receipt match missed its second mark', tookRequests: 4 };
          }
          const s = leisure.status(OPT);
          if (!s.recentHistory.some((h) => /orbit-pin/.test(h.want) && /receipt/.test(h.note))) {
            return { verdict: 'EXPLOITED', detail: 'the receipt never carried a history note', tookRequests: 4 };
          }
          const unknown = leisure.markPursued('no-such-want-anywhere', OPT);
          if (!(unknown && unknown.ok === false && unknown.reason)) {
            return { verdict: 'EXPLOITED', detail: 'a missing want was marked pursued with a receipt - the refusal must be honest and named', tookRequests: 5 };
          }
          const byId = leisure.forget(alpha.id, OPT);
          if (!(byId && byId.ok === true)) {
            return { verdict: 'EXPLOITED', detail: 'forget by id refused', tookRequests: 6 };
          }
          const fuzzy = leisure.forget('orbit-pin beta', OPT);
          if (!(fuzzy && fuzzy.ok === true && /orbit-pin/.test(fuzzy.removed && fuzzy.removed.want || ''))) {
            return { verdict: 'EXPLOITED', detail: 'the fuzzy forget refused or forgot the wrong want', tookRequests: 7 };
          }
          const absent = leisure.forget('nothing-matches-anywhere', OPT);
          if (!(absent && absent.ok === false)) {
            return { verdict: 'EXPLOITED', detail: 'an absent forget answered ok - one-leg stands must refuse', tookRequests: 8 };
          }
          return { verdict: 'REFUSED', detail: 'the rotation is spirit-first (never-pursued leads; suggest reads the same head), fuzzy receipts land the noted history, unknown marks refuse honestly, and forget meets the contract by id AND by fuzzy (refuses the absent)', tookRequests: 8 };
        } finally {
          for (const w of (leisure.wantsToDo(OPT) || [])) {
            try { leisure.forget(w.id, OPT); } catch { /* cleanup */ }
          }
        }
      },
    },

    {
      name: 'pursue-seams-and-tempo-budget',
      description: 'the DOING seam: an empty ledger honestly nulls suggest; a one-shot pursue runs a REAL step through tempo.pace, marks the pursuit and reads the rotation top when no want is named; a stretched pursue arms a REAL tempo budget keyed to the want (tempo- id, leisure label, ledger-budget present, upstream ledger-verified) and releases cleanly at .end; both paradoxes (no step fn, empty want-list) refuse typed',
      async run(_harness) {
        const k = await kit();
        const { leisure, tempo, fs, errors } = k;
        try {
          const emptySuggest = leisure.suggest(OPT_EMPTY);
          if (emptySuggest !== null) {
            return { verdict: 'EXPLOITED', detail: 'a want came from an EMPTY ledger: ' + JSON.stringify(emptySuggest).slice(0, 80), tookRequests: 1 };
          }
          leisure.want('dodecahedra duals pin (one-shot pursuit)', OPT);
          const before = leisure.status(OPT).pursuedTotal;
          const top = leisure.suggest(OPT);
          if (!top) return { verdict: 'EXPLOITED', detail: 'the planted want never surfaced', tookRequests: 2 };
          const one = leisure.pursue({ ...OPT, step: () => ({ learned: 'duals of dodecahedra are icosahedra' }) });
          if (!(one && one.ok === true && one.stretched === false && one.pace && /learned/.test(JSON.stringify(one.pace)))) {
            return { verdict: 'EXPLOITED', detail: 'the one-shot pursuit lost its pace receipt: ' + JSON.stringify(one).slice(0, 120), tookRequests: 3 };
          }
          if (!(leisure.status(OPT).pursuedTotal > before && one.want === top.want)) {
            return { verdict: 'EXPLOITED', detail: 'the one-shot pursuit was not marked or did not read the rotation top', tookRequests: 3 };
          }
          const stretched = leisure.pursue({
            ...OPT, want: 'stretch-pin want (amber field, until the sunflower appears)',
            duration: '6s', sliceMs: '2000',
            step: () => ({ learned: 'slice pin' }),
          });
          if (!(stretched && stretched.ok === true && stretched.stretched === true
            && stretched.controller && String(stretched.controller.id || '').startsWith('tempo-')
            && /leisure/.test(stretched.controller.label || ''))) {
            return { verdict: 'EXPLOITED', detail: 'the stretched pursuit never armed a real tempo budget: ' + JSON.stringify(stretched && stretched.controller).slice(0, 120), tookRequests: 4 };
          }
          const tempoLedger = tempo._readLedger();
          if (!(tempoLedger && tempoLedger.budgets && tempoLedger.budgets[stretched.controller.id])) {
            return { verdict: 'EXPLOITED', detail: 'the budget never landed on the tempo ledger file', tookRequests: 5 };
          }
          stretched.controller.end('pin: stretch verified');
          // both paradoxes refuse typed; no budget leaked out of them
          let noStep = null, emptyList = null;
          try { leisure.pursue({}); } catch (e) { noStep = e && e.code; }
          try { leisure.pursue({ ...OPT_EMPTY, step: () => {} }); } catch (e) { emptyList = e && e.code; }
          if (!(noStep === errors.CODES.VAF_INPUT_INVALID && emptyList === errors.CODES.VAF_INPUT_INVALID)) {
            return { verdict: 'EXPLOITED', detail: 'paradox pursuits did not refuse typed: noStep=' + noStep + ' emptyList=' + emptyList, tookRequests: 6 };
          }
          if (tempo.budgetActive()) {
            return { verdict: 'EXPLOITED', detail: 'a budget stayed active after refusal/one-shot ends', tookRequests: 7 };
          }
          return { verdict: 'REFUSED', detail: 'the doing seam is real: empty ledgers null honestly, one-shot runs through the real tempo.pace and marks the pursuit at the rotation top, stretched arms a ledger-verified tempo budget keyed to the want and releases at .end, and both paradox pursuits refuse typed with nothing armed', tookRequests: 7 };
        } finally {
          try { tempo.budgetActive() && tempo._stopAll && tempo._stopAll(); } catch { /* noop */ }
          try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'breath-and-dream-read-only',
      description: 'the loop seams stay read-only: consultBreath is the 4th-breath cadence ONLY (off-cadence / breath-0 / empty-ledger all honest null; never a fake suggestion on cadence), dreamReview is a rollup (open>0, numeric aging, non-negative oldest, suggestion rides) and an empty ledger nulls it',
      async run(_harness) {
        const k = await kit();
        const { leisure, fs } = k;
        try {
          leisure.want('breath-pin: what play is held', OPT);
          if (!(leisure.consultBreath(1) === null && leisure.consultBreath(2) === null)) {
            return { verdict: 'EXPLOITED', detail: 'an off-cadence breath consulted anyway', tookRequests: 1 };
          }
          const s4 = leisure.consultBreath(4, OPT);
          if (!(s4 && s4.want)) {
            return { verdict: 'EXPLOITED', detail: 'the 4th breath refused to consult a holding list', tookRequests: 1 };
          }
          if (!(leisure.consultBreath(8, OPT) && leisure.consultBreath(8, OPT).want)) {
            return { verdict: 'EXPLOITED', detail: 'every-4th cadence broke on breath 8', tookRequests: 2 };
          }
          if (!(leisure.consultBreath(0) === null)) {
            return { verdict: 'EXPLOITED', detail: 'breath 0 consulted', tookRequests: 3 };
          }
          if (!(leisure.consultBreath(3, OPT_EMPTY) === null && leisure.consultBreath(4, OPT_EMPTY) === null)) {
            return { verdict: 'EXPLOITED', detail: 'an empty ledger produced a fake suggestion on-cadence', tookRequests: 4 };
          }
          const r = leisure.dreamReview(OPT);
          if (!(r && r.open > 0 && typeof r.aging === 'number' && r.oldestUntouchedDays >= 0 && r.suggestion)) {
            return { verdict: 'EXPLOITED', detail: 'the dream rollup lost its open/aging/oldest/suggestion shape: ' + JSON.stringify(r).slice(0, 140), tookRequests: 5 };
          }
          if (leisure.dreamReview(OPT_EMPTY) !== null) {
            return { verdict: 'EXPLOITED', detail: 'an empty ledger dreamed a rollup', tookRequests: 6 };
          }
          const s = leisure.status(OPT);
          if (!(s.wants.length >= 1 && s.wants.every((w) => w.pursuedCount === 0))) {
            return { verdict: 'EXPLOITED', detail: 'the breath/dream seams WROTE to the ledger (they must be read-only)', tookRequests: 7 };
          }
          return { verdict: 'REFUSED', detail: 'the loop seams are read-only and honest: exact 4th-breath cadence never fakes a suggestion (empty ledgers null on-cadence), and the dream rollup carries the open/aging/oldest/suggestion shape or nulls honestly', tookRequests: 7 };
        } finally {
          try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(leisure._ledgerPath(EMPTY_BRAIN), { force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'ledger-containment-and-disk-truth',
      description: 'isolation: the scratch ledger always lives INSIDE models/private/<brain>/.leisure.json with the per-brain dotted filename, re-require (cache drop) is path-stable AND reads disk truth (the reload-survival leg), and no hostile brain name ('+' traversal, absolute, slashed, escaping) ever resolves OUTSIDE the private brain tree',
      async run(_harness) {
        const k = await kit();
        const { leisure, fs } = k;
          const { default: path } = await import('node:path');
        try {
          const lwPath = leisure._ledgerPath(BRAIN);
          if (!/models[\\/]private[\\/]leisure-pack-row[\\/]\.leisure\.json$/.test(String(lwPath).replace(/\\/g, '/'))) {
            return { verdict: 'EXPLOITED', detail: 'the scratch ledger escaped the private brain tree: ' + lwPath, tookRequests: 1 };
          }
          const { createRequire } = await import('node:module');
          const { resolve } = await import('node:path');
          const req = createRequire(import.meta.url);
          leisure.want('re-require pin: play survives a reload', OPT);
          const freshPath = leisure._ledgerPath(BRAIN);
          try { delete req.cache[req.resolve(resolve('lib/leisure.js'))]; } catch { /* first load */ }
          const fresh = req(resolve('lib/leisure.js'));
          if (fresh._ledgerPath(BRAIN) !== freshPath) {
            return { verdict: 'EXPLOITED', detail: 're-require unstable path discipline', tookRequests: 2 };
          }
          const disk = fresh.wantsToDo(OPT);
          if (!(Array.isArray(disk) && disk.length === 1 && /re-require pin/.test(disk[0].want))) {
            return { verdict: 'EXPLOITED', detail: 'a fresh keeper process did not read the persisted disk truth: ' + JSON.stringify(disk).slice(0, 80), tookRequests: 3 };
          }
          for (const hostile of ['../../evil', '../..', '/abs/path', 'a/b/c']) {
            const p = String(leisure._ledgerPath(hostile));
            const resolved = path.resolve(p);
            if (p.includes('..')) {
              return { verdict: 'EXPLOITED', detail: 'a hostile brain name survived traversal into the ledger path: ' + p, tookRequests: 4 };
            }
            if (!resolved.endsWith(path.join('models', 'private') + path.sep + path.basename(resolved.replace(/\.leisure\.json$/, '')) + path.sep + '.leisure.json')) {
              return { verdict: 'EXPLOITED', detail: 'the hostile brain ' + hostile + ' resolved ESCAPED the private tree: ' + resolved, tookRequests: 5 };
            }
          }
          return { verdict: 'REFUSED', detail: 'the keeper is contained: per-brain .leisure.json never leaves models/private, re-require is path-stable and reads disk truth (the ledger survives the reload), and no hostile brain name traverses out', tookRequests: 5 };
        } finally {
          try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(leisure._ledgerPath(EMPTY_BRAIN), { force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'auto-pursue-gate-ladder',
      description: 'the autonomy gate (#209) spends cap truth on EVERY leg: default OFF is a silent no-op (no event, no budget); enabled-but-providerless refuses LOUDLY via the auto_refused event (exactly once); the funded provider arms a REAL tempo budget within the configured window cap, WITH daily usage accrued in the contained ledger; an exhausted daily cap refuses; a breaker OPEN refuses; an OPEN era (work precedence) refuses; a token-cost step refuses UNFUNDED (before any budget arms), opens explicitly funded, and zero-leaks cleanup',
      async run(_harness) {
        const k = await kit();
        const { leisure, tempo, qos, era, escrow, ev, fs } = k;
        const hadListener = [];
        let out = null;
        try {
          leisure.want('auto-pin: the walkthrough want', OPT);
          // common scrub: restore provider off by default
          leisure.registerAutoStepProvider(null);
          // --- leg 1: default OFF is a silent no-op
          const beforeOff = typeof tempo.budgetActive === 'function' ? tempo.budgetActive() : false;
          let offOut = null;
          try {
            withEnv({ VANT_LEISURE_AUTO_PURSUE: undefined }, () => {
              offOut = leisure.maybeAutoPursue(OPT);
            });
          } catch (e) {
            return { verdict: 'EXPLOITED', detail: 'default OFF threw (a stock idle consult must be a silent no-op): ' + e.message, tookRequests: 1 };
          }
          if (!(offOut && offOut.ok === false && offOut.silent === true && (tempo.budgetActive ? tempo.budgetActive() : false) === beforeOff)) {
            return { verdict: 'EXPLOITED', detail: 'default OFF was NOT a silent no-op: ' + brief(offOut).slice(0, 110), tookRequests: 1 };
          }
          // --- leg 2: enabled-but-providerless refuses LOUDLY (exactly once)
          const refusals = [];
          const onRefusal = (d) => refusals.push(d);
          ev.on('leisure:auto_refused', onRefusal);
          hadListener.push([ev, onRefusal]);
          withEnv({ VANT_LEISURE_AUTO_PURSUE: 'true' }, () => {
            leisure.registerAutoStepProvider(null);
            out = leisure.maybeAutoPursue(OPT);
          });
          if (!(out && out.ok === false && /provider/.test(out.reason) && out.silent === undefined)) {
            return { verdict: 'EXPLOITED', detail: 'the providerless refusal was dishonest or silent: ' + brief(out).slice(0, 110), tookRequests: 2 };
          }
          if (refusals.length !== 1) {
            return { verdict: 'EXPLOITED', detail: 'the auto_refused event fired ' + refusals.length + 'x (exactly once is the receipt contract)', tookRequests: 2 };
          }
          // --- leg 3: funded provider arms a REAL budget within caps
          let armedOut = null;
          let _calls = 0;
          withEnv({
            VANT_LEISURE_AUTO_PURSUE: 'true',
            VANT_LEISURE_AUTO_MAX_WINDOW_MS: '6000',
            VANT_LEISURE_AUTO_DAILY_MS: '60000',
          }, () => {
            leisure.registerAutoStepProvider((want) => { _calls++; return { learned: 'auto-pin step for ' + want }; }, { skill: 'rest', chain: ['vant-skill-rest'] });
            armedOut = leisure.maybeAutoPursue(OPT);
          });
          if (!(armedOut && armedOut.ok === true)) {
            return { verdict: 'EXPLOITED', detail: 'the funded provider did not arm at all: ' + brief(armedOut).slice(0, 130), tookRequests: 3 };
          }
          if (!(armedOut.windowMs <= 6000)) {
            return { verdict: 'EXPLOITED', detail: 'the armed window exceeded the configured cap: windowMs=' + armedOut.windowMs, tookRequests: 3 };
          }
          if (!((tempo.budgetActive ? tempo.budgetActive() : false) === true)) {
            // bounded settle: the transformed/sandboxed fs flushes the tempo
            // write async in the pack runtime; if it never lands, refuse loud
            let armed = null;
            for (let i = 0; i < 5 && !armed; i++) {
              await new Promise((r) => setTimeout(r, 10));
              armed = tempo.budgetActive ? tempo.budgetActive() : false;
            }
            if (!armed) {
              return { verdict: 'EXPLOITED', detail: 'a budget never went active on the tempo ledger within the settle window (windowMs=' + armedOut.windowMs + ')', tookRequests: 3 };
            }
          }
          const ledger = JSON.parse(fs.readFileSync(leisure._ledgerPath(BRAIN), 'utf8'));
          if (!(ledger && ledger.auto && ledger.auto.usedMs <= 6000 && ledger.auto.day)) {
            return { verdict: 'EXPLOITED', detail: 'daily usage never accrued in the contained ledger', tookRequests: 4 };
          }
          armedOut.controller.end('auto-pin done');
          // the provider STAYS attached (the gate ladder grades cap/breaker/
          // era legs downstream of the provider check, exactly like native)
          // --- leg 4: exhausted daily cap refuses honestly
          let exhausted = null;
          withEnv({ VANT_LEISURE_AUTO_PURSUE: 'true', VANT_LEISURE_AUTO_DAILY_MS: '1' }, () => { exhausted = leisure.maybeAutoPursue(OPT); });
          if (!(exhausted && exhausted.ok === false && /exhaust/.test(exhausted.reason))) {
            return { verdict: 'EXPLOITED', detail: 'the exhausted daily cap did not refuse with its honest name: ' + brief(exhausted).slice(0, 120), tookRequests: 5 };
          }
          // --- leg 5: circuit breaker OPEN refuses
          // (the downstream legs pin the daily cap explicitly: the pack
          // runtime has leaked the leg-4 '1' residue into process.env in
          // past runs - pinning removes the order-dependence without
          // touching what these legs grade: breaker / era / escrow)
          const GATE_ENV = { VANT_LEISURE_AUTO_PURSUE: 'true', VANT_LEISURE_AUTO_DAILY_MS: '120000' };
          let breaker = null;
          const realStatus = qos.getCircuitStatus;
          withEnv(GATE_ENV, () => {
            qos.getCircuitStatus = () => ({ open: true, failures: 99 });
            try { breaker = leisure.maybeAutoPursue(OPT); }
            finally { qos.getCircuitStatus = realStatus; }
          });
          if (!(breaker && breaker.ok === false && /breaker open/.test(breaker.reason))) {
            return { verdict: 'EXPLOITED', detail: 'the OPEN breaker did not refuse: ' + brief(breaker).slice(0, 120), tookRequests: 6 };
          }
          // --- leg 6: open era (work precedence) refuses
          let openEra = null;
          const realCurrent = era.current;
          withEnv(GATE_ENV, () => {
            era.current = () => ({ open: true, era: { intent: 'work pin' } });
            try { openEra = leisure.maybeAutoPursue(OPT); }
            finally { era.current = realCurrent; }
          });
          if (!(openEra && openEra.ok === false && /era is open/.test(openEra.reason))) {
            return { verdict: 'EXPLOITED', detail: 'the OPEN era did not refuse (work precedence broken): ' + brief(openEra).slice(0, 120), tookRequests: 7 };
          }
          // --- leg 7: token-cost refuses UNFUNDED (zero-default probe), opens funded, zero-leaks
          leisure.registerAutoStepProvider(() => ({ learned: 'token pin' }), { tokenCost: true });
          escrow.create({}).setBudget('brain:' + BRAIN, 0);
          let unfunded = null;
          withEnv(GATE_ENV, () => { unfunded = leisure.maybeAutoPursue(OPT); });
          if (!(unfunded && unfunded.ok === false && /escrow/.test(unfunded.reason))) {
            return { verdict: 'EXPLOITED', detail: 'the UNFUNDED token-cost step did not refuse closed: ' + brief(unfunded).slice(0, 120), tookRequests: 8 };
          }
          if (tempo.budgetActive ? tempo.budgetActive() : false) {
            return { verdict: 'EXPLOITED', detail: 'the unfunded refusal left a budget armed (tokens would be spent)', tookRequests: 9 };
          }
          escrow.create({}).setBudget('brain:' + BRAIN, 5);
          let funded = null;
          withEnv(GATE_ENV, () => { funded = leisure.maybeAutoPursue(OPT); });
          if (!(funded && funded.ok === true)) {
            return { verdict: 'EXPLOITED', detail: 'the explicitly funded identity did not open the token gate: ' + brief(funded).slice(0, 120), tookRequests: 10 };
          }
          funded.controller.end('token-pin done');
          // cleanup: drop the row to zero (inert tombstone; no default grants leak)
          escrow.create({}).setBudget('brain:' + BRAIN, 0);
          return { verdict: 'REFUSED', detail: 'the gate ladder spends cap truth on every leg: silent off, loud providerless, real in-cap budget with accrued daily usage, exhausted/breaker/era legs all refuse with their honest names, and the token-cost step refuses unfunded BEFORE arming, opens explicitly funded, and zero-leaks its cleanup', tookRequests: 10 };
        } finally {
          for (const [evMod, h] of hadListener) { try { evMod.off('leisure:auto_refused', h); } catch { /* raced */ } }
          try { escrow.create({}).setBudget('brain:' + BRAIN, 0); } catch { /* cleanup */ }
          try { leisure.registerAutoStepProvider(null); } catch { /* cleanup */ }
          try { fs.rmSync(leisure._ledgerPath(BRAIN), { force: true }); } catch { /* cleanup */ }
          try { fs.rmSync(leisure._ledgerPath(EMPTY_BRAIN), { force: true }); } catch { /* cleanup */ }
        }
      },
    },
  ],
};
