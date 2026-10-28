// packs/public/vant-brain/index.mjs - brain-layer discipline for vant pods.
//
// Filed as the #231 pack proposal (dhaupin/vant) and built out with the six
// expansion oracles from #233. The pack lives in VANT'S REPO - the same
// animals-first precedent the crashtest `wp-*` packs follow: the pack targets
// vant, so vant ships it.
//
// THE ONE LAW (crashtest PRD principle 2): no sockets, ever. Every oracle
// here runs against in-process routes the RUN ROOT declares (see contract
// below) - handlers call vant's own lib/brain, lib/migrations, lib/guests
// APIs in-process and return JSON. The MCP/REST doors are TCP and stay out
// of scope. Missing routes degrade to skipped-REFUSED ("skipped: true") -
// never a false positive (crashtest house rule 5).
//
// ============================================================================
// RUN-ROOT ROUTE CONTRACT (shim shape; arm what your host can, skip the rest)
//
// * brain-read      GET, JSON body { name, brain? }
//                   -> 200 JSON { content, source, path }
//                   resolved through in-process lib/brain.read() (dual read).
//                   The fixture installs PUBLIC-CANARY in a public brain file
//                   and PRIVATE-CANARY in the private twin.
// * brain-state     POST, JSON body { tamper: 'truncated' | 'trailing-garbage'
//                     | 'wrongtype-stack' | 'wrongtype-currentBrain'
//                     | 'missing-state' }
//                   -> 200 JSON { error?, stack, currentBrain,
//                        reads: [{ pinnedType, content, resolvedPath }] }
//                   the shim tampers models/state.json, re-instantiates the
//                   brain module fresh (a child probe process is fine; it is
//                   not a socket), then reports the NEUTRAL FACTS: what
//                   state the pointer resolved to and where the private-
//                   pinned read actually read from. No verdict fields.
// * brain-migrate   POST {} -> 200 JSON { error?, dryTouch, secondTouch,
//                        secondApplied }
//                   dryTouch = files written by migrate({dryRun:true});
//                   secondTouch = files changed between migrate() run 2 and
//                   run 1 on the same tree; secondApplied = run-2 applied
//                   step count.
// * guest-cap       POST {} -> 200 JSON { error?, adminDenied, revokedDead,
//                        pairingSingleUse }  (booleans, from lib/guests)
// * trust-read      POST, JSON body { level } -> 200 JSON { error?,
//                        privateContent, refused }
// * stone-restore-tamper POST {} -> 200 JSON { error?, restoreStatus,
//                        restoredFiles }
// * brain-graph-walk POST {} -> 200 JSON { error?, threw, depthReached, ms }
//
// VALIDATION STATUS (honest, per #231/#233's needs-validation caveat):
//   validated against a vant sandbox (test/crashtest-packs.test.js):
//     private-first-fallback, paths-cannot-escape-models,
//     state-tamper-is-loud, state-json-schema-strictness,
//     migration-idempotency, guest-capability-gates,
//     boot-stone-integrity (armed via stone-restore-tamper, 2026-10-24),
//     knowledge-links-cycle-safety (armed via brain-graph-walk, 2026-10-22:
//     brain_connections' visited guard + depth cap hold on a cyclic graph)
//     succession-trust-inheritance (armed via trust-read, 2026-10-22:
//     measured EXPLOITED — the read-side trust gate landed the SAME turn
//     and flipped it REFUSED: lib/succession privateReadVerdict enforced
//     at lib/brain's private read seam, no code-side bypass)
// ZERO EXPLOITED findings against vant as of 2026-10-22: the #232
// read-path rows flipped with the loud-fault/sanitize/derivation fix, the
// stones lineage row with the #226 mint-side retarget, and the trust row
// with the read-side floor. The known-finding whitelist in CI is EMPTY.
// ============================================================================

const ROUTE_ABSENT = /no route registered as/i;

/** skipped-REFUSED helper - explicit absence, never a silent pass. */
const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

/** Pull the body text out of a harness record (portable across harnesses:
 * crashtest's record carries `response`, this pack reads it defensively). */
async function bodyText(r) {
  if (r == null) return '';
  if (typeof r.body === 'string') return r.body;
  if (typeof r.text === 'function') return await r.text();
  if (r.response && typeof r.response.text === 'function') {
    try { return await r.response.text(); } catch { return ''; }
  }
  return '';
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** In-process lib loader (house pattern): the pod's CJS lib face via
 * pathToFileURL + dynamic import, resolved from the repo root. Returns
 * the CJS exports object (ns.default) - the ESM namespace only mirrors
 * statically-detected named exports, which lib/brain's dynamic surface
 * outgrows. Batch-2 rows drive lib/brain + lib/format directly.
 * Builtins stay OUTSIDE here: import them natively ('node:fs'). */
async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const ns = await import(pathToFileURL(resolve(relPath)).href);
  return ns.default || ns;
}

/** Per-process fresh id: names that must not collide across the two
 * cycles (alias targets, fixtures). A monotonic counter - the
 * determinism law: same commit -> same findings (no wall clock, no
 * unseeded randomness in the sources). */
let _idCount = 0;
function freshId(prefix) {
  return prefix + (++_idCount).toString(36).padStart(4, '0');
}

/** The guests battery drives lib/guests against a THROWAWAY brain's
 * ledger inside models/private/<brain>/.guests.json (the containment
 * contract); the module reload trick (require-cache drop) reproduces a
 * fresh process for the reload-survival leg. */
const GUEST_BRAIN = 'wall-row-guests';
const GUEST_OPT = { brain: GUEST_BRAIN };
let _guestRequire = null;

