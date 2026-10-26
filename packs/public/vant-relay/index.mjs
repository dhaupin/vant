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

/** In-process lib loader (house pattern): the pod's CJS lib face via
 * pathToFileURL + dynamic import, resolved from the repo root (the run
 * root and the bare gate both run packs from there). */
async function loadLib(relPath) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  return await import(pathToFileURL(resolve(relPath)).href);
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
      async run(_harness) {
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
      async run(_harness) {
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
      async run(_harness) {
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
      async run(_harness) {
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
      async run(_harness) {
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

    // ============ pod lib face (relay battery slice 1, 2026-10-26):
    // the SAME r/2 laws graded against the pod's own lib face (lib/api
    // `relay` + lib/encrypt + lib/config) loaded in-process — NO sockets,
    // NO run-root arm: these rows are self-contained. The edge rows above
    // grade the deploy; these grade the core underneath both faces.
    // Honest-absent this slice: the real-socket families (mount-listen,
    // wire HMAC lane, hop/ride round trips, body cap on the wire,
    // liveness counters, the traveler carrier) queue behind an in-process
    // socket arm; native test/relay.test.js stays green alongside under
    // the reverse-verification law.

    {
      name: 'lib-face-truth-and-envelope-canon',
      description: 'the pod lib face announces contract r/2 with the webhook-native route and events (no rogue module behind it), and the seal roundtrips: envelope() emits the 4-part colon canon and openEnvelope() opens it back to the SAME plaintext with the SAME key',
      async run(_harness) {
        let relayCore;
        try { relayCore = (await loadLib('lib/api.js')).relay; }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the pod lib face was not reachable in-process - the core must load, not fault: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        const st0 = relayCore.status();
        if (st0.contract !== 'r/2' || st0.route !== 'POST /relay') {
          return { verdict: 'EXPLOITED', detail: 'face truth drifted: ' + JSON.stringify(st0).slice(0, 150) + ' - the lib face must announce r/2 + POST /relay', tookRequests: 1, evidence: st0 };
        }
        if (!Array.isArray(st0.events) || !(st0.events.includes('relay.hop') && st0.events.includes('relay.ride'))) {
          return { verdict: 'EXPLOITED', detail: 'the lib face events list lost the r/2 families: ' + JSON.stringify(st0.events), tookRequests: 1, evidence: st0 };
        }
        const KEY = 'vant-relay-pack-channel-key-0123456789';
        const ct = relayCore.envelope('pack-lib-probe', KEY);
        const parts = String(ct).split(':');
        if (parts.length !== 4) {
          return { verdict: 'EXPLOITED', detail: 'the seal emitted ' + parts.length + ' parts - the canon is exactly 4 colon parts (salt:iv:tag:cipher)', tookRequests: 2, evidence: { ct: String(ct).slice(0, 60) } };
        }
        let opened = null;
        try { opened = relayCore.openEnvelope(ct, KEY); } catch { opened = null; }
        if (opened !== 'pack-lib-probe') {
          return { verdict: 'EXPLOITED', detail: 'the seal roundtrip broke: openEnvelope with the SAME key returned ' + JSON.stringify(opened), tookRequests: 2, evidence: { opened: String(opened).slice(0, 60) } };
        }
        // fail-closed half: the WRONG key must open NOTHING (no salvage)
        let wrongOpened = 'no-throw';
        try { wrongOpened = relayCore.openEnvelope(ct, 'the-wrong-channel-key-00000000000'); } catch (e) { wrongOpened = null; }
        if (wrongOpened !== null && wrongOpened !== undefined) {
          return { verdict: 'EXPLOITED', detail: 'a WRONG channel key salvaged open the seal (got: ' + String(wrongOpened).slice(0, 40) + ') - decode must fail CLOSED', tookRequests: 3 };
        }
        return { verdict: 'REFUSED', detail: "contract r/2 + POST /relay + both event families declared; the seal roundtrips to the same plaintext and a wrong key opens NOTHING - the lib face and canon are sound", tookRequests: 3 };
      },
    },

    {
      name: 'lib-face-mount-gates-fail-closed',
      description: 'the mount posture is first-class in-process: relay OFF binds NOTHING (enabled=false, mounted=false) and enabled WITHOUT a gate secret binds NOTHING either (fail-closed - the key gate refuses before any wire exists)',
      async run(_harness) {
        const cfg = await loadLib('lib/config.js');
        let relayCore;
        try { relayCore = (await loadLib('lib/api.js')).relay; }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the pod lib face was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        const savedEnabled = cfg.get('relay.enabled');
        const savedGate = cfg.get('relay.gateKey');
        try {
          cfg.set('relay.enabled', false);
          const off = relayCore.mount();
          if (off.mounted !== false) {
            return { verdict: 'EXPLOITED', detail: 'an OFF mount BINDS: ' + JSON.stringify(off).slice(0, 120) + ' - OFF must be first-class', tookRequests: 1, evidence: off };
          }
          cfg.set('relay.enabled', true);
          cfg.set('relay.gateKey', null);
          const nk = relayCore.mount();
          if (nk.enabled !== true || nk.mounted !== false) {
            return { verdict: 'EXPLOITED', detail: 'enabled-without-secret mounted a wire: ' + JSON.stringify(nk).slice(0, 120) + ' - the key gate must fail CLOSED (2b)', tookRequests: 2, evidence: nk };
          }
          return { verdict: 'REFUSED', detail: 'OFF binds nothing and enabled-without-secret binds nothing - both mount gates fail closed in-process, matching the edge posture rows', tookRequests: 2 };
        } finally {
          cfg.set('relay.enabled', savedEnabled);
          cfg.set('relay.gateKey', savedGate);
        }
      },
    },

    {
      name: 'lib-face-origin-policy-wall',
      description: 'the origin policy resolver holds all seven shapes: public https rides the standing SSRF wall, plain http refuses typed E_RELAY_BAD_ORIGIN, intranet admission reaches ONLY loopback+RFC1918 (cloud metadata and multicast stay walled through every posture), the public internet stays refused under intranet, the lab escape widens LAST to policy off, and an unparseable origin refuses through the SAME typed language',
      async run(_harness) {
        let api;
        try { api = await loadLib('lib/api.js'); }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the pod lib face was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        const policy = api._relayOriginPolicy;
        if (typeof policy !== 'function') {
          return { verdict: 'EXPLOITED', detail: 'the origin policy resolver is gone from the lib face - the wall must be inspectable, not hidden', tookRequests: 0 };
        }
        const p = (origin, cfg) => policy(origin, { allowPrivate: false, intranet: false, ...(cfg || {}) });
        const shapes = [
          { label: 'public https', origin: 'https://pod.example.com', cfg: {}, want: (r) => r.ok === true && r.policy === 'refuse' },
          { label: 'public http', origin: 'http://example.com', cfg: {}, want: (r) => !r.ok && r.code === 'E_RELAY_BAD_ORIGIN' },
          { label: 'intranet loopback', origin: 'http://127.0.0.1:7717', cfg: { intranet: true }, want: (r) => r.ok === true && r.policy === 'privateLan' },
          { label: 'intranet RFC1918', origin: 'http://10.40.2.7:7717', cfg: { intranet: true }, want: (r) => r.ok === true && r.policy === 'privateLan' },
          { label: 'cloud metadata', origin: 'http://169.254.169.254/latest', cfg: { intranet: true }, want: (r) => !r.ok && r.code === 'E_RELAY_BAD_ORIGIN' },
          { label: 'multicast', origin: 'http://224.0.0.1/', cfg: { intranet: true }, want: (r) => !r.ok },
          { label: 'intranet public http', origin: 'http://example.com', cfg: { intranet: true }, want: (r) => !r.ok && r.code === 'E_RELAY_BAD_ORIGIN' },
          { label: 'lab escape', origin: 'http://example.com', cfg: { allowPrivate: true }, want: (r) => r.ok === true && r.policy === 'off' },
          { label: 'unparseable', origin: 'not-an-origin', cfg: {}, want: (r) => !r.ok && r.code === 'E_RELAY_BAD_ORIGIN' },
        ];
        const graded = [];
        for (const s of shapes) {
          let r;
          try { r = p(s.origin, s.cfg); }
          catch (e) {
            return { verdict: 'EXPLOITED', detail: 'the resolver THREW on ' + s.label + ' - guards answer typed, never crash', tookRequests: graded.length, evidence: { label: s.label, error: String(e?.message).slice(0, 90) } };
          }
          graded.push(s.label);
          if (!s.want(r)) {
            return { verdict: 'EXPLOITED', detail: 'origin wall breach on ' + s.label + ': ' + JSON.stringify(r).slice(0, 140) + ' - the wall posture must hold on this shape', tookRequests: graded.length, evidence: { label: s.label, verdict: r } };
          }
        }
        return { verdict: 'REFUSED', detail: 'all nine origin-policy shapes hold: the SSRF wall survives every posture (intranet admits only LAN scope; metadata/multicast never ride), the lab escape widens last, and refusals share ONE typed language', tookRequests: graded.length };
      },
    },

    {
      name: 'lib-face-dispatch-guards-typed',
      description: 'the dispatch seam answers typed with NO wire: an OFF posture dispatch refuses rides with E_RIDE_OFFLINE (honest absence, never a fake ride) and a plaintext hop body refuses with E_RELAY_NEEDS_ENVELOPE (no downgrade at the core either)',
      async run(_harness) {
        const cfg = await loadLib('lib/config.js');
        let relayCore;
        try { relayCore = (await loadLib('lib/api.js')).relay; }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the pod lib face was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        const savedEnabled = cfg.get('relay.enabled');
        const savedPrivate = cfg.get('relay.allowPrivateOrigins');
        try {
          cfg.set('relay.enabled', false);
          const dsOff = { dispatched: 0 };
          await relayCore._dispatchRide({ body: { event: 'relay.ride', payload: { ct: 'a'.repeat(96) } }, _dispatchState: dsOff });
          if (!(dsOff.reply && dsOff.reply.ok === false && dsOff.reply.code === 'E_RIDE_OFFLINE')) {
            return { verdict: 'EXPLOITED', detail: 'an OFF dispatch did not refuse E_RIDE_OFFLINE: ' + JSON.stringify(dsOff.reply).slice(0, 140) + ' - absent posture must answer honestly', tookRequests: 1, evidence: dsOff.reply };
          }
          cfg.set('relay.enabled', savedEnabled);
          cfg.set('relay.allowPrivateOrigins', false);
          const dsHop = { dispatched: 0 };
          await relayCore._dispatchHop({ body: { event: 'relay.hop', payload: { origin: 'https://rel-dispatch-probe.local', path: '/x', ct: 'plaintext-not-an-envelope' } }, _dispatchState: dsHop });
          if (!(dsHop.reply && dsHop.reply.ok === false && dsHop.reply.code === 'E_RELAY_NEEDS_ENVELOPE')) {
            return { verdict: 'EXPLOITED', detail: 'a plaintext hop body did not refuse NEEDS_ENVELOPE: ' + JSON.stringify(dsHop.reply).slice(0, 140) + ' - no downgrade at the core', tookRequests: 2, evidence: dsHop.reply };
          }
          return { verdict: 'REFUSED', detail: 'OFF rides refuse E_RIDE_OFFLINE and plaintext hops refuse E_RELAY_NEEDS_ENVELOPE - both dispatch guards answer typed with no wire attached', tookRequests: 2 };
        } finally {
          cfg.set('relay.enabled', savedEnabled);
          cfg.set('relay.allowPrivateOrigins', savedPrivate);
        }
      },
    },

    {
      name: 'lib-face-sender-gate-refusal-typed',
      description: 'the sender seam refuses BEFORE any wire: relay.send with an under-sized gate secret throws typed E_RELAY_GATE_REQUIRED (the client half is fail-closed too - a short key never dials, never materializes a lane)',
      async run(_harness) {
        let relayCore;
        try { relayCore = (await loadLib('lib/api.js')).relay; }
        catch (e) {
          return { verdict: 'EXPLOITED', detail: 'the pod lib face was not reachable in-process: ' + String(e?.message).slice(0, 110), tookRequests: 0 };
        }
        let caught = null;
        try {
          await relayCore.send('http://relay-sender-probe.invalid/', 'short', { ct: 'x' });
        } catch (e) { caught = String(e && e.message); }
        if (caught === null) {
          return { verdict: 'EXPLOITED', detail: 'relay.send with a short key sent ANYWAY (no throw) - the sender half must refuse before any dial', tookRequests: 1 };
        }
        if (!caught.startsWith('E_RELAY_GATE_REQUIRED')) {
          return { verdict: 'EXPLOITED', detail: 'the sender refusal lost its type: ' + caught.slice(0, 110) + ' - refusals share ONE typed language (native pin 14a)', tookRequests: 1, evidence: { message: caught.slice(0, 110) } };
        }
        return { verdict: 'REFUSED', detail: 'a short gate secret answered E_RELAY_GATE_REQUIRED typed, pre-dial - the sender half is fail-closed to the same law as the receiver', tookRequests: 1 };
      },
    },
  ],
};
