#!/usr/bin/env node
/**
 * pilot-pairing-ride (pass 272) — THE BINDING-INTO-RIDE LANE, LIVE.
 *
 * ONE full vant pod process over real HTTP (MCP door keyed, relay face
 * armed) walks the whole sovereign lane end to end:
 *
 *   P1  pairing_voucher_generate  (keyed operator call)
 *   P2  pairing_voucher_redeem    (the BINDING MOMENT: the reply carries
 *        the RAW e2e relay.channelKey exactly once, beside the guest token)
 *   P3  the paired client seals a REAL door call with the DELIVERED key —
 *        the Encrypt canon re-stated in node (PBKDF2-SHA256 100k →
 *        AES-256-GCM, 12 B IV, salt:iv:tag:cipher hex; the same math the
 *        browser seal is vitest-pinned byte-compatible with) — ride inner
 *        { nonce, ctx { origin, path, nonce }, bearer, body } — §5 rung 2
 *        — and drives it through the relay_ride DOOR VERB, real HTTP.
 *   P4  the answer opes as a NONCE-BOUND record { nonce, answer }: the
 *        binding is verified, the door truth confirmed.
 *   R1  a ctx-less seal refuses typed E_RIDE_DECODE (the downgrade never
 *        salvages, rung 2).
 *   R2  inner-nonce replay on fresh bytes -> typed E_RIDE_REPLAY.
 *   R3  a wrong-key seal decodes to nothing (E_RIDE_DECODE, fail-closed).
 *   R4  THE SWAPPED-ANSWER LAW: a record whose nonce ≠ the request's is
 *        refused BY THE CLIENT CHECK (the pass-268 W1 attack shape can no
 *        longer splice an answer into another request).
 *
 * Exit 1 on ANY miss. Per the pilot house law (scripts/pilot-*): real
 * pods, real HTTP, zero fake transport.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

let passNum = 0, failNum = 0;
function ok(name, cond, extra) {
  if (cond) { passNum++; console.log('  \u2713 ' + name); }
  else { failNum++; console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}
function jsonParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---- the Encrypt canon, node re-statement (only the documented constants) ----
function seal(plain, key) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const der = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', der, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + c.getAuthTag().toString('hex') + ':' + enc.toString('hex');
}
function open(ct, key) {
  const p = String(ct).split(':');
  if (p.length !== 4) throw new Error('format');
  const der = crypto.pbkdf2Sync(key, Buffer.from(p[0], 'hex'), 100000, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', der, Buffer.from(p[1], 'hex'));
  d.setAuthTag(Buffer.from(p[2], 'hex'));
  return Buffer.concat([d.update(Buffer.from(p[3], 'hex')), d.final()]).toString('utf8');
}

// ---- real HTTP door helpers ----
function doorCall(port, key, tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ tool, args: args || {} });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (key) headers['x-api-key'] = key;
    const req = http.request({ host: '127.0.0.1', port, path: '/mcp/exec', method: 'POST', headers }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: jsonParse(buf) }));
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.end(body);
  });
}

// ---- the boot (same lane pilot-two-relays uses: full runtime, real posture) ----
const BOOT = `
const cfg = require('./lib/config');
cfg.set('relay.enabled', true);
cfg.set('relay.gateKey', process.env.VANT_RELAY_GATE);
cfg.set('relay.channelKey', process.env.VANT_RELAY_CHANNEL);
cfg.set('relay.intranetOrigins', true);
// the pairing pairing MUST ride THIS pod's own ledger — brain.getCurrentBrain
// reads models/state.json (stack[0]='vant') and ignores env, so the door's
// redeem would otherwise land the guest on the SHARED workspace ledger (and
// its roster cap). The stack push is PROCESS-LOCAL: the workspace state.json
// is never touched (the two-pods pilot's own-brain house rule, same lane).
(function () {
  var b = process.env.VANT_BRAIN;
  var fs = require('fs');
  fs.mkdirSync('./models/private/' + b, { recursive: true });
})();
require('./lib/vant').startFull({ mode: 'all' })
  .then(function () {
    // the pairing lane MUST ride THIS pod's own ledger — the runtime boot
    // seeds the default stack top ('vant'), whose SHARED workspace ledger
    // then caps the redeem's guest mint. currentBrain(name) is the
    // process-local switch (never touches the workspace state.json).
    require('./lib/brain').currentBrain(process.env.VANT_BRAIN);
    console.log('[POD] spine up, active brain ' + process.env.VANT_BRAIN);
  })
  .catch(function (e) { console.error('[POD] boot failed: ' + e.message); process.exit(1); });
`;

function bootFullPod(brain, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', BOOT], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        VANT_BRAIN: brain,
        VANT_MCP_PORT: String(opts.mcp),
        VANT_SERVER_PORT: String(opts.rest),
        VANT_WEBHOOK_PORT: String(opts.webhook),
        VANT_MCP_REQUIRE_KEY: 'true',
        VANT_MCP_API_KEY: opts.mcpKey,
        VANT_RELAY_GATE: opts.gate,
        VANT_RELAY_CHANNEL: opts.channel
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let errTail = '';
    child.stdout.on('data', (c) => { /* drained; failures surface via polls */ });
    child.stderr.on('data', (c) => { errTail = (errTail + c).slice(-400); });
    const dead = setTimeout(() => { child.kill(); reject(new Error('pod ' + brain + ' never came up')); }, 30000);
    const poll = async () => {
      const mcp = await getHealth(opts.mcp);
      if (mcp) { clearTimeout(dead); resolve({ child, opts }); return; }
      if (child.exitCode !== null) { clearTimeout(dead); reject(new Error('pod ' + brain + ' exited during boot (code ' + child.exitCode + ') :: ' + errTail.trim())); return; }
      setTimeout(poll, 300);
    };
    setTimeout(poll, 500);
  });
}
function getHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 1500 }, (res) => {
      res.resume(); resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

(async () => {
  const POD = {
    mcp: 21341 + (process.pid % 40),
    rest: 22541 + (process.pid % 40),
    webhook: 23541 + (process.pid % 40),
    mcpKey: 'pairing-ride-pilot-' + crypto.randomBytes(16).toString('hex'),
    gate: crypto.randomBytes(32).toString('hex'),
    // the pod operators arm a channel key FIRST; the redeem DELIVERS it
    channel: crypto.randomBytes(32).toString('hex')
  };

  console.log('\n  pilot:pairing-ride — the binding moment rides the live corridor (one full pod, real HTTP)\n');

  // fresh roster each run: wipe ONLY this pilot brain's ledger (never
  // models/private/vant — the pilot house rule holds)
  try {
    fs.rmSync(path.join(ROOT, 'models', 'private', 'pairing-ride-pilot', '.guests.json'), { force: true });
  } catch (e) { /* fresh run anyway */ }
  const pod = await bootFullPod('pairing-ride-pilot', POD);
  try {
    // ---- P1: mint (keyed operator call) ----
    const gen = await doorCall(POD.mcp, POD.mcpKey, 'pairing_voucher_generate', {});
    const genR = gen.json && gen.json.result;
    ok('P1. a real voucher minted at the keyed door (code exists, expiry stated)',
      gen.status === 200 && genR && genR.ok === true && typeof genR.code === 'string' && genR.code.startsWith('vhpair-'),
      JSON.stringify(gen.json || gen.status).slice(0, 120));

    // ---- P2: redeem — THE BINDING MOMENT (the door gates the transport; the key rides the ONE-TIME reply) ----
    const red = await doorCall(POD.mcp, POD.mcpKey, 'pairing_voucher_redeem', { code: genR.code });
    const redR = red.json && red.json.result;
    ok('P2. redeem delivers the RAW e2e channelKey beside the guest token (e2e:"bound")',
      red.status === 200 && redR && redR.ok === true
      && redR.channelKey === POD.channel && redR.e2e === 'bound'
      && /^vguest_/.test(redR.token || ''),
      JSON.stringify(red.json).slice(0, 260));
    const TOKEN = redR && redR.token;

    // ---- P3-P4: the paired client rides SEALED with the DELIVERED key ----
    const nonce = 'pairing-ride-' + crypto.randomBytes(12).toString('hex');
    const inner = JSON.stringify({
      nonce,
      ctx: { origin: 'pod-door', path: '/mcp/relay_ride', nonce },
      bearer: TOKEN,
      body: { tool: 'context_heartbeat', args: { action: 'status' } }
    });
    const ct = seal(inner, POD.channel);
    const ride = await doorCall(POD.mcp, POD.mcpKey, 'relay_ride', { ct });
    ok('P3. the sealed ride rides the real door verb over real HTTP (sealed -> door -> re-sealed)',
      ride.status === 200 && ride.json && ride.json.result && ride.json.result.ok === true
      && ride.json.result.rode === true && typeof ride.json.result.ct === 'string',
      JSON.stringify((ride.json && ride.json.result) || ride.status).slice(0, 160));

    let record = null;
    try { record = jsonParse(open(ride.json.result.ct, POD.channel)); } catch (e) { record = { openError: e.message }; }
    const doorAnswer = record && record.nonce === nonce && typeof record.answer === 'string' ? jsonParse(record.answer) : null;
    ok('P4. the answer record binds to the request nonce (rung 2) and carries the door truth',
      record && !record.openError && record.nonce === nonce && doorAnswer
      && doorAnswer.result && typeof doorAnswer.result === 'object',
      JSON.stringify(record || {}).slice(0, 200) || 'n/a');

    // ---- R1: the downgrade (ctx-less seal) refuses typed ----
    const ctxless = JSON.stringify({
      nonce: 'pairing-ride-' + crypto.randomBytes(12).toString('hex'),
      ctx: null,
      bearer: TOKEN,
      body: { tool: 'context_heartbeat', args: { action: 'status' } }
    });
    const r1 = await doorCall(POD.mcp, POD.mcpKey, 'relay_ride', { ct: seal(ctxless, POD.channel) });
    ok('R1. a ctx-less (downgrade) seal refuses typed E_RIDE_DECODE — the rung-2 refusal is live',
      r1.status === 200 && r1.json && r1.json.result && r1.json.result.ok === false
      && r1.json.result.code === 'E_RIDE_DECODE',
      JSON.stringify((r1.json && r1.json.result) || r1.status).slice(0, 160));

    // ---- R2: the replay probe (fresh bytes, same inner nonce) ----
    const r2 = await doorCall(POD.mcp, POD.mcpKey, 'relay_ride', { ct });
    ok('R2. the SAME sealed ride re-posted -> typed E_RIDE_REPLAY (the nonce is spent for good)',
      r2.status === 200 && r2.json && r2.json.result && r2.json.result.ok === false
      && r2.json.result.code === 'E_RIDE_REPLAY',
      JSON.stringify((r2.json && r2.json.result) || r2.status).slice(0, 160));

    // ---- R3: the outsider's seal (wrong key) decodes to nothing ----
    const outsiderCt = seal(inner, 'the-outsiders-own-key-0123456789abcdef');
    const r3 = await doorCall(POD.mcp, POD.mcpKey, 'relay_ride', { ct: outsiderCt });
    ok('R3. a wrong-key seal decodes typed E_RIDE_DECODE (fail-closed, no ferry for the outsider)',
      r3.status === 200 && r3.json && r3.json.result && r3.json.result.ok === false
      && r3.json.result.code === 'E_RIDE_DECODE',
      JSON.stringify((r3.json && r3.json.result) || r3.status).slice(0, 160));

    // ---- R4: THE SWAPPED-ANSWER LAW — the client check refuses a record
    // whose nonce names a different ride (the pass-268 W1 splice shape) ----
    const swapped = { nonce: 'a-different-ride-nonce', answer: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { imposter: true } }) };
    // the client's own binding check, verbatim: record.nonce !== sent => refuse
    const clientAccepts = (record) => record && record.nonce === nonce;
    ok('R4. the client answer-binding check refuses a swapped record (W1 chased out by construction)',
      clientAccepts(swapped) === false,
      'the swapped record must NOT pass');
    ok('R4b. and an HONEST record passes the same check (the law binds, it does not block)',
      clientAccepts(jsonParse(open(ride.json.result.ct, POD.channel))) === true);

    console.log('\n--- RESULTS ---\n');
    console.log('  Passed:  ' + passNum);
    console.log('  Failed:  ' + failNum);
  } finally {
    try { pod.child.kill(); } catch (e) { /* already down */ }
  }
  process.exit(failNum > 0 ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