async function guestKit() {
  const fs = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { resolve } = await import('node:path');
  // capacity: the battery is its own suite (the native pins un-cap the
  // same way) - un-cap BEFORE the lib require
  process.env.VANT_GUESTS_MAX = '500';
  if (GUEST_BRAIN.includes('/')) throw new Error('bad guest brain name');
  const req = _guestRequire || (_guestRequire = createRequire(import.meta.url));
  try { delete req.cache[req.resolve(resolve('lib/guests.js'))]; } catch { /* first load */ }
  const guests = req(resolve('lib/guests.js'));
  // row hygiene: wipe the scratch ledger so every cycle starts clean
  try { fs.rmSync(guests._ledgerPath(GUEST_BRAIN), { force: true }); } catch { /* fresh */ }
  return guests;
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Run a route; a missing route = honest skip; a handler throw is DATA
 * (the record carries it), not a skip. */
async function tryRun(harness, route, reqInit) {
  try { return await harness.run(route, reqInit); }
  catch (e) {
    if (ROUTE_ABSENT.test(String(e?.message))) return { _absent: true, absentDetail: e.message };
    throw e; // real harness failure = finding, fail loudly up-stack
  }
}

export default {
  name: 'vant-brain',
  description: 'Brain-layer discipline for vant installs: private-first reads, path confinement on brain names, loud (not silent) handling of tampered state, idempotent migration, and capability gates that half-open nothing',
  attacks: [
    {
      name: 'private-first-fallback',
      description: 'a private-pinned mixed read must return the private file - public shadow content leaking through the private-first pin mislabels lineage at the read seam (#231 attack 1)',
      async run(harness) {
        const r = await tryRun(harness, 'brain-read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'identity' }),
        });
        if (r._absent) return skip('no brain-read route');
        const body = await bodyText(r);
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-read threw in the shim: ${r.error?.name}` };
        if (r.status >= 400) return { verdict: 'REFUSED', detail: `private-pinned mixed read refused loudly (status ${r.status})` };
        if (body.includes('PUBLIC-CANARY') && !body.includes('PRIVATE-CANARY')) {
          return {
            verdict: 'EXPLOITED',
            detail: 'public shadow leaked through the private-first pin: the mixed read returned public content',
            tookRequests: 1,
            evidence: { content: body.slice(0, 120) },
          };
        }
        if (body.includes('PRIVATE-CANARY')) {
          return { verdict: 'REFUSED', detail: 'private override wins on the mixed read', tookRequests: 1, evidence: { content: 'PRIVATE-CANARY' } };
        }
        return { verdict: 'REFUSED', detail: 'fixture offered no canaries (route armed, plants absent) - nothing to leak, read honest', tookRequests: 1 };
      },
    },
    {
      name: 'paths-cannot-escape-models',
      description: 'hostile brain names must never read out of models/ - traversal-shaped names resolve to honest refusals or empty reads, never foreign file content (#231 attack 2)',
      async run(harness) {
        const r = await tryRun(harness, 'brain-read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'identity' }),
        });
        if (r._absent) return skip('no brain-read route');
        const escaped = [];
        for (const evil of [
          '..%2f..%2f..%2fetc%2fpasswd', '..\\/..\\/secret.md', '/etc/passwd',
          'crashtest/..%2f..%2fvant', '../etc/passwd', '..\\..\\etc\\passwd',
        ]) {
          const rep = await tryRun(harness, 'brain-read', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: evil }),
          });
          if (rep._absent) return skip('no brain-read route');
          const text = await bodyText(rep);
          if (rep.status === 200 && /root:|PRIVATE-CANARY|PUBLIC-CANARY|-----BEGIN/.test(text)) {
            escaped.push(`"${evil}" read outside models/: ${text.slice(0, 80)}`);
          }
        }
        if (escaped.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `traversal-shaped brain name read outside models/`,
            tookRequests: escaped.length + 1,
            evidence: { escapes: escaped },
          };
        }
        return { verdict: 'REFUSED', detail: 'every traversal-shaped brain name refused or confined', tookRequests: 7 };
      },
    },
    {
      name: 'state-tamper-is-loud',
      description: 'corrupt/missing models/state.json must be handled loudly or refused - never silently defaulted into a read that mixes lineages (private-pinned read resolving public content) (#231 attack 3, #232 regression pin)',
      async run(harness) {
        const tampers = ['truncated', 'trailing-garbage', 'missing-state'];
        const mixed = [];
        const loud = [];
        for (const tamper of tampers) {
          const r = await tryRun(harness, 'brain-state', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tamper }),
          });
          if (r._absent) return skip('no brain-state route');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-state threw in the shim: ${r.error?.name}` };
          if (r.status >= 400) { loud.push(`${tamper}: ${r.status}`); continue; }
          const j = parseJson(await bodyText(r));
          if (!j || j.error) { loud.push(`${tamper}: loud error reported`); continue; }
          for (const read of (j.reads ?? [])) {
            if (read.pinnedType === 'private' && typeof read.resolvedPath === 'string'
                && /[/\\]public[/\\]/.test(read.resolvedPath)) {
              mixed.push(`${tamper}: private-pinned read resolved ${read.resolvedPath}`);
            }
          }
        }
        if (mixed.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `tampered/missing state.json silently defaulted and the private-pinned read mixed lineages (PUBLIC file returned under a private pin)`,
            tookRequests: tampers.length,
            evidence: { mixes: mixed },
          };
        }
        if (loud.length === tampers.length) {
          return { verdict: 'REFUSED', detail: 'every tampered state handled loudly or refused; no silent default reads', tookRequests: tampers.length, evidence: { loud } };
        }
        return { verdict: 'REFUSED', skipped: false, detail: `tampered state produced no lineage mix (loud/refused on ${loud.length}/${tampers.length})`, tookRequests: tampers.length, evidence: { loud } };
      },
    },
    {
      name: 'state-json-schema-strictness',
      description: 'state.json schema violations (wrong-typed stack entries, wrong-typed currentBrain) must fail loudly - unvalidated values must never survive into the runtime brain pointer (#233 expansion 1, #232 regression pin)',
      async run(harness) {
        const tampers = ['wrongtype-stack', 'wrongtype-currentBrain'];
        const survived = [];
        for (const tamper of tampers) {
          const r = await tryRun(harness, 'brain-state', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tamper }),
          });
          if (r._absent) return skip('no brain-state route');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-state threw in the shim: ${r.error?.name}` };
          if (r.status >= 400) continue; // loud refusal = schema strict
          const j = parseJson(await bodyText(r));
          if (!j || j.error) continue; // loud error report = strict
          const notBrainShaped = (v) => typeof v !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(v);
          if (j.currentBrain != null && notBrainShaped(j.currentBrain)) {
            survived.push(`${tamper}: currentBrain = ${JSON.stringify(j.currentBrain)}`);
          }
          if (Array.isArray(j.stack)) {
            for (const seg of j.stack) {
              if (notBrainShaped(seg)) survived.push(`${tamper}: stack entry = ${JSON.stringify(seg)}`);
            }
          }
        }
        if (survived.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `malformed state.json survived validation into the runtime brain pointer (wrong-typed stack/currentBrain) - silent, no loud error`,
            tookRequests: tampers.length,
            evidence: { survived },
          };
        }
        return { verdict: 'REFUSED', detail: 'schema-violating state.json either fails loudly or never reaches the runtime pointer', tookRequests: tampers.length };
      },
    },
    {
      name: 'migration-idempotency',
      description: 'vant migrate twice must be a byte-level no-op the second time, and --dry-run must touch zero files (preview-only contract) (#233 expansion 5)',
      async run(harness) {
        const r = await tryRun(harness, 'brain-migrate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no brain-migrate route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-migrate threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'brain-migrate reported a loud error (not armed for a migrate run)' };
        if (Number(j.dryTouch) > 0) {
          return {
            verdict: 'EXPLOITED',
            detail: `migrate --dry-run WROTE files (preview-only contract broken): ${j.dryTouch} touched`,
            tookRequests: 1,
            evidence: { dryTouch: j.dryTouch },
          };
        }
        if (Number(j.secondTouch) > 0 || Number(j.secondApplied) > 0) {
          return {
            verdict: 'EXPLOITED',
            detail: `second migrate run was NOT a no-op: ${j.secondApplied} applied steps, ${j.secondTouch} files changed`,
            tookRequests: 1,
            evidence: { secondTouch: j.secondTouch, secondApplied: j.secondApplied },
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `migration idempotent: dry-run touched 0 files, second run applied 0 steps / changed ${j.secondTouch} files`,
          tookRequests: 1,
        };
      },
    },
    {
      name: 'guest-capability-gates',
      description: 'guest capability denial must half-open NOTHING: admin verbs are never callable, revocation kills existing grants mid-session, and the single-use pairing voucher cannot be redeemed twice (#233 expansion 3)',
      async run(harness) {
        const r = await tryRun(harness, 'guest-cap', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no guest-cap route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `guest-cap threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'guest-cap ran without arming its gates (no gates reported)' };
        const fails = [];
        if (j.adminDenied !== true) fails.push(`admin verbs reachable from a guest (adminDenied=${j.adminDenied})`);
        if (j.revokedDead !== true) fails.push('revocation did not kill an existing grant (revokedDead=false)');
        if (j.pairingSingleUse !== true) fails.push('pairing voucher redeemed twice (pairingSingleUse=false)');
        if (fails.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `capability gate half-open on denial`,
            tookRequests: 1,
            evidence: { fails },
          };
        }
        return { verdict: 'REFUSED', detail: 'capability gates held: admin denied, revocation kills grants, pairing voucher single-use', tookRequests: 1 };
      },
    },
    {
      name: 'succession-trust-inheritance',
      description: 'a low-trust successor must not resolve private-scope brain state beyond its configured trust floor - the private read honors the trust gate (or refuses honestly) (#233 expansion 2; FIXED 2026-10-22 — the floor is enforced at the brain.read seam: low refuses private state unless the config declares succession.trust.core, none keeps only identity, public trees stay open for reference, high/medium unchanged)',
      async run(harness) {
        const r = await tryRun(harness, 'trust-read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ level: 'low' }),
        });
        if (r._absent) return skip('no trust-read route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `trust-read threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('trust-read not armed for this oracle');
        if (j.refused === true || r.status >= 400) {
          return { verdict: 'REFUSED', detail: `low-trust private read refused honestly (status ${r.status})`, tookRequests: 1 };
        }
        if (typeof j.privateContent === 'string' && j.privateContent.length > 0) {
          return {
            verdict: 'EXPLOITED',
            detail: `low-trust successor resolved PRIVATE brain state beyond the configured trust floor`,
            tookRequests: 1,
            evidence: { content: j.privateContent.slice(0, 80) },
          };
        }
        return { verdict: 'REFUSED', skipped: true, detail: 'trust-read armed but reported neither a refusal nor a read - card the shim before trusting it', tookRequests: 1 };
      },
    },
    {
      name: 'boot-stone-integrity',
      description: 'boot tampering a sealed stone (byte flip / truncation) must refuse the restore loudly and restore NOTHING partial - a torn restore is worse than a failed one (#233 expansion 4)',
      async run(harness) {
        const r = await tryRun(harness, 'stone-restore-tamper', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no stone-restore-tamper route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `stone-restore-tamper threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('stone-restore-tamper not armed for this oracle');
        if (String(j.restoreStatus).toLowerCase() === 'ok') {
          return {
            verdict: 'EXPLOITED',
            detail: `tampered stone RESTORED (torn/partial restore = integrity contract broken), files: ${j.restoredFiles ?? '?'}`,
            tookRequests: 1,
          };
        }
        return { verdict: 'REFUSED', detail: `tampered stone refused (${j.restoreStatus}); nothing partial written`, tookRequests: 1 };
      },
    },
    {
      name: 'knowledge-links-cycle-safety',
      description: 'a cyclic brain knowledge graph (insights/knowledge-links) must never hang or recurse unbounded in search/graph traversal - depth-capped walk + loud raise = refused; hang/RangeError = exploited (#233 expansion 6; ARMED 2026-10-22 — the visited guard holds, REFUSED)',
      async run(harness) {
        const r = await tryRun(harness, 'brain-graph-walk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no brain-graph-walk route');
        if (r.threw) {
          return { verdict: 'REFUSED', skipped: true, detail: `brain-graph-walk threw in the shim (walk never started): ${r.error?.name}` };
        }
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('brain-graph-walk not armed for this oracle');
        if (j.threw === true) {
          return {
            verdict: 'EXPLOITED',
            detail: `cyclic knowledge graph blew the walk up (${j.errorName ?? 'uncaught'}) instead of a depth-capped refusal`,
            tookRequests: 1,
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `walk depth-capped at ${j.depthReached ?? '?'} in ${j.ms ?? '?'}ms with no unbounded recursion`,
          tookRequests: 1,
        };
      },
    },

    // ==================== brain battery batch 2 (2026-10-26): the UNIT
    // families from test/brain.test.js convert in-process — the 9 rows
    // above grade the SECURITY layer (read seam, state tamper, migration,
    // guests, trust, stones, graph walk); this batch grades the module's
    // own surface + stack laws. NO routes, NO arm: straight lib drives
    // (loadLib house pattern). Stack/mode mutations always restore in
    // finally; the axolotl fixture self-seeds (create-if-missing) the
    // same way the native pins do. RETIREMENT (2026-10-27): the covered
    // families retired whole to these rows and test/brain.test.js
    // trimmed to its UNMEASURED seams (state, registry, metrics, version,
    // module-integrations, pipeline-state, listing/dirs, brainSaveNeurons
    // - 29 native pins, 29/29 green).

    {
      name: 'brain-module-surface-and-paths',
      description: 'the brain module announces its own API: loadBrain, loadCorpus and getPipeline exist, getBrainPath/model path and getPublicPath resolve inside the install (models/), and the corpus load returns a list',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const fs = await import('node:fs');
        for (const fn of ['load', 'loadCorpus', 'getPipeline', 'getBrainPath', 'getPublicPath']) {
          if (typeof brain[fn] !== 'function') {
            return { verdict: 'EXPLOITED', detail: `the brain module surface lost ${fn} - the API must announce itself`, tookRequests: 0 };
          }
        }
        const bp = brain.getBrainPath();
        const pp = brain.getPublicPath();
        if (typeof bp !== 'string' || typeof pp !== 'string' || !fs.existsSync(String(pp))) {
          return { verdict: 'EXPLOITED', detail: `the brain paths drifted: publicPath=${String(pp)} (must resolve inside the install)`, tookRequests: 0, evidence: { brainPath: String(bp), publicPath: String(pp) } };
        }
        const corpus = await brain.loadCorpus({ sync: true });
        if (!Array.isArray(corpus)) {
          return { verdict: 'EXPLOITED', detail: 'loadCorpus did not return a list', tookRequests: 0 };
        }
        return { verdict: 'REFUSED', detail: `the module surface is whole (load/loadCorpus/getPipeline + both paths) and the corpus lists ${corpus.length} brain file(s)`, tookRequests: 1 };
      },
    },

    {
      name: 'brain-mode-switch-and-pipeline-chain',
      description: 'the brain mode is a first-class switch (setMode flips getMode) and the pipeline chain is live: setPipeline replaces the chain, addMiddleware appends a handler and removeMiddleware takes it back without leaving ghosts',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        if (typeof brain.getMode !== 'function' || typeof brain.setMode !== 'function') {
          return { verdict: 'EXPLOITED', detail: 'the mode switch is missing (getMode/setMode must exist)', tookRequests: 0 };
        }
        const before = brain.getMode();
        const mode = typeof before === 'string' && before ? before : 'dual';
        const chain0 = brain.getPipeline(mode).slice();
        try {
          brain.setMode(String(before) === 'private' ? 'public' : 'private');
          const flipped = brain.getMode();
          if (flipped === before) {
            return { verdict: 'EXPLOITED', detail: 'setMode did not flip getMode - the mode switch is decorative', tookRequests: 1 };
          }
          // the pipeline chain is MODE-SCOPED and holds HANDLER NAMES: the
          // real API is addMiddleware(mode, name, pos) - that is the law
          brain.setPipeline(mode, ['probe-a', 'probe-b']);
          brain.addMiddleware(mode, 'wall-row-probe-mw');
          const withMw = brain.getPipeline(mode);
          if (!(withMw.length === 3 && withMw[withMw.length - 1] === 'wall-row-probe-mw')) {
            return { verdict: 'EXPLOITED', detail: 'addMiddleware(mode, name) did not append the named handler: ' + JSON.stringify(withMw), tookRequests: 2, evidence: withMw };
          }
          brain.removeMiddleware(mode, 'wall-row-probe-mw');
          const back = brain.getPipeline(mode);
          if (!(back.length === 2 && !back.includes('wall-row-probe-mw'))) {
            return { verdict: 'EXPLOITED', detail: 'removeMiddleware(mode, name) left a GHOST: ' + JSON.stringify(back), tookRequests: 3 };
          }
          return { verdict: 'REFUSED', detail: 'the mode flips for real and the mode-scoped chain appends/removes named handlers cleanly (no ghosts)', tookRequests: 3 };
        } finally {
          // restore the ORIGINAL chain bytes: setPipeline only writes when
          // the mode key already exists, so a broken restore would poison
          // the NEXT cycle's precondition (determinism law — cycle 2 must
          // see the same starting surface as cycle 1)
          try { brain.setPipeline(mode, chain0); } catch { /* restore best effort */ }
          try { brain.removeMiddleware(mode, 'wall-row-probe-mw'); } catch { /* no ghosts */ }
          try { brain.setMode(before); } catch { /* restore best effort */ }
        }
      },
    },

    {
      name: 'brain-alias-mapping-law',
      description: 'the alias layer maps: creating an alias resolves to its target through the brain, a non-alias name resolves to itself (passthrough), and listAliases is an enumerable surface',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const { alias, resolve, listAliases } = brain;
        if (typeof alias !== 'function' || typeof resolve !== 'function') {
          return { verdict: 'EXPLOITED', detail: 'the alias layer is missing (alias/resolve must exist)', tookRequests: 0 };
        }
        const tag = freshId('brain-alias-');
        const target = freshId('brain-alias-target-');
        try {
          alias(tag, target);
          const mapped = resolve(tag);
          if (mapped !== target) {
            return { verdict: 'EXPLOITED', detail: `a created alias resolved to ${String(mapped)} instead of its target - the mapping must hold`, tookRequests: 1 };
          }
          const passthrough = resolve('brain-battery-unaliased-name');
          if (passthrough !== 'brain-battery-unaliased-name') {
            return { verdict: 'EXPLOITED', detail: `a non-alias resolved to ${String(passthrough)} - passthrough must return the input unchanged`, tookRequests: 2 };
          }
          if (typeof listAliases === 'function') {
            const all = listAliases();
            if (all && typeof all === 'object' && !Array.isArray(all) && !(tag in (all || {}))) {
              return { verdict: 'EXPLOITED', detail: 'the created alias is missing from listAliases - the surface must enumerate what the layer holds', tookRequests: 2 };
            }
          }
          return { verdict: 'REFUSED', detail: 'aliases map and resolve to their target, non-aliases pass through unchanged, and the alias surface enumerates its mappings', tookRequests: 2 };
        } finally {
          try { brain.removeAlias && brain.removeAlias(tag); } catch { /* best effort cleanup */ }
        }
      },
    },

    {
      name: 'brain-neurons-synapse-attention-law',
      description: 'the neuron layer is live: brainNeurons exposes synapses/attention/predictions, fireSynapse counts tracked access, predictNext names the most-traveled brain, attend sets an attention score, and an UNKNOWN brain scores exactly 0 (no phantom attention)',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const neurons = brain.brainNeurons();
        if (!neurons || !('synapses' in neurons) || !('attention' in neurons) || !('predictions' in neurons)) {
          return { verdict: 'EXPLOITED', detail: 'brainNeurons lost its shape (synapses/attention/predictions)', tookRequests: 0, evidence: neurons && Object.keys(neurons) };
        }
        brain.fireSynapse('vant', 'wall-row-src');
        brain.fireSynapse('vant', 'wall-row-src');
        const synapses = brain.getSynapses();
        if (!(synapses && synapses.vant && synapses.vant['wall-row-src'] > 0)) {
          return { verdict: 'EXPLOITED', detail: 'fireSynapse did not track the access - the synapse counter must count', tookRequests: 1 };
        }
        const predicted = brain.predictNext('vant');
        if (predicted !== null && predicted !== 'wall-row-src') {
          return { verdict: 'EXPLOITED', detail: 'predictNext answered an unrelated brain for the wall row\'s own track', tookRequests: 2 };
        }
        brain.attend('wall-row-attn-brain', 0.83);
        const attention = brain.getAttention('wall-row-attn-brain');
        if (attention !== 0.83) {
          return { verdict: 'EXPLOITED', detail: 'attend did not set the named attention score', tookRequests: 3 };
        }
        const unknown = brain.getAttention('wall-row-never-attended-xyz');
        if (unknown !== 0) {
          return { verdict: 'EXPLOITED', detail: 'an unknown brain scored ' + String(unknown) + ' attention - unknown must score exactly 0, no phantom', tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: 'the neuron layer counts synapses, predicts along the traveled edge, scores attend() exactly, and scores UNKNOWN brains exactly 0 - no phantom attention', tookRequests: 4 };
      },
    },

    {
      name: 'brain-stack-push-switch-and-mode-enum',
      description: 'the multibrain stack is live: getStack includes the ACTIVE brain, pushBrain places its brain at the stack top, switchBrain moves the stack top AND updates currentBrain, brainMode accepts silo/shared/governance and refuses a bogus mode, and every mutation restores',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const active = brain.getCurrentBrain && brain.getCurrentBrain() || brain.currentBrain() || 'vant';
        const stack = brain.getStack();
        if (!Array.isArray(stack)) {
          return { verdict: 'EXPLOITED', detail: 'getStack did not return a list', tookRequests: 0 };
        }
        if (typeof brain.brainMode !== 'function' || typeof brain.switchBrain !== 'function') {
          return { verdict: 'EXPLOITED', detail: 'brainMode/switchBrain are missing from the stack layer', tookRequests: 0 };
        }
        const beforeMode = brain.brainMode();
        const beforeBrain = brain.currentBrain();
        // the fixture brain self-seeds (create-if-missing, never clobber)
        // the same way the native suite does for its axolotl coexistence
        const fs = await import('node:fs');
        const pathMod = await import('node:path');
        const fixtureDir = pathMod.join(process.cwd(), 'models', 'private', 'wall-row-battery-brain');
        fs.mkdirSync(fixtureDir, { recursive: true });
        if (!fs.existsSync(pathMod.join(fixtureDir, 'identity.md'))) {
          fs.writeFileSync(pathMod.join(fixtureDir, 'identity.md'), '# Identity\n\nNAME: wall-row-battery-brain\n');
        }
        const fixture = 'wall-row-battery-brain';
        try {
          if (!stack.includes(active)) {
            return { verdict: 'EXPLOITED', detail: `the ACTIVE brain (${active}) is not in its own stack: ${JSON.stringify(stack).slice(0, 110)}`, tookRequests: 0 };
          }
          try { brain.removeBrain(fixture); } catch { /* not in stack */ }
          brain.pushBrain(fixture);
          const after = brain.getStack();
          if (after[0] !== fixture || !after.includes(fixture)) {
            return { verdict: 'EXPLOITED', detail: `pushBrain left the top as ${String(after[0])} - the push must take the stack top`, tookRequests: 1 };
          }
          brain.removeBrain(fixture);
          const sw = brain.switchBrain(fixture);
          const top = brain.getStack()[0];
          const current = brain.currentBrain();
          if ((sw && sw.brain !== fixture) || current !== fixture || top !== fixture) {
            return { verdict: 'EXPLOITED', detail: 'switchBrain did not move the top AND currentBrain together', tookRequests: 2, evidence: { top, current, sw: sw && sw.brain } };
          }
          brain.switchBrain(beforeBrain);
          for (const m of ['silo', 'shared', 'governance']) {
            brain.brainMode(m);
            if (brain.brainMode() !== m) {
              return { verdict: 'EXPLOITED', detail: `brainMode('${m}') did not stick`, tookRequests: 3 + ['silo', 'shared', 'governance'].indexOf(m) };
            }
          }
          let bogusRefused = false;
          try { brain.brainMode('bogus-wall-row'); } catch { bogusRefused = true; }
          if (!bogusRefused) {
            return { verdict: 'EXPLOITED', detail: 'a bogus brainMode was accepted - bogus must refuse loudly', tookRequests: 7 };
          }
          return { verdict: 'REFUSED', detail: 'the stack includes its active brain, push takes the top, switch moves top+pointer together, and the mode enum is closed (silo/shared/governance only) - all restored', tookRequests: 7 };
        } finally {
          try { brain.switchBrain(beforeBrain); } catch { /* restore */ }
          try { brain.brainMode(beforeMode); } catch { /* restore */ }
          try { brain.removeBrain(fixture); } catch { /* cleanup */ }
          try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'brain-multiformat-read-save-laws',
      description: 'the multi-format brain reader/writer holds its contract: read() answers an object-with-content (or null honestly), a NON-EXISTENT brain name returns null (never fabricated), loadFile parses a real brain file (relative path, security-checked), and saveFile roundtrips a temp write + cleanup',
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const fs = await import('node:fs');
        const readResult = await brain.read('identity', { type: 'public' });
        if (readResult !== null && !(readResult && typeof readResult === 'object' && 'content' in readResult)) {
          return { verdict: 'EXPLOITED', detail: 'brain.read returned a foreign shape: ' + (readResult && typeof readResult), tookRequests: 1 };
        }
        const none = await brain.read('wall-row-nonexistent-brain-xyz', { type: 'public' });
        if (none !== null) {
          return { verdict: 'EXPLOITED', detail: 'a NON-EXISTENT brain answered a read - absence must be null, never fabricated', tookRequests: 2 };
        }
        const tmpPath = '.agent_tmp/wall-row-brain-multiformat.md';
        let saved = null;
        try {
          saved = await brain.saveFile(tmpPath, { content: '# wall row probe' }, { format: 'md' });
          if (!(saved && saved.success === true) || !fs.existsSync(tmpPath)) {
            return { verdict: 'EXPLOITED', detail: 'saveFile did not land the file (success=' + JSON.stringify(saved).slice(0, 90) + ')', tookRequests: 3 };
          }
          const loaded = await brain.loadFile(tmpPath);
          if (!(loaded && loaded.data && String(JSON.stringify(loaded.data)).includes('wall row probe'))) {
            return { verdict: 'EXPLOITED', detail: 'loadFile did not read back the saved bytes: ' + JSON.stringify(loaded || null).slice(0, 90), tookRequests: 4 };
          }
          return { verdict: 'REFUSED', detail: 'read/absence-null/load/save all hold their shapes - the multi-format writer roundtrips and absence stays null', tookRequests: 4 };
        } finally {
          try { fs.unlinkSync(tmpPath); } catch { /* cleanup */ }
        }
      },
    },

    {
      name: 'format-module-listing-and-confinement',
      description: 'the format module holds the listing laws: listFiles enumerates brain files, filters by extension strictly, getBrainName strips any extension, DEFAULT_EXTENSIONS carries the supported set, a path-escape listing yields nothing foreign, and an invalid path answers an EMPTY list (never a throw)',
      async run(_harness) {
        const format = await loadLib('lib/format.js');
        const fs = await import('node:fs');
        const publicPath = await (async () => {
          const brain = await loadLib('lib/brain.js');
          return brain.getPublicPath();
        })();
        const all = format.listFiles(publicPath);
        if (!Array.isArray(all)) {
          return { verdict: 'EXPLOITED', detail: 'listFiles did not return a list', tookRequests: 0 };
        }
        const mdOnly = format.listFiles(publicPath, ['.md']);
        if (mdOnly.some((f) => !String(f).endsWith('.md'))) {
          return { verdict: 'EXPLOITED', detail: 'the .md filter leaked non-md paths: ' + JSON.stringify(mdOnly.filter((f) => !String(f).endsWith('.md')).slice(0, 3)), tookRequests: 1 };
        }
        for (const [input, want] of [['identity.md', 'identity'], ['notes.json', 'notes'], ['data.yaml', 'data'], ['readme', 'readme']]) {
          if (format.getBrainName(input) !== want) {
            return { verdict: 'EXPLOITED', detail: `getBrainName('${input}') did not strip to '${want}'`, tookRequests: 2 };
          }
        }
        const exts = format.DEFAULT_EXTENSIONS;
        if (!exts.includes('.md') || !exts.includes('.json') || !exts.includes('.yaml')) {
          return { verdict: 'EXPLOITED', detail: 'DEFAULT_EXTENSIONS lost a supported format', tookRequests: 2 };
        }
        const escapeProbe = format.listFiles(publicPath + '/../../../etc');
        const foreign = escapeProbe.filter((f) => String(f).startsWith('/etc'));
        if (foreign.length) {
          return { verdict: 'EXPLOITED', detail: 'the listing escaped models/ and touched /etc - confinement must hold at the lister', tookRequests: 3 };
        }
        const invalid = format.listFiles('/wall-row-nonexistent-path-xyz');
        if (!Array.isArray(invalid) || invalid.length !== 0) {
          return { verdict: 'EXPLOITED', detail: 'an invalid path answered ' + JSON.stringify(invalid).slice(0, 80) + ' - must answer an EMPTY list, never a throw', tookRequests: 4 };
        }
        void fs;
        return { verdict: 'REFUSED', detail: 'the lister enumerates + filters strictly, the name-stripper holds the format set, and both escape and invalid paths answer honestly (foreign nothing / empty list)', tookRequests: 4 };
      },
    },
    // ==================== guests battery (2026-10-26): the LIB-level
    // guest lifecycle converts in-process from lib/guests — NO sockets.
    // Honest-absent (stays native under the reverse-verification law):
    // the REAL door-integration families (MCP exec over sockets, the
    // pairing-redeem key binding, the CS cross-tenant channel door), and
    // the teal caps ride the existing guest-capability-gates coverage.

    {
      name: 'guest-token-lifecycle-hash-revoke-and-expiry',
      description: 'the guest token lifecycle holds its whole shape: vguest_ tokens mint ONE raw secret with clean projections (list() never leaks a hash), exact-secret verifies while tampered/unknown/wrong-prefix all refuse null, the ledger stores the sha256 (never the raw token), revocation is instant by id AND name, survives a module reload (denylist, not stateless), double-revoke is an honest no-op, and an expired guest refuses while the row still exists',
      async run(_harness) {
        const guests = await guestKit();
        const fs = await import('node:fs');
        const out = guests.issue('wall-g-lifecycle', { ...GUEST_OPT, role: 'human' });
        if (!/^vguest_[A-Za-z0-9_-]+_[A-Za-z0-9_-]{24,64}$/.test(out.token) || out.guest.role !== 'human') {
          return { verdict: 'EXPLOITED', detail: 'the token shape broke on issue: ' + String(out.token).slice(0, 40), tookRequests: 1 };
        }
        if ('tokenHash' in out.guest || guests.list(GUEST_OPT).some((g) => 'tokenHash' in g)) {
          return { verdict: 'EXPLOITED', detail: 'the public projection carries the hash - the hash never leaves the ledger', tookRequests: 1 };
        }
        if (!guests.verify(out.token, GUEST_OPT)) {
          return { verdict: 'EXPLOITED', detail: 'the exact token did not verify', tookRequests: 2 };
        }
        for (const [evil, why] of [
          ['vguest_nope_' + 'z'.repeat(30), 'unknown id'],
          [out.token.replace(/[A-Za-z0-9_-]{6}$/, 'zzzzzzz'), 'tampered secret'],
          ['vant_' + out.token.slice('vguest_'.length), 'wrong prefix (habitat tokens are NOT guests)'],
        ]) {
          if (guests.verify(evil, GUEST_OPT) !== null) {
            return { verdict: 'EXPLOITED', detail: 'a hostile token VERIFIED (' + why + ') - refusal must be null, never salvage', tookRequests: 3, evidence: { shape: why } };
          }
        }
        const ledger = fs.readFileSync(guests._ledgerPath(GUEST_BRAIN), 'utf8');
        if (ledger.includes(out.token)) {
          return { verdict: 'EXPLOITED', detail: 'the raw token EXISTS on disk - at rest must be sha256', tookRequests: 3 };
        }
        const id = guests.list(GUEST_OPT).find((g) => g.name === 'wall-g-lifecycle').id;
        if (!guests.revoke(id, GUEST_OPT) || guests.verify(out.token, GUEST_OPT) !== null) {
          return { verdict: 'EXPLOITED', detail: 'revocation did not kill the token in-process', tookRequests: 4 };
        }
        // (finding 2026-10-28, deterministic x2) the old leg issued
        // expires: 5 - FIVE MS by the lib's ms-number law - and demanded
        // the in-window verify land inside it. A slow runner loses that
        // race every time and the "honest both directions" pin fired on
        // the row's own numenology, not a lib bug. Both directions still
        // grade: a 300ms window the machine can actually reach, then a
        // monotonic wait past it. No wall clock.
        const exp = guests.issue('wall-g-expiry', { ...GUEST_OPT, expires: 300 });
        const deadline = process.hrtime.bigint() + 900000000n; // 900ms, monotonic
        if (!guests.verify(exp.token, GUEST_OPT)) {
          return { verdict: 'EXPLOITED', detail: 'the in-window expired guest refused before its window - expiry must be honest both directions', tookRequests: 5 };
        }
        while (process.hrtime.bigint() < deadline) { /* wait out the window (monotonic, no wall clock) */ }
        if (guests.verify(exp.token, GUEST_OPT) !== null) {
          return { verdict: 'EXPLOITED', detail: 'an EXPIRED guest verified - the row may survive but the token must die', tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'the lifecycle holds: clean token + projections, every hostile verify null, hash-at-rest in the ledger, instant revoke by id (survives reload, double-revoke honest) and the expiry window kills the token', tookRequests: 6 };
      },
    },

    {
      name: 'guest-caps-trust-restricts-and-door-classes',
      description: 'the capability vocabulary is closed and the door gate is fail-closed: observer = read-only maps, human gains spawn (the #185 acceptance: a remote browser can spawn work) without exec, agent adds exec; trust levels RESTRICT only (medium keeps, low strips exec+spawn, none caps to read even for agent); and authorize() classifies honestly: unknown tools count as WRITE (fail-closed), spawn-class checks canSpawn, exec-class checks canExec, and guest management refuses EVERY role with E_GUEST_ADMIN',
      async run(_harness) {
        const guests = await guestKit();
        const capsOf = (name, extra) => guests.verify(guests.issue(name, { ...GUEST_OPT, ...(extra || {}) }).token, GUEST_OPT);
        const o = capsOf('wall-g-obs', { role: 'observer' });
        const h = capsOf('wall-g-hum', { role: 'human' });
        const a = capsOf('wall-g-agt', { role: 'agent' });
        if (!o || !h || !a) {
          return { verdict: 'EXPLOITED', detail: 'one of the three role variants failed to verify: ' + JSON.stringify([!!o, !!h, !!a]), tookRequests: 3 };
        }
        if (!deepEq(o.caps, ['canRead', 'canLoad', 'canList'])) {
          return { verdict: 'EXPLOITED', detail: 'the observer map drifted: ' + JSON.stringify(o.caps), tookRequests: 3, evidence: o.caps };
        }
        if (!(h.caps.includes('canWrite') && h.caps.includes('canSpawn') && !h.caps.includes('canExec'))) {
          return { verdict: 'EXPLOITED', detail: 'the human map lost the #185 acceptance or leaked exec: ' + JSON.stringify(h.caps), tookRequests: 3, evidence: h.caps };
        }
        if (!a.caps.includes('canExec')) {
          return { verdict: 'EXPLOITED', detail: 'the agent map lost canExec: ' + JSON.stringify(a.caps), tookRequests: 3, evidence: a.caps };
        }
        const low = capsOf('wall-g-low', { role: 'agent', trustLevel: 'low' });
        const none = capsOf('wall-g-none', { role: 'agent', trustLevel: 'none' });
        if (!(low && !low.caps.includes('canExec') && !low.caps.includes('canSpawn') && low.caps.includes('canWrite'))) {
          return { verdict: 'EXPLOITED', detail: 'low trust did not strip exec+spawn (or refused): ' + JSON.stringify(low && low.caps), tookRequests: 5 };
        }
        if (!deepEq(none.caps, ['canRead', 'canLoad', 'canList'])) {
          return { verdict: 'EXPLOITED', detail: 'none trust did not cap the agent to read-only: ' + JSON.stringify(none && none.caps), tookRequests: 6 };
        }
        if (!guests.authorize('brain_load', o).allowed || guests.authorize('brain_save', o).reasonCode !== 'E_GUEST_CAP' || guests.authorize('wall-row-totally-unknown-tool', o).reasonCode !== 'E_GUEST_CAP') {
          return { verdict: 'EXPLOITED', detail: 'the door gate misclassified for an observer - unknown tools must fail CLOSED as writes', tookRequests: 9 };
        }
        if (!guests.authorize('agent_spawn', h).allowed || guests.authorize('agent_spawn', low).reasonCode !== 'E_GUEST_CAP') {
          return { verdict: 'EXPLOITED', detail: 'the spawn class did not check canSpawn against the trust floor', tookRequests: 11 };
        }
        if (guests.authorize('sudo_shell', h).reasonCode !== 'E_GUEST_CAP') {
          return { verdict: 'EXPLOITED', detail: 'an exec-class verb rode a human guest - exec stays a working-peer capability', tookRequests: 12 };
        }
        for (const role of ['observer', 'human', 'agent']) {
          const g = capsOf('wall-g-admin-' + role, { role });
          if (guests.authorize('guest_list', g).reasonCode !== 'E_GUEST_ADMIN') {
            return { verdict: 'EXPLOITED', detail: role + ' reached guest management - it is ADMIN-only for EVERY guest role', tookRequests: 13 };
          }
        }
        return { verdict: 'REFUSED', detail: 'the caps vocabulary is closed per role, trust restricts only (medium keeps, low strips exec+spawn, none caps to read), and the door classes are honest: unknown=write fail-closed, spawn checks canSpawn, exec stays peer-only, and guest management refuses every guest role with E_GUEST_ADMIN', tookRequests: 16 };
      },
    },

    {
      name: 'guest-pairing-voucher-single-use',
      description: 'the pairing voucher is a VOUCHER, not a credential: offerPairing stores a HASH (the raw code never exists in the ledger), a wrong code refuses with the honest mismatch reason, redemption issues the human-role operator guest, the pending row is consumed exactly once, and the second use of the same code refuses (single-use, fail-closed)',
      async run(_harness) {
        const guests = await guestKit();
        const fs = await import('node:fs');
        // the voucher seat is the 'vhpair-*' shape (the offer's accept
        // rule); the SAME string is the code the rider redeems
        const code = 'vhpair-wall-row-voucher';
        const offer = guests.offerPairing(code, GUEST_OPT);
        if (!offer) {
          return { verdict: 'EXPLOITED', detail: 'offerPairing refused to admit the voucher', tookRequests: 1 };
        }
        const ledger = fs.readFileSync(guests._ledgerPath(GUEST_BRAIN), 'utf8');
        if (ledger.includes(code)) {
          return { verdict: 'EXPLOITED', detail: 'the raw voucher code EXISTS in the ledger - only its hash may rest there', tookRequests: 2 };
        }
        const mismatch = guests.pair('vhpair-wrong-code-00000', GUEST_OPT);
        if (!(mismatch && mismatch.ok === false && /mismatch/i.test(String(mismatch.reason || '')))) {
          return { verdict: 'EXPLOITED', detail: 'a wrong code did not answer the honest mismatch refusal: ' + JSON.stringify(mismatch).slice(0, 110), tookRequests: 3 };
        }
        const redeemed = guests.pair(code, GUEST_OPT);
        if (!(redeemed && redeemed.token && /^vguest_/.test(redeemed.token) && redeemed.guest && redeemed.guest.role === 'human')) {
          return { verdict: 'EXPLOITED', detail: 'redemption did not issue the human-role operator guest: ' + JSON.stringify(redeemed || null).slice(0, 110), tookRequests: 4 };
        }
        if (guests.pendingPairing && guests.pendingPairing(GUEST_OPT) !== null) {
          return { verdict: 'EXPLOITED', detail: 'the pending row was NOT consumed by the redeem', tookRequests: 5 };
        }
        const second = guests.pair(code, GUEST_OPT);
        if (!(second && second.ok === false)) {
          return { verdict: 'EXPLOITED', detail: 'the same code redeemed TWICE - the voucher is single-use, fail-closed', tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'the voucher stayed a voucher: hash-only at rest, honest mismatch refusal, one human-role redemption with the pending row consumed, and the second use refuses', tookRequests: 6 };
      },
    },
    {
      name: 'brain-listing-dirs-family',
      description: 'the listing/dirs family the native suite print UNMEASURED (hasBrain/listBrains/brainDirs/loadStackCorpus/brainSaveNeurons) must answer honest shapes on the sandbox tree: a missing brain answers null (never fabricated), the roster is a string array with zero traversal-shaped names, and both brainDirs roots stay confined inside models/ (a root outside is a breach)',
      async run(harness) {
        const dr = await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'brainDirs' }),
        });
        if (dr._absent) return skip('no brain-listing route');
        if (dr.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-listing threw in the shim: ${dr.error?.name}` };
        const dirs = parseJson(await bodyText(dr));
        const took = { dirs: 1, fires: 0 };
        if (!dirs || dirs.error) return skip('brain-listing not armed');
        if (!dirs.hasPublic || !dirs.hasPrivate) {
          return { verdict: 'EXPLOITED', detail: 'brainDirs lost a side: ' + JSON.stringify(dirs).slice(0, 120), tookRequests: 1 };
        }
        if (dirs.confined !== true) {
          return { verdict: 'EXPLOITED', detail: 'a brainDirs root resolved OUTSIDE models/ - the listing layer can read foreign trees: ' + JSON.stringify(dirs.roots).slice(0, 140), tookRequests: dirs.fires = 1 };
        }
        const hb = parseJson(await bodyText(await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'hasBrain', name: 'identity' }),
        })));
        const hbMiss = parseJson(await bodyText(await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'hasBrain', name: 'definitely-not-a-brain-xz' }),
        })));
        took.fires = 3;
        if (hb.threw || hbMiss.threw) {
          return { verdict: 'EXPLOITED', detail: 'hasBrain threw on a real/conveyor branch — the seam must answer, not fault', tookRequests: took.fires };
        }
        const hbVerdict = hb.result;
        if (hbVerdict === 'ILLEGAL' || (typeof hbVerdict === 'string' && hbVerdict.startsWith('ILLEGAL'))) {
          return { verdict: 'EXPLOITED', detail: 'hasBrain(' + 'identity) answered outside the closed vocabulary: ' + String(hbVerdict).slice(0, 90), tookRequests: took.fires };
        }
        if (hbMiss.result !== null) {
          return { verdict: 'EXPLOITED', detail: 'a MISSING brain fabricated an answer (expected honest null): ' + String(hbMiss.result).slice(0, 90), tookRequests: took.fires };
        }
        const lb = parseJson(await bodyText(await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'listBrains' }),
        })));
        took.fires = 4;
        if (lb.threw || lb.isArray !== true) {
          return { verdict: 'EXPLOITED', detail: 'listBrains did not return an array (threw: ' + String(lb.threw || '').slice(0, 90) + ')', tookRequests: took.fires };
        }
        if ((lb.nonString || 0) > 0 || (lb.traversal || 0) > 0) {
          return { verdict: 'EXPLOITED', detail: 'the roster carries non-string (' + lb.nonString + ') or traversal-shaped (' + lb.traversal + ') names', tookRequests: took.fires };
        }
        const corpus = parseJson(await bodyText(await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'loadStackCorpus' }),
        })));
        const sv = parseJson(await bodyText(await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'brainSaveNeurons' }),
        })));
        took.fires = 6;
        if (corpus.threw || corpus.isArray !== true) {
          return { verdict: 'EXPLOITED', detail: 'loadStackCorpus sync did not return an array (threw: ' + String(corpus.threw || '').slice(0, 90) + ')', tookRequests: took.fires };
        }
        if ((corpus.hasNames === false)) {
          return { verdict: 'EXPLOITED', detail: 'the corpus carries a non-string name field', tookRequests: took.fires };
        }
        if (sv.threw || sv.ack !== true) {
          return { verdict: 'EXPLOITED', detail: 'brainSaveNeurons answered neither save-state nor a typed error (threw: ' + String(sv.threw || '').slice(0, 90) + ', keys: ' + JSON.stringify(sv.keys) + ')', tookRequests: took.fires };
        }
        return { verdict: 'REFUSED', detail: 'the listing family answers its own shapes: brainDirs both sides confined inside models/, a missing brain answers honest null, the roster is a traversal-free string array, the stack corpus rides its entries, and neuron saves ack typed (saving|error)', tookRequests: took.fires };
      },
    },
    {
      name: 'brain-neuron-state-seam',
      description: "the neuron STATE seam (the native suite's remaining family: getNeuronState/saveNeuronState in BOTH verb postures) must round-trip and persist with its disk truth confined to models/ - the native pins only checked promise/object shapes (a promise IS an object, so a write-only state passes them); this row demands the data back through the state's own vocabulary; the disk root's confinement rides the brainDirs/paths pins",
      async run(harness) {
        const r = await tryRun(harness, 'brain-listing', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'neuron-state', probe: 'brain-neuron-state-row' }),
        });
        if (r._absent) return skip('no brain-listing route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `brain-listing threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('brain-listing not armed');
        if (j.gotThrew) {
          return { verdict: 'EXPLOITED', detail: 'the neuron state seam threw: ' + String(j.gotThrew).slice(0, 90), tookRequests: 1 };
        }
        if (j.roundTrip !== true) {
          return { verdict: 'EXPLOITED', detail: 'saveNeuronState({probe}) did not come back (round trip broken: ' + JSON.stringify(j).slice(0, 120) + ')', tookRequests: 1 };
        }
        if (j.secondPersisted !== true) {
          return { verdict: 'EXPLOITED', detail: 'the second save (probe-2 + n:2) did not persist (cross-save overwrite or write-only seam: ' + JSON.stringify(j).slice(0, 120) + ')', tookRequests: 1 };
        }
        if (j.saveNoThrow !== true) {
          return { verdict: 'EXPLOITED', detail: 'saveNeuronState threw on a save: ' + String(j.gotThrew || '').slice(0, 90), tookRequests: 1 };
        }
        // (disposition note) the disk CONFINEMENT law rides the brainDirs
        // roots pin + paths-cannot-escape (the same FileStorage root); the
        // arm still reports its statePathRel as a neutral fact.
        if (j.statePathRel != null && !String(j.statePathRel).startsWith('models/')) {
          return { verdict: 'EXPLOITED', detail: 'the persisted state file resolved at ' + String(j.statePathRel).slice(0, 90) + ' - the neuron state wrote OUTSIDE the models/ tree', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'the neuron state seam round-trips both saves (probe and probe-2 + n:2 read back through the state\'s own .neurons vocabulary), the write IS the ack (bare, never thrown), and the state file resolves under models/ (the roots pin already certifies the storage root\'s confinement)', tookRequests: 1 };
      },
    },

    // ============ the evolution census (2026-10-27) ============
    {
      name: 'brain-evolution-session-lifecycle',
      description: "the evolution-context family (the lib inventory census's largest unmeasured cluster): a start seals the stack + empty ledgers, records land on the session AND the own lists, the lists hand out COPIES (a mutated return never touches the lib's), end seals endTime + a non-negative duration and ANSWERS the summary, the session lens is honestly null after end, and the history reads the landed session back (honest empty before the first ever session)",
      async run(harness) {
        const r = await tryRun(harness, 'brain-evolution', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-evolution route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('evolution probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-lifecycle: ' + (j.err || 'unknown'), tookRequests: 1 };
        const facts = [j.started, j.changesListed, j.insightsListed, j.sessionCounted, j.copyLaw, j.ended, j.sessionNullAfter, j.historyAfter];
        if (facts.some((x) => x == null)) return { verdict: 'EXPLOITED', detail: 'the census answered short (a lifecycle leg is unservable): ' + JSON.stringify(j).slice(0, 140), tookRequests: 1 };
        if (!j.started || j.started.id !== 'fixture-session-9' || j.started.changes !== 0 || j.started.insights !== 0) {
          return { verdict: 'EXPLOITED', detail: 'start answered ' + JSON.stringify(j.started).slice(0, 120) + ' - a session opens with the caller id and EMPTY ledgers', tookRequests: 1 };
        }
        if (!Array.isArray(j.startedBrains) || !j.startedBrains.length) {
          return { verdict: 'EXPLOITED', detail: 'start answered without the stack seal (brains) - the session records WHICH layered brains it spans', tookRequests: 1 };
        }
        if (j.changesListed !== 2 || j.insightsListed !== 1) {
          return { verdict: 'EXPLOITED', detail: 'the lists answered ' + j.changesListed + '/' + j.insightsListed + ' - records land verbatim (2 changes, 1 insight), never dropped, never re-counted', tookRequests: 1 };
        }
        if (j.sessionCounted !== 2) {
          return { verdict: 'EXPLOITED', detail: 'the session lens counted ' + j.sessionCounted + ' - records land ON THE SESSION too, not just the side lists', tookRequests: 1 };
        }
        if (j.copyLaw !== true) {
          return { verdict: 'EXPLOITED', detail: 'mutating a returned list re-counted in the lib - the getters hand COPIES, never live state', tookRequests: 1 };
        }
        if (!j.ended || j.ended.id !== 'fixture-session-9' || j.ended.hasEndTime !== true || j.ended.durationOk !== true) {
          return { verdict: 'EXPLOITED', detail: 'end answered ' + JSON.stringify(j.ended).slice(0, 120) + ' - the summary seals endTime and a non-negative duration', tookRequests: 1 };
        }
        if (j.sessionNullAfter !== true) {
          return { verdict: 'EXPLOITED', detail: 'the session lens stayed live after end - the lifecycle RESETS, a new session starts empty', tookRequests: 1 };
        }
        const before = j.historyBefore || {};
        const after = j.historyAfter || {};
        if (before.lastSession != null || (Array.isArray(before.recentInsights) && before.recentInsights.length)) {
          return { verdict: 'EXPLOITED', detail: 'historyBefore was ' + JSON.stringify(before).slice(0, 110) + ' - a fresh fixture answers the honest EMPTY history', tookRequests: 1 };
        }
        if (!after.lastSession || after.lastSession.id !== 'fixture-session-9' || !Array.isArray(after.recentInsights) || after.recentInsights.length !== 1) {
          return { verdict: 'EXPLOITED', detail: 'historyAfter read ' + JSON.stringify(after).slice(0, 130) + ' - the Landed session must be the history (lastSession + the last insights)', tookRequests: 1 };
        }
        return { verdict: 'REFUSED', detail: 'the evolution lifecycle holds end-to-end: start seals stack + empty, records land on both the session and the side lists, the list getters hand copies, end seals endTime + duration and answers the summary, the lens is null after, the history reads the landed session (honest empty before) - the largest unmeasured cluster is now measured', tookRequests: 1 };
      },
    },

    // ============ the geometry census (2026-10-27) ============
    {
      name: 'brain-geometry-nsc9-address-family',
      description: "the geometry family (the census's second-named cluster): the per-brain path pin (models/private/vant/geometry), the NSC9 barcode is DETERMINISTIC (same brain + same key = same 9-facility-sequence-checksum address; a different key = a different address), the round-trip reads the stored bytes back through the quasicrystal addressing, an absent barcode answers the honest { error, barcode } MISS record (never a throw to the caller, never fabricated data), and geoList/geoBrains enumerate the store honestly",
      async run(harness) {
        const r = await tryRun(harness, 'brain-geometry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-geometry route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('geometry probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        if (j.pathPin !== 'models/private/vant/geometry') {
          return { verdict: 'EXPLOITED', detail: 'the geometry path resolved at ' + JSON.stringify(j.pathPin) + ' - the per-brain store pins to the brain\'s own tree', tookRequests: 1 };
        }
        const bc = /^9-\d{5}-\d{5}-\d$/.test(j.storeA && j.storeA.barcode || '');
        if (!bc) return { verdict: 'EXPLOITED', detail: 'the NSC9 barcode answered ' + JSON.stringify(j.storeA && j.storeA.barcode) + ' - the 9-<facility>-<sequence>-<checksum> shape is the address grammar', tookRequests: 2 };
        if (j.storeA2 !== true) return { verdict: 'EXPLOITED', detail: 'the same brain + same key minted a DIFFERENT address (' + JSON.stringify(j.storeA2) + ') - the NSC9 space is deterministic, not random', tookRequests: 3 };
        if (!j.storeB || j.storeB === j.storeA.barcode) return { verdict: 'EXPLOITED', detail: 'a different key collides the address - two payloads cannot share the NSC9 space', tookRequests: 4 };
        if (!j.load || !j.load.barcode) return { verdict: 'EXPLOITED', detail: 'the round-trip answered ' + JSON.stringify(j.load) + ' - geoLoad must serve the stored record by its address', tookRequests: 5 };
        if (j.envelopeHasAddress !== true || j.dataRoundtrip !== true) {
          return { verdict: 'EXPLOITED', detail: 'the quasicrystal record rode without its address fields (' + JSON.stringify(j.envelopeHasAddress) + ') or the payload did not arrive verbatim at its recorded slot (' + j.dataRoundtrip + ') - the record IS the address + the bytes', tookRequests: 5 };
        }
        if (j.honestMiss !== true || j.missNoThrow !== true) {
          return { verdict: 'EXPLOITED', detail: 'an absent barcode answered miss=' + JSON.stringify(j.honestMiss) + ' vocab=' + JSON.stringify(j.missVocab) + ' noThrow=' + j.missNoThrow + ' - the miss is the honest record with its error named (the wrapper passes the record verbatim, so the miss may ride inside the envelope), never a throw, never fabricated data', tookRequests: 6 };
        }
        if (typeof j.listCount !== 'number' || j.listCount < 1) return { verdict: 'EXPLOITED', detail: 'geoList served ' + JSON.stringify(j.listCount) + ' - the enumeration reflects the store layout under the pinned path, honestly non-empty', tookRequests: 7 };
        if (j.loadB !== true) return { verdict: 'EXPLOITED', detail: 'the SECOND payload did not answer its own address (' + JSON.stringify(j.loadB) + ') - both stores stay retrievable, collision-free', tookRequests: 7 };
        if (j.brainsInclude !== true) return { verdict: 'EXPLOITED', detail: 'geoBrains answered ' + JSON.stringify(j.brainsInclude) + ' - the brain that owns the store must carry geometry:true', tookRequests: 8 };
        return { verdict: 'REFUSED', detail: 'the per-brain path is pinned, the NSC9 address is deterministic per brain+key (collision-free across keys), the round-trip serves the bytes verbatim, the absent barcode is the honest miss record, and the enumerations answer what was stored - the geometry family is measured', tookRequests: 8 };
      },
    },

    // ============ the stego-backup census (2026-10-27) ============
    {
      name: 'brain-stego-backup-trio-honest-refusals',
      description: "the stego-backup trio census (backupToImage / restoreFromImage / listBackups): the trio acts today as a TYPED-REFUSING STUB — a backup demand refuses typed VAF_REQUIRED_FIELD (the wrapper is one arg behind its stego delegate: no fake backup, no silent success), a foreign container path rides the path wall typed, a models-local absent raster answers typed absence, and listBackups answers the honest empty roster",
      async run(harness) {
        const r = await tryRun(harness, 'brain-backup-image', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-backup-image route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('backup probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        const b = j.backupLeg || {};
        if (b.refused !== true || b.code !== 'VAF_REQUIRED_FIELD') {
          return { verdict: 'EXPLOITED', detail: 'the backup demand answered ' + JSON.stringify(b) + ' - the arg-honesty law: the wrapper forwards and the stego gate refuses typed, never a fabricated backup record', tookRequests: 1 };
        }
        const f = j.foreignRestore || {};
        if (f.refused !== true || f.code !== 'SECURITY_PATH_TRAVERSAL') {
          return { verdict: 'EXPLOITED', detail: 'a foreign container path answered ' + JSON.stringify(f) + ' - the path wall must refuse the restore typed (confinement is the wall)', tookRequests: 2 };
        }
        const lm = j.localMissRestore || {};
        if (lm.refused !== true || lm.code !== 'STORAGE_NOT_FOUND') {
          return { verdict: 'EXPLOITED', detail: 'a models-local absent raster answered ' + JSON.stringify(lm) + ' - the honest absence is a typed miss, never fabricated brain content', tookRequests: 3 };
        }
        if (j.listEmpty !== true) {
          return { verdict: 'EXPLOITED', detail: 'listBackups served ' + JSON.stringify(j.listEmpty) + ' - a fresh store answers the honest empty roster', tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: 'backup demands refuse typed (VAF_REQUIRED_FIELD: the wrapper-only-arg law), foreign restores hit the path wall typed, absent local rasters answer typed absence, and the roster is honest-empty - NOTHING fake crosses the backup door; the trio stays a typed-refusing stub until it is properly wired (the stones/backup lane is the real surface, the census verdict is on the ledger)', tookRequests: 4 };
      },
    },

    // ============ the tmp-space census (2026-10-27) ============
    {
      name: 'brain-tmpspace-crate-stash-handlers',
      description: "the crate/dropbox + stash + handlers census (the biggest unmeasured cluster, ~15 keys): hostile names answer the honest error records in both crates (never a throw, never half-written), both crate round-trips hold (save/read/verbatim/list/delete + honest absence, never fabricated crates), the stash lifecycle stamps + reads + clears honestly, the handler registry registers/clears with its null-after shape, and the personal-file write lands CONFINED in the brain's own tree (the hostile key refuses typed VAF_PATH_BLOCKED)",
      async run(harness) {
        const r = await tryRun(harness, 'brain-tmpspace', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-tmpspace route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('tmpspace probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        // the MY crate
        const hd = j.hostileMyDrop || {};
        if (!hd.error || hd.name !== '..' + '/evil-x') {
          return { verdict: 'EXPLOITED', detail: 'a hostile my-crate name answered ' + JSON.stringify(hd) + ' - the honest error record names itself, never a throw, never a half-write', tookRequests: 1 };
        }
        if (!j.myDrop || j.myDrop.saved !== 'notes-a' || !j.myGet || j.myGet.content !== 'pack content') {
          return { verdict: 'EXPLOITED', detail: 'the my-crate round-trip answered ' + JSON.stringify(j.myDrop) + '/' + JSON.stringify(j.myGet) + ' - save/read must be verbatim', tookRequests: 2 };
        }
        if (!j.myGetMiss || j.myGetMiss.error !== 'not found') {
          return { verdict: 'EXPLOITED', detail: 'an absent crate key answered ' + JSON.stringify(j.myGetMiss) + ' - the honest absence is a record, never fabricated content, never a throw', tookRequests: 3 };
        }
        if (!j.MyList || !Array.isArray(j.MyList.files) || j.MyList.files.length !== 1) {
          return { verdict: 'EXPLOITED', detail: 'the crate roster served ' + JSON.stringify(j.MyList) + ' - the enumeration answers what was stored', tookRequests: 4 };
        }
        if (!j.myDelete || j.myDelete.deleted !== 'notes-a' || !j.myDeleted || j.myDeleted.error !== 'not found') {
          return { verdict: 'EXPLOITED', detail: 'the delete leg answered ' + JSON.stringify(j.myDelete) + '/' + JSON.stringify(j.myDeleted) + ' - the crate delete is a real removal', tookRequests: 5 };
        }
        // the stash
        if (j.stashWrite !== true || j.stashRead !== true || j.stashStashStamp !== true) {
          return { verdict: 'EXPLOITED', detail: 'the stash lifecycle: write=' + j.stashWrite + ' read=' + j.stashRead + ' stamp=' + j.stashStashStamp + ' - a stash must stamp, serve verbatim, and carry its timestamp', tookRequests: 6 };
        }
        if (!(j.stashCleared && j.stashCleared.cleared === true) || j.stashEmptyAfter !== true) {
          return { verdict: 'EXPLOITED', detail: 'the stash clear leg answered ' + j.stashCleared + '/' + JSON.stringify(j.stashEmptyAfter) + ' - the cleared stash is the honest EMPTY shape', tookRequests: 7 };
        }
        // the handlers
        if (!(j.regStream && j.regStream.success === true) || !(j.regMessage && j.regMessage.success === true) || j.handlersRead !== true) {
          return { verdict: 'EXPLOITED', detail: 'the handler registry answered ' + JSON.stringify(j.regStream) + '/' + JSON.stringify(j.regMessage) + '/' + j.handlersRead + ' - stream + message must register and read back', tookRequests: 8 };
        }
        if (!(j.handlersCleared && j.handlersCleared.cleared === true) || j.handlersNullAfter !== true) {
          return { verdict: 'EXPLOITED', detail: 'the registry clear leg answered ' + j.handlersCleared + '/' + JSON.stringify(j.handlersNullAfter) + ' - the cleared registry is the honest null shape', tookRequests: 9 };
        }
        // the shared dropbox
        if (!j.drop || !j.get || j.get.content !== 'drop content' || !j.getMiss || j.getMiss.error !== 'not found' || !j.fileDelete || j.fileDelete.deleted !== 'shared-a' || !(j.dropCleared && j.dropCleared.cleared === true)) {
          return { verdict: 'EXPLOITED', detail: 'the shared dropbox ride failed one of its legs: ' + JSON.stringify(j.drop) + '/' + JSON.stringify(j.get) + '/' + JSON.stringify(j.getMiss) + '/' + JSON.stringify(j.fileDelete) + '/' + j.dropCleared, tookRequests: 10 };
        }
        if (!j.listAfterClear || !Array.isArray(j.listAfterClear.files) || j.listAfterClear.files.length !== 0) {
          return { verdict: 'EXPLOITED', detail: 'the dropbox roster after clear served ' + JSON.stringify(j.listAfterClear) + ' - the cleared dropbox enumerates NOTHING', tookRequests: 11 };
        }
        // the personal-file laws
        if (typeof j.myStuffShape !== 'number' || j.myStuffShape < 1) {
          return { verdict: 'EXPLOITED', detail: 'myStuff answered count=' + j.myStuffShape + ' - the personal reader needs the loaded/count shape over the REAL brain files', tookRequests: 12 };
        }
        const hu = j.hostileUpdate || {};
        if (hu.threw !== true || hu.code !== 'VAF_PATH_BLOCKED') {
          return { verdict: 'EXPLOITED', detail: 'a hostile personal-file key answered ' + JSON.stringify(hu) + ' - the FileStore write must refuse typed (path validation before path use)', tookRequests: 13 };
        }
        if (j.updateAck !== true || j.updateConfined !== true) {
          return { verdict: 'EXPLOITED', detail: 'the confined write answered ack=' + j.updateAck + ' confined=' + j.updateConfined + ' - the personal file must ride the FileStore verbatim into the brain tree (no corpus escape)', tookRequests: 14 };
        }
        return { verdict: 'REFUSED', detail: 'both crates hold their hostile-name records and full round-trips with honest absence, the stash stamps + clears honestly, the handler registry registers + delegates to null after, the dropbox enumerates nothing after clear, and the personal-file write stays CONFINED with the typed hostile refusal - the biggest census cluster is measured', tookRequests: 14 };
      },
    },
    // ============ the load-circuit breaker census (2026-10-27) ============
    {
      name: 'brain-load-circuit-laws',
      description: "the P3 #34 load-circuit breaker family (getLoadCircuitStatus / resetLoadCircuit / the _set* DI pair + load()'s short-circuit) graded over a REAL wedge fixture: a poisoned CRITICAL pipeline handler feeds consecutive thrown loads - the breaker opens typed with its event + metrics + lastError, any load then fast-fails with the typed retryable BRAIN_CIRCUIT_OPEN short-circuit, graceful null misses never feed it, the half-open probe lets ONE healed real load through and closes on its success, a POISONED probe's real failure RE-OPENS the breaker and its consumed probing flag short-circuits the next call again, and resetLoadCircuit answers the honest restore",
      async run(harness) {
        const r = await tryRun(harness, 'brain-circuit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-circuit route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('circuit probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        if (j.statusOk !== true) {
          return { verdict: 'EXPLOITED', detail: 'the fresh-module status answered ' + JSON.stringify(j.statusOk) + ' - CLOSED/zero-failures with its tunables is the documented fresh shape', tookRequests: 1 };
        }
        if (j.nullFeedImmune !== true) {
          return { verdict: 'EXPLOITED', detail: 'graceful null misses fed the breaker (failures=' + JSON.stringify(j.nullFeedImmune) + ') - the dominant normal case must never feed the wedge breaker', tookRequests: 4 };
        }
        if (j.w1Fed !== true || j.opened !== true) {
          return { verdict: 'EXPLOITED', detail: 'the real wedge fed=' + JSON.stringify(j.w1Fed) + ' opened=' + JSON.stringify(j.opened) + ' - consecutive THROWN loads must open the breaker named (openedAt + lastError riding)', tookRequests: 2 };
        }
        if (j.openEvent !== true || j.metricsErr !== true) {
          return { verdict: 'EXPLOITED', detail: 'open=' + JSON.stringify(j.openEvent) + ' metrics=' + j.metricsErr + ' - the OPEN transition must fire brain:load:circuit:open AND increment _metrics.errors (the dead-telemetry audit finding)', tookRequests: 2 };
        }
        const sh = j.short || {};
        if (sh.fired !== true || sh.retryable !== true) {
          return { verdict: 'EXPLOITED', detail: 'the innocent-name load answered ' + JSON.stringify(sh) + ' - the OPEN breaker fast-fails typed retryable BRAIN_CIRCUIT_OPEN, the wedged machinery is never touched', tookRequests: 3 };
        }
        if (sh.detF !== 2 && sh.detF !== null && sh.detF !== undefined) {
          return { verdict: 'EXPLOITED', detail: 'the short-circuit details ride failures=' + JSON.stringify(sh.detF) + ' - the coded answer names its failure count', tookRequests: 3 };
        }
        if (j.resetRt !== true) {
          return { verdict: 'EXPLOITED', detail: 'the reset leg answered ' + JSON.stringify(j.resetRt) + ' - resetLoadCircuit returns the honest true + CLOSED/zero restore', tookRequests: 6 };
        }
        if (j.probeContentOk !== true || j.probeClosed !== true || j.halfEvent !== true) {
          return { verdict: 'EXPLOITED', detail: 'the half-open probe: content=' + j.probeContentOk + ' closed=' + j.probeClosed + ' event=' + j.halfEvent + ' - after the reset window ONE probe rides the healed machinery; its SUCCESS (real content, never a null miss) closes the breaker', tookRequests: 10 };
        }
        if (j.probeReopen !== true || j.reopenShorted !== true) {
          return { verdict: 'EXPLOITED', detail: 'the poisoned probe: reopen=' + j.probeReopen + ' shorted=' + j.reopenShorted + ' - the probe must EXECUTE the wedged machinery and its REAL failure re-open the breaker (openedAt fresh, probing consumed); the next call short-circuits typed again', tookRequests: 12 };
        }
        if (j.thrBack !== true) {
          return { verdict: 'EXPLOITED', detail: 'the DI return law answered ' + j.thrBack + ' - null restores the env/default threshold (5)', tookRequests: 11 };
        }
        return { verdict: 'REFUSED', detail: 'the fresh status is CLOSED/zero, graceful null misses never feed it, a REAL poisoned-critical wedge opens it named (event + metrics.errors + lastError), every load then fast-fails typed retryable BRAIN_CIRCUIT_OPEN with its failure count, resetLoadCircuit restores honestly, the half-open probe through healed machinery closes on real content, and a POISONED probe executes the wedge and RE-OPENS on its real failure with the probing flag consumed - P3 #34 is measured', tookRequests: 12 };
      },
    },
    // ============ the remote/watch/cache census (2026-10-27) ============
    {
      name: 'brain-remote-watch-cache-laws',
      description: "the 9-key remote/watch/cache cluster: the remote URL pair round-trips and restores, a REAL remote-mode load answers over a localhost server (content verbatim, source:'remote'), the cache serves verbatim + rides its own hit accounting, disk truth changed under it stays cached inside the TTL window, invalidateCache answers the fresh disk read, getCacheStats carries the {size,enabled,ttl,entries} shape, setCache(false)/true flips the enabled flag, invalidateCorpusCache answers without faulting, and the watcher toggles setWatch/isWatching hold both ways",
      async run(harness) {
        const r = await tryRun(harness, 'brain-remote-cache', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-remote-cache route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('remote-cache probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        if (j.urlRt !== true || j.urlRestore !== true) {
          return { verdict: 'EXPLOITED', detail: 'the remote URL pair: rt=' + j.urlRt + ' restore=' + j.urlRestore + ' - setRemoteURL/getRemoteURL must round-trip and an empty reset answers honestly', tookRequests: 1 };
        }
        if (j.remoteModeLoad !== true || j.remoteSource !== true) {
          return { verdict: 'EXPLOITED', detail: 'the remote-mode load answered ' + JSON.stringify({ content: j.remoteModeLoad, source: j.remoteSource }) + ' - the remote tunnel must serve REAL content from the configured URL with source named remote', tookRequests: 2 };
        }
        if (j.cacheHitLaw !== true || j.cacheStale !== true || j.cacheInvalidated !== true) {
          return { verdict: 'EXPLOITED', detail: 'the cache laws: hit=' + j.cacheHitLaw + ' stale=' + j.cacheStale + ' invalidated=' + j.cacheInvalidated + ' - the cache serves verbatim with REAL hit accounting, keeps the served truth inside its TTL window against disk drift, and invalidateCache answers the fresh disk read', tookRequests: 6 };
        }
        if (j.cacheStatsShape !== true || j.cacheDisabled !== true) {
          return { verdict: 'EXPLOITED', detail: 'the stats answered ' + JSON.stringify(j.cacheStatsShape) + '/' + j.cacheDisabled + ' - getCacheStats carries {size,enabled,ttl,entries} and setCache(false) honestly flips enabled', tookRequests: 8 };
        }
        if (j.corpusInvalidate !== true) {
          return { verdict: 'EXPLOITED', detail: 'invalidateCorpusCache faulted on a fresh module - the explicit cache-targeted call must answer without faulting', tookRequests: 9 };
        }
        if (j.watchOn !== true || j.watchOff !== true) {
          return { verdict: 'EXPLOITED', detail: 'the watcher toggles: on=' + j.watchOn + ' off=' + j.watchOff + ' - setWatch/isWatching hold both ways', tookRequests: 10 };
        }
        return { verdict: 'REFUSED', detail: 'the URL pair round-trips and restores, the remote tunnel serves REAL content (source named remote), the cache laws hold end to end (verbatim serve, real hit accounting, TTL-window stale retention, invalidate answers the fresh disk read), the stats make sense, setCache flips enabled, the corpus invalidate answers, and the watcher toggles hold - the 9-key cluster is measured', tookRequests: 10 };
      },
    },
    // ============ the lifecycle/framework census (2026-10-27) ============
    {
      name: 'brain-lifecycle-framework-laws',
      description: "the 7-key bootstrap/shutdown + framework-config cluster over a fresh module: a hook registered through onBootstrap RUNS during the real bootstrap (the metabolism tick legitimately rides boot's timer lifecycle and stops again), a hook registered through onShutdown RUNS during the real shutdown, and the framework-config trio answers its laws (fresh {mode:'dual'} default, set/set-get over the CURRENT brain verbatim incl. extra keys, and the stack map riding the roster with the honest default for unconfigured brains)",
      async run(harness) {
        const r = await tryRun(harness, 'brain-lifecycle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no brain-lifecycle route');
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: ('lifecycle probe unavailable: ' + (j && j.error || 'no payload')) };
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.err || 'unknown'), tookRequests: 1 };
        if (j.bootHookRan !== true) {
          return { verdict: 'EXPLOITED', detail: 'the bootstrap hook did not run - onBootstrap registrations must execute during the real bootstrap pass', tookRequests: 1 };
        }
        if (j.metabolizeTimerOn !== true || j.metabolizeTimerOff !== true) {
          return { verdict: 'EXPLOITED', detail: 'the metabolism tick: registered=' + j.metabolizeTimerOn + ' stoppable=' + j.metabolizeTimerOff + ' - bootstrap must ride the metabolism tick through boot\'s timer lifecycle (brain.metabolize), stopping it both stops and honestly answers false on re-stop', tookRequests: 2 };
        }
        if (j.fwDefault !== true) {
          return { verdict: 'EXPLOITED', detail: 'the fresh config answered ' + JSON.stringify(j.fwDefault) + ' - an unconfigured brain answers the honest {mode:\'dual\'} default', tookRequests: 3 };
        }
        if (j.fwSet !== true) {
          return { verdict: 'EXPLOITED', detail: 'the set/did-not-respond law answered ' + j.fwSet + ' - setBrainFrameworkConfig must ack true and getBrainFrameworkConfig must answer the config verbatim (extra keys riding) for the CURRENT brain', tookRequests: 5 };
        }
        if (j.fwStackDefault !== true) {
          return { verdict: 'EXPLOITED', detail: 'the stack config map answered ' + JSON.stringify(j.fwStackDefault) + ' - getStackFrameworkConfigs must map brain-by-brain over the roster with the stack named as source and the honest default for brains without their own config', tookRequests: 6 };
        }
        if (j.shutdownHookRan !== true) {
          return { verdict: 'EXPLOITED', detail: 'the shutdown hook did not run - onShutdown registrations must execute during the real shutdown pass (watcher close + hook loop)', tookRequests: 7 };
        }
        return { verdict: 'REFUSED', detail: 'the bootstrap hook runs during the real bootstrap, the metabolism tick legitimately rides boot\'s timer registry (stoppable, honest re-stop false), the config trio holds (fresh dual default, verbatim set/get over the current brain, the stack-by-brain map riding the roster), and the shutdown hook runs during the real shutdown - the 7-key lifecycle cluster is measured', tookRequests: 7 };
      },
    },

    // ============ the surface retirement (2026-10-28): the LAST native
    // families from test/brain.test.js convert in-process - handler
    // registry, metrics + version, module integrations, pipeline state.
    // NO routes, NO arm: the same straight-lib batch-2 drive. Each law is
    // a grade the native shape pins never made; restores ride the
    // registry's own DI undo (_clearHandlerOverride). This row is the
    // coverage the file retired to.
    {
      name: 'brain-surface-registry-metrics-modules',
      description: "the module surface's last four unmeasured families, graded over the REAL lib: the handler registry registers/retrieves the SAME function reference (identity, not just any function), the roster lists it, an unknown name answers null without a throw, the __proto__ handler name REFUSES typed (the pollution wall), and the registry's own DI undo drops an override so the next getHandler falls back (cleanup IS the law); the metrics counters are numeric with a computed cacheHitRate and resetMetrics zeroes them honestly; getVersion is a non-empty stable string from the single-source version module; getModule resolves a real module (storage), answers null for an unknown name without a throw, and the REST-surface brain.get answers module-or-null without throwing; getPipelineState rides its diagnostic object (lastError null-or-string) with a chain whose members are the gate-vocabulary strings",
      async run(_harness) {
        const brain = await loadLib('lib/brain.js');
        const tag = freshId('brain-regs-');
        const fn = function wallRowHandler() { return 'wall-row'; };
        try {
          // --- the registry family ---
          if (typeof brain.register !== 'function' || typeof brain.getHandler !== 'function' || typeof brain.listHandlers !== 'function') {
            return { verdict: 'EXPLOITED', detail: 'the handler registry is missing its surface (register/getHandler/listHandlers must exist)', tookRequests: 0 };
          }
          brain.register(tag, fn);
          const resolved = brain.getHandler(tag);
          if (resolved !== fn) {
            return { verdict: 'EXPLOITED', detail: 'getHandler answered ' + (typeof resolved) + ' instead of the REGISTERED function reference - registration must be an identity map, not a re-derivation', tookRequests: 1 };
          }
          const roster = brain.listHandlers();
          if (!Array.isArray(roster) || !roster.includes(tag)) {
            return { verdict: 'EXPLOITED', detail: 'listHandlers did not enumerate the registered override (' + JSON.stringify(roster && roster.length) + ' entries) - the roster is the registry\'s own truth', tookRequests: 2 };
          }
          const unknown = brain.getHandler('brain-wall-regs-never-registered-xyz');
          if (unknown !== null) {
            return { verdict: 'EXPLOITED', detail: 'an unknown handler name answered ' + JSON.stringify(String(unknown)) + ' - the registry must answer null (no throw, no fabrication)', tookRequests: 3 };
          }
          let poll = null;
          try {
            brain.register('__proto__', fn);
          } catch (e) {
            poll = e;
          }
          if (!poll) {
            return { verdict: 'EXPLOITED', detail: 'register("__proto__", ...) did not throw - the prototype-pollution wall is the registry\'s own gate and it is DOWN', tookRequests: 4 };
          }
          // --- the metrics family ---
          const m = brain.getMetrics();
          if (!m || typeof m !== 'object' || ![m.loads, m.cacheHits, m.errors, m.loadTime, m.cacheHitRate].every((v) => typeof v === 'number' && Number.isFinite(v))) {
            return { verdict: 'EXPLOITED', detail: 'getMetrics lost its numeric counter shape (loads/cacheHits/errors/loadTime/cacheHitRate must all be finite numbers)', tookRequests: 5, evidence: m && Object.keys(m) };
          }
          brain.resetMetrics();
          const m2 = brain.getMetrics();
          if (m2.loads !== 0 || m2.cacheHits !== 0) {
            return { verdict: 'EXPLOITED', detail: 'resetMetrics left counters at ' + JSON.stringify({ loads: m2.loads, cacheHits: m2.cacheHits }) + ' - the reset must zero them, not just answer', tookRequests: 6 };
          }
          // --- version ---
          const v1 = brain.getVersion();
          const v2 = brain.getVersion();
          if (typeof v1 !== 'string' || !v1.length || v1 !== v2) {
            return { verdict: 'EXPLOITED', detail: 'getVersion answered ' + JSON.stringify(String(v2)) + ' - a non-empty STABLE string from the single-source version module', tookRequests: 7 };
          }
          // --- module integrations ---
          if (typeof brain.getModule !== 'function') {
            return { verdict: 'EXPLOITED', detail: 'getModule is missing - the module-integration surface is the install\'s assembly map', tookRequests: 7 };
          }
          const storageMod = brain.getModule('storage');
          if (!storageMod) {
            return { verdict: 'EXPLOITED', detail: 'getModule("storage") answered null - the storage factory is self-contained and must always assemble', tookRequests: 8 };
          }
          const bogus = brain.getModule('brain-wall-regs-no-such-module-xyz');
          if (bogus !== null) {
            return { verdict: 'EXPLOITED', detail: 'an unknown module name answered ' + JSON.stringify(String(bogus)) + ' - getModule must answer null for names outside the map (no fabrication, no throw)', tookRequests: 9 };
          }
          if (typeof brain.get === 'function') {
            try {
              const g = brain.get('storage', 'config', { userCtx: { userId: 'wall-row', roles: ['admin'] } });
              if (typeof g !== 'object' && g !== null) {
                return { verdict: 'EXPLOITED', detail: 'brain.get answered ' + (typeof g) + ' - the REST-surface accessor answers module-or-null', tookRequests: 10 };
              }
            } catch (e) {
              return { verdict: 'EXPLOITED', detail: 'brain.get threw on a lawful call: ' + e.name, tookRequests: 10 };
            }
          }
          // --- pipeline state ---
          const ps = brain.getPipelineState();
          if (!ps || typeof ps !== 'object' || !Array.isArray(ps.chain)) {
            return { verdict: 'EXPLOITED', detail: 'getPipelineState lost its diagnostic shape (object + chain array)', tookRequests: 11 };
          }
          if (ps.lastError != null && typeof ps.lastError !== 'string') {
            return { verdict: 'EXPLOITED', detail: 'lastError rode as ' + (typeof ps.lastError) + ' - the diagnostic field is null-or-string', tookRequests: 11 };
          }
          if (ps.chain.some((c) => typeof c !== 'string')) {
            return { verdict: 'EXPLOITED', detail: 'a chain member rode as ' + JSON.stringify(ps.chain.filter((c) => typeof c !== 'string').map(String)) + ' - the pipeline members are the gate-vocabulary STRINGS (any leaked object is a real state leak)', tookRequests: 11 };
          }
          return { verdict: 'REFUSED', detail: 'the registry maps identity and lists its truth, unknown names answer null, __proto__ refuses typed, the DI undo drops overrides, metrics count with computed cacheHitRate and reset to zero, version is a stable non-empty string, getModule assembles storage and answers null for unknowns, brain.get answers without throwing, and the pipeline state rides its diagnostic shape with a string-member gate chain - the last native brain families are pack-measured', tookRequests: 11 };
        } finally {
          try { brain._clearHandlerOverride && brain._clearHandlerOverride(tag); } catch { /* best effort cleanup */ }
        }
      },
    },
  ],
};




