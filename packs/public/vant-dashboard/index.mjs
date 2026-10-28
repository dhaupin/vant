/**
 * vant-dashboard pack — Phase A wire-surface slice (issue #249, S0→S1
 * campaign). Converts the dashboard auth-door wire pins into pack rows
 * riding the run root's `dash-auth` arm: the REAL handlers
 * (web/dashboard/functions/api/auth/{request,verify}-otp.ts + session.ts)
 * driven in-process by a strip-types probe child with an in-child KVStore
 * shim for the Bolete_KV binding and a capture sink sitting in the email
 * sender's webhook seat. Verdicts are vant's truth, never answer sheets;
 * a semantics the doors lack stays UNDECLARED and the rows honest-skip.
 *
 * Marker protocol: a shape body whose desired code is the 7-char token
 * "__CODE__" gets the code the capture sink caught in the SAME ride
 * substituted before the call (single-use codes are mailed exactly
 * once; the pack never touches the store). A shape with
 * useMintedCookie rides the ride's own minted Set-Cookie forward.
 *
 * House laws: fixed ids (no wall clock in any fixed id, no randomness in
 * the attack shape), one decision per attack, `skipped: true` marks
 * honest absence. Determinism note: the ~10-minute TTL and the 60-second
 * cooldown ride vant's own record fields through the in-child store, and
 * a full walk runs in milliseconds — deep inside both windows.
 */

import { createHmac, createHash } from 'node:crypto';

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** The probe child's marker protocol: one round trip, many shapes. */
async function probeDoors(harness, shapes) {
  let raw;
  try {
    const r = await harness.run('dash-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shapes }),
    });
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; } }
    else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
  if (!raw) return null;
  const j = parseJson(raw);
  if (!j || j.error) return null; // the probe child faulted - not a wall verdict
  return j;
}

function shapeResults(results, name) {
  const arr = (results && Array.isArray(results.results)) ? results.results : (Array.isArray(results) ? results : []);
  const hit = arr.find((r) => r && r.name === name);
  if (!hit || hit.status === 'THREW') return null;
  return { status: hit.status, body: parseJson(hit.bodyText), raw: hit.bodyText, headers: hit.headers || {} };
}

function capturedCode(results) {
  const arr = (results && Array.isArray(results.results)) ? results.results : [];
  const hit = arr.find((r) => r && r.name === 'capture-mint');
  const c = hit && hit.capture && hit.capture.code;
  return typeof c === 'string' ? c : null;
}

const EMAIL = 'pack-probe@vant-dash.local';
const COOKIE = 'bdash_session';

// --- (batch 3, 2026-10-27) the DASHBOARD-relay flavor -------------------
// web/dashboard's OWN r/2 intake faces (api/r/relay.ts + api/r/capabilities.ts)
// ride the run root's relay-edge child (edge 'dashrelay' / 'dashcaps') - the
// same WHATWG/WebCrypto probe the solo face uses, two doors per child. The
// lane laws differ from solo: the BROWSER lane hands INTENT (a vguest_ bearer,
// no signature) and forwards through the pod bridge; the RELAY lane is the
// HMAC header over the RAW body bytes; a COMPLETE payload seal is the keyless
// last mile. Door verbs on the bridge side: brain_write / context_heartbeat /
// brain_current / relay_ride / an arbitrary relay.call tool.
const DASH_CALL = 'https://relay-edge.local/api/r/relay';
const DASH_ROUTE = '/relay'; // the contract surface name the caps page carries (ROUTES.relay, dashboard kit)

// --- (batch 4, 2026-10-27) the small doors ------------------------------
// audit / users / properties / breakers + the MCP forward trio, through
// the dash-auth child (now driving all seven module faces). The users
// ride pins VANT_EMAIL_SALT so the rostered account hash is computable
// client-side: sha256('<salt>:<trimmed lowercase email>').slice(0, 32) -
// the same emailHashFor law accounts.ts pins; the roster ships the hash,
// never the address.
const UD_SALT = 'vant-dash-pack-ud-salt';
function emailHashOf(email, salt) {
  return createHash('sha256').update(String(salt) + ':' + String(email).trim().toLowerCase()).digest('hex').slice(0, 32);
}
const LEDGER_KINDS = [
  'auth.otp.requested', 'auth.otp.cooldown', 'auth.otp.verified', 'auth.otp.failed', 'auth.otp.burned',
  'auth.session.created', 'auth.session.destroyed', 'auth.account.disabled', 'auth.account.activated',
  'bridge.refused', 'bridge.unreachable',
];
const AUDIT_URL = 'https://dash-run-root.pages.dev/api/audit';
const USERS_URL = 'https://dash-run-root.pages.dev/api/users';
const DASH_GATE_SECRET = 'vant-dash-pack-relay-gate-0123456789abcdef';
const DASH_ENV_ON = { VANT_RELAY_ENABLED: '1', VANT_RELAY_GATE_KEY: DASH_GATE_SECRET };
const DASH_CT_SHAPE = 'a'.repeat(32) + ':' + 'b'.repeat(24) + ':' + 'c'.repeat(32) + ':' + 'd'.repeat(2);

function dashSign(body, secret) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

// (determinism law, 2026-10-28) the wall stamp rides the run root's
// vant-now route - the pack sources never read one. stampNow(harness)
// sets _runNow at the top of every row that composes envelopes; a row
// whose route is missing honest-skips.
let _runNow = null;
async function stampNow(harness) {
  try {
    const r = await harness.run('vant-now', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const text = (typeof r.body === 'string' && r.body) ? r.body : (r.response && typeof r.response.text === 'function' ? await r.response.text() : '');
    const j = JSON.parse(text);
    if (j && typeof j.now === 'number') { _runNow = j.now; return _runNow; }
  } catch (e0) { /* route absent: the caller honest-skips */ }
  return null;
}

function dashFrame(event, payload, extra) {
  const e = extra || {};
  return JSON.stringify({
    event,
    from: 'dash-pack-probe',
    ts: e.ts == null ? _runNow : e.ts,
    nonce: 'd' + (++e.n || (e.n = 1)),
    payload,
    v: { major: 2 },
  });
}

/** The relay-edge child ride (one round trip, many shapes). */
async function probeDashRelay(harness, spec) {
  let raw;
  try {
    const r = await harness.run('relay-edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(spec),
    });
    // harness.run returns a RECORD: the Response lives on r.response.
    if (typeof r.body === 'string') raw = r.body;
    else if (typeof r.text === 'function') { try { raw = await r.text(); } catch { raw = ''; } }
    else if (r.response && typeof r.response.text === 'function') {
      try { raw = await r.response.text(); } catch { raw = ''; }
    } else raw = '';
  } catch (e) {
    if (/no route registered as/i.test(String(e?.message))) return null;
    throw e;
  }
  if (!raw) return null;
  const j = parseJson(raw);
  if (!j || j.error) return null; // the child faulted - not a wall verdict
  return j;
}

function dashShape(results, name) {
  const arr = (results && Array.isArray(results.results)) ? results.results : [];
  const hit = arr.find((r) => r && r.name === name);
  if (!hit || hit.status === 'THREW') return null;
  return { status: hit.status, body: parseJson(hit.bodyText), raw: hit.bodyText };
}

/** A header-lane POST shape: HMAC over the body EXACTLY as shipped. */
function dashSigned(name, body, env) {
  // dashFrame returns the EXACT body string; sign and ship it verbatim
  // (the edge verifies over the raw UTF-8 bytes - no re-serialization).
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { name, edge: 'dashrelay', method: 'POST', url: DASH_CALL, env: env || DASH_ENV_ON,
    request: { method: 'POST', url: DASH_CALL, headers: { 'content-type': 'application/json', 'X-Signature-256': dashSign(text, DASH_GATE_SECRET) }, body: text } };
}

/** A browser-lane shape: vguest bearer, NO signature (the intent lane). */
function dashBrowser(name, payload, opts) {
  const o = opts || {};
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { name, edge: 'dashrelay', method: 'POST', url: DASH_CALL, env: o.env || DASH_ENV_ON,
    request: { method: 'POST', url: DASH_CALL, headers: { 'content-type': 'application/json', authorization: 'Bearer vguest_dash-pack-intent-lane' }, body: text } };
}

// (batch 2) the bridge knee's three source lanes, each carrying a
// DISTINCT token so the resolution order is provable by hash equality —
// the pack grades the token's identity, the details never quote it.
const TOKEN_H = 'vguest_auth-header-lane-vant-dash-pack';   // Authorization: Bearer
const TOKEN_B = 'vguest_bound-session-lane-vant-dash-pack'; // server-side session binding
const TOKEN_R = 'vguest_raw-cookie-lane-vant-dash-pack';    // unbound MVP cookie
const PROP_A = 'pod-alpha';
const PROP_B = 'pod-beta';

