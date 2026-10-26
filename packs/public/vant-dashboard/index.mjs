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

function cookieSnapshot(headers) {
  const set = headers['set-cookie'] || '';
  return {
    present: set.indexOf(COOKIE + '=') !== -1,
    bsess: new RegExp(COOKIE + '=bsess_[A-Za-z0-9_-]{8,}').test(set),
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
  ],
};
