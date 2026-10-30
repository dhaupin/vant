// packs/public/vant-crew/index.mjs - agent-crew budget discipline for vant.
//
// Fourth candidate from the packs/README survey (2026-10-22), driven by the
// same contract as vant-brain: the RUN ROOT declares routes against vant's
// in-process agent registry (lib/agents - no OS processes, no sockets, the
// one law holds), returns neutral facts, and the attacks decide.
//
// ROUTE CONTRACT (arm what your run root can; missing route = skipped-REFUSED):
//
// * crew-run   POST, JSON body { }, optional { limit } to override the
//              probe's spawn bound
//              -> 200 JSON { error?, cap, attempts, capError?, rateError?,
//                            rateLimit, rosterSize, rosterNames: [...] }
//              the shim drives lib/agents.spawn() against a fresh roster:
//              `cap` = agents.maxAgents as resolved by the run root,
//              `capError` = the typed quota error text (present when the cap
//              fired), `rateError` = the typed rate-limit error (present
//              when the window fired), `rosterNames` = everything ACCEPTED.
//
// VALIDATION STATUS (honest, per the candidates survey):
//   validated against a vant sandbox (test/crashtest-packs.test.js):
//     roster-quota-ceiling, spawn-rate-limit, quota-error-is-typed
//   No pending rows in this pack: every oracle is registry-level and
//   armable anywhere the one law holds.

const ROUTE_ABSENT = /no route registered as/i;

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

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

async function tryRun(harness, route, reqInit) {
  try { return await harness.run(route, reqInit); }
  catch (e) {
    if (ROUTE_ABSENT.test(String(e?.message))) return { _absent: true };
    throw e;
  }
}

