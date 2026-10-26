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
 * cycles (alias targets, fixtures). Carries no wall clock in verdicts. */
let _idCount = 0;
function freshId(prefix) {
  return prefix + String(++_idCount).padStart(4, '0') + '-' + Math.random().toString(36).slice(2, 7);
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
    // same way the native pins do.

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
  ],
};

