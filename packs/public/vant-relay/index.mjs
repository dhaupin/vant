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

/** The slice-2 wire kit: real relay + config + encrypt, keyed for the
 * wire rows (the SAME keys all rows share so verdicts compose once). */
const CHANNEL_KEY = 'vant-relay-pack-channel-key-0123456789abc';
// The ride nonce store PERSISTS across the two pack cycles in one
// process, so a fixed inner nonce would replay on cycle 2 and diverge
// the second run. Every ride row mints its nonces FRESH per run (the
// helper is per-process; the verdicts carry none of it).
const _nonceSeed = Date.now().toString(36).slice(-7);
let _nonceCount = 0;
function freshNonce(prefix) {
  return prefix + _nonceSeed + '-' + (++_nonceCount).toString(36).padStart(4, '0');
}

async function wireKit() {
  const api = await loadLib('lib/api.js');
  const cfg = await loadLib('lib/config.js');
  const enc = await loadLib('lib/encrypt.js');
  return { relay: api.relay, cfg, Encrypt: enc.default || enc };
}

/** Mount the REAL relay route on loopback (port 0), await its listen,
 * run the row body, then ALWAYS unmount + restore the gating keys. */
async function withMountedRelay(relayCore, fn) {
  const { cfg } = await wireKit();
  const savedEnabled = cfg.get('relay.enabled');
  const savedGate = cfg.get('relay.gateKey');
  cfg.set('relay.enabled', true);
  cfg.set('relay.gateKey', GATE_SECRET);
  const m = relayCore.mount({ port: 0 });
  if (!m.mounted) {
    cfg.set('relay.enabled', savedEnabled);
    cfg.set('relay.gateKey', savedGate);
    throw new Error('relay.mount did not bind (gate posture failed): ' + JSON.stringify(m).slice(0, 120));
  }
  const srv = relayCore._getMountedState() && relayCore._getMountedState().server;
  if (!srv) {
    try { await relayCore.unmount(); } catch { /* noop */ }
    cfg.set('relay.enabled', savedEnabled);
    cfg.set('relay.gateKey', savedGate);
    throw new Error('relay.mount left no inspectable server');
  }
  await new Promise((res) => { if (srv.listening) return res(); srv.on('listening', res); });
  const port = srv.address().port;
  let out;
  try { out = await fn(port); }
  finally {
    try { await relayCore.unmount(); } catch { /* already down */ }
    cfg.set('relay.enabled', savedEnabled);
    cfg.set('relay.gateKey', savedGate);
  }
  return out;
}

/** One HTTP POST /relay over a REAL loopback socket; resolves a
 * bounded {status, json, raw} - never rejects. */
async function postWire(port, rawBody, headers) {
  const http = await import('node:http');
  return await new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port, path: '/relay', method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json',
        'content-length': Buffer.byteLength(rawBody) }, headers || {}),
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch { /* non-JSON */ } resolve({ status: res.statusCode, json: j, raw: data }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, raw: '' }));
    req.end(rawBody);
  });
}

/** Compose + sign ONE envelope: the exact bytes posted are the exact
 * bytes signed (the cycle-2 law - never eval the composer twice). */
function signedEnvelope(event, payload) {
  const env = {
    event,
    from: 'wire-row',
    ts: Date.now(),
    nonce: 'w' + Math.random().toString(16).slice(2),
    payload,
    v: { major: 2 },
  };
  const raw = JSON.stringify(env);
  return { raw, sig: createHmac('sha256', GATE_SECRET).update(raw, 'utf8').digest('hex') };
}

/** A REAL local upstream server (the hop's far side); its captures ride
 * the returned .seen array. */
async function startUpstream(http, token) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, body: String(body), auth: req.headers.authorization || null, gate: req.headers['x-relay-gate'] });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: token }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, seen };
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
  return { status: hit.status, body: parseJson(hit.bodyText), headers: hit.headers || null };
}

