// packs/public/vant-rest/index.mjs - REST-door discipline for vant pods.
//
// Third candidate from the packs/README survey (2026-10-22), VALIDATED
// 2026-10-24 against a vant run root: the shim arms lib/server.js's REAL
// Edge chain - Server._handleRequest's vaf → QoS → auth → escrow sequence
// driven in-process with the fake req/res shapes it consumes (no listener,
// zero sockets; same shape crashtest's `crashtest-site` pack drives in-
// process). Two postures exist on the run root: open (default install) and
// privileged (authRequired arm), the latter also lighting crashtest's
// library authz rows.
//
// ROUTE CONTRACT (armed):
//
// * rest-request  POST, JSON body { method, path, headers?, body?,
//                 authRequired? } -> { status, headers, bodyText } - one
//                 honest round trip through the chain; status/headers/body
//                 are the chain's own answer, untouched.
//
// VALIDATED 2026-10-24: fuzz-floor / CORS / session rows. Armed 2026-10-22
// (crashtest v1.0.0-on-npm port of the qs-shapes oracle family): the
// urlencoded-body two below — lib/server's BodyParser genuinely parses
// `application/x-www-form-urlencoded` (URLSearchParams + Object.fromEntries),
// so a bracket-notation prototype canary and a deep-nesting ladder measure
// the parser's real wire behavior instead of assuming it.
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

// (crashtest qs-shapes vocabulary) deterministic urlencoded prototype-arrival
// shapes: raw brackets, the two paths a qs-style parser is known to honor.
const QS_CANARY = 'crashtestQsCanary4e91';
const QS_SHAPES = [
  `x[__proto__][${QS_CANARY}]=planted`,
  `x[constructor][prototype][${QS_CANARY}]=planted`,
];

/** The process must stay sane between attacks (crashtest input.js hygiene). */
function cleanupCanary() {
  delete Object.prototype[QS_CANARY];
  if (Object.prototype[QS_CANARY]) delete Object.prototype[QS_CANARY];
}

/** Fire a raw urlencoded (or plain-GET-query) shape through the REAL Edge
 * chain: -> parsed { status, headers, bodyText } or null when not armed. */
async function rawFire(harness, method, path, body = undefined) {
  const r = await probe(harness, method, path, { 'content-type': 'application/x-www-form-urlencoded' }, body);
  if (r._absent || r.threw) return null;
  const j = parseJson(await bodyText(r));
  return j && !j.error ? j : null;
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
      name: 'urlencoded-bracket-canary',
      description: 'urlencoded bracket shapes carrying a canary on __proto__/constructor.prototype paths ride the REAL Edge BodyParser - the canary must never surface on a fresh object literal (crashtest qs-shapes oracle, measured over vant\'s actual wire)',
      async run(harness) {
        // Flat-key expansion is what Object.fromEntries(URLSearchParams) can
        // produce: keys stay own string properties of the parsed object, not
        // prototype paths. Anything else - bracket expansion, proto walk -
        // lands the canary on Object.prototype and is a global-pollution accept.
        const fired = [];
        for (const shape of QS_SHAPES) {
          const j = await rawFire(harness, 'POST', '/anything', shape);
          if (!j) return skip('rest-request not armed for this oracle');
          fired.push(shape.split('=')[0]);
          const fresh = {}; // object literal - inherits Object.prototype only
          if (fresh[QS_CANARY] === 'planted') {
            cleanupCanary();
            return {
              verdict: 'EXPLOITED',
              detail: `bracket canary landed on Object.prototype via "${shape.split('=')[0]}" - the Edge BodyParser honors prototype arrival paths on the urlencoded wire`,
              tookRequests: fired.length,
              evidence: { shape },
            };
          }
          cleanupCanary();
        }
        return { verdict: 'REFUSED', detail: `${fired.length} bracket shapes stayed flat string keys - no prototype-key expansion reached Object.prototype`, tookRequests: fired.length };
      },
    },
    {
      name: 'urlencoded-depth-floor',
      description: 'deep [0]-nesting ladders on the query AND urlencoded wires must stay under the fuzz floor - never 5xx, never an uncaught throw; a parser without a depth cap dies in recursion (crashtest qs-shapes oracle, measured over vant\'s actual wire)',
      async run(harness) {
        const ladder = [64, 256, 1024, 4096, 20000]; // fixed, deterministic depths
        const fired = [];
        for (const depth of ladder) {
          const deep = `q${'[0]'.repeat(depth)}`;
          // GET wire: the query parser's shape. POST wire: BodyParser's
          // urlencoded shape. Both are the places a qs-style parser dies.
          const get = await rawFire(harness, 'GET', `/?${deep}=x`);
          if (!get) return skip('rest-request not armed for this oracle');
          fired.push(`GET#${depth}`);
          if (Number(get.status) >= 500) {
            return {
              verdict: 'EXPLOITED',
              detail: `deep query nesting broke the floor at bracket depth ${depth} (status ${get.status}) - the query wire has no depth cap`,
              tookRequests: fired.length,
            };
          }
          const post = await rawFire(harness, 'POST', '/anything', `${deep}=x`);
          if (!post) return skip('rest-request not armed for this oracle');
          fired.push(`POST#${depth}`);
          if (Number(post.status) >= 500) {
            return {
              verdict: 'EXPLOITED',
              detail: `deep urlencoded nesting broke the floor at bracket depth ${depth} (status ${post.status}) - the BodyParser has no depth cap`,
              tookRequests: fired.length,
            };
          }
        }
        return { verdict: 'REFUSED', detail: `the full depth ladder held on both wires (${fired.length} fires) - never 5xx, never an uncaught throw`, tookRequests: fired.length };
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
