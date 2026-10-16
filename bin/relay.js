#!/usr/bin/env node
/**
 * Vant Relay CLI - the r/2 WEBHOOK-NATIVE FACE (prd-relay.md §2, pass 236)
 *
 * Usage:
 *   vant relay status    # posture truth + liveness counters (this process)
 *   vant relay gate      # generate + persist the gate key (the HMAC secret)
 *   vant relay channel   # generate + persist the e2e channel key (shown once)
 *
 * The ruling this CLI encodes (owner, pass 236): there is NO lib/relay
 * module. The relay face is composed OUT OF the existing webhook/door
 * transports and lives in the api face (lib/api.js relay). The boot
 * (vant server/all/headless) mounts it onto the webhook transport when
 * relay.enabled is set; intake rides the HMAC-verified webhook route.
 */

const crypto = require('crypto');
const vaf = require('../lib/vaf');
const args = process.argv.slice(2);

if (args[0] === '-h' || args[0] === '--help') {
    console.log(`
Vant Relay CLI - the r/2 webhook-native relay face (prd-relay.md, §2)

Usage:
  vant relay status      Posture truth: enabled, mounted, gate readiness, counters
  vant relay gate        Generate + persist the relay gate key (256-bit hex)
  vant relay channel     Generate + persist the e2e channel key (256-bit hex)

The wire (r/2): ONE webhook route served by the webhook transport - exactly
like a crew node registers:

    POST /relay   (webhook server, HMAC gate = the relay.gateKey)
      X-Signature-256: HMAC-SHA256 hex over the RAW body bytes
      { event: 'relay.hop' | 'relay.ride', from, ts, nonce, payload,
        v: { major: 2 } }

  relay.hop  payload = { origin, path, ct }    this pod IS the relay: it
             forwards via lib/network.fetch (SSRF wall + DNS-rebinding
             refusal + circuit breaker are the transport's own) and the
             upstream's answer rides the SAME post's ack back (ack.reply).
  relay.ride payload = { ct }                  this pod is the ENDPOINT: the
             envelope opens with the e2e channel key, the inner call
             dispatches to this pod's OWN MCP door (full auth chain runs),
             and the door's answer re-envelopes into ack.reply. Replays
             refuse by nonce (TTL window) AND at the transport (webhook
             signature replay gate).

The relay stays BLIND: the gate secret is spent at HMAC verification, the
channel key is never held, and every body it carries is ciphertext.

Posture:
  1. vant config set relay.enabled true   (persisted to the current brain)
  2. vant relay gate                      (shown ONCE; signers of /relay)
  Then the boot (vant server / all / headless) mounts the face:
    the webhook server starts on its configured port (3467 default,
    loopback bind by default, VANT_WEBHOOK_* to widen deliberately).
  Order:  vant relay gate  ->  vant relay status
`);
    process.exit(0);
}

const cmd = args[0] || 'status';
vaf.check(cmd, { type: 'string', name: 'cmd', maxLength: 20 });

// (r/2) The face lives in the api layer - never a lib/relay module again.
const relay = require('../lib/api').relay;
const config = require('../lib/config');

if (cmd === 'channel') {
    const key = crypto.randomBytes(32).toString('hex');
    const r = config.setConfig('relay.channelKey', key);
    if (r && r.error) {
        console.error('relay channel: could not persist the key pair: ' + r.error);
        process.exit(1);
    }
    console.log('Relay e2e channel key generated + persisted to the current brain config.');
    console.log('');
    console.log('  ' + key);
    console.log('');
    console.log('  Shown ONCE - the dashboard carries it in memory (never persisted)');
    console.log('  to envelope ride calls / open ride replies. The relay NEVER');
    console.log('  holds it; the relay.ride dispatch below opens envelopes with it.');
    console.log('  Rotate by re-running: vant relay channel');
    process.exit(0);
}

if (cmd === 'status' || cmd === '-s') {
    const st = relay.status();
    console.log('Vant Relay face (' + st.flavor + ', wire ' + st.contract + '):');
    console.log('  enabled:      ' + st.enabled);
    console.log('  mounted:      ' + st.mounted + (st.enabled && !st.mounted ? '  (restart the boot (vant server|all|headless) to mount)' : ''));
    console.log('  gate ready:   ' + st.gateReady + (st.enabled && !st.gateReady ? '  (no HMAC secret - nothing binds until: vant relay gate)' : ''));
    console.log('  channel:      ' + (st.channelReady ? 'bound (the ride dispatch opens envelopes with it)' : 'not set - rides refuse until: vant relay channel'));
    console.log('  route:        ' + st.route + ' (webhook transport, HMAC-gated: X-Signature-256)');
    console.log('  events:       ' + st.events.join(', '));
    console.log('  e2e posture:  envelope-required (encrypted pipes only - no plain rides)');
    console.log('');
    console.log('  liveness (this process; the serving boot counts its own):');
    const s = st.stats;
    console.log('    hops served: ' + (s.hopsServed || 0) + '  forwarded: ' + (s.hopsForwarded || 0) + '  upstream refuses: ' + (s.upstreamRefs || 0));
    console.log('    rides served: ' + (s.ridesServed || 0) + '  replays refused: ' + (s.ridesReplayed || 0) + '  decode refusals: ' + (s.rideDecodeRefused || 0));
    console.log('    gate refusals: ' + (s.gateRefused || 0));
    process.exit(0);
}

if (cmd === 'gate') {
    const key = crypto.randomBytes(32).toString('hex');
    const r = config.setConfig('relay.gateKey', key);
    if (r && r.error) {
        console.error('relay gate: could not persist the key pair: ' + r.error);
        process.exit(1);
    }
    console.log('Relay gate key generated + persisted to the current brain config.');
    console.log('');
    console.log('  ' + key);
    console.log('');
    console.log('  Shown ONCE - this IS the HMAC secret of the webhook route:');
    console.log('  clients sign the RAW body bytes with it (header X-Signature-256)');
    console.log('  when they POST /relay. It is spent at verification only; it');
    console.log('  never rides inside a hop/ride payload. Rotate by re-running.');
    process.exit(0);
}

console.log('Usage: vant relay [status|gate|channel]  (-h for the posture walkthrough)');
process.exit(1);