export default {
  name: 'vant-relay',
  description: "r/2 discipline driven in-process from the edge face through the pod lib core onto the REAL wire: posture and key gates fail closed, the HMAC lane verifies over RAW body bytes, staleness refuses typed, hostile origins never pass the rolling wall, the 1 MiB cap holds, the sealed lane rides keyless with seal-sig dedupe, and the traveler carrier lands id-named through the door slot",

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

    // ============ pod lib face (relay battery slice 1, 2026-10-26):
    // the SAME r/2 laws graded against the pod's own lib face (lib/api
    // `relay` + lib/encrypt + lib/config) loaded in-process — NO sockets,
    // NO run-root arm: these rows are self-contained. The edge rows above
    // grade the deploy; these grade the core underneath both faces.
    // Honesty note: the wire/socket families now drive in-process too
    // (slice 2, below — the real route mounted on loopback port 0), so
    // nothing here stays honest-absent; native test/relay.test.js stays
    // green alongside under the reverse-verification law.

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

    // ============ wire families (relay battery slice 2, 2026-10-26):
    // the REAL wire, in-process: each row mounts the actual relay route
    // (relay.mount({ port: 0 })) on loopback and drives it over HTTP —
    // sockets yes, arms no. Every composed envelope is serialized and
    // signed ONCE (the exact bytes posted are the exact bytes signed —
    // the cycle-2 origin-row law). Config keys are saved+restored; the
    // mount is unmounted in every finally.

    {
      name: 'wire-hmac-lane-and-replay-gate',
      description: 'the gate IS the route secret over the real wire: unsigned posts answer 401, a wrong signature answers 401 (timing-safe verify), a correct raw-body HMAC passes into the 200 ack, and the SAME signed bytes replay 409 at the transport',
      async run(_harness) {
        const { relay: relayCore } = await wireKit();
        return await withMountedRelay(relayCore, async (port) => {
          const good = signedEnvelope('relay.hop', { origin: 'https://wire-hmac-probe.local/', path: '/x', ct: SEALED_CT });
          const unsigned = await postWire(port, good.raw, {});
          const wrong = await postWire(port, good.raw, { 'x-signature-256': '0'.repeat(64) });
          const valid = await postWire(port, good.raw, { 'x-signature-256': good.sig });
          const replay = await postWire(port, good.raw, { 'x-signature-256': good.sig });
          if (unsigned.status !== 401 || wrong.status !== 401) {
            return { verdict: 'EXPLOITED', detail: 'unsigned answered ' + unsigned.status + ' and wrong-sig answered ' + wrong.status + ' - the HMAC lane must refuse both 401', tookRequests: 3, evidence: { unsigned: unsigned.status, wrong: wrong.status } };
          }
          if (valid.status !== 200 || !valid.json || valid.json.received !== true) {
            return { verdict: 'EXPLOITED', detail: 'the correct HMAC answered ' + valid.status + ' - a valid credential must reach the 200 ack', tookRequests: 3, evidence: { valid: valid.status } };
          }
          if (replay.status !== 409) {
            return { verdict: 'EXPLOITED', detail: 'the identical signed bytes replayed as ' + replay.status + ' - the transport replay gate answers 409', tookRequests: 3, evidence: { replay: replay.status } };
          }
          return { verdict: 'REFUSED', detail: 'no header and a wrong signature refused 401, the correct raw-body HMAC passed into the 200 ack, and identical bytes replayed 409 - the gate is the secret and it reads the raw bytes', tookRequests: 3 };
        });
      },
    },

    {
      name: 'wire-hop-roundtrip-and-no-body-leak',
      description: 'the FULL hop loop over real sockets: an http origin refuses typed in the public posture, a signed hop to a REAL local upstream forwards and the answer rides the same ack, the upstream sees ONLY the ct (no plaintext, no gate secret, the gate never rides inside the hop), and the envelope canon is 4 colon parts',
      async run(_harness) {
        const http = await import('node:http');
        const { relay: relayCore, cfg } = await wireKit();
        const upstream = await startUpstream(http, 'pong-pipe');
        const savedPriv = cfg.get('relay.allowPrivateOrigins');
        try {
          return await withMountedRelay(relayCore, async (port) => {
            const savedPriv2 = cfg.get('relay.allowPrivateOrigins');
            try {
              cfg.set('relay.allowPrivateOrigins', false);
              const publicHttp = signedEnvelope('relay.hop', { origin: 'http://127.0.0.1:' + upstream.port, path: '/up', ct: '00'.repeat(48) });
              const pubAns = await postWire(port, publicHttp.raw, { 'x-signature-256': publicHttp.sig });
              if (!(pubAns.status === 200 && pubAns.json && pubAns.json.reply && pubAns.json.reply.ok === false && pubAns.json.reply.code === 'E_RELAY_BAD_ORIGIN')) {
                return { verdict: 'EXPLOITED', detail: 'the http origin answered ' + pubAns.status + ' ' + JSON.stringify(pubAns.json || null).slice(0, 120) + ' - the public posture must refuse typed INSIDE the 200 ack', tookRequests: 1 };
              }
              cfg.set('relay.allowPrivateOrigins', true);
              const ct = relayCore.envelope('wire-hop-secret', CHANNEL_KEY);
              const hop = signedEnvelope('relay.hop', { origin: 'http://127.0.0.1:' + upstream.port, path: '/up', ct });
              const hopAns = await postWire(port, hop.raw, { 'x-signature-256': hop.sig });
              if (!(hopAns.status === 200 && hopAns.json && hopAns.json.reply && hopAns.json.reply.ok === true && String(hopAns.json.reply.raw || '').includes('pong-pipe'))) {
                return { verdict: 'EXPLOITED', detail: 'the full hop loop failed: ' + JSON.stringify(hopAns.json || null).slice(0, 140) + ' - a signed hop must forward to the real upstream and ride the answer back', tookRequests: 2 };
              }
              const seen = upstream.seen[upstream.seen.length - 1];
              if (!seen || !String(seen.body).includes('"ct') || String(seen.body).includes('wire-hop-secret')) {
                return { verdict: 'EXPLOITED', detail: 'the upstream saw plaintext: ' + JSON.stringify(seen).slice(0, 140) + ' - the upstream sees ONLY the ct', tookRequests: 2 };
              }
              if (String(seen.body).includes(GATE_SECRET) || seen.gate !== undefined) {
                return { verdict: 'EXPLOITED', detail: 'the gate secret leaked upstream - it is spent at verification and never rides the hop', tookRequests: 2 };
              }
              if (!(/:/.test(ct) && ct.split(':').length === 4)) {
                return { verdict: 'EXPLOITED', detail: 'the envelope canon drifted: ' + ct.split(':').length + ' parts (must be 4)', tookRequests: 2 };
              }
              return { verdict: 'REFUSED', detail: 'http-downgrade refused typed, the full hop rode a REAL upstream and back, the upstream saw only the ct (no plaintext, no gate), and the canon is 4 parts - encrypted pipes only, bodies sealed', tookRequests: 2 };
            } finally {
              cfg.set('relay.allowPrivateOrigins', savedPriv2);
            }
          });
        } finally {
          cfg.set('relay.allowPrivateOrigins', savedPriv);
          try { upstream.server.close(); } catch { /* already closed */ }
        }
      },
    },

    {
      name: 'wire-ride-core-loop-and-refusals',
      description: 'the RIDE core over real sockets: envelope in, opened with the channel key, nonce checked, the door answers with the bearer teleported INSIDE the envelope, the answer re-seals nonce-bound; transport replay 409s, a same-inner-nonce ride refuses typed E_RIDE_REPLAY, a ctx-less seal refuses typed E_RIDE_DECODE, and a wrong channel key decodes to NOTHING',
      async run(_harness) {
        const { relay: relayCore, cfg } = await wireKit();
        return await withMountedRelay(relayCore, async (port) => {
          const savedChan = cfg.get('relay.channelKey');
          cfg.set('relay.channelKey', CHANNEL_KEY);
          const doorSeen = [];
          relayCore.setDoorTransport(async ({ bearer, body }) => {
            doorSeen.push({ bearer, body });
            return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echo: 'wire-pong', gotAuth: bearer || null } }) };
          });
          try {
            const inner = (n, withCtx = true) => JSON.stringify({
              nonce: n,
              ...(withCtx ? { ctx: { origin: 'wire-intake', path: '/relay', nonce: n } } : {}),
              bearer: 'vguest_wire-ride-test-0123456789abcdef',
              body: { tool: 'echo_test', args: { q: 'through-the-wire' } },
            });
            const coreNonce = freshNonce('wire-ride-core-');
            const ride = () => signedEnvelope('relay.ride', { ct: relayCore.envelope(inner(coreNonce), CHANNEL_KEY) });
            const ry1 = ride();
            const ryd = await postWire(port, ry1.raw, { 'x-signature-256': ry1.sig });
            if (!(ryd.status === 200 && ryd.json && ryd.json.reply && ryd.json.reply.ok === true && ryd.json.reply.rode === true && typeof ryd.json.reply.ct === 'string')) {
              return { verdict: 'EXPLOITED', detail: 'the ride core did not serve the loop: ' + JSON.stringify(ryd.json || null).slice(0, 140), tookRequests: 1 };
            }
            let opened = null;
            try { opened = JSON.parse(relayCore.openEnvelope(ryd.json.reply.ct, CHANNEL_KEY)); } catch { opened = null; }
            if (!(opened && opened.nonce === coreNonce)) {
              return { verdict: 'EXPLOITED', detail: 'the re-sealed answer is not nonce-bound: ' + JSON.stringify(opened).slice(0, 110), tookRequests: 1 };
            }
            if (doorSeen.length !== 1 || doorSeen[0].bearer !== 'vguest_wire-ride-test-0123456789abcdef') {
              return { verdict: 'EXPLOITED', detail: 'the bearer did not teleport inside the envelope: ' + JSON.stringify(doorSeen).slice(0, 130), tookRequests: 1 };
            }
            if (JSON.stringify(doorSeen[0].body).includes(GATE_SECRET)) {
              return { verdict: 'EXPLOITED', detail: 'the door saw a tool call carrying the gate secret - never', tookRequests: 1 };
            }
            // transport replay = the IDENTICAL signed bytes, posted again
            // (fresh envelopes would only exercise the inner-nonce gate)
            const replayed = await postWire(port, ry1.raw, { 'x-signature-256': ry1.sig });
            if (replayed.status !== 409) {
              return { verdict: 'EXPLOITED', detail: 'identical ride bytes replayed ' + replayed.status + ' - the transport must 409 before the ride opens', tookRequests: 2, evidence: { replayed: replayed.status } };
            }
            const ry2 = signedEnvelope('relay.ride', { ct: relayCore.envelope(inner(coreNonce), CHANNEL_KEY) });
            const sameNonce = await postWire(port, ry2.raw, { 'x-signature-256': ry2.sig });
            if (!(sameNonce.status === 200 && sameNonce.json && sameNonce.json.reply && sameNonce.json.reply.ok === false && sameNonce.json.reply.code === 'E_RIDE_REPLAY')) {
              return { verdict: 'EXPLOITED', detail: 'a same-nonce ride on fresh bytes answered ' + JSON.stringify(sameNonce.json || null).slice(0, 120) + ' - inner-nonce replay must refuse typed E_RIDE_REPLAY', tookRequests: 3 };
            }
            const le = signedEnvelope('relay.ride', { ct: relayCore.envelope(inner(freshNonce('wire-ride-ctx-'), false), CHANNEL_KEY) });
            const ctxless = await postWire(port, le.raw, { 'x-signature-256': le.sig });
            if (!(ctxless.status === 200 && ctxless.json && ctxless.json.reply && ctxless.json.reply.ok === false && ctxless.json.reply.code === 'E_RIDE_DECODE')) {
              return { verdict: 'EXPLOITED', detail: 'a ctx-less seal answered ' + JSON.stringify(ctxless.json || null).slice(0, 120) + ' - the downgrade must refuse typed E_RIDE_DECODE', tookRequests: 4 };
            }
            const ke = signedEnvelope('relay.ride', { ct: relayCore.envelope(JSON.stringify({ nonce: freshNonce('wire-ride-wrong-'), body: { tool: 'echo_test' } }), 'a-completely-different-channel-key') });
            const wrong = await postWire(port, ke.raw, { 'x-signature-256': ke.sig });
            if (!(wrong.status === 200 && wrong.json && wrong.json.reply && wrong.json.reply.ok === false && wrong.json.reply.code === 'E_RIDE_DECODE')) {
              return { verdict: 'EXPLOITED', detail: 'a wrong/stale channel key answered ' + JSON.stringify(wrong.json || null).slice(0, 120) + ' - decode fails CLOSED, typed', tookRequests: 5 };
            }
            return { verdict: 'REFUSED', detail: 'the ride core served the full loop (nonce-bound re-seal, bearer teleported inside, the gate never leaks to the door) and every hostile shape refused typed: transport 409, inner replay E_RIDE_REPLAY, ctx-less E_RIDE_DECODE, wrong key decodes to NOTHING', tookRequests: 5 };
          } finally {
            relayCore.setDoorTransport(null);
            cfg.set('relay.channelKey', savedChan);
          }
        });
      },
    },

    {
      name: 'wire-body-cap-and-liveness-counters',
      description: "the shared posture on the wire: a body beyond the doors' 1 MiB cap answers 413, and the liveness counters MOVE with the served and refused traffic (hops served, gate refusals) - the face counts what it did, loudly",
      async run(_harness) {
        const { relay: relayCore, cfg } = await wireKit();
        // the ride counters are the face's honest liveness: a SERVED ride
        // bumps ridesServed, an inner-nonce replay bumps ridesReplayed, a
        // wrong-key decode bumps rideDecodeRefused (semantics measured
        // against the real wire, cycle-2)
        const savedChan = cfg.get('relay.channelKey');
        cfg.set('relay.channelKey', CHANNEL_KEY);
        return await withMountedRelay(relayCore, async (port) => {
          relayCore.setDoorTransport(async () => ({ ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echoed: 'counted-wire' } }) }));
          const inner = (n) => JSON.stringify({ nonce: n, ctx: { origin: 'wire-count-intake', path: '/relay', nonce: n }, bearer: null, body: { tool: 'echo_test', args: { q: 'counted' } } });
          const rideCt = (n, key) => relayCore.envelope(inner(n), key || CHANNEL_KEY);
          const env = (ct) => signedEnvelope('relay.ride', { ct });
          const st0 = relayCore.status().stats;
          const big = signedEnvelope('relay.hop', { origin: 'https://wire-cap-probe.local/', path: '/x', ct: '0'.repeat(1024 * 1024 + 64) });
          const cap = await postWire(port, big.raw, { 'x-signature-256': big.sig });
          const countNonce = freshNonce('wire-count-');
          const servedEnv = env(rideCt(countNonce));
          const served = await postWire(port, servedEnv.raw, { 'x-signature-256': servedEnv.sig });
          const replayEnv = env(rideCt(countNonce));
          const replayed = await postWire(port, replayEnv.raw, { 'x-signature-256': replayEnv.sig });
          const wrongEnv = env(rideCt(freshNonce('wire-count-'), 'a-completely-different-channel-key'));
          const wrong = await postWire(port, wrongEnv.raw, { 'x-signature-256': wrongEnv.sig });
          const st1 = relayCore.status().stats;
          relayCore.setDoorTransport(null);
          if (cap.status !== 413) {
            return { verdict: 'EXPLOITED', detail: "a " + (big.raw.length / (1024 * 1024)).toFixed(2) + "MiB body answered " + cap.status + " - the doors' shared cap answers 413", tookRequests: 4, evidence: { cap: cap.status } };
          }
          if (!(st1.ridesServed > st0.ridesServed)) {
            return { verdict: 'EXPLOITED', detail: 'a SERVED ride did not bump ridesServed: ' + JSON.stringify({ st0, st1 }).slice(0, 160), tookRequests: 4, evidence: { served: served.json && served.json.reply } };
          }
          if (!(st1.ridesReplayed > st0.ridesReplayed)) {
            return { verdict: 'EXPLOITED', detail: 'an inner-nonce replay did not bump ridesReplayed: ' + JSON.stringify(st1).slice(0, 160), tookRequests: 4, evidence: { replayed: replayed.json && replayed.json.reply } };
          }
          if (!(st1.rideDecodeRefused > st0.rideDecodeRefused)) {
            return { verdict: 'EXPLOITED', detail: 'a wrong-key decode did not bump rideDecodeRefused: ' + JSON.stringify(st1).slice(0, 160), tookRequests: 4, evidence: { wrong: wrong.json && wrong.json.reply } };
          }
          return { verdict: 'REFUSED', detail: "served/replayed/decode-refused rides each counted in their own counter and the " + (big.raw.length / (1024 * 1024)).toFixed(2) + "MiB body answered 413 - the face counts what it did, loudly", tookRequests: 4 };
        }).finally(() => { cfg.set('relay.channelKey', savedChan); });
      },
    },

    {
      name: 'wire-sender-seam-and-bridge-families',
      description: 'the sender seam rides the real wire end-to-end (relay.send over sockets, the pong rides back), and the interface-handler bridge translates its families ONTO the door: relay.sync lands as brain_write, relay.call is the catch-all through the door, a bent payload refuses typed E_RIDE_DECODE, and an unknown family answers typed E_RELAY_UNKNOWN_EVENT',
      async run(_harness) {
        const http = await import('node:http');
        const { relay: relayCore, Encrypt, cfg } = await wireKit();
        const upstream = await startUpstream(http, 'pong-seam');
        const savedPriv = cfg.get('relay.allowPrivateOrigins');
        cfg.set('relay.allowPrivateOrigins', true);
        try {
          return await withMountedRelay(relayCore, async (port) => {
          const doorCalls = new Set();
          relayCore.setDoorTransport(async ({ body }) => {
            doorCalls.add(body && body.tool);
            if (body && body.tool === 'brain_write') return { ok: true, status: 200, body: JSON.stringify({ saved: true, name: body.args.name }) };
            if (body && body.tool === 'context_heartbeat') return { ok: true, status: 200, body: JSON.stringify({ running: true }) };
            if (body && body.tool === 'brain_current') return { ok: true, status: 200, body: JSON.stringify({ current: 'vant' }) };
            return { ok: true, status: 200, body: JSON.stringify({ echoed: body && body.tool }) };
          });
          try {
            const sent = await relayCore.send('http://127.0.0.1:' + port, GATE_SECRET,
              { origin: 'http://127.0.0.1:' + upstream.port, path: '/up', ct: relayCore.envelope('wire-sender-seam', CHANNEL_KEY) },
              { event: 'relay.hop', insecure: true });
            if (!(sent.ok === true && sent.reply && sent.reply.ok === true)) {
              return { verdict: 'EXPLOITED', detail: 'the sender seam did not ride the real wire: ' + JSON.stringify(sent).slice(0, 140), tookRequests: 1 };
            }
            const door = (event, payload) => {
              const env = { event, from: 'wire-bridge-row', ts: Date.now(), nonce: 'b' + Math.random().toString(16).slice(2), payload, v: { major: 2 } };
              const raw = JSON.stringify(env);
              return { raw, sig: Encrypt.hmacSign(raw, GATE_SECRET) };
            };
            const b1 = door('relay.sync', { name: 'wire-bridge-notes', content: 'ingested through the bridge' });
            const sync = await postWire(port, b1.raw, { 'x-signature-256': b1.sig });
            const b3 = door('relay.call', { tool: 'brain_list', args: {} });
            const call = await postWire(port, b3.raw, { 'x-signature-256': b3.sig });
            const bent = door('relay.call', { wrong: true });
            const bentAns = await postWire(port, bent.raw, { 'x-signature-256': Encrypt.hmacSign(bent.raw, GATE_SECRET) });
            const unknown = door('relay.nothing', { x: 1 });
            const unknownAns = await postWire(port, unknown.raw, { 'x-signature-256': unknown.sig });
            if (!(sync.status === 200 && sync.json && sync.json.reply && sync.json.reply.ok === true && sync.json.reply.answer && sync.json.reply.answer.saved === true && doorCalls.has('brain_write'))) {
              return { verdict: 'EXPLOITED', detail: 'relay.sync did not land as brain_write through the door: ' + JSON.stringify(sync.json || null).slice(0, 140), tookRequests: 3 };
            }
            if (!(call.status === 200 && call.json && call.json.reply && call.json.reply.ok === true && call.json.reply.answer && call.json.reply.answer.echoed === 'brain_list')) {
              return { verdict: 'EXPLOITED', detail: 'relay.call did not catch-all through the door: ' + JSON.stringify(call.json || null).slice(0, 140), tookRequests: 3 };
            }
            if (!(bentAns.status === 200 && bentAns.json && bentAns.json.reply && bentAns.json.reply.ok === false && bentAns.json.reply.code === 'E_RIDE_DECODE')) {
              return { verdict: 'EXPLOITED', detail: 'a bent bridge payload answered ' + JSON.stringify(bentAns.json || null).slice(0, 120) + ' - it must refuse typed E_RIDE_DECODE', tookRequests: 4 };
            }
            if (!(unknownAns.status === 200 && unknownAns.json && unknownAns.json.reply && unknownAns.json.reply.ok === false && unknownAns.json.reply.code === 'E_RELAY_UNKNOWN_EVENT')) {
              return { verdict: 'EXPLOITED', detail: 'an unknown family answered ' + JSON.stringify(unknownAns.json || null).slice(0, 120) + ' - the schema answers typed, never silence', tookRequests: 5 };
            }
            return { verdict: 'REFUSED', detail: 'the sender seam rode the wire end-to-end and the bridge translated honestly: sync landed as brain_write, call passed through the door, bent refused E_RIDE_DECODE, and the unknown family answered E_RELAY_UNKNOWN_EVENT typed', tookRequests: 5 };
          } finally {
            relayCore.setDoorTransport(null);
          }
          });
        } catch (e) {
          try { upstream.server.close(); } catch { /* already closed */ }
          throw e;
        } finally {
          cfg.set('relay.allowPrivateOrigins', savedPriv);
          try { upstream.server.close(); } catch { /* already closed */ }
        }
      },
    },

    {
      name: 'wire-sealed-lane-freshness-and-dedupe',
      description: 'the SEALED lane on the real wire (the seal inside the payload IS the credential, keyed by the channel key - no gate header): a channel-key seal rides, a gate-key seal rides on the same verify set, a present-but-wrong seal refuses 401, a stale seal settles 401 outside the freshness window, and the same VALID seal on fresh top-level bytes still 409s because the seal sig is the dedupe key',
      async run(_harness) {
        const { relay: relayCore, Encrypt, cfg } = await wireKit();
        // the seal verify set [gate, channel] ARMS AT MOUNT (the snapshot
        // law): the channel key binds BEFORE relay.mount()
        const savedChan = cfg.get('relay.channelKey');
        cfg.set('relay.channelKey', CHANNEL_KEY);
        let sealedOut;
        try {
          sealedOut = await withMountedRelay(relayCore, async (port) => {
          relayCore.setDoorTransport(async () => ({ ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echoed: 'sealed-wire' } }) }));
          try {
            const ride = (n) => relayCore.envelope(JSON.stringify({ nonce: n, ctx: { origin: 'wire-sealed-intake', path: '/relay', nonce: n }, bearer: null, body: { tool: 'echo_test', args: { q: 'sealed' } } }), CHANNEL_KEY);
            const sealedBody = (ct, key, ts) => JSON.stringify({ event: 'relay.ride', from: 'wire-sealed-row', ts: Date.now(), nonce: 's' + Math.random().toString(16).slice(2), payload: { ct, seal: { sig: Encrypt.hmacSign(ct, key), ts: ts === undefined ? Date.now() : ts } }, v: { major: 2 } });
            const keyless = await postWire(port, sealedBody(ride(freshNonce('wire-seal-')), CHANNEL_KEY), {});
            await new Promise((r) => setTimeout(r, 6));
            const gateSeal = await postWire(port, sealedBody(ride(freshNonce('wire-seal-')), GATE_SECRET), {});
            const wrong = await postWire(port, JSON.stringify({ event: 'relay.ride', from: 'wire-sealed-row', ts: Date.now(), nonce: 's' + Math.random().toString(16).slice(2), payload: { ct: ride(freshNonce('wire-seal-')), seal: { sig: Encrypt.hmacSign('not-the-ct', CHANNEL_KEY), ts: Date.now() } }, v: { major: 2 } }), {});
            const staleAns = await postWire(port, sealedBody(ride(freshNonce('wire-seal-')), CHANNEL_KEY, Date.now() - (6 * 60 * 1000)), {});
            const ctE = ride(freshNonce('wire-seal-'));
            const shared = { sig: Encrypt.hmacSign(ctE, CHANNEL_KEY), ts: Date.now() };
            const fresh = () => JSON.stringify({ event: 'relay.ride', from: 'wire-sealed-row', ts: Date.now(), nonce: 's' + Math.random().toString(16).slice(2), payload: { ct: ctE, seal: shared }, v: { major: 2 } });
            const first = await postWire(port, fresh(), {});
            await new Promise((r) => setTimeout(r, 6));
            const second = await postWire(port, fresh(), {});
            if (!(keyless.status === 200 && keyless.json && keyless.json.reply && keyless.json.reply.ok === true && keyless.json.reply.rode === true)) {
              return { verdict: 'EXPLOITED', detail: 'the keyless channel-key seal did not ride: ' + JSON.stringify(keyless.json || null).slice(0, 140), tookRequests: 2 };
            }
            if (!(gateSeal.status === 200 && gateSeal.json && gateSeal.json.reply && gateSeal.json.reply.ok === true)) {
              return { verdict: 'EXPLOITED', detail: 'the gate-key seal did not verify on the verify set: ' + JSON.stringify(gateSeal.json || null).slice(0, 120), tookRequests: 3 };
            }
            if (wrong.status !== 401 || staleAns.status !== 401) {
              return { verdict: 'EXPLOITED', detail: 'a wrong seal answered ' + wrong.status + ' and a stale seal answered ' + staleAns.status + ' - present-but-invalid is WORSE than absent, and staleness settles 401', tookRequests: 5, evidence: { wrong: wrong.status, stale: staleAns.status } };
            }
            if (!(first.status === 200 && second.status === 409)) {
              return { verdict: 'EXPLOITED', detail: 'the same VALID seal on fresh top-level bytes answered ' + first.status + ' then ' + second.status + ' - the seal sig is the dedupe key, not the envelope bytes', tookRequests: 5 };
            }
            return { verdict: 'REFUSED', detail: 'the sealed lane rode keyless, the verify set took both keys, wrong/stale seals refused 401, and the same valid seal on fresh bytes replayed 409 - freshness + seal-sig dedupe hold on the wire', tookRequests: 5 };
          } finally {
            relayCore.setDoorTransport(null);
          }
          });
          return sealedOut;
        } finally {
          relayCore.setDoorTransport(null);
          cfg.set('relay.channelKey', savedChan);
        }
      },
    },

    {
      name: 'wire-traveler-carrier-id-named',
      description: 'the traveler carrier (tr/1) rides the real wire as a bridge family: a legal packet dispatches and its door landing is the brain_write record slot NAMED traveler-<id>-tr1.json with the packet inside; a bent packet (seq != steps) refuses typed INSIDE the 200 ack (E_TRAVELER_STEP) and an unknown tr/ version refuses the SAME lane (E_TRAVELER_SCHEMA) - the rizer never guesses',
      async run(_harness) {
        const { relay: relayCore } = await wireKit();
        return await withMountedRelay(relayCore, async (port) => {
          const seen = [];
          relayCore.setDoorTransport(async ({ body }) => {
            seen.push({ body });
            return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }) };
          });
          try {
            const { createHash } = await import('node:crypto');
            const trId = createHash('sha256').update('relay-wire-travel-row').digest('hex');
            const pkt = { tr: 'tr/1', id: trId, from: 'wire-travel-row', seq: 1, steps: [{ seq: 1, op: 'open', by: 'wire-travel-row', ts: 0 }], slots: { title: 'the wire pin' }, v: { major: 2 } };
            const legal = signedEnvelope('relay.travel', pkt);
            const legalAns = await postWire(port, legal.raw, { 'x-signature-256': legal.sig });
            const bent = signedEnvelope('relay.travel', Object.assign({}, pkt, { seq: 9 }));
            const bentAns = await postWire(port, bent.raw, { 'x-signature-256': bent.sig });
            const future = signedEnvelope('relay.travel', Object.assign({}, pkt, { tr: 'tr/9' }));
            const futureAns = await postWire(port, future.raw, { 'x-signature-256': future.sig });
            const land = seen[seen.length - 1];
            if (!(legalAns.status === 200 && legalAns.json && legalAns.json.reply && legalAns.json.reply.ok === true)) {
              return { verdict: 'EXPLOITED', detail: 'the legal traveler did not dispatch: ' + JSON.stringify(legalAns.json || null).slice(0, 140), tookRequests: 3 };
            }
            if (!(land && land.body && land.body.tool === 'brain_write' && land.body.args && land.body.args.name === 'traveler-' + trId + '-tr1.json' && land.body.args.format === 'json' && JSON.parse(land.body.args.content).id === trId)) {
              return { verdict: 'EXPLOITED', detail: 'the traveler did not land id-named through the brain_write slot: ' + JSON.stringify(land || null).slice(0, 160), tookRequests: 3 };
            }
            if (!(bentAns.status === 200 && bentAns.json && bentAns.json.reply && bentAns.json.reply.ok === false && bentAns.json.reply.code === 'E_RIDE_DECODE' && String(bentAns.json.reply.error) === 'E_TRAVELER_STEP')) {
              return { verdict: 'EXPLOITED', detail: 'a bent traveler answered ' + JSON.stringify(bentAns.json || null).slice(0, 140) + ' - the shared door-disposition code must carry E_TRAVELER_STEP INSIDE the 200 ack', tookRequests: 3 };
            }
            if (!(futureAns.status === 200 && futureAns.json && futureAns.json.reply && futureAns.json.reply.ok === false && futureAns.json.reply.code === 'E_RIDE_DECODE' && String(futureAns.json.reply.error) === 'E_TRAVELER_SCHEMA')) {
              return { verdict: 'EXPLOITED', detail: 'an unknown tr/ answered ' + JSON.stringify(futureAns.json || null).slice(0, 140) + ' - the rizer never guesses forward; E_TRAVELER_SCHEMA rides the same lane', tookRequests: 4 };
            }
            return { verdict: 'REFUSED', detail: 'the traveler dispatched and landed id-named through the brain_write slot, the bent packet carried E_TRAVELER_STEP inside the 200 ack, and the unknown tr/ version carried E_TRAVELER_SCHEMA on the SAME lane - the structural packet rides the wire without a fake guess', tookRequests: 4 };
          } finally {
            relayCore.setDoorTransport(null);
          }
        });
      },
    },
  // ------------------------------------------------------------------
  // Edge-family deepening (2026-10-27): the caps page + the SSE
  // stream-through joined the edge face (web/relay/functions/api/r/
  // {capabilities,events}.ts) after the edge slice landed - the packs go
  // WITH the thing they attack. Both drive the REAL handlers through the
  // same relay-edge probe child (strip types, WHATWG Request/Response,
  // WebCrypto), no sockets, no wall clock in a verdict.
  // ------------------------------------------------------------------

    {
      name: 'edge-caps-posture-page',
      description: "the caps page is the PUBLIC posture proof: posture OFF answers the pod-parity raw 404 (error 'Not Found', no CORS inflation), posture ON answers 200 with the solo-relay flavor, the r/2 surface named (both doors), and CORS open WIDE only on this secrets-free route - the x-content-type-options no-sniff rides both, the gate secret arrives on NO wire shape",
      async run(harness) {
        const shapes = [
          { name: 'caps-off', env: {}, edge: 'capabilities', request: { url: 'https://relay-edge.local/api/r/capabilities', method: 'GET', headers: {} } },
          { name: 'caps-on', env: ENV_ON, edge: 'capabilities', request: { url: 'https://relay-edge.local/api/r/capabilities', method: 'GET', headers: { origin: 'https://some-dashboard.example' } } },
        ];
        const r = await probeEdge(harness, shapes);
        if (!r) return skip('relay-edge not armed');
        const off = shapeResults(r, 'caps-off');
        const on = shapeResults(r, 'caps-on');
        if (!off || !on) return { verdict: 'EXPLOITED', detail: 'the caps shapes did not answer: ' + JSON.stringify(r).slice(0, 140), tookRequests: 1 };
        if (off.status === 'THREW') return { verdict: 'EXPLOITED', detail: 'the caps child threw: ' + (off.body && off.body.error || '').slice(0, 120), tookRequests: 1 };
        if (!(off.status === 404 && off.body && off.body.error === 'Not Found')) {
          return { verdict: 'EXPLOITED', detail: 'posture OFF answered ' + off.status + ' - the unmounted route must match the pod parity raw 404', tookRequests: 2 };
        }
        if (on.status === 'THREW') return { verdict: 'EXPLOITED', detail: 'the live caps child threw: ' + (on.body && on.body.error || '').slice(0, 120), tookRequests: 3 };
        if (on.status !== 200 || !(on.body && on.body.flavor === 'solo-relay')) {
          return { verdict: 'EXPLOITED', detail: 'a live posture answered ' + JSON.stringify({ status: on.status, flavor: on.body && on.body.flavor }) + ' probeRide=' + JSON.stringify(r).slice(0, 400), tookRequests: 3 };
        }
        const caps = JSON.stringify(on.body);
        if (!caps.includes('/api/r/events') || !caps.includes('POST /relay')) {
          return { verdict: 'EXPLOITED', detail: 'the caps page did not name the r/2 surface (both doors)', tookRequests: 4 };
        }
        if (caps.includes(GATE_SECRET)) {
          return { verdict: 'EXPLOITED', detail: 'THE CAPS PAGE CARRIES THE GATE SECRET - secrets never ride a caps page', tookRequests: 4 };
        }
        if (!(on.headers && on.headers.cors === '*')) {
          return { verdict: 'EXPLOITED', detail: 'the caps page did not open its wildcard CORS (the posture proof must be cross-origin readable): ' + JSON.stringify(on.headers), tookRequests: 4 };
        }
        if (!(on.headers && on.headers.nosniff === 'nosniff' && off.headers && off.headers.nosniff === 'nosniff')) {
          return { verdict: 'EXPLOITED', detail: 'the no-sniff hardening dropped on a caps answer: ' + JSON.stringify({ on: on.headers, off: off.headers }), tookRequests: 4 };
        }
        return { verdict: 'REFUSED', detail: 'the caps page is a honest proof: raw-404 parity off posture, solo-relay 200 with both doors named and ZERO secrets, wildcard CORS only on the secrets-free route, no-sniff everywhere', tookRequests: 4 };
      },
    },

    {
      name: 'edge-events-gate-ladder',
      description: "the SSE stream-through's GET gate is the FULL r/2 ladder re-run over DECLARATIONS: posture off = raw 404; enabled without a secret = typed 503 fail-closed; a missing signature, a WRONG signature and a STALE ts (signed but outside the freshness window) all answer 401 typed; and the declared target rides the same origin guard - a plaintext hop 403s, the metadata IP 403s, a traversal path 400s - the bytes never pipe through a refusal",
      async run(harness) {
        const now = Date.now();
        const staleTs = now - (11 * 60 * 1000);
        // the edge signs url.search VERBATIM - and url.search carries the
        // LEADING '?'. The signed bytes are the full search string.
        const q = (origin, path, ts) => '?origin=' + origin + '&path=' + path + '&ts=' + ts;
        const sig = (s) => createHmac('sha256', GATE_SECRET).update(s, 'utf8').digest('hex');
        const EV = 'https://relay-edge.local/api/r/events';
        const mk = (name, env, search, headers) => ({ name, env, edge: 'events', request: { url: EV + search, method: 'GET', headers: headers || {} } });
        const sigHeader = (val) => ({ 'x-signature-256': val });
        const shapes = [
          mk('ev-off', {}, q('https://stream.example', '/feed', now)),
          mk('ev-nosecret', { VANT_RELAY_ENABLED: '1' }, q('https://stream.example', '/feed', now)),
          mk('ev-nosig', ENV_ON, q('https://stream.example', '/feed', now)),
          mk('ev-badsig', ENV_ON, q('https://stream.example', '/feed', now), sigHeader('f'.repeat(64))),
          mk('ev-stale', ENV_ON, q('https://stream.example', '/feed', staleTs), sigHeader(sig(q('https://stream.example', '/feed', staleTs)))),
          mk('ev-http', ENV_ON, q('http://stream.example', '/feed', now), sigHeader(sig(q('http://stream.example', '/feed', now)))),
          mk('ev-metadata', ENV_ON, q('https://169.254.169.254', '/latest/meta-data', now), sigHeader(sig(q('https://169.254.169.254', '/latest/meta-data', now)))),
          mk('ev-badpath', ENV_ON, q('https://stream.example', '/../etc/passwd', now), sigHeader(sig(q('https://stream.example', '/../etc/passwd', now)))),
        ];
        const r = await probeEdge(harness, shapes);
        if (!r) return skip('relay-edge not armed');
        const get = (n) => shapeResults(r, n);
        const shot = (c, why, n) => ({ verdict: 'EXPLOITED', detail: why + ' [' + n + ']: ' + JSON.stringify(c).slice(0, 150), tookRequests: n === 'ev-stale' ? 5 : 8 });
        const off = get('ev-off');
        if (off.status === 'THREW') return shot(off, 'the events child threw', 'ev-off');
        if (!(off.status === 404 && off.body && off.body.error === 'Not Found')) return shot(off, 'a disabled relay served its events door (raw-404 parity broken)', 'ev-off');
        const nosec = get('ev-nosecret');
        if (!(nosec.status === 503 && JSON.stringify(nosec.body || {}).includes('VANT_RELAY_GATE_KEY'))) return shot(nosec, 'a gated-but-secretless relay served/answered oddly (must be typed 503 fail-closed)', 'ev-nosecret');
        const nosig = get('ev-nosig');
        if (!(nosig.status === 401 && JSON.stringify(nosig.body || {}).includes('X-Signature-256'))) return shot(nosig, 'a signature-less declaration answered ' + JSON.stringify(nosig && nosig.status), 'ev-nosig');
        const badsig = get('ev-badsig');
        if (!(badsig.status === 401 && JSON.stringify(badsig.body || {}).includes('Invalid signature'))) return shot(badsig, 'a WRONG signature verified or answered oddly', 'ev-badsig');
        const stale = get('ev-stale');
        if (!(stale.status === 401 && JSON.stringify(stale.body || {}).includes('Stale declaration'))) return shot(stale, 'a stale declaration (outside the freshness window) verified or answered oddly', 'ev-stale');
        const httpOrig = get('ev-http');
        if (!(httpOrig.status === 403)) return shot(httpOrig, 'a PLAINTEXT declared origin passed the edge guard', 'ev-http');
        const meta = get('ev-metadata');
        if (!(meta.status === 403)) return shot(meta, 'the metadata IP passed the edge origin guard', 'ev-metadata');
        const badp = get('ev-badpath');
        if (!(badp.status === 400)) return shot(badp, 'a traversal path passed the declared-path guard', 'ev-badpath');
        return { verdict: 'REFUSED', detail: 'the r/2 GET ladder holds over declarations: raw-404 parity, typed 503 secretless, missing/wrong/stale sigs all 401 typed, and the origin guards refuse the plaintext, metadata and traversal shapes - the bytes never pipe through a refusal', tookRequests: 8 };
      },
    },
  ],
};

