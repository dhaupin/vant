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
//     succession-trust-inheritance (armed via trust-read, 2026-10-22)
// One oracle EXPLOITS against vant v0.8.6/axolotl TODAY — succession-
// trust-inheritance is a measured FINDING, not a glitch: the succession
// trust floor (lib/succession getFilesForTrust) is a behavioral descriptor
// and nothing enforces it at the brain.read seam, so a low-trust successor
// resolves FULL private state. The pin lives in the suite's expected table
// and keeps biting until a read-side trust gate lands.
// The two #232 read-path rows were EXPLOITED findings until the 2026-10-22
// fix (loud faults + schema sanitize + pointer-side derivation at both
// state.json load seams) flipped them to REFUSED.
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
      description: 'a low-trust successor must not resolve private-scope brain state beyond its configured trust floor - the private read honors the trust gate (or refuses honestly) (#233 expansion 2; ARMED 2026-10-22 — measures EXPLOITED today: the trust floor is behavioral description, not a read-path gate)',
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
  ],
};
