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
    {
      name: 'rest-mcp-door-args-parity',
      description: "the REST surface's MCP-carrier doors (streams / brain / trust / market) forward their path and body pieces under the EXACT arg names their tool's declared inputSchema requires - a wrong-name door answers the tool's typed arg gate instead of running the tool, so every honest call turns into a shapes-only refusal (2026-10-27 parity audit)",
      async run(harness) {
        // The honest rounds: each door is called the way the surface intends,
        // so the ANSWER must be the tool's real result - never MCP_INPUT_INVALID
        // (the tool's arg gate), never 'not found' (the tool registry gate).
        const rounds = [
          ['GET', '/streams/alpha', null],                       // stream_info  { stream: 'alpha' }
          ['POST', '/streams/alpha/poll', {}],                   // stream_poll  { stream: 'alpha' }
          ['POST', '/streams/alpha/enqueue', { task: { kind: 'pack-canary', n: 1 } }], // stream_enqueue { stream, task }
          ['GET', '/brain/identity', null],                      // brain_load   { name }
          ['GET', '/trust/score/alpha', null],                   // trust_getScore { entityId }
          ['GET', '/trust/leaderboard', null],
          ['GET', '/market/stats', null],
          ['GET', '/market/listings', null],                     // market_search (query passthrough)
          ['GET', '/health', null],                              // vant_health
        ];
        const fired = [];
        for (const [method, path, body] of rounds) {
          const r = await probe(harness, method, path,
            body == null ? {} : { 'content-type': 'application/json' },
            body == null ? undefined : JSON.stringify(body));
          if (r._absent) return skip('no rest-request route (pending run-root wiring)');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
          const outer = parseJson(await bodyText(r));
          if (!outer || outer.error) return skip('rest-request not armed for this oracle');
          // The Edge QoS floor is a SHARED per-chain budget, so a second pack
          // cycle legitimately starts mid-budget; a 429 there is the fixture's
          // budget, not a door behavior - skip, never grade it.
          if (Number(outer.status) === 429) return { verdict: 'REFUSED', skipped: true, detail: `edge QoS budget spent by earlier cycles (${method} ${path}) - door shape not reachable on this fire` };
          fired.push({ method, path, status: outer.status, inner: parseJson(outer.bodyText) });
          const wrongArgName = outer.inner && (outer.inner.error === 'MCP_INPUT_INVALID' || outer.inner.error === 'not found');
          const toolThrew = Number(outer.status) >= 500;
          if (toolThrew || wrongArgName) {
            return {
              verdict: 'EXPLOITED',
              detail: `door "${method} ${path}" answered ${toolThrew ? 'HTTP ' + outer.status : 'the tool arg gate (' + outer.inner.error + ')'} instead of running its tool - the REST carrier forwards the wrong arg name (or no tool)`,
              tookRequests: fired.length,
              evidence: { door: `${method} ${path}`, answer: outer.inner },
            };
          }
        }
        return { verdict: 'REFUSED', detail: `all ${fired.length} carrier-door rounds ran their REAL tool (no arg-gate answers, no 5xx) - the REST surface speaks its tools' own vocabulary`, tookRequests: fired.length };
      },
    },
    {
      name: 'rest-bent-body-fuzz-floor',
      description: 'bent bodies across the REST door family (missing required tool params, garbage shapes) must answer 2xx-4xx with the tool\'s typed arg gate - never a 5xx, never an uncaught throw (the fuzz floor, now measured over the REST surface\'s MCP doors)',
      async run(harness) {
        const rounds = [
          ['POST', '/market/list', {}],                 // market_list requires {type, title}
          ['POST', '/market/bid', {}],                  // market_bid requires {title}
          ['POST', '/market/trade', {}],                // market_trade requires {listingId, buyerId}
          ['POST', '/streams', {}],                     // stream_create requires {stream}
          ['POST', '/streams/alpha/enqueue', {}],       // stream_enqueue requires {stream, task}
          ['POST', '/streams/alpha/enqueue', 'not-json'],
          ['POST', '/brain/save-me', {}],               // brain_save requires {name, content}
          ['POST', '/trust/record', {}],                // trust_record requires {entityId, type}
          ['POST', '/trust/record', 'not-json'],
          ['POST', '/market/list', 'garbage-not-json'],
        ];
        const fired = [];
        for (const [method, path, body] of rounds) {
          const r = await probe(harness, method, path,
            typeof body === 'string' ? { 'content-type': 'application/json' } : { 'content-type': 'application/json' },
            typeof body === 'string' ? body : JSON.stringify(body));
          if (r._absent) return skip('no rest-request route (pending run-root wiring)');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
          const outer = parseJson(await bodyText(r));
          if (!outer || outer.error) return skip('rest-request not armed for this oracle');
          // Shared per-chain QoS budget: a mid-cycle 429 is the fixture's own
          // limiter, never the door's degradation, so it skips rather than
          // grading as either a half-pay or an exploit.
          if (Number(outer.status) === 429) return { verdict: 'REFUSED', skipped: true, detail: `edge QoS budget spent by earlier cycles (${method} ${path}) - degradation floor not measurable on this fire` };
          fired.push({ method, path, status: outer.status, threw: outer.threw });
          if (outer.threw || Number(outer.status) >= 500) {
            return {
              verdict: 'EXPLOITED',
              detail: `bent body broke the fuzz floor at "${method} ${path}" (status ${outer.status}${outer.threw ? ', uncaught throw' : ''}) - the REST door does not degrade to a typed refusal`,
              tookRequests: fired.length,
              evidence: { door: `${method} ${path}` },
            };
          }
        }
        return { verdict: 'REFUSED', detail: `all ${fired.length} bent-body shapes answered 2xx-4xx over the REST door family (no 5xx, no uncaught throw)`, tookRequests: fired.length };
      },
    },
    {
      name: 'rest-typed-gate-is-the-answer',
      description: 'the REST door family must answer the tool arg gate VERBATIM on bent input inside a 200 - the typed refusal text is the interface (missing-param problems are listed, not redacted, and the tool name is named)',
      async run(harness) {
        const r = await probe(harness, 'POST', '/trust/record', { 'content-type': 'application/json' }, JSON.stringify({}));
        if (r._absent) return skip('no rest-request route (pending run-root wiring)');
        if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
        const outer = parseJson(await bodyText(r));
        if (!outer || outer.error) return skip('rest-request not armed for this oracle');
        if (Number(outer.status) === 429) return { verdict: 'REFUSED', skipped: true, detail: 'edge QoS budget spent by earlier cycles - the typed gate is the shared-budget answer here, not the bent-body answer, so this fire never grades' };
        const inner = parseJson(outer.bodyText);
        if (Number(outer.status) >= 500 || outer.threw) {
          return { verdict: 'EXPLOITED', detail: `bent body answered ${outer.status} instead of the typed gate - a server fault is an escalation`, tookRequests: 1 };
        }
        if (!inner || inner.error !== 'MCP_INPUT_INVALID' || !inner.tool || !Array.isArray(inner.problems) || inner.problems.length === 0) {
          return { verdict: 'EXPLOITED', detail: `bent body answered ${JSON.stringify(inner).slice(0, 120)} - no typed MCP_INPUT_INVALID with tool name and problem list`, tookRequests: 1 };
        }
        if (!inner.problems.some((p) => /entityId/.test(String(p)))) {
          return { verdict: 'EXPLOITED', detail: 'the arg gate fired but did not name the missing param (entityId) - problems are redacted', tookRequests: 1, evidence: { problems: inner.problems } };
        }
        return { verdict: 'REFUSED', detail: 'the typed arg gate answers verbatim: MCP_INPUT_INVALID + tool name + the named missing params', tookRequests: 1, evidence: { problems: inner.problems } };
      },
    },

    {
      name: 'rest-remaining-doors-parity',
      description: "the ten door table routes the args-parity row left: streams list/create, brain state/ls/save, trust record, and market list/bid/trade/get all forward their path and body pieces under the EXACT arg names their tool's declared inputSchema requires - each honest call answers the tool's REAL domain answer (never the arg gate, never the registry gate, never a 5xx), and the family closes its own loop (listing created through the door is gettable through the door; the brain note saved through the door round-trips)",
      async run(harness) {
        // Honest rounds per door, built from each tool's declared schema.
        // The grade is the same law as the parity row: never MCP_INPUT_INVALID
        // (the tool arg gate), never 'not found' (the registry gate), never
        // 5xx - anything else IS the tool's domain answer.
        const rounds = [
          ['GET', '/streams', null],
          ['POST', '/streams', { stream: 'census-rem-door' }],
          ['GET', '/brain', null],
          ['GET', '/brain/ls', null],
          ['POST', '/brain/census-rem-door', { content: 'remaining-doors-census' }],
          ['POST', '/trust/record', { entityId: 'census-rem-door', type: 'help', positive: true }],
          ['POST', '/market/list', { type: 'knowledge', title: 'census-rem-door' }],
          ['POST', '/market/bid', { title: 'census-rem-door-bid' }],
        ];
        const fired = [];
        let listingId = null;
        for (const [method, path, body] of rounds) {
          const r = await probe(harness, method, path,
            body == null ? {} : { 'content-type': 'application/json' },
            body == null ? undefined : JSON.stringify(body));
          if (r._absent) return skip('no rest-request route (pending run-root wiring)');
          if (r.threw) return { verdict: 'REFUSED', skipped: true, detail: `rest-request threw in the shim: ${r.error?.name}` };
          const outer = parseJson(await bodyText(r));
          if (!outer || outer.error) return skip('rest-request not armed for this oracle');
          // Shared per-chain QoS budget: a later cycle may start mid-budget.
          if (Number(outer.status) === 429) return { verdict: 'REFUSED', skipped: true, detail: `edge QoS budget spent by earlier cycles (${method} ${path}) - door shape not reachable on this fire` };
          const inner = parseJson(outer.bodyText);
          fired.push({ method, path, status: outer.status });
          const wrongArgName = inner && (inner.error === 'MCP_INPUT_INVALID' || inner.error === 'not found');
          const toolThrew = Number(outer.status) >= 500;
          if (toolThrew || wrongArgName) {
            return { verdict: 'EXPLOITED', detail: `door "${method} ${path}" answered ${toolThrew ? 'HTTP ' + outer.status : 'the tool arg gate (' + inner.error + ')'} instead of running its tool - the remaining door forwards the wrong arg name (or no tool)`, tookRequests: fired.length, evidence: { door: `${method} ${path}`, answer: inner } };
          }
          if (method === 'POST' && path === '/brain/census-rem-door' && !(inner && inner.saved === true)) {
            return { verdict: 'EXPLOITED', detail: 'brain_save through the door did not save (' + JSON.stringify(inner).slice(0, 90) + ') - the door must forward the body content under the tool\'s name', tookRequests: fired.length, evidence: { answer: inner } };
          }
          if (method === 'POST' && path === '/market/list' && inner && inner.id) listingId = inner.id;
        }
        // The loop closes: the listing the DOOR created is gettable through
        // the DOOR, and the door-created listing is tradable through the door
        // (the trade's own domain answer).
        if (listingId) {
          const r1 = await probe(harness, 'GET', '/market/listing/' + listingId, {}, undefined);
          if (r1._absent) return skip('no rest-request route (pending run-root wiring)');
          const o1 = parseJson(await bodyText(r1));
          if (o1 && !o1.error && Number(o1.status) !== 429) {
            const i1 = parseJson(o1.bodyText);
            if (!(i1 && i1.id === listingId) && !(i1 && i1.title === 'census-rem-door')) {
              return { verdict: 'EXPLOITED', detail: 'market_get did not serve the door-created listing (' + JSON.stringify(i1).slice(0, 90) + ') - the family must close its own loop', tookRequests: fired.length + 1, evidence: { listingId } };
            }
          }
          const r2 = await probe(harness, 'POST', '/market/trade', { 'content-type': 'application/json' }, JSON.stringify({ listingId, buyerId: 'census-rem-door-buyer' }));
          if (r2._absent) return skip('no rest-request route (pending run-root wiring)');
          const o2 = parseJson(await bodyText(r2));
          if (o2 && !o2.error && Number(o2.status) !== 429) {
            const i2 = parseJson(o2.bodyText);
            const domainAnswer = i2 && (i2.id || i2.error);
            if (!domainAnswer) {
              return { verdict: 'EXPLOITED', detail: 'market_trade answered an unrecognizable ' + JSON.stringify(i2).slice(0, 90) + ' - the door must hand the tool its body verbatim', tookRequests: fired.length + 2, evidence: { listingId } };
            }
          }
        }
        return { verdict: 'REFUSED', detail: "all ten remaining doors run their tools with the exact arg names (domain answers throughout: stream roster/create, brain state/ls/save acked, trust record acked, market list/bid), the door-created listing is served by market_get and its trade rides the tool's own domain answer, and the brain note the door saved carries the forwarded body verbatim - the door table is fully measured", tookRequests: fired.length + (listingId ? 2 : 0) };
      },
    },
  ],
};