let hashCache = null;
async function tokenHash(token) {
  if (!hashCache) hashCache = await import('node:crypto');
  return hashCache.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** One door call. `env` selects the shim seats: bolete (KV present),
 * sink (email capture standing in for the configured sender). */
function call(name, kwargs) {
  return {
    name,
    env: Object.assign({ bolete: true }, kwargs.env || {}),
    request: {
      endpoint: kwargs.endpoint,
      method: kwargs.method || 'POST',
      headers: kwargs.headers || {},
      body: kwargs.body == null ? null : JSON.stringify(kwargs.body),
    },
  };
}

function cookieSnapshot(headers, cookieName) {
  const name = cookieName || COOKIE;
  const set = headers['set-cookie'] || '';
  return {
    present: set.indexOf(name + '=') !== -1,
    bsess: new RegExp(name + '=[A-Za-z0-9_-]{8,}').test(set),
    httpOnly: /httponly/i.test(set),
    secure: /secure/i.test(set),
    strict: /samesite=strict/i.test(set),
  };
}

export default {
  name: 'vant-dashboard',
  description: 'dashboard auth doors driven in-process: the store-absence state answers typed 503, hostile bodies floor at 400, the mint lane is typed and cooldown-budgeted, the verify handshake mints a server-side session under the cookie discipline law, and the attempt budget burns the code single-use',

  attacks: [
    {
      name: 'store-absence-fail-closed',
      description: 'no Bolete_KV binding: request-otp, verify-otp, and the session probe all answer 503 E_STORE_UNCONFIGURED typed - the deployment truth (store not configured) is a state the UI renders, never a crash and never a fake record',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('req-no-store', { env: { bolete: false }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('ver-no-store', { env: { bolete: false }, endpoint: 'verify-otp', body: { email: EMAIL, code: '123456' } }),
          { name: 'sess-no-store', env: { bolete: false }, request: { endpoint: 'session', method: 'GET', headers: { cookie: COOKIE + '=bsess_missing' } } },
        ]);
        if (!results) return skip('dash-auth not armed (pending run-root wiring)');
        const req = shapeResults(results, 'req-no-store');
        const ver = shapeResults(results, 'ver-no-store');
        const sess = shapeResults(results, 'sess-no-store');
        if (!req || !ver || !sess) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the no-store shapes - absence must be an answer, not a fault', tookRequests: 3 };
        }
        for (const [door, s] of Object.entries({ 'request-otp': req, 'verify-otp': ver, session: sess })) {
          if (s.status !== 503 || !s.body || s.body.error !== 'E_STORE_UNCONFIGURED') {
            return { verdict: 'EXPLOITED', detail: `store-missing ${door} answered ${s.status}${s.body && s.body.error ? '/' + s.body.error : ''} - the unconfigured store must be a typed 503 everywhere it is touched`, tookRequests: 3, evidence: { door, status: s.status } };
          }
        }
        return { verdict: 'REFUSED', detail: 'every door answers E_STORE_UNCONFIGURED 503 typed with no binding - an absent store is a loud state, not a crash', tookRequests: 3 };
      },
    },

    {
      name: 'bad-body-floor',
      description: 'hostile bodies floor typed: bent JSON and malformed/missing addresses answer 400 (E_BAD_BODY / E_EMAIL_INVALID), and a codeless verify never mints (typed 401) - the auth wire never becomes a server fault and never mints against junk',
      async run(harness) {
        const shapes = [
          { name: 'bent-json', env: { bolete: true }, request: { endpoint: 'request-otp', method: 'POST', body: '{"email":' } },
          call('no-email-field', { endpoint: 'request-otp', body: {} }),
          call('not-an-email', { endpoint: 'request-otp', body: { email: 'not-an-email' } }),
          call('no-code-field', { endpoint: 'verify-otp', body: { email: EMAIL } }),
          call('space-email', { endpoint: 'verify-otp', body: { email: 'a b@vant-dash.local', code: '123456' } }),
        ];
        const results = await probeDoors(harness, shapes);
        if (!results) return skip('dash-auth not armed');
        const bent = shapeResults(results, 'bent-json');
        const noEmail = shapeResults(results, 'no-email-field');
        const bad = shapeResults(results, 'not-an-email');
        const noCode = shapeResults(results, 'no-code-field');
        const spaced = shapeResults(results, 'space-email');
        if (!bent || !noEmail || !bad || !noCode || !spaced) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the body-floor shapes - hostile bodies must be answers', tookRequests: 5 };
        }
        if (bent.status !== 400 || !bent.body || bent.body.error !== 'E_BAD_BODY') {
          return { verdict: 'EXPLOITED', detail: `bent JSON answered ${bent.status} - malformed envelopes floor at 400 E_BAD_BODY`, tookRequests: 5, evidence: { status: bent.status } };
        }
        if (noEmail.status !== 400 || !noEmail.body || noEmail.body.error !== 'E_EMAIL_INVALID') {
          return { verdict: 'EXPLOITED', detail: `body without an email answered ${noEmail.status} - a missing address is an invalid address, typed`, tookRequests: 5, evidence: { status: noEmail.status } };
        }
        if (bad.status !== 400 || !bad.body || bad.body.error !== 'E_EMAIL_INVALID') {
          return { verdict: 'EXPLOITED', detail: `junk address answered ${bad.status} - malformed addresses never mint and never fault`, tookRequests: 5, evidence: { status: bad.status } };
        }
        // vant's truth (measured): a body with an email but NO code does
        // NOT get a 400 - it walks verify and refuses typed (the empty
        // candidate never opens anything): 401 E_OTP_MISMATCH live code /
        // E_OTP_EXPIRED absent row. The typed floor is the 4xx family.
        if (noCode.status !== 401 || !noCode.body || (noCode.body.error !== 'E_OTP_MISMATCH' && noCode.body.error !== 'E_OTP_EXPIRED')) {
          return { verdict: 'EXPLOITED', detail: `verify without a code answered ${noCode.status}${noCode.body ? '/' + noCode.body.error : ''} - the empty candidate must refuse typed 401, never mint`, tookRequests: 5, evidence: { status: noCode.status } };
        }
        if (spaced.status !== 400) {
          return { verdict: 'EXPLOITED', detail: `whitespace address answered ${spaced.status} on verify - the address shape law holds on both doors`, tookRequests: 5, evidence: { status: spaced.status } };
        }
        return { verdict: 'REFUSED', detail: 'bent JSON / missing address / malformed addresses answered 400 typed and the codeless verify refused typed 401 - hostile bodies never became server faults', tookRequests: 5 };
      },
    },

    {
      name: 'mint-lane-typed-and-cooldown',
      description: 'the mint lane with NO sender configured: the request answers 503 E_EMAIL_UNCONFIGURED typed (the mint is real, the delivery is honestly absent), and the SECOND request for the same address rides the live per-email cooldown (429 E_OTP_COOLDOWN) - unavailability is loud, and the wire never fakes a "sent"',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('mint-no-sender', { env: { sink: false }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('mint-again', { env: { sink: false }, endpoint: 'request-otp', body: { email: EMAIL } }),
        ]);
        if (!results) return skip('dash-auth not armed');
        const first = shapeResults(results, 'mint-no-sender');
        const second = shapeResults(results, 'mint-again');
        if (!first || !second) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the mint lanes - the mint schedule must be answers', tookRequests: 2 };
        }
        if (first.status !== 503 || !first.body || first.body.error !== 'E_EMAIL_UNCONFIGURED') {
          return { verdict: 'EXPLOITED', detail: `unconfigured sender answered ${first.status} - a missing sender is a typed 503, never a fake ok`, tookRequests: 2, evidence: { status: first.status } };
        }
        if (second.status !== 429 || !second.body || second.body.error !== 'E_OTP_COOLDOWN') {
          return { verdict: 'EXPLOITED', detail: `repeat request answered ${second.status} - the per-email cooldown rides the FIRST request (an undelivered mint still budgets), typed 429`, tookRequests: 2, evidence: { status: second.status } };
        }
        return { verdict: 'REFUSED', detail: 'no-sender answered 503 typed and the repeat request rode the cooldown 429 - the mint lane is honest about delivery and strict about budget', tookRequests: 2 };
      },
    },

    {
      name: 'session-mint-and-cookie-discipline',
      description: 'the full handshake in one ride: mint (the code exists exactly once - in the mail), WRONG code 401 E_OTP_MISMATCH typed, RIGHT code 200 with a bsess_* HttpOnly+Secure+SameSite=Strict cookie, the session probe reads that identity with the SAME cookie, and a cookieless probe answers 401 E_NO_SESSION - identity is server-side, the cookie never carries the account',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('verify-wrong', { endpoint: 'verify-otp', body: { email: EMAIL, code: '000000' } }),
          call('verify-right', { endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
          { name: 'session-read', env: { bolete: true }, request: { endpoint: 'session', method: 'GET', useMintedCookie: true } },
          { name: 'session-anon', env: { bolete: true }, request: { endpoint: 'session', method: 'GET' } },
        ]);
        if (!results) return skip('dash-auth not armed');
        if (!capturedCode(results)) {
          return { verdict: 'EXPLOITED', detail: 'the capture sink saw no code - a real mint must deliver exactly once through the configured sender', tookRequests: 1 };
        }
        const wrong = shapeResults(results, 'verify-wrong');
        const right = shapeResults(results, 'verify-right');
        const read = shapeResults(results, 'session-read');
        const anon = shapeResults(results, 'session-anon');
        if (!wrong || !right || !read || !anon) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the verify/session lanes - the handshake must be answers', tookRequests: 5 };
        }
        if (wrong.status !== 401 || !wrong.body || wrong.body.error !== 'E_OTP_MISMATCH') {
          return { verdict: 'EXPLOITED', detail: `wrong code answered ${wrong.status} - a live code with a wrong candidate refuses E_OTP_MISMATCH 401 typed`, tookRequests: 5, evidence: { status: wrong.status } };
        }
        if (right.status !== 200 || !right.body || right.body.ok !== true) {
          return { verdict: 'EXPLOITED', detail: `the right code answered ${right.status} - the correct candidate opens the door`, tookRequests: 5, evidence: { status: right.status } };
        }
        const c = cookieSnapshot(right.headers);
        if (!c.present || !c.bsess || !c.httpOnly || !c.secure || !c.strict) {
          return { verdict: 'EXPLOITED', detail: `the mint cookie failed its discipline (present=${c.present} bsess=${c.bsess} httponly=${c.httpOnly} secure=${c.secure} strict=${c.strict}) - the session cookie is HttpOnly+Secure+SameSite=Strict and its id is a bsess_*`, tookRequests: 5, evidence: c };
        }
        if (anon.status !== 401 || !anon.body || anon.body.error !== 'E_NO_SESSION') {
          return { verdict: 'EXPLOITED', detail: `a cookieless session probe answered ${anon.status} - identity with no cookie is E_NO_SESSION 401 typed`, tookRequests: 5, evidence: { status: anon.status } };
        }
        if (read.status !== 200 || !read.body || (read.body.role !== 'admin' && read.body.role !== 'viewer')) {
          return { verdict: 'EXPLOITED', detail: `the same-cookie session probe answered ${read.status} - the minted session must serve its role server-side`, tookRequests: 5, evidence: { status: read.status } };
        }
        return { verdict: 'REFUSED', detail: 'wrong 401 typed / right 200 + bsess HttpOnly-Secure-Strict cookie / same-cookie read serves the role / anon probe 401 - the server-side session discipline holds', tookRequests: 5 };
      },
    },

    {
      name: 'attempt-budget-burn',
      description: 'the verify budget burns: wrong #1-4 answer mismatch 401, wrong #5 deletes the code and answers E_OTP_BURNED, and every later ask (wrong #6 and the mailed code) refuses typed E_OTP_EXPIRED - a burned code never resurrects',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          ...[1, 2, 3, 4, 5, 6].map((i) => call('wrong-' + String(i - 1).padStart(2, '0'), { env: { bolete: true }, endpoint: 'verify-otp', body: { email: EMAIL, code: '99900' + String(i) } })),
          call('correct-after-burn', { env: { bolete: true }, endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
        ]);
        if (!results) return skip('dash-auth not armed');
        if (capturedCode(results) === null) {
          return { verdict: 'EXPLOITED', detail: 'the capture sink saw no code - the burn walk needs a real mint', tookRequests: 1 };
        }
        const walked = (results && Array.isArray(results.results)) ? results.results : [];
        const wrongRows = walked.filter((r) => /^wrong-/.test(r && r.name));
        const correctLater = shapeResults(results, 'correct-after-burn');
        if (wrongRows.length !== 6 || !correctLater) {
          return { verdict: 'EXPLOITED', detail: 'probe threw or short-served the burn walk - answers, not faults', tookRequests: wrongRows.length + 1 };
        }
        // vant's truth (measured on the real verify seam): the budget
        // decrements THEN burns - wrong #1-4 answer E_OTP_MISMATCH, wrong
        // #5 deletes the row and answers E_OTP_BURNED, and every later ask
        // (wrong #6, the mailed code) answers E_OTP_EXPIRED typed.
        const at = (i) => shapeResults(results, 'wrong-' + String(i).padStart(2, '0'));
        for (let i = 0; i < 4; i++) {
          const s = at(i);
          if (!s || s.status !== 401 || !s.body || s.body.error !== 'E_OTP_MISMATCH') {
            return { verdict: 'EXPLOITED', detail: `wrong #${i + 1} answered ${s && s.status}${s && s.body ? '/' + s.body.error : ''} - the budget's live attempts are typed mismatches`, tookRequests: 7, evidence: { attempt: i + 1, status: s && s.status } };
          }
        }
        const burn = at(4);
        if (!burn || burn.status !== 401 || !burn.body || burn.body.error !== 'E_OTP_BURNED') {
          return { verdict: 'EXPLOITED', detail: `wrong #5 answered ${burn && burn.status}${burn && burn.body ? '/' + (burn && burn.body.error) : ''} - exhaustion deletes the code and answers E_OTP_BURNED typed`, tookRequests: 7, evidence: { status: burn && burn.status } };
        }
        const sixth = at(5);
        if (sixth.status !== 401 || !sixth.body || sixth.body.error !== 'E_OTP_EXPIRED') {
          return { verdict: 'EXPLOITED', detail: `wrong #6 answered ${sixth.status}${sixth.body ? '/' + sixth.body.error : ''} - past the burn the row is gone and the refusal stays typed (E_OTP_EXPIRED)`, tookRequests: 7, evidence: { status: sixth.status } };
        }
        if (correctLater.status !== 401 || !correctLater.body || correctLater.body.error !== 'E_OTP_EXPIRED') {
          return { verdict: 'EXPLOITED', detail: `the mailed code after burn answered ${correctLater.status}${correctLater.body ? '/' + correctLater.body.error : ''} - a burned code never resurrects (the row is deleted; E_OTP_EXPIRED is the typed truth)`, tookRequests: 7, evidence: { status: correctLater.status } };
        }
        return { verdict: 'REFUSED', detail: 'four downs answer mismatch 401, the fifth answers E_OTP_BURNED typed, and both later asks (wrong #6 + the mailed code) refuse E_OTP_EXPIRED typed - the attempt budget is the door', tookRequests: 7 };
      },
    },


    // ---------------- (batch 2, 2026-10-25) the bridge knee -------------

    {
      name: 'token-source-order',
      description: 'the bridged-token resolution order is provable and it holds: three lanes planted with distinct tokens (Authorization header / server-side bound session / raw MVP cookie) - the answer is the header token with the session live, and with the header gone the BOUND token outranks the raw cookie',
      async run(harness) {
        const hashH = await tokenHash(TOKEN_H);
        const hashB = await tokenHash(TOKEN_B);
        const ride = [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('verify-ok', { endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
          { name: 'bind-token', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', useMintedCookie: true, property: PROP_A, body: JSON.stringify({ token: TOKEN_B }) } },
          { name: 'probe-all-three', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_A, useMintedCookie: true, headers: { cookie: 'vg_session_' + PROP_A + '=' + TOKEN_R, authorization: 'Bearer ' + TOKEN_H } } },
          { name: 'probe-bound-vs-raw', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_A, useMintedCookie: true, headers: { cookie: 'vg_session_' + PROP_A + '=' + TOKEN_R } } },
        ];
        const results = await probeDoors(harness, ride);
        if (!results) return skip('dash-auth not armed (batch 2 arm pending)');
        void hashH;
        const bind = shapeResults(results, 'bind-token');
        const all3 = shapeResults(results, 'probe-all-three');
        const boundVsRaw = shapeResults(results, 'probe-bound-vs-raw');
        if (!bind || !all3 || !boundVsRaw) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the order lanes - the resolution must be answers', tookRequests: 5 };
        }
        if (!bind.body || bind.body.ok !== true || bind.body.bound !== true) {
          return { verdict: 'EXPLOITED', detail: `token binding answered ${bind.status}${bind.body ? '/' + JSON.stringify(bind.body).slice(0, 80) : ''} - a live session must bind the token SERVER-SIDE (ok, bound:true)`, tookRequests: 5, evidence: { status: bind.status } };
        }
        if (!all3.body || all3.body.present !== true || all3.body.hash !== hashH) {
          return { verdict: 'EXPLOITED', detail: `probe-all-three resolved ${all3.body && all3.body.present ? 'a DIFFERENT token than the header lane' : 'nothing'} - with an Authorization header present it must win over both the bound token and the raw cookie`, tookRequests: 5, evidence: { present: all3.body && all3.body.present } };
        }
        if (!boundVsRaw.body || boundVsRaw.body.present !== true || boundVsRaw.body.hash !== hashB) {
          return { verdict: 'EXPLOITED', detail: `probe-bound-vs-raw resolved ${boundVsRaw.body && boundVsRaw.body.present ? 'the raw-cookie lane' : 'nothing'} - with no header the SERVER-SIDE bound token outranks the raw MVP cookie`, tookRequests: 5, evidence: { present: boundVsRaw.body && boundVsRaw.body.present } };
        }
        return { verdict: 'REFUSED', detail: 'header wins with all three lanes live; header gone, the server-side bound token outranks the raw cookie - the resolution order holds', tookRequests: 5 };
      },
    },

    {
      name: 'bound-token-property-scoped',
      description: 'the server-side binding is scoped by property: pod-alpha resolves exactly the token bound for it and pod-beta (never bound) resolves nothing - a bound token never leaks across properties, and an unbound probe never mints one',
      async run(harness) {
        const hashB = await tokenHash(TOKEN_B);
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('verify-ok', { endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
          { name: 'bind-a', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', useMintedCookie: true, property: PROP_A, body: JSON.stringify({ token: TOKEN_B }) } },
          { name: 'probe-a', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_A, useMintedCookie: true, headers: {} } },
          { name: 'probe-b', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_B, useMintedCookie: true, headers: {} } },
        ]);
        if (!results) return skip('dash-auth not armed');
        const bindA = shapeResults(results, 'bind-a');
        const probeA = shapeResults(results, 'probe-a');
        const probeB = shapeResults(results, 'probe-b');
        if (!bindA || !probeA || !probeB) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the scope lanes - answers, not faults', tookRequests: 5 };
        }
        if (!bindA.body || bindA.body.bound !== true) {
          return { verdict: 'EXPLOITED', detail: `the binding ride answered bound=${bindA.body && bindA.body.bound}${bindA.body ? '/' + JSON.stringify(bindA.body).slice(0, 60) : ''} - the walk needs a real server-side binding`, tookRequests: 5, evidence: { status: bindA.status } };
        }
        if (!probeA.body || probeA.body.present !== true || probeA.body.hash !== hashB) {
          return { verdict: 'EXPLOITED', detail: `pod-alpha resolved ${probeA.body && probeA.body.present ? 'a DIFFERENT token than its bound lane' : 'nothing'} - the bound property must resolve its token`, tookRequests: 5, evidence: { present: probeA.body && probeA.body.present } };
        }
        if (probeB.body && probeB.body.present) {
          return { verdict: 'EXPLOITED', detail: `pod-beta resolved a token it never bound (hash ${String(probeB.body.hash || '').slice(0, 8)}) - the server-side binding must stay property-scoped, no cross-property leak`, tookRequests: 5, evidence: { present: probeB.body.present } };
        }
        return { verdict: 'REFUSED', detail: 'pod-alpha resolves its bound token; pod-beta resolves nothing - the binding is scoped exactly to its property', tookRequests: 5 };
      },
    },

    {
      name: 'token-intake-binding-law',
      description: 'the token intake is shape-gated: a malformed property id, a non-vguest string, and an over-512 token all answer 400 typed - and a legit intake with a live session binds SERVER-SIDE (ok, bound:true) with NO token-carrying cookie minted',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('verify-ok', { endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
          { name: 'est-bad-property', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', property: 'BAD PROPERTY!!', body: JSON.stringify({ token: TOKEN_B }) } },
          { name: 'est-not-a-token', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', property: PROP_A, body: JSON.stringify({ token: 'not-a-guest-token' }) } },
          { name: 'est-oversized', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', property: PROP_A, body: JSON.stringify({ token: 'vguest_' + 'x'.repeat(512) }) } },
          { name: 'est-bound', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', useMintedCookie: true, property: PROP_A, body: JSON.stringify({ token: TOKEN_B }) } },
        ]);
        if (!results) return skip('dash-auth not armed');
        const badProp = shapeResults(results, 'est-bad-property');
        const notToken = shapeResults(results, 'est-not-a-token');
        const oversized = shapeResults(results, 'est-oversized');
        const bound = shapeResults(results, 'est-bound');
        if (!badProp || !notToken || !oversized || !bound) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the intake law lanes - answers, not faults', tookRequests: 6 };
        }
        if (badProp.status !== 400) {
          return { verdict: 'EXPLOITED', detail: `malformed property answered ${badProp.status} - the intake shape-gates the property id typed`, tookRequests: 6, evidence: { status: badProp.status } };
        }
        if (notToken.status !== 400 || oversized.status !== 400) {
          return { verdict: 'EXPLOITED', detail: `non-vguest/oversized token answered ${notToken.status}/${oversized.status} - the intake only eats vguest_* under 512, typed 400`, tookRequests: 6, evidence: { notToken: notToken.status, oversized: oversized.status } };
        }
        if (!bound.body || bound.body.ok !== true || bound.body.bound !== true) {
          return { verdict: 'EXPLOITED', detail: `the legit intake answered ${bound.status} - a live session binds the token server-side (bound:true)`, tookRequests: 6, evidence: { status: bound.status } };
        }
        if (bound.headers && /vguest_/.test(String(bound.headers['set-cookie'] || ''))) {
          return { verdict: 'EXPLOITED', detail: 'the bound intake minted a TOKEN-CARRYING cookie - server-side binding never ships the token to the client', tookRequests: 6 };
        }
        return { verdict: 'REFUSED', detail: 'bad property / non-vguest / oversized all 400 typed; the legit intake binds server-side with no token-riding cookie - the intake law holds', tookRequests: 6 };
      },
    },

    {
      name: 'raw-cookie-fallback-hygiene',
      description: 'the unbound MVP fallback stays honest: with NO account session the intake answers bound:false and ships the raw cookie with FULL hygiene (HttpOnly+Secure+SameSite=Strict), the bridged probe resolves exactly that token, and a malformed cookie escape answers typed null - never a crash',
      async run(harness) {
        const hashR = await tokenHash(TOKEN_R);
        const results = await probeDoors(harness, [
          { name: 'est-raw', env: { bolete: true }, request: { endpoint: 'bridge-establish', method: 'POST', property: PROP_A, body: JSON.stringify({ token: TOKEN_R }) } },
          { name: 'probe-raw', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_A, headers: { cookie: 'vg_session_' + PROP_A + '=' + TOKEN_R } } },
          { name: 'junk-cookie', env: { bolete: true }, request: { endpoint: 'bridge-pod-token', method: 'POST', property: PROP_A, headers: { cookie: 'vg_session_' + PROP_A + '=a%' } } },
        ]);
        if (!results) return skip('dash-auth not armed');
        const est = shapeResults(results, 'est-raw');
        const probe = shapeResults(results, 'probe-raw');
        const junk = shapeResults(results, 'junk-cookie');
        if (!est || !probe || !junk) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the fallback lanes - answers, not faults', tookRequests: 3 };
        }
        if (!est.body || est.body.bound !== false) {
          return { verdict: 'EXPLOITED', detail: `raw intake answered bound=${est.body && est.body.bound} - with no account session the honest answer is bound:false`, tookRequests: 3, evidence: { status: est.status } };
        }
        const csnap = cookieSnapshot(est.headers, 'vg_session_' + PROP_A);
        if (!csnap.present || !csnap.httpOnly || !csnap.secure || !csnap.strict) {
          return { verdict: 'EXPLOITED', detail: `the raw cookie failed hygiene (present=${csnap.present} httponly=${csnap.httpOnly} secure=${csnap.secure} strict=${csnap.strict}) - the MVP fallback obeys the same cookie discipline`, tookRequests: 3, evidence: csnap };
        }
        if (!probe.body || probe.body.present !== true || probe.body.hash !== hashR) {
          return { verdict: 'EXPLOITED', detail: `the raw-cookie probe resolved ${probe.body && probe.body.present ? 'a DIFFERENT token than the cookie lane' : 'nothing'} - the fallback cookie must be resolvable unbound`, tookRequests: 3, evidence: { present: probe.body && probe.body.present } };
        }
        if (junk.body && junk.body.present) {
          return { verdict: 'EXPLOITED', detail: 'a malformed cookie escape resolved a token - an undecodable pair is not counted, never guessed', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: 'bound:false + full cookie hygiene + the raw token resolves + the junk escape refuses typed-null - the unbound fallback stays honest', tookRequests: 3 };
      },
    },

    {
      name: 'admin-gate-typed-ladder',
      description: 'the admin gate renders states, never crashes: no cookie 401 E_NO_SESSION, a forged sid 401, a viewer session 403 E_FORBIDDEN, the admin session passes (ok, role admin), and an unconfigured store answers 503 E_STORE_UNCONFIGURED - the typed ladder at every rung',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: 'admin-probe@vant-dash.local' } }),
          call('ok-admin', { endpoint: 'verify-otp', body: { email: 'admin-probe@vant-dash.local', code: '__CODE__' } }),
          { name: 'capture-mint-2', env: { bolete: true, sink: true }, request: { endpoint: 'request-otp', method: 'POST', body: JSON.stringify({ email: 'viewer-probe@vant-dash.local' }) } },
          { name: 'ok-viewer', env: { bolete: true }, request: { endpoint: 'verify-otp', method: 'POST', body: JSON.stringify({ email: 'viewer-probe@vant-dash.local', code: '__CODE__' }) } },
          { name: 'gate-anon', env: { bolete: true }, request: { endpoint: 'auth-gate', method: 'POST', headers: {} } },
          { name: 'gate-forged', env: { bolete: true }, request: { endpoint: 'auth-gate', method: 'POST', headers: { cookie: COOKIE + '=bsess_forged-id-0123456' } } },
          { name: 'gate-viewer', env: { bolete: true }, request: { endpoint: 'auth-gate', method: 'POST', useCookie: 'ok-viewer', headers: {} } },
          { name: 'gate-admin', env: { bolete: true }, request: { endpoint: 'auth-gate', method: 'POST', useCookie: 'ok-admin', headers: {} } },
          { name: 'gate-no-store', env: { bolete: false }, request: { endpoint: 'auth-gate', method: 'POST', headers: { cookie: COOKIE + '=bsess_anything' } } },
        ]);
        if (!results) return skip('dash-auth not armed');
        const rows = (Array.isArray(results.results) ? results.results : []);
        const find = (n) => rows.find((r) => r && r.name === n);
        const adminCookieRaw = find('ok-admin') && find('ok-admin').headers && find('ok-admin').headers['set-cookie'];
        const viewerCookieRaw = find('ok-viewer') && find('ok-viewer').headers && find('ok-viewer').headers['set-cookie'];
        if (!adminCookieRaw || !viewerCookieRaw) {
          return { verdict: 'EXPLOITED', detail: 'the mint rides did not produce session cookies - the ladder needs both roles (first account admin, second viewer)', tookRequests: 4 };
        }
        const anon = shapeResults(results, 'gate-anon');
        const forged = shapeResults(results, 'gate-forged');
        const viewer = shapeResults(results, 'gate-viewer');
        const admin = shapeResults(results, 'gate-admin');
        const noStore = shapeResults(results, 'gate-no-store');
        if (!anon || !forged || !viewer || !admin || !noStore) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the ladder - every rung must answer', tookRequests: 9 };
        }
        if (anon.status !== 401 || !anon.body || anon.body.error !== 'E_NO_SESSION') {
          return { verdict: 'EXPLOITED', detail: `no-cookie answered ${anon.status} - the gate opens at 401 E_NO_SESSION typed`, tookRequests: 9, evidence: { status: anon.status } };
        }
        if (forged.status !== 401) {
          return { verdict: 'EXPLOITED', detail: `a forged sid answered ${forged.status} - an unknown session is E_NO_SESSION, not a pass`, tookRequests: 9, evidence: { status: forged.status } };
        }
        if (viewer.status !== 403 || !viewer.body || viewer.body.error !== 'E_FORBIDDEN') {
          return { verdict: 'EXPLOITED', detail: `a viewer session answered ${viewer.status} - a live non-admin session is E_FORBIDDEN 403 typed`, tookRequests: 9, evidence: { status: viewer.status } };
        }
        if (admin.status !== 'OK' || !admin.body || admin.body.ok !== true || admin.body.role !== 'admin') {
          return { verdict: 'EXPLOITED', detail: `the admin session answered ${admin.status} - the gate must pass the role through (ok, role admin)`, tookRequests: 9, evidence: { status: admin.status } };
        }
        if (noStore.status !== 503 || !noStore.body || noStore.body.error !== 'E_STORE_UNCONFIGURED') {
          return { verdict: 'EXPLOITED', detail: `no store answered ${noStore.status} - the gate's store leg is a typed 503`, tookRequests: 9, evidence: { status: noStore.status } };
        }
        return { verdict: 'REFUSED', detail: 'anon 401 / forged 401 / viewer 403 / admin passes with the role / no-store 503 - the typed ladder holds at every rung', tookRequests: 9 };
      },
    },

    // ---------------- (batch 3, 2026-10-27) the DASHBOARD-relay flavor ----
    // web/dashboard has its OWN r/2 intake + caps page (a dashboard-relay
    // flavor, pass-236 ruling). Both ride the run root's relay-edge child
    // (edge 'dashrelay' / 'dashcaps') - the same WHATWG + WebCrypto probe
    // the solo face uses, two doors per child. The lane map differs from
    // the solo face: the BROWSER lane hands INTENT (a vguest_ bearer, no
    // signature) and forwards through the pod bridge; the RELAY lane is
    // the HMAC header over the RAW body bytes; a COMPLETE payload seal is
    // the keyless last mile. Bridge-side door verbs: brain_write,
    // context_heartbeat, brain_current, relay_ride, any relay.call tool.

    {
      name: 'dash-relay-gates-fail-closed',
      description: 'the dashboard-relay posture gates hold: the posture env off answers the pod-parity raw 404 on BOTH the intake and the caps page, the on caps page reads flavor dashboard-relay with its gate declared ready, carries NO gate secret anywhere and names its POST surface, and a relay lane POST on a deploy with no gate secret configured fails closed at 503 naming VANT_RELAY_GATE_KEY',
      async run(harness) {
        const results = await probeDashRelay(harness, {
          shapes: [
            { name: 'posture-off', edge: 'dashrelay', method: 'POST', url: DASH_CALL, env: {}, request: { method: 'POST', url: DASH_CALL, headers: {}, body: '{}' } },
            { name: 'caps-off', edge: 'dashcaps', env: {}, request: { method: 'GET', headers: {} } },
            { name: 'caps-on', edge: 'dashcaps', env: DASH_ENV_ON, request: { method: 'GET', headers: {} } },
            { name: 'keygate-no-secret', edge: 'dashrelay', env: { VANT_RELAY_ENABLED: '1' }, request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"event":"relay.hop"}' } },
          ],
        });
        if (!results) return skip('relay-edge not armed with the dash doors (batch 3 arm pending)');
        const posture = dashShape(results, 'posture-off');
        const capsOff = dashShape(results, 'caps-off');
        const capsOn = dashShape(results, 'caps-on');
        const keygate = dashShape(results, 'keygate-no-secret');
        if (!posture || !capsOff || !capsOn || !keygate) return { verdict: 'EXPLOITED', detail: 'probe threw on the posture lane - every rung must answer', tookRequests: 4 };
        if (posture.status !== 404 || !posture.body || posture.body.error !== 'Not Found') {
          return { verdict: 'EXPLOITED', detail: 'posture-off answered ' + posture.status + ' - an unmounted relay routes nowhere, the pod-parity raw 404', tookRequests: 4, evidence: { status: posture.status } };
        }
        if (capsOff.status !== 404) {
          return { verdict: 'EXPLOITED', detail: 'caps-off answered ' + capsOff.status + ' - the caps page rides the posture env: off means routed nowhere', tookRequests: 4, evidence: { status: capsOff.status } };
        }
        if (capsOn.status !== 200 || !capsOn.body || capsOn.body.flavor !== 'dashboard-relay' || capsOn.body.gateReady !== true) {
          return { verdict: 'EXPLOITED', detail: 'caps-on answered ' + capsOn.status + (capsOn.body ? '/flavor=' + capsOn.body.flavor : '') + ' - the posture proof must read dashboard-relay with its gate ready', tookRequests: 4, evidence: { status: capsOn.status } };
        }
        if (capsOn.raw.indexOf(DASH_GATE_SECRET) !== -1) {
          return { verdict: 'EXPLOITED', detail: 'the caps page echoed the gate secret - secrets NEVER ride a caps page (the paranoid law, parity with the solo face)', tookRequests: 4 };
        }
        if (!(capsOn.body.surface || []).some((s) => String(s) === 'POST ' + DASH_ROUTE)) {
          return { verdict: 'EXPLOITED', detail: 'the caps page named no POST intake surface - the contract surface shape (POST /relay) is what a client reads', tookRequests: 4, evidence: { surface: capsOn.body.surface } };
        }
        if (keygate.status !== 503 || !keygate.body || String(keygate.body.error || '').indexOf('VANT_RELAY_GATE_KEY') === -1) {
          return { verdict: 'EXPLOITED', detail: 'keygate-no-secret answered ' + keygate.status + ' - enabled without a secret serves NOTHING until the operator sets VANT_RELAY_GATE_KEY', tookRequests: 4, evidence: { status: keygate.status } };
        }
        return { verdict: 'REFUSED', detail: 'posture off is the raw 404 on both doors, the caps page proves the dashboard-relay posture secrets-free with its POST surface named, and the secretless relay lane 503s typed - the gates fail closed', tookRequests: 4 };
      },
    },

    {
      name: 'dash-relay-hmac-header-lane-laws',
      description: 'the relay lane is HMAC-gated over the RAW body bytes and the hop guards ride typed INSIDE the 200 acks: a signatureless envelope answers 401 naming X-Signature-256, a wrong sig 401s, an http hop origin refuses E_RELAY_BAD_ORIGIN naming https, a loopback target refuses E_RELAY_BAD_ORIGIN, a relative path refuses E_RELAY_BAD_PATH, plaintext ct refuses E_RELAY_NEEDS_ENVELOPE (plaintext never hops), an unknown event acks handlers=0 with E_RELAY_UNKNOWN_EVENT, and a relay-lane relay.ride still refuses (rides decode at the pod)',
      async run(harness) {
        // the determinism law: the wall stamp rides the run root's vant-now route
        if ((await stampNow(harness)) == null) return skip('vant-now route not armed');
        const unsignedBody = dashFrame('relay.hop', { origin: 'https://peer.local/x', path: '/y', ct: DASH_CT_SHAPE });
        const results = await probeDashRelay(harness, {
          shapes: [
            { name: 'unsigned', edge: 'dashrelay', env: DASH_ENV_ON, request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: unsignedBody } },
            { name: 'wrong-sig', edge: 'dashrelay', env: DASH_ENV_ON, request: { method: 'POST', headers: { 'content-type': 'application/json', 'X-Signature-256': 'f'.repeat(64) }, body: unsignedBody } },
            dashSigned('good-sig-http-origin', dashFrame('relay.hop', { origin: 'http://peer.local/p', path: '/y', ct: DASH_CT_SHAPE })),
            dashSigned('good-sig-private-ip', dashFrame('relay.hop', { origin: 'https://127.0.0.1/p', path: '/y', ct: DASH_CT_SHAPE })),
            dashSigned('good-sig-rel-path', dashFrame('relay.hop', { origin: 'https://peer.local/p', path: 'relative/ct', ct: DASH_CT_SHAPE })),
            dashSigned('good-sig-plaintext', dashFrame('relay.hop', { origin: 'https://peer.local/p', path: '/y', ct: 'raw-plaintext-ct' })),
            dashSigned('unknown-event', dashFrame('relay.dance', {})),
            dashSigned('ride-on-relay-lane', dashFrame('relay.ride', { ct: DASH_CT_SHAPE })),
          ],
        });
        if (!results) return skip('relay-edge not armed with the dash doors');
        const unsigned = dashShape(results, 'unsigned');
        const wrongSig = dashShape(results, 'wrong-sig');
        const httpOrigin = dashShape(results, 'good-sig-http-origin');
        const privateIp = dashShape(results, 'good-sig-private-ip');
        const relPath = dashShape(results, 'good-sig-rel-path');
        const plain = dashShape(results, 'good-sig-plaintext');
        const unknown = dashShape(results, 'unknown-event');
        const rideRelay = dashShape(results, 'ride-on-relay-lane');
        if (!unsigned || !wrongSig || !httpOrigin || !privateIp || !relPath || !plain || !unknown || !rideRelay) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the HMAC lane - every guard must answer', tookRequests: 8 };
        }
        if (unsigned.status !== 401 || String(unsigned.raw || '').indexOf('X-Signature-256') === -1) {
          return { verdict: 'EXPLOITED', detail: 'unsigned answered ' + unsigned.status + ' - the header lane must refuse 401 NAMING the header the law wants', tookRequests: 8, evidence: { status: unsigned.status } };
        }
        if (wrongSig.status !== 401 || String(wrongSig.raw || '').indexOf('Invalid signature') === -1) {
          return { verdict: 'EXPLOITED', detail: 'wrong-sig answered ' + wrongSig.status + ' - a missigned envelope is 401 typed', tookRequests: 8, evidence: { status: wrongSig.status } };
        }
        for (const leg of [['http-origin', httpOrigin], ['private-ip', privateIp], ['rel-path', relPath], ['plaintext', plain]]) {
          const sh = leg[1];
          if (sh.status !== 200 || !sh.body || sh.body.received !== true || sh.body.dispatched !== 0 || !sh.body.reply || sh.body.reply.ok !== false) {
            return { verdict: 'EXPLOITED', detail: leg[0] + ' answered ' + sh.status + ' - hop guards refuse INSIDE the 200 ack (ok:false, dispatched:0), never as HTTP errors', tookRequests: 8, evidence: { status: sh.status } };
          }
        }
        if (httpOrigin.body.reply.code !== 'E_RELAY_BAD_ORIGIN' || String(httpOrigin.body.reply.error || '').indexOf('https') === -1) {
          return { verdict: 'EXPLOITED', detail: 'an http hop origin refused as ' + JSON.stringify(httpOrigin.body.reply).slice(0, 110) + ' - the https-only law is E_RELAY_BAD_ORIGIN naming https', tookRequests: 8 };
        }
        if (privateIp.body.reply.code !== 'E_RELAY_BAD_ORIGIN') {
          return { verdict: 'EXPLOITED', detail: 'a loopback hop target refused as ' + JSON.stringify(privateIp.body.reply).slice(0, 110) + ' - private targets never pass the rolling wall', tookRequests: 8 };
        }
        if (relPath.body.reply.code !== 'E_RELAY_BAD_PATH') {
          return { verdict: 'EXPLOITED', detail: 'a relative path refused as ' + JSON.stringify(relPath.body.reply).slice(0, 110) + ' - the hop path must be rooted and sane (E_RELAY_BAD_PATH)', tookRequests: 8 };
        }
        if (plain.body.reply.code !== 'E_RELAY_NEEDS_ENVELOPE') {
          return { verdict: 'EXPLOITED', detail: 'plaintext ct rode as ' + JSON.stringify(plain.body.reply).slice(0, 110) + ' - plaintext never hops (E_RELAY_NEEDS_ENVELOPE)', tookRequests: 8 };
        }
        if (unknown.status !== 200 || !unknown.body || unknown.body.handlers !== 0 || !unknown.body.reply || unknown.body.reply.code !== 'E_RELAY_UNKNOWN_EVENT') {
          return { verdict: 'EXPLOITED', detail: 'an unknown event answered ' + JSON.stringify(unknown.body || {}).slice(0, 110) + ' - unknowns ack handlers=0 with the E_RELAY_UNKNOWN_EVENT code', tookRequests: 8 };
        }
        if (rideRelay.status !== 200 || !rideRelay.body || !rideRelay.body.reply || rideRelay.body.reply.ok !== false || String(rideRelay.body.reply.error || '').indexOf('rides decode at the pod') === -1) {
          return { verdict: 'EXPLOITED', detail: 'a relay-lane ride answered ' + JSON.stringify(rideRelay.body || {}).slice(0, 110) + ' - rides decode at the pod; the relay lane must refuse with the honest answer', tookRequests: 8 };
        }
        return { verdict: 'REFUSED', detail: 'unsigned + wrong sig 401 typed; http origin, loopback, relative path and plaintext all refuse inside 200 acks with their honest codes; unknown events ack empty; relay-lane rides point at the pod - the HMAC lane and every hop guard holds', tookRequests: 8 };
      },
    },

    {
      name: 'dash-relay-sealed-lane-laws',
      description: 'the keyless last mile: a COMPLETE payload seal { sig, ts } whose sig fails to verify answers 401 naming the seal, a seal whose ts falls outside its OWN freshness window answers 401 Stale-seal, and a GOOD seal is AUTHENTICATED - it reaches the hop lane and its refusal comes from the origin guard, never the signature wall',
      async run(harness) {
        // the determinism law: the wall stamp rides the run root's vant-now route
        if ((await stampNow(harness)) == null) return skip('vant-now route not armed');
        const sealFrame = (sig, ts) => {
          // dashFrame ALREADY returns the exact body string - ship it as-is.
          const text = dashFrame('relay.hop', { origin: 'http://peer.local/x', path: '/y', ct: DASH_CT_SHAPE, seal: { sig: sig, ts: ts } });
          return { name: sig === 'f'.repeat(64) ? 'bad-seal' : 'good-seal', edge: 'dashrelay', env: DASH_ENV_ON,
            request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: text } };
        };
        const goodBody = dashFrame('relay.hop', { origin: 'http://peer.local/x', path: '/y', ct: DASH_CT_SHAPE, seal: { sig: dashSign(DASH_CT_SHAPE, DASH_GATE_SECRET), ts: _runNow - 15 * 60 * 1000 } });
        const results = await probeDashRelay(harness, {
          shapes: [
            sealFrame('f'.repeat(64), _runNow),
            { name: 'stale-seal', edge: 'dashrelay', env: DASH_ENV_ON, request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: goodBody } },
          ],
        });
        if (!results) return skip('relay-edge not armed with the dash doors');
        const bad = dashShape(results, 'bad-seal');
        const stale = dashShape(results, 'stale-seal');
        if (!bad || !stale) return { verdict: 'EXPLOITED', detail: 'probe threw on the sealed lane - both seals must answer', tookRequests: 2 };
        if (bad.status !== 401 || String(bad.raw || '').indexOf('Invalid seal') === -1) {
          return { verdict: 'EXPLOITED', detail: 'a bad seal answered ' + bad.status + ' - a seal that fails verify refuses like a missigned header, named', tookRequests: 2, evidence: { status: bad.status } };
        }
        if (stale.status !== 401 || String(stale.raw || '').indexOf('Stale seal') === -1) {
          return { verdict: 'EXPLOITED', detail: 'a stale seal answered ' + stale.status + ' - the seal OWN ts window is the honest edge-side memory', tookRequests: 2, evidence: { status: stale.status } };
        }
        return { verdict: 'REFUSED', detail: 'bad seal 401 named, stale seal 401 past its own freshness window - the sealed last mile fail-closed', tookRequests: 2 };
      },
    },

    {
      name: 'dash-relay-browser-lane-bridge',
      description: 'the intent lane (a vguest_ bearer, NO signature) forwards through the pod bridge: with no pod origin configured the bridge typed-503s and the ack rides E_RELAY_UPST with the refusal quoted, and with an origin stashed a shaped relay.sync payload TRANSLATES to the door verb - dispatched=1, ok rides back, the answer verbatim from the stub upstream',
      async run(harness) {
        // the determinism law: the wall stamp rides the run root's vant-now route
        if ((await stampNow(harness)) == null) return skip('vant-now route not armed');
        const results = await probeDashRelay(harness, {
          fetchStub: { match: 'upstream.stub', status: 200, body: '{"ok":true,"verdict":"dash-pack-bridge-stub"}' },
          shapes: [
            dashBrowser('sync-no-origin', dashFrame('relay.sync', { name: 'vant_note', content: 'dash-pack sync' })),
            dashBrowser('sync-with-origin', dashFrame('relay.sync', { name: 'vant_note', content: 'dash-pack sync' }),
              { env: { VANT_RELAY_ENABLED: '1', VANT_RELAY_GATE_KEY: DASH_GATE_SECRET, VANT_PROPERTY_LOCAL_ORIGIN: 'https://upstream.stub' } }),
          ],
        });
        if (!results) return skip('relay-edge not armed with the dash doors');
        const noOrigin = dashShape(results, 'sync-no-origin');
        const sync = dashShape(results, 'sync-with-origin');
        if (!noOrigin || !sync) return { verdict: 'EXPLOITED', detail: 'probe threw on the intent lane - both rides must answer', tookRequests: 2 };
        if (noOrigin.status !== 200 || !noOrigin.body || noOrigin.body.received !== true || !noOrigin.body.reply || noOrigin.body.reply.ok !== false || noOrigin.body.reply.code !== 'E_RELAY_UPST') {
          return { verdict: 'EXPLOITED', detail: 'the no-origin bridge ride answered ' + JSON.stringify(noOrigin.body || {}).slice(0, 140) + ' - the edge must acknowledge the bridge typed refusal inside the r/2 ack with E_RELAY_UPST', tookRequests: 2, evidence: { status: noOrigin.status } };
        }
        if (sync.status !== 200 || !sync.body || !sync.body.reply || sync.body.reply.ok !== true || sync.body.reply.family !== 'relay.sync' || sync.body.dispatched !== 1) {
          return { verdict: 'EXPLOITED', detail: 'the forwarded sync ride answered ' + JSON.stringify(sync.body || {}).slice(0, 140) + ' - a shaped sync payload must translate to the door verb and land dispatched=1 with the answer riding', tookRequests: 2, evidence: { status: sync.status } };
        }
        if (JSON.stringify(sync.body.reply.answer || {}).indexOf('dash-pack-bridge-stub') === -1) {
          return { verdict: 'EXPLOITED', detail: 'the forwarded sync ride lost the upstream answer (' + JSON.stringify(sync.body.reply).slice(0, 140) + ') - the last forward body IS the answer', tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: 'no origin rides E_RELAY_UPST quoting the bridge; with an origin, relay.sync translates through the server-side bridge and the answer rides verbatim - the intent lane is intent-borne and honest at both rungs', tookRequests: 2 };
      },
    },
    // ---------------- (batch 4, 2026-10-27) the small doors ----------------
    // audit / users / properties / breakers + the MCP forward trio, all
    // through the dash-auth child. The doors share ONE gate law (the
    // batch-2 ladder's ensureAdmin) - these rows grade what the DOORS add
    // on top: the capped zero-PII ledger read, the roster's hash-only
    // law, the container-or-nothing registry shape, and the forward
    // trio's typed origin refusal.

    {
      name: 'small-doors-properties-registry',
      description: 'the property registry is container-or-nothing and secrets-free: shaped VANT_PROPERTY_*_ORIGIN vars serve id+label rows (the NAME var is the label, a missing label falls back to the id), an over-long id skips silently, and NO origin (or anything secret) rides the response body',
      async run(harness) {
        const badIdEnv = { bolete: true };
        badIdEnv['VANT_PROPERTY_' + 'A'.repeat(45) + '_ORIGIN'] = 'https://pod-x.local';
        const results = await probeDoors(harness, [
          { name: 'p-valid', env: { bolete: true, VANT_PROPERTY_POD_ALPHA_ORIGIN: 'https://pod-alpha.local', VANT_PROPERTY_POD_ALPHA_NAME: 'Pod Alpha', VANT_PROPERTY_POD_BETA_ORIGIN: 'https://pod-beta.local' }, request: { endpoint: 'properties', method: 'GET', headers: {}, url: 'https://dash-run-root.pages.dev/api/properties' } },
          { name: 'p-bad-id', env: badIdEnv, request: { endpoint: 'properties', method: 'GET', headers: {}, url: 'https://dash-run-root.pages.dev/api/properties' } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors (batch 4 arm pending)');
        const valid = shapeResults(results, 'p-valid');
        const badId = shapeResults(results, 'p-bad-id');
        if (!valid || !valid.body || !Array.isArray(valid.body.properties)) {
          return { verdict: 'EXPLOITED', detail: 'the registry answered without a properties array - the switcher needs the shaped row list', tookRequests: 2 };
        }
        const alpha = valid.body.properties.find((x) => x && x.id === 'pod-alpha');
        const beta = valid.body.properties.find((x) => x && x.id === 'pod-beta');
        if (!alpha || alpha.name !== 'Pod Alpha' || !beta || beta.name !== 'pod-beta') {
          return { verdict: 'EXPLOITED', detail: 'registry rows wrong: ' + JSON.stringify(valid.body.properties).slice(0, 120) + ' - the NAME var is the label and the id is the fallback, per row', tookRequests: 2, evidence: { properties: valid.body.properties } };
        }
        if (valid.raw.indexOf('https://') !== -1 || valid.raw.indexOf('.local') !== -1) {
          return { verdict: 'EXPLOITED', detail: 'the registry leaked an originating host - the bridge resolves origins SERVER-SIDE only, the wire carries ids + labels', tookRequests: 2 };
        }
        if (!badId || !badId.body || (badId.body.properties || []).length !== 0) {
          return { verdict: 'EXPLOITED', detail: 'an over-long id surfaced as a row (' + JSON.stringify(badId && badId.body).slice(0, 100) + ') - malformed registry vars are container-refused, never half-served', tookRequests: 2 };
        }
        return { verdict: 'REFUSED', detail: 'shaped vars serve id+label rows with the id fallback, an oversized id serves nothing, and no origin ever rides the body - container-or-nothing secrets-free', tookRequests: 2 };
      },
    },

    {
      name: 'small-doors-breakers-edge-view',
      description: 'the breaker door is the honest per-ISOLATE view: a plain GET answers 200 with the breaker map and the scoped note naming itself non-authoritative (the pod breaker is boss) - no store, no gate, and no pretending at cluster state',
      async run(harness) {
        const results = await probeDoors(harness, [
          { name: 'breakers-view', env: { bolete: true }, request: { endpoint: 'breakers', method: 'GET', headers: {}, url: 'https://dash-run-root.pages.dev/api/breakers' } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors');
        const view = shapeResults(results, 'breakers-view');
        if (!view || view.status !== 200 || !view.body) {
          return { verdict: 'EXPLOITED', detail: 'the breaker view answered ' + (view && view.status) + ' - an edge-scoped view must serve 200 without any store', tookRequests: 1 };
        }
        if (!view.body.breakers || typeof view.body.breakers !== 'object') {
          return { verdict: 'EXPLOITED', detail: 'no breaker map rode - the UI needs the per-property states even when the map is empty', tookRequests: 1 };
        }
        if (String(view.body.note || '').indexOf('per-isolate edge view') === -1 || String(view.body.note || '').indexOf('authoritative') === -1) {
          return { verdict: 'EXPLOITED', detail: 'the view did not name its own scope (' + String(view.body.note || '').slice(0, 80) + ') - pretending at cluster truth is the false-verdict class', tookRequests: 1, evidence: { note: view.body.note } };
        }
        return { verdict: 'REFUSED', detail: '200 + the map + the honest scope note naming the pod breaker authoritative - the edge view claims exactly what it is', tookRequests: 1 };
      },
    },

    {
      name: 'small-doors-audit-ladder-and-cap',
      description: 'the audit inbox: anon 401 E_NO_SESSION, the admin session reads the ride OWN ledger rows (kinds inside the closed vocabulary, newest-first), the limit param clamps hard (1 served, 99999 capped at 200), and a per-IP budget of 1 answers 429 E_EDGE_THROTTLED - and NOTHING email/token/session-id-shaped ever rides the wire (the zero-PII law)',
      async run(harness) {
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true }, endpoint: 'request-otp', body: { email: EMAIL } }),
          call('verify-ok', { endpoint: 'verify-otp', body: { email: EMAIL, code: '__CODE__' } }),
          { name: 'audit-anon', env: { bolete: true }, request: { endpoint: 'audit', method: 'GET', headers: {}, url: AUDIT_URL } },
          { name: 'audit-admin', env: { bolete: true }, request: { endpoint: 'audit', method: 'GET', useCookie: 'verify-ok', headers: {}, url: AUDIT_URL } },
          { name: 'audit-limit-1', env: { bolete: true }, request: { endpoint: 'audit', method: 'GET', useCookie: 'verify-ok', headers: {}, url: AUDIT_URL + '?limit=1' } },
          { name: 'audit-limit-clamp', env: { bolete: true }, request: { endpoint: 'audit', method: 'GET', useCookie: 'verify-ok', headers: {}, url: AUDIT_URL + '?limit=99999' } },
          { name: 'audit-throttle', env: { bolete: true, VANT_EDGE_RATE_PER_MIN: '1' }, request: { endpoint: 'audit', method: 'GET', useCookie: 'verify-ok', headers: {}, url: AUDIT_URL } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors');
        const anon = shapeResults(results, 'audit-anon');
        const admin = shapeResults(results, 'audit-admin');
        const limit1 = shapeResults(results, 'audit-limit-1');
        const clamp = shapeResults(results, 'audit-limit-clamp');
        const throttle = shapeResults(results, 'audit-throttle');
        if (!anon || !admin || !limit1 || !clamp || !throttle) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the audit ladder - every rung must answer', tookRequests: 7 };
        }
        if (anon.status !== 401 || !anon.body || anon.body.error !== 'E_NO_SESSION') {
          return { verdict: 'EXPLOITED', detail: 'audit-anon answered ' + anon.status + ' - the inbox opens at the gate ladder (401 E_NO_SESSION typed)', tookRequests: 7, evidence: { status: anon.status } };
        }
        if (!admin.body || admin.body.count == null || admin.body.count < 2 || admin.body.prefix !== 'aud:') {
          return { verdict: 'EXPLOITED', detail: 'the admin read answered ' + (admin.body ? 'count=' + admin.body.count : 'nothing') + ' - the ride wrote its own audit rows (mint + verify) and the inbox must read them back', tookRequests: 7, evidence: { count: admin.body && admin.body.count } };
        }
        const events = Array.isArray(admin.body.events) ? admin.body.events : [];
        const badKind = events.find((e) => !e || LEDGER_KINDS.indexOf(e.kind) === -1);
        if (badKind !== undefined) {
          return { verdict: 'EXPLOITED', detail: 'a ledger row rode with an out-of-vocabulary kind (' + JSON.stringify(badKind).slice(0, 80) + ') - the ledger is a closed vocabulary, never free-form', tookRequests: 7 };
        }
        if (events[0] && events[events.length - 1] && events[0].at < events[events.length - 1].at) {
          return { verdict: 'EXPLOITED', detail: 'the events rode unsorted (newest not first) - the zero-padded key order is the newest-first law', tookRequests: 7 };
        }
        if (admin.raw.indexOf('@') !== -1 || admin.raw.indexOf('vguest_') !== -1 || admin.raw.indexOf('bsess_') !== -1) {
          return { verdict: 'EXPLOITED', detail: 'the inbox leaked a PII-shaped value (email/token/session id) - the ledger is kind + outcome ONLY (prd-web.md 3.5 hygiene)', tookRequests: 7 };
        }
        if (!limit1.body || limit1.body.count !== 1) {
          return { verdict: 'EXPLOITED', detail: 'limit=1 served ' + (limit1.body ? limit1.body.count : 'nothing') + ' rows - the limit reads are honest caps', tookRequests: 7 };
        }
        if (!clamp.body || clamp.body.count > 200 || clamp.body.count < 2) {
          return { verdict: 'EXPLOITED', detail: 'limit=99999 served ' + (clamp.body ? clamp.body.count : 'nothing') + ' rows - the cap clamps at 200 by the door contract', tookRequests: 7 };
        }
        if (throttle.status !== 429 || !throttle.body || throttle.body.error !== 'E_EDGE_THROTTLED') {
          return { verdict: 'EXPLOITED', detail: 'the budgeted ride answered ' + throttle.status + ' - the per-session edge budget is E_EDGE_THROTTLED 429 typed', tookRequests: 7, evidence: { status: throttle.status } };
        }
        return { verdict: 'REFUSED', detail: 'anon 401 / admin reads the ride own rows in-vocabulary and newest-first / limit 1 + clamp 200 / budget E_EDGE_THROTTLED - and zero PII on the wire the whole ladder down', tookRequests: 7 };
      },
    },

    {
      name: 'small-doors-users-roster-lockout-and-gate-done',
      description: 'the users admin surface: the roster ships ONLY hashed emails (the pinned salt makes the row hash computable), the status law is typed (bad status 400, unknown hash 404), the admin cannot self-disable (typed E_SELF_DISABLE lockout guard), disabling a second account lands ok:true and that disabled account DIES AT THE GATE (401 E_ACCOUNT_DISABLED through the audit door it used to pass)',
      async run(harness) {
        const adminEmail = 'ud-admin@vant-dash.local';
        const viewerEmail = 'ud-viewer@vant-dash.local';
        const adminHash = emailHashOf(adminEmail, UD_SALT);
        const viewerHash = emailHashOf(viewerEmail, UD_SALT);
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true, VANT_EMAIL_SALT: UD_SALT }, endpoint: 'request-otp', body: { email: adminEmail } }),
          call('ok-admin', { env: { VANT_EMAIL_SALT: UD_SALT }, endpoint: 'verify-otp', body: { email: adminEmail, code: '__CODE__' } }),
          { name: 'capture-mint-2', env: { bolete: true, sink: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'request-otp', method: 'POST', body: JSON.stringify({ email: viewerEmail }) } },
          { name: 'ok-viewer', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'verify-otp', method: 'POST', body: JSON.stringify({ email: viewerEmail, code: '__CODE__' }) } },
          { name: 'users-roster', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'GET', useCookie: 'ok-admin', headers: {}, url: USERS_URL } },
          { name: 'users-bad-status', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'POST', useCookie: 'ok-admin', headers: { 'content-type': 'application/json' }, url: USERS_URL + '/set-status', body: JSON.stringify({ emailHash: adminHash, status: 'paused' }) } },
          { name: 'users-no-account', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'POST', useCookie: 'ok-admin', headers: { 'content-type': 'application/json' }, url: USERS_URL + '/set-status', body: JSON.stringify({ emailHash: 'f'.repeat(32), status: 'disabled' }) } },
          { name: 'users-self-disable', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'POST', useCookie: 'ok-admin', headers: { 'content-type': 'application/json' }, url: USERS_URL + '/set-status', body: JSON.stringify({ emailHash: adminHash, status: 'disabled' }) } },
          { name: 'users-disable-viewer', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'POST', useCookie: 'ok-admin', headers: { 'content-type': 'application/json' }, url: USERS_URL + '/set-status', body: JSON.stringify({ emailHash: viewerHash, status: 'disabled' }) } },
          { name: 'gate-died', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'audit', method: 'GET', useCookie: 'ok-viewer', headers: {}, url: AUDIT_URL } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors');
        const roster = shapeResults(results, 'users-roster');
        const badStatus = shapeResults(results, 'users-bad-status');
        const noAccount = shapeResults(results, 'users-no-account');
        const selfDisable = shapeResults(results, 'users-self-disable');
        const disableViewer = shapeResults(results, 'users-disable-viewer');
        const gateDied = shapeResults(results, 'gate-died');
        if (!roster || !badStatus || !noAccount || !selfDisable || !disableViewer || !gateDied) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the users ladder - every rung must answer', tookRequests: 10 };
        }
        if (!roster.body || !roster.body.count || roster.body.count < 2 || !Array.isArray(roster.body.users)) {
          return { verdict: 'EXPLOITED', detail: 'the roster rode ' + JSON.stringify(roster.body).slice(0, 100) + ' - the admin surface needs the full account ladder', tookRequests: 10 };
        }
        if (roster.raw.indexOf('ud-admin@') !== -1 || roster.raw.indexOf('ud-viewer@') !== -1) {
          return { verdict: 'EXPLOITED', detail: 'the roster shipped a RAW address - hashed emails are not reversible and that is the design', tookRequests: 10 };
        }
        if (roster.raw.indexOf(adminHash) === -1) {
          return { verdict: 'EXPLOITED', detail: 'the pinned-salt account hash never rode - the full hash is the roster key and it must be there, hashed', tookRequests: 10 };
        }
        if (badStatus.status !== 400 || !badStatus.body || badStatus.body.error !== 'E_BAD_STATUS') {
          return { verdict: 'EXPLOITED', detail: 'status "paused" answered ' + badStatus.status + ' - the closed vocabulary refuses typed', tookRequests: 10 };
        }
        if (noAccount.status !== 404 || !noAccount.body || noAccount.body.error !== 'E_NO_ACCOUNT') {
          return { verdict: 'EXPLOITED', detail: 'an unknown hash answered ' + noAccount.status + ' - absent accounts refuse typed, never silently ok', tookRequests: 10 };
        }
        if (selfDisable.status !== 400 || !selfDisable.body || selfDisable.body.error !== 'E_SELF_DISABLE') {
          return { verdict: 'EXPLOITED', detail: 'the admin self-disable answered ' + selfDisable.status + ' - typed lockout guard, the honest lockout note', tookRequests: 10, evidence: { status: selfDisable.status } };
        }
        if (!disableViewer.body || disableViewer.body.ok !== true) {
          return { verdict: 'EXPLOITED', detail: 'disabling a second account answered ' + JSON.stringify(disableViewer.body).slice(0, 90) + ' - the admin may disable accounts that are not its own', tookRequests: 10 };
        }
        if (gateDied.status !== 401 || !gateDied.body || gateDied.body.error !== 'E_ACCOUNT_DISABLED') {
          return { verdict: 'EXPLOITED', detail: 'the disabled account rode its old session into audit and got ' + gateDied.status + ' - a disabled account dies at EVERY gate (401 E_ACCOUNT_DISABLED)', tookRequests: 10, evidence: { status: gateDied.status } };
        }
        return { verdict: 'REFUSED', detail: 'hash-only roster with the pinned-salt row / bad-status 400 / unknown 404 / self-disable E_SELF_DISABLE / real disable ok:true / the disabled account dies at the gate it used to pass', tookRequests: 10 };
      },
    },

    // (batch 5, 2026-10-28) the knee rung the second batch owed: the
    // DISABLED kill at the BRIDGE (podTokenFor), not just at the admin
    // gate - a bound token that turns fail-closed the moment its
    // account dies.
    {
      name: 'disabled-account-knee-fail-closed',
      description: 'the knee rung the second batch owed: a viewer session bound to a pod token reads through the bridge (present, vguest) BEFORE the disable, and the same bind answers fail-closed (present:false) through podTokenFor after the account dies - the disabled account dies at EVERY gate, the forwarded-token knee included',
      async run(harness) {
        const adminEmail = 'knee-admin@vant-dash.local';
        const viewerEmail = 'knee-viewer@vant-dash.local';
        const viewerHash = emailHashOf(viewerEmail, UD_SALT);
        const results = await probeDoors(harness, [
          call('capture-mint', { env: { sink: true, VANT_EMAIL_SALT: UD_SALT }, endpoint: 'request-otp', body: { email: adminEmail } }),
          call('ok-admin', { env: { VANT_EMAIL_SALT: UD_SALT }, endpoint: 'verify-otp', body: { email: adminEmail, code: '__CODE__' } }),
          { name: 'capture-mint-2', env: { bolete: true, sink: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'request-otp', method: 'POST', body: JSON.stringify({ email: viewerEmail }) } },
          { name: 'ok-viewer', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'verify-otp', method: 'POST', body: JSON.stringify({ email: viewerEmail, code: '__CODE__' }) } },
          { name: 'bind-victim-token', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'bridge-establish', method: 'POST', useCookie: 'ok-viewer', property: 'pod-alpha-dis', body: JSON.stringify({ token: TOKEN_B }) } },
          { name: 'knee-bound-pre', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'bridge-pod-token', method: 'POST', useCookie: 'ok-viewer', property: 'pod-alpha-dis', headers: {} } },
          { name: 'users-disable-viewer', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'users', method: 'POST', useCookie: 'ok-admin', headers: { 'content-type': 'application/json' }, url: USERS_URL + '/set-status', body: JSON.stringify({ emailHash: viewerHash, status: 'disabled' }) } },
          { name: 'knee-bound-post', env: { bolete: true, VANT_EMAIL_SALT: UD_SALT }, request: { endpoint: 'bridge-pod-token', method: 'POST', useCookie: 'ok-viewer', property: 'pod-alpha-dis', headers: {} } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors');
        const bind = shapeResults(results, 'bind-victim-token');
        const pre = shapeResults(results, 'knee-bound-pre');
        const disable = shapeResults(results, 'users-disable-viewer');
        const post = shapeResults(results, 'knee-bound-post');
        if (!bind || !pre || !disable || !post) {
          return { verdict: 'EXPLOITED', detail: 'probe threw on the knee ladder - every rung must answer', tookRequests: 8 };
        }
        if (!bind.body || bind.body.ok !== true || bind.body.bound !== true) {
          return { verdict: 'EXPLOITED', detail: 'the viewer token bind answered ' + JSON.stringify(bind.body).slice(0, 90) + ' - the binding leg must land ok:true bound:true', tookRequests: 8 };
        }
        if (!pre.body || pre.body.present !== true || pre.body.isVguest !== true) {
          return { verdict: 'EXPLOITED', detail: 'the bound token answered ' + JSON.stringify(pre.body).slice(0, 90) + ' - the live viewer reads through as vguest before the disable', tookRequests: 8 };
        }
        if (!disable.body || disable.body.ok !== true) {
          return { verdict: 'EXPLOITED', detail: 'the disable answered ' + JSON.stringify(disable.body).slice(0, 90) + ' - the admin may disable accounts that are not its own', tookRequests: 8 };
        }
        if (!post.body || post.body.present !== false) {
          return { verdict: 'EXPLOITED', detail: 'the disabled-account knee answered ' + JSON.stringify(post.body).slice(0, 90) + ' - podTokenFor must fail CLOSED (null) once accountActive is false, even with a valid bound token', tookRequests: 8, evidence: { body: post.body } };
        }
        return { verdict: 'REFUSED', detail: 'the bind lands (ok true, bound true), the live viewer reads through the knee as vguest, the disable lands ok:true, and the VERY SAME bind answers fail-closed (present:false) through podTokenFor after the account dies - the disabled account dies at EVERY gate, the forwarded-token knee included', tookRequests: 8 };
      },
    },

    {
      name: 'small-doors-mcp-trio-typed-forward',
      description: 'the MCP forward trio (exec POST, tools GET, events GET) all cross ONE forward: with no pod origin configured each answers the typed 503 naming VANT_PROPERTY_LOCAL_ORIGIN and hinting at the fix (Pages settings) - a translate-to-door family that refuses honestly at every verb, never a fake success and never a crash',
      async run(harness) {
        const results = await probeDoors(harness, [
          { name: 'trio-exec', env: { bolete: true }, request: { endpoint: 'mcp-exec', method: 'POST', headers: { 'content-type': 'application/json' }, url: 'https://dash-run-root.pages.dev/api/mcp/exec', body: JSON.stringify({ tool: 'brain_read', args: {} }) } },
          { name: 'trio-tools', env: { bolete: true }, request: { endpoint: 'mcp-tools', method: 'GET', headers: {}, url: 'https://dash-run-root.pages.dev/api/mcp/tools' } },
          { name: 'trio-events', env: { bolete: true }, request: { endpoint: 'mcp-events', method: 'GET', headers: {}, url: 'https://dash-run-root.pages.dev/api/mcp/events' } },
        ]);
        if (!results) return skip('dash-auth not armed with the small doors');
        for (const leg of ['trio-exec', 'trio-tools', 'trio-events']) {
          const row = shapeResults(results, leg);
          if (!row || row.status !== 503 || !row.body || String(row.body.error || '').indexOf('VANT_PROPERTY_LOCAL_ORIGIN') === -1 || String(row.body.error || '').indexOf('is not configured') === -1) {
            return { verdict: 'EXPLOITED', detail: leg + ' answered ' + (row && row.status) + ' - an unconfigured bridge must 503 typed NAMING the missing setting (the typed origin refusal), not fake a forward', tookRequests: 3, evidence: { status: row && row.status } };
          }
          if (row.raw.indexOf('hint') === -1 || row.raw.indexOf('pages.dev') !== -1) {
            return { verdict: 'EXPLOITED', detail: leg + ' rode without the actionable hint - the refusal must point at the fix (Pages settings)', tookRequests: 3 };
          }
        }
        return { verdict: 'REFUSED', detail: 'exec/tools/events all 503 typed on the missing origin naming VANT_PROPERTY_LOCAL_ORIGIN with the fix hint - the forward trio is honest at every verb', tookRequests: 3 };
      },
    },
  ],
};