export default {
  name: 'vant-crew',
  description: 'Agent-crew budget discipline for vant installs: roster quota ceiling respected at the declared cap, spawn rate limit refuses past the window, and quota denials grow no ghost agents',
  attacks: [
    {
      name: 'roster-quota-ceiling',
      description: 'the declared agents.maxAgents cap must fire as a typed refusal when the roster is full - a roster that grows past its ceiling is a budget in name only',
      async run(harness) {
        const r = await tryRun(harness, 'crew-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no crew-run route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `crew-run threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'crew-run not armed for a quota probe' };
        if (Number(j.rosterSize) > Number(j.cap)) {
          return {
            verdict: 'EXPLOITED',
            detail: `roster grew past its declared cap (${j.rosterSize} agents > cap ${j.cap}) - the quota is decorative`,
            tookRequests: Number(j.attempts) || 0,
            evidence: { rosterSize: j.rosterSize, cap: j.cap, names: j.rosterNames },
          };
        }
        if (!j.capError && Number(j.attempts) > Number(j.cap)) {
          return {
            verdict: 'EXPLOITED',
            detail: `${j.attempts} spawn attempts and the cap NEVER fired (no typed quota error)`,
            tookRequests: Number(j.attempts) || 0,
            evidence: { attempts: j.attempts, cap: j.cap },
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `quota held: ${j.attempts} attempts, cap ${j.cap}, ${j.rosterSize}.length roster, typed refusal on the breach attempt`,
          tookRequests: Number(j.attempts) || 0,
        };
      },
    },
    {
      name: 'spawn-rate-limit',
      description: 'the spawn rate limiter must refuse past its declared window budget - an unthrottled spawn burst defeats the cap without breaking it',
      async run(harness) {
        const r = await tryRun(harness, 'crew-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no crew-run route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `crew-run threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'crew-run not armed for a rate probe' };
        if (!j.rateError && Number(j.attempts) > Number(j.rateLimit)) {
          return {
            verdict: 'EXPLOITED',
            detail: `${j.attempts} in-window attempts, budget ${j.rateLimit}, and the rate limiter never refused`,
            tookRequests: Number(j.attempts) || 0,
            evidence: { attempts: j.attempts, rateLimit: j.rateLimit },
          };
        }
        return {
          verdict: 'REFUSED',
          detail: `rate limit held: budget ${j.rateLimit}, typed refusal seen (${String(j.rateError).slice(0, 60)})`,
          tookRequests: Number(j.attempts) || 0,
        };
      },
    },
    {
      name: 'quota-error-is-typed',
      description: 'a quota denial must come back as a typed, informative refusal (named cap, code) - a raw crash or a blank error leaves the operator guessing what budget exists',
      async run(harness) {
        const r = await tryRun(harness, 'crew-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (r._absent) return skip('no crew-run route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `crew-run threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return { verdict: 'REFUSED', skipped: true, detail: 'crew-run not armed' };
        // typed = names the budget that refused (quota cap or rate window).
        const typed = (s) => typeof s === 'string' && s.length > 10 && /quota|rate limit/i.test(String(s));
        if (j.capError != null && !typed(j.capError)) {
          return {
            verdict: 'EXPLOITED',
            detail: `quota refusal is not typed/informative: ${JSON.stringify(j.capError)}`,
            tookRequests: Number(j.attempts) || 0,
          };
        }
        if (j.rateError != null && !typed(j.rateError)) {
          return {
            verdict: 'EXPLOITED',
            detail: `rate-limit refusal is not typed/informative: ${JSON.stringify(j.rateError)}`,
            tookRequests: Number(j.attempts) || 0,
          };
        }
        return {
          verdict: 'REFUSED',
          detail: 'denials are typed refusals naming the budget that refused',
          tookRequests: Number(j.attempts) || 0,
        };
      },
    },
    {
      name: 'crew-doors-census',
      description: "the crew door inventory (run-root census, fresh-module ladder): every gate verb over ids that do not exist answers its own honest shape (undefined/typed/'Agent not found'/honest false no-ops/prune zeroes), the work verbs refuse unknown ids typed AND the approval acks are GROUNDED (approve/reject/signOff used to ack work that never existed - the live find this census fixed: today an unknown id answers the stream's typed refusal, never an approved:true/rejected:true receipt), the protos loader lists empty rosters honestly and loadProto of an unknown answers null, and the crew bus refuses typed in BOTH postures (unconfigured CONFIG_MISSING walls; configured: URL/name validations typed, ROSTER/STATUS projections carry NO pair secret, unknown sends answer NOT_FOUND, broadcast returns per-node attempt results, removeNode returns true-for-real then false-for-unknown, and the receiver version gate refuses a bogus version typed)",
      async run(harness) {
        const r = await tryRun(harness, 'crew-doors', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (r._absent) return skip('no crew-doors route');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `crew-doors threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('crew-doors probe unavailable: ' + (j && j.error || 'no payload'));
        if (j.ok === false) return { verdict: 'EXPLOITED', detail: 'the census child faulted mid-census: ' + (j.bail || 'unknown'), tookRequests: 1 };
        const laws = [
          ['gate verbs honest', j.getUnknownUndefined && j.pauseUnknownTyped && j.resumeUnknownTyped && j.killTerminateHonestNoop && j.pruneHonest],
          ['work verbs typed', j.delegateUnknownTyped && j.pollUnknownTyped && j.completeUnknownTyped && j.retryUnknownTyped && j.escalateUnknownTyped],
          ['approval acks grounded', j.approveUnknownGrounded && j.rejectUnknownGrounded && j.signOffUnknownGrounded],
          ['protos loader honest', j.protosListsHonest && j.loadProtoUnknownNull],
          ['bus unconfigured walls', j.unconfiguredTyped],
          ['bus configured invariants', j.statusShapeConfigured && j.statusSecretFree && j.regBadUrlTyped && j.regBadNameTyped && j.regOkNoSecret && j.nodesShapeNoSecret && j.sendUnknownTyped && j.broadcastAttemptArray && j.removeRealTrueThenUnknownFalse && j.versionGateTyped && j.stopHonest],
        ];
        const broken = laws.filter(([, ok2]) => !ok2);
        if (broken.length) {
          return { verdict: 'EXPLOITED', detail: 'the crew doors broke at: ' + broken.map(([n]) => n).join(', '), tookRequests: 1, evidence: { census: j } };
        }
        return { verdict: 'REFUSED', detail: '28 census rungs hold: every gate verb answers its own honest shape, the work verbs refuse unknown ids typed, the approval acks are grounded in the stream (the ungrounded approved:true ack the census found was fixed this pass), the protos loader is honest, and the crew bus refuses typed in both postures with secret-free projections and attempt-array broadcast - the crew door inventory is measured', tookRequests: 1 };
      },
    },
  ],
};
