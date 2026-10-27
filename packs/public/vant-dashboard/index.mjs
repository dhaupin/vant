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

import { createHmac } from 'node:crypto';

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
const DASH_GATE_SECRET = 'vant-dash-pack-relay-gate-0123456789abcdef';
const DASH_ENV_ON = { VANT_RELAY_ENABLED: '1', VANT_RELAY_GATE_KEY: DASH_GATE_SECRET };
const DASH_CT_SHAPE = 'a'.repeat(32) + ':' + 'b'.repeat(24) + ':' + 'c'.repeat(32) + ':' + 'd'.repeat(2);

function dashSign(body, secret) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function dashFrame(event, payload, extra) {
  const e = extra || {};
  return JSON.stringify({
    event,
    from: 'dash-pack-probe',
    ts: e.ts == null ? Date.now() : e.ts,
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
        const sealFrame = (sig, ts) => {
          // dashFrame ALREADY returns the exact body string - ship it as-is.
          const text = dashFrame('relay.hop', { origin: 'http://peer.local/x', path: '/y', ct: DASH_CT_SHAPE, seal: { sig: sig, ts: ts } });
          return { name: sig === 'f'.repeat(64) ? 'bad-seal' : 'good-seal', edge: 'dashrelay', env: DASH_ENV_ON,
            request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: text } };
        };
        const goodBody = dashFrame('relay.hop', { origin: 'http://peer.local/x', path: '/y', ct: DASH_CT_SHAPE, seal: { sig: dashSign(DASH_CT_SHAPE, DASH_GATE_SECRET), ts: Date.now() - 15 * 60 * 1000 } });
        const results = await probeDashRelay(harness, {
          shapes: [
            sealFrame('f'.repeat(64), Date.now()),
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
  ],
};
