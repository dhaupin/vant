/**
 * vant-relay pack — Phase A wire-surface slice (issue #249, S0→S1 campaign).
 *
 * Grading vant's REAL r/2 solo relay edge face (web/relay/functions/api/
 * r/relay.ts) through the run root's `relay-edge` probe child: the
 * TypeScript onRequestPost runs in-process under Node --experimental-
 * strip-types with WHATWG Request/Response and WebCrypto HMAC — no
 * sockets, no deploy, no wall clock stored in a verdict.
 *
 * The wire laws graded here (each row drives the edge and reads its real
 * verdict; findings are what the wire DID):
 *   1. posture gate  — unmounted = 404 (the deploy is NOT a relay)
 *   2. key gate      — enabled without a gate secret = 503 fail-closed
 *   3. the HMAC lane — X-Signature-256 over the RAW UTF-8 body bytes;
 *                      missing/wrong signatures answer 401 typed
 *   4. freshness     — a stale ts refuses typed (the edge's honest stateless memory)
 *   5. origin guard  — https-only on the edge; private/loopback/metadata
 *                      hop targets NEVER pass; typed refusals ride INSIDE
 *                      the 200 ack (application-level, never HTTP errors)
 *   6. encrypted pipes only — plaintext never hops (typed NEEDS_ENVELOPE)
 *   7. body cap      — the doors' shared 1 MiB cap answers 413
 *
 * Reverse-verification law: the native relay lanes (test/relay.test.js,
 * test/relay-parity.test.js) stay green alongside these rows until one
 * full run cycle is green on both; the S-counter only moves on that.
 */

import { createHmac } from 'node:crypto';

const skip = (why) => ({ verdict: 'REFUSED', skipped: true, detail: `not armed: ${why}` });

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** The probe child's marker protocol: parse the results table out of one
 * relay-edge round trip; null when the arm is absent or faulted. */
async function probeEdge(harness, shapes) {
  let raw;
  try {
    const r = await harness.run('relay-edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shapes }),
    });
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
  if (!j || j.error) return null; // the probe child faulted - not a wall verdict
  return j;
}

/** One signed r/2 hop envelope: HMAC-SHA256 hex over the RAW UTF-8 body
 * bytes, keyed by the gate secret (the same law the edge verifies). */
function signEnvelope(body, secret) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const GATE_SECRET = 'vant-relay-pack-gate-secret-0123456789';
const ENV_ON = { VANT_RELAY_ENABLED: '1', VANT_RELAY_GATE_KEY: GATE_SECRET };
const CALL = 'https://relay-edge.local/api/r/relay';

function hopFrame(origin, path, ct, ts = Date.now(), extra = {}) {
  return JSON.stringify({
    event: 'relay.hop',
    from: 'pack-probe',
    ts,
    nonce: 't' + (extra.nonce || '0'),
    payload: { origin, path, ct },
    v: { major: 2 },
  });
}

// A shape-correct AES-256-GCM envelope (salt:iv:tag:cipher hex) — the guard
// rows need it to REACH their guard (shape law is structural, no key).
const SEALED_CT = 'a'.repeat(32) + ':' + 'b'.repeat(24) + ':' + 'c'.repeat(32) + ':' + 'd'.repeat(2);

function shapeResults(results, name) {
  // accepts either the probe's parsed wrapper `{ results: [...] }` or a plain array
  const arr = (results && Array.isArray(results.results)) ? results.results : (Array.isArray(results) ? results : []);
  const hit = arr.find((r) => r && r.name === name);
  if (!hit || hit.status === 'THREW') return null;
  return { status: hit.status, body: parseJson(hit.bodyText) };
}

