// packs/public/vant-rest/index.mjs - REST-door discipline for vant pods.
//
// Third candidate from the packs/README survey (2026-10-22). vant's REST
// door (lib/server.js) exports an Edge-shaped stack: Server.Request,
// Server.Response, Router, BodyParser, CORS, Helmet, Session, SessionStore —
// the same shape crashtest's `crashtest-site` pack drives in-process. The
// shim arms that stack WITHOUT a listener (construct Request objects, hand
// them to the Router, read Responses) so the door is attacked on the wire
// contract with zero sockets.
//
// ROUTE CONTRACT (PENDING VALIDATION - the routes below are 501 until a run
// root wires lib/server's stack; the attacks are written against the v1.0.0
// session/protohygiene/taxonomy row shapes and honestly skipped until then):
//
// * rest-request  POST, JSON body { method, path, headers?, body? }
//                 -> { status, headers?, bodyText } - one round-trip through
//                 the Router/Stack in-process.
//                 PENDING: wire to a Server/Router fixture (temps brain
//                 state), then flip this pack's rows to validated.
//
// Verdict vocabulary and absence-tolerance match the other vant packs:
// exactly one decision per attack, `skipped: true` marks honest absence,
// same commit = same findings.

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

async function probe(harness, method, path, headers = {}, body = undefined) {
  return tryRun(harness, 'rest-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, path, headers, body }),
  });
}

export default {
  name: 'vant-rest',
  description: 'REST-door discipline for vant installs: hostile fuzz traffic never lands as 5xx or an uncaught throw, CORS mirrors the method it is asked about, and session endpoints mint zero cookies they refuse to own',
  attacks: [
    {
      name: 'fuzz-floor-never-500',
      description: 'hostile method/path/body shapes across the REST surface must answer 2xx-4xx with sane bodies - a 5xx or an uncaught throw turns abuse into a server fault (the fuzz floor, PRD principle 1)',
      async run(harness) {
        const probes = [];
        for (const p of [
          ['/', '/'], ['GET', '/whatever'], ['GET', '/api/../etc/passwd'],
          ['UNICORN', '/anything'], ['POST', '/anything', '{"body":'],
        ]) {
          const [method, path, body] = p;
          const r = await probe(harness, method, path, {}, body);
          if (r._absent) return skip('no rest-request route (pending run-root wiring of the lib/server stack)');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
          const j = parseJson(await bodyText(r));
          if (!j || j.error) return skip('rest-request not armed for this oracle');
          probes.push({ method, path, status: j.status, threw: j.threw });
        }
        const faults = probes.filter((p) => p.threw || p.status >= 500);
        if (faults.length) {
          return {
            verdict: 'EXPLOITED',
            detail: `fuzz floor broken: ${faults.length}/${probes.length} hostile shapes landed as 5xx/uncaught throws`,
            tookRequests: probes.length,
            evidence: { faults },
          };
        }
        return { verdict: 'REFUSED', detail: `all ${probes.length} hostile shapes answered 2xx-4xx; abuse impersonal, never a server fault`, tookRequests: probes.length };
      },
    },
    {
      name: 'cors-enable-parity',
      description: 'CORS behavior must mirror the method it is asked about - preflight answers differ from the allow rules or OPTIONS never terminates early signal a hand-rolled insecure door',
      async run(harness) {
        const r = await probe(harness, 'OPTIONS', '/anything');
        if (r._absent) return skip('no rest-request route (pending run-root wiring)');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
        const j = parseJson(await bodyText(r));
        if (!j || j.error) return skip('rest-request not armed for this oracle');
        if (j.status !== 204) {
          return {
            verdict: 'EXPLOITED',
            detail: `pre-flight OPTIONS answered ${j.status} instead of a clean 204 early-terminate`,
            tookRequests: 1,
          };
        }
        return { verdict: 'REFUSED', detail: 'pre-flight OPTIONS terminates early and cleanly (204)', tookRequests: 1 };
      },
    },
    {
      name: 'session-cookie-discipline',
      description: 'a session-less client must receive zero cookie grants, and a FORGED cookie is never adopted or reflected - session endpoints that mint trust they do not own are an authz hole with a header',
      async run(harness) {
        const guest = await probe(harness, 'GET', '/session');
        const forged = await probe(harness, 'GET', '/session', { cookie: 'vant_session=forged-canary' });
        for (const r of [guest, forged]) {
          if (r._absent) return skip('no rest-request route (pending run-root wiring)');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
        }
        const jg = parseJson(await bodyText(guest));
        const jf = parseJson(await bodyText(forged));
        if (!jg || !jf || jg.error || jf.error) return skip('rest-request not armed for this oracle');
        const minted = jg.headers?.['set-cookie'];
        if (minted) {
          return {
            verdict: 'EXPLOITED',
            detail: 'a session-less GET minted a session grant it never authenticated',
            tookRequests: 2,
            evidence: { setCookie: String(minted).slice(0, 80) },
          };
        }
        if (jf.bodyText && jf.bodyText.includes('forged-canary')) {
          return {
            verdict: 'EXPLOITED',
            detail: 'a forged session cookie was adopted and reflected back to the caller',
            tookRequests: 2,
          };
        }
        return { verdict: 'REFUSED', detail: 'session endpoints mint nothing unauthenticated and adopt nothing forged', tookRequests: 2 };
      },
    },
  ],
};