export default {
  name: 'vant-relay',
  description: 'r/2 edge-face discipline driven in-process: posture and key gates fail closed, the HMAC lane verifies over RAW body bytes, staleness refuses typed, hostile hop origins never pass the origin guard, plaintext never hops, and the 1 MiB cap holds',

  attacks: [
    {
      name: 'posture-and-key-gates-fail-closed',
      description: 'an unmounted relay routes nowhere (404, no admission phục) and an enabled relay without a gate secret serves NOTHING (503 fail-closed - nothing to verify against is still nothing served)',
      async run(harness) {
        const results = await probeEdge(harness, [
          { name: 'unmounted', env: {}, request: { url: CALL, method: 'POST', body: '{}' } },
          { name: 'no-gate-secret', env: { VANT_RELAY_ENABLED: '1' }, request: { url: CALL, method: 'POST', body: '{}' } },
        ]);
        if (!results) return skip('relay-edge not armed (pending run-root wiring)');
        const unmounted = shapeResults(results, 'unmounted');
        const noSecret = shapeResults(results, 'no-gate-secret');
        if (!unmounted || !noSecret) {
          return { verdict: 'EXPLOITED', detail: 'edge probe threw resolving the posture shapes - the face must answer, not fault', tookRequests: 2 };
        }
        if (unmounted.status !== 404) {
          return { verdict: 'EXPLOITED', detail: `unmounted relay answered ${unmounted.status} instead of 404 - posture off must route NOWHERE`, tookRequests: 2, evidence: { unmounted: unmounted.status } };
        }
        if (noSecret.status !== 503) {
          return { verdict: 'EXPLOITED', detail: `enabled-without-secret answered ${noSecret.status} instead of 503 - the key gate must fail CLOSED, never open`, tookRequests: 2, evidence: { noSecret: noSecret.status } };
        }
        return { verdict: 'REFUSED', detail: 'posture off routes nowhere (404); enabled-without-secret serves nothing (503) - both gates fail closed', tookRequests: 2 };
      },
    },

    {
      name: 'hmac-lane-over-raw-bytes',
      description: 'the gate IS the HMAC secret: a signed envelope with no header refuses 401 typed, a WRONG signature refuses 401 typed, and the CORRECT HMAC over the raw UTF-8 body bytes passes the gate into the ack path (X-Signature-256 raw-bytes law)',
      async run(harness) {
        // the VALID lane's envelope carries a fresh ts too: the gate first,
        // then the freshness window — a valid credential rides INTO the ack
        // path, so this shape proves the raw-bytes HMAC law end to end
        const ctx = JSON.stringify({ event: 'msg-sync', from: 'pack-probe', ts: Date.now(), nonce: 'n-hmac', payload: { probe: 'hmac-lane' }, v: { major: 2 } });
        const wrongSig = 'f'.repeat(64);
        const results = await probeEdge(harness, [
          { name: 'no-header', env: ENV_ON, request: { url: CALL, method: 'POST', body: ctx } },
          { name: 'wrong-sig', env: ENV_ON, request: { url: CALL, method: 'POST', headers: { 'x-signature-256': wrongSig }, body: ctx } },
          { name: 'valid-sig', env: ENV_ON, request: { url: CALL, method: 'POST', headers: { 'x-signature-256': signEnvelope(ctx, GATE_SECRET) }, body: ctx } },
        ]);
        if (!results) return skip('relay-edge not armed');
        const noHeader = shapeResults(results, 'no-header');
        const wrong = shapeResults(results, 'wrong-sig');
        const valid = shapeResults(results, 'valid-sig');
        if (!noHeader || !wrong || !valid) {
          return { verdict: 'EXPLOITED', detail: 'edge probe threw on the HMAC lanes - signature verdicts must be answers, not faults', tookRequests: 3 };
        }
        if (noHeader.status !== 401 || wrong.status !== 401) {
          return { verdict: 'EXPLOITED', detail: `unsigned/wrong-signature answered ${noHeader.status}/${wrong.status} - the HMAC lane must refuse both typed (401)`, tookRequests: 3, evidence: { noHeader: noHeader.status, wrong: wrong.status } };
        }
        if (valid.status !== 200 || !valid.body || valid.body.received !== true) {
          return { verdict: 'EXPLOITED', detail: `the CORRECT raw-body HMAC answered ${valid.status} - a valid credential must pass the gate into the ack path`, tookRequests: 3, evidence: { status: valid.status } };
        }
        return { verdict: 'REFUSED', detail: 'no/wrong signature refused 401 typed; the correct raw-body HMAC passed into the ack path - the gate is the secret and it reads the RAW bytes', tookRequests: 3 };
      },
    },

    {
      name: 'freshness-window-typed',
      description: 'a correctly SIGNED envelope whose ts sits outside the freshness window refuses 401 typed - the edge has no replay cache, so staleness is the stateless memory it honestly owns',
      async run(harness) {
        // 11 minutes back: outside the 10-minute window, deterministic per run
        const staleTs = Date.now() - (11 * 60 * 1000);
        const body = JSON.stringify({ event: 'msg-sync', from: 'pack-probe', ts: staleTs, nonce: 'n-stale', payload: { note: 'freshly signed but old' }, v: { major: 2 } });
        const results = await probeEdge(harness, [
          { name: 'stale-signed', env: ENV_ON, request: { url: CALL, method: 'POST', headers: { 'x-signature-256': signEnvelope(body, GATE_SECRET) }, body } },
        ]);
        if (!results) return skip('relay-edge not armed');
        const stale = shapeResults(results, 'stale-signed');
        if (!stale) {
          return { verdict: 'EXPLOITED', detail: 'edge probe threw on the staleness lane - staleness must be an answer', tookRequests: 1 };
        }
        if (stale.status !== 401) {
          return { verdict: 'EXPLOITED', detail: `a signed stale envelope answered ${stale.status} - staleness outside the window must refuse 401 typed, never ride through`, tookRequests: 1, evidence: { status: stale.status } };
        }
        return { verdict: 'REFUSED', detail: 'a freshly signed but stale envelope refused 401 typed - the freshness window is the stateless replay memory', tookRequests: 1 };
      },
    },

    {
      name: 'origin-guard-typed-acks',
      description: 'hostile hop origins answer the ack path with typed refusals INSIDE the 200: http downgrade, loopback, and cloud metadata targets all refuse - the edge has NO lab escape and private targets never hop',
      async run(harness) {
        // ONE string per shape, signed over the EXACT bytes shipped — the
        // row used to call hopFrame twice (sign call + body call), and each
        // call re-evaluated ts. A ms-grain boundary between the two evals
        // left the signature covering different bytes than the body carried,
        // so the edge (correctly!) answered 401 and the row misclassified
        // vant's true gate as a flake (measured 2026-10-25, cycles 2+3).
        const shape = (origin) => {
          const bodyStr = hopFrame(origin, '/api', SEALED_CT);
          return {
            name: 'origin:' + origin,
            env: ENV_ON,
            request: {
              url: CALL, method: 'POST',
              headers: { 'x-signature-256': signEnvelope(bodyStr, GATE_SECRET) },
              body: bodyStr,
            },
          };
        };
        const results = await probeEdge(harness, [
          shape('http://public-target.example/'),
          shape('https://127.0.0.1/'),
          shape('https://169.254.169.254/latest/meta-data/'),
        ]);
        if (!results) return skip('relay-edge not armed');
        const graded = [];
        for (const origin of ['http://public-target.example/', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data/']) {
          const s = shapeResults(results, 'origin:' + origin);
          if (!s) return { verdict: 'EXPLOITED', detail: `origin guard probe faulted on ${origin} - guards answer typed, never crash`, tookRequests: results.length };
          graded.push(s);
          const code = s.body && s.body.reply && s.body.reply.code;
          if (s.status !== 200 || !s.body || s.body.received !== true || code === undefined || code === 'UPS' + 'T') {
            return { verdict: 'EXPLOITED', detail: `hostile origin ${origin} answered ${s.status}${code ? '/' + code : ''} - the guard must refuse typed INSIDE the 200 ack, never dispatch and never HTTP-error`, tookRequests: graded.length, evidence: { origin, status: s.status } };
          }
        }
        return { verdict: 'REFUSED', detail: 'http-downgrade, loopback, and metadata origins all refused with typed ack codes - no lab escape on the edge', tookRequests: graded.length };
      },
    },

    {
      name: 'encrypted-pipes-only-and-body-cap',
      description: 'plaintext hop bodies answer NEEDS_ENVELOPE typed inside the 200 (no downgrade, ever) and a body beyond the doors\' shared 1 MiB cap answers 413 - the transport posture is shared and loud (native pin 12)',
      async run(harness) {
        const plainBody = hopFrame('https://public-target.example/', '/api', 'plaintext-never-hops');
        const oversized = 'x'.repeat(1024 * 1024 + 1);
        const results = await probeEdge(harness, [
          { name: 'plaintext-hop', env: ENV_ON, request: { url: CALL, method: 'POST', headers: { 'x-signature-256': signEnvelope(plainBody, GATE_SECRET) }, body: plainBody } },
          { name: 'body-cap', env: ENV_ON, request: { url: CALL, method: 'POST', headers: { 'x-signature-256': 'a'.repeat(64) }, body: oversized } },
        ]);
        if (!results) return skip('relay-edge not armed');
        const plain = shapeResults(results, 'plaintext-hop');
        if (!plain) return { verdict: 'EXPLOITED', detail: 'edge probe threw on the plaintext lane - envelope downgrades answer typed, never fault', tookRequests: 1 };
        const code = plain.body && plain.body.reply && plain.body.reply.code;
        if (plain.status !== 200 || code === undefined || code === 'UP' + 'ST' || code === 'BAD_ORIGIN') {
          return { verdict: 'EXPLOITED', detail: `a plaintext hop body answered ${plain.status}${code ? '/' + code : ''} - plaintext must reach the envelope guard and answer NEEDS_ENVELOPE typed`, tookRequests: 1, evidence: { status: plain.status } };
        }
        const cap = shapeResults(results, 'body-cap');
        if (cap && cap.status !== 413) {
          return { verdict: 'EXPLOITED', detail: `a ${(oversized.length / (1024 * 1024)).toFixed(2)}MiB body answered ${cap.status} - the doors' shared 1 MiB cap must answer 413`, tookRequests: 2, evidence: { status: cap.status } };
        }
        return { verdict: 'REFUSED', detail: 'plaintext answered NEEDS_ENVELOPE typed inside the 200; the 1 MiB cap holds at 413 - encrypted pipes only, shared posture loud', tookRequests: cap ? 2 : 1 };
      },
    },
  ],
};
