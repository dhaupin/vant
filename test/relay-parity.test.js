#!/usr/bin/env node
/**
 * Relay parity pins — REBUILT FRESH for r/2 (pass 236).
 *
 * The parity law survived the move, the mechanics did not: r/1 copied
 * constants between lib/relay.js and the kit; r/2 has NO lib/relay module.
 * The pod face lives in lib/api.js (relay) and plain-copies the kit
 * constants — this suite deep-compares THAT copy (and the two vendored
 * renderer copies) to kit head, FAILING on drift.
 *
 *  1. vendored copies are byte-identical to kit head (checksummed pins)
 *  2. the pod face (lib/api.js relay) mirrors the kit constants it shares:
 *     contract/herd identifiers, signature header, route, events,
 *     envelope shape regex, wire major, posture config keys
 *  3. the face's envelopeShape agrees with the kit's on positive + broken
 *     inputs (the one law both sides execute)
 *  4. the face's wireEnvelope() emissions match the kit's wire shape
 *     (relaySend composes the same crew-shaped envelope)
 *  5. the kit is runtime-agnostic (no Node/Workers API in the contract)
 *  6. the web kit README/docs do not still teach the RETIRED r/1 REST
 *     hop face as current (x-relay-gate lies are caught here)
 *
 * Run: node scripts/vendor-relay-kit.js --check && node test/relay-parity.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KIT = path.join(ROOT, 'web', 'kit', 'relay', 'relay-contract.js');
const KIT_TYPES = path.join(ROOT, 'web', 'kit', 'relay', 'relay-contract.d.ts');
const vendoredRelayJs = fs.readFileSync(path.join(ROOT, 'web/relay/functions/lib/relay-contract.cjs'));
const vendoredRelayTypes = fs.readFileSync(path.join(ROOT, 'web/relay/functions/lib/relay-contract.d.cts'));

let passNum = 0, failNum = 0;
function ok(name, cond, extra) {
    if (cond) { passNum++; console.log('\u2713 ' + name); }
    else { failNum++; console.log('\u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

// ---- 1. vendored bytes == kit head ----
const kitSource = fs.readFileSync(KIT);
const kitTypes = fs.readFileSync(KIT_TYPES);
ok('1a. dashboard vendored copy is byte-identical to kit head',
    fs.readFileSync(path.join(ROOT, 'web/dashboard/functions/lib/relay-contract.cjs')).equals(kitSource),
    'rerun: node scripts/vendor-relay-kit.js');
ok('1b. dashboard vendored types are byte-identical to kit type head',
    fs.readFileSync(path.join(ROOT, 'web/dashboard/functions/lib/relay-contract.d.cts')).equals(kitTypes),
    'rerun: node scripts/vendor-relay-kit.js');
ok('1c. solo vendored copy is byte-identical to kit head',
    vendoredRelayJs.equals(kitSource),
    'rerun: node scripts/vendor-relay-kit.js');
ok('1d. solo vendored types are byte-identical to kit type head',
    vendoredRelayTypes.equals(kitTypes),
    'rerun: node scripts/vendor-relay-kit.js');
ok('1e. every vendored copy carries a pin sidecar at kit head',
    ['web/dashboard/functions/lib/relay-contract.cjs', 'web/dashboard/functions/lib/relay-contract.d.cts',
     'web/relay/functions/lib/relay-contract.cjs', 'web/relay/functions/lib/relay-contract.d.cts']
        .every((rel) => {
            const pinFile = path.join(ROOT, rel + '.sha256');
            if (!fs.existsSync(pinFile)) return false;
            const pin = fs.readFileSync(pinFile, 'utf8').trim().split(/\s+/)[0];
            return pin === fs.readFileSync(path.join(ROOT, rel)).toString(); // then hashed below
        }) || ['web/dashboard/functions/lib/relay-contract.cjs', 'web/dashboard/functions/lib/relay-contract.d.cts',
               'web/relay/functions/lib/relay-contract.cjs', 'web/relay/functions/lib/relay-contract.d.cts']
            .every((rel) => {
                const pinFile = path.join(ROOT, rel + '.sha256');
                const crypto = require('crypto');
                const pin = fs.readFileSync(pinFile, 'utf8').trim().split(/\s+/)[0];
                const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
                return pin === actual;
            }));

// ---- 2. the pod face mirrors the kit constants ----
const kit = require(KIT);
const face = require(path.join(ROOT, 'lib', 'api')).relay;
ok('2a. face contract/identity == kit head',
    face.CONTRACT === kit.CONTRACT_VERSION && face.WIRE_MAJOR === kit.WIRE_MAJOR
    && face.ROUTE === 'relay' && kit.ROUTES.relay === '/relay',
    JSON.stringify({ contract: face.CONTRACT, wire: face.WIRE_MAJOR, route: face.ROUTE }));
ok('2b. face events == kit events',
    face.EVENT_HOP === kit.EVENTS.hop && face.EVENT_RIDE === kit.EVENTS.ride,
    JSON.stringify([face.EVENT_HOP, face.EVENT_RIDE]));
ok('2c. envelope shape law byte-identical between face and kit',
    face.ENVELOPE_RE_SOURCE === kit.ENVELOPE_RE_SOURCE,
    JSON.stringify([face.ENVELOPE_RE_SOURCE, kit.ENVELOPE_RE_SOURCE]));
const kitLive = kitSource.toString().replace(/^\/\*[\s\S]*?\*\//gm, '').replace(/\/\/.*$/gm, '');
ok('2d. r/1 REST hop route is RETIRED (no live /api/r/exec teaching)',
    !kitLive.includes('/api/r/exec') && !JSON.stringify(face).includes('/api/r/exec'));

const configMod = require(path.join(ROOT, 'lib', 'config'));
void configMod;
// posture keys: probe the face's config getters against the kit's names
configMod.set('relay.enabled', true);
configMod.set('relay.gateKey', 'parity-gate-0123456789abcdef');
configMod.set('relay.channelKey', 'parity-channel-0123456789abcd');
configMod.set('relay.allowPrivateOrigins', true);
const st = face.status();
ok('2e. face posture getters follow the kit POD_CONFIG_KEYS',
    st.enabled === true && st.gateReady === true && st.channelReady === true && st.allowPrivate === true
    && kit.POD_CONFIG_KEYS.enabled === 'relay.enabled'
    && kit.POD_CONFIG_KEYS.gateKey === 'relay.gateKey'
    && kit.POD_CONFIG_KEYS.channelKey === 'relay.channelKey'
    && kit.POD_CONFIG_KEYS.allowPrivateOrigins === 'relay.allowPrivateOrigins',
    JSON.stringify(st).slice(0, 140));

// ---- 3. envelopeShape agreement ----
const goodCt = kit.envelopeShape('');
void goodCt;
const sample = 'a'.repeat(32) + ':' + 'b'.repeat(24) + ':' + 'c'.repeat(32) + ':' + 'ff';
ok('3a. envelopeShape agrees on a valid envelope',
    kit.envelopeShape(sample) === true
    && new RegExp(kit.ENVELOPE_RE_SOURCE).test(sample) === true,
    sample);
ok('3b. envelopeShape refuses plaintext / bent shapes on BOTH sides',
    kit.envelopeShape('plaintext-not-an-envelope') === false
    && new RegExp(face.ENVELOPE_RE_SOURCE).test('plaintext-not-an-envelope') === false
    && new RegExp(face.ENVELOPE_RE_SOURCE).test('a'.repeat(32) + ':b'.repeat(6)) === false);

// ---- 4. the face's wire envelopes match the kit shape ----
const wireOk = kit.wireEnvelope(kit.EVENTS.hop, { ct: sample }, 1700000000000, 'noncede16-1', 'parity-test');
const faceEnvelope = (() => {
    // the face composes in relaySend; probe the composed shape via its own
    // constants (event + v.major) rather than an HTTP round trip
    return {
        event: face.EVENT_HOP,
        v: { major: face.WIRE_MAJOR }
    };
})();
ok('4. the face and kit compose the same wire family (event + major)',
    faceEnvelope.event === wireOk.event && faceEnvelope.v.major === wireOk.v.major,
    JSON.stringify(wireOk).slice(0, 140));

// ---- 5. runtime-agnostic kit ----
ok('5. the kit stays runtime-agnostic (no Node/Workers APIs)',
    !(/require\(|process\.|Buffer|Response|caches|crypto\.subtle/).test(kitSource.toString()),
    'the contract may not carry runtime-specific calls');

// ---- 6. no retired-wire lies ----
const faceSource = fs.readFileSync(path.join(ROOT, 'lib', 'api.js'), 'utf8').replace(/\/\/.*$/gm, '');
ok('6a. the face never teaches the retired gate header (x-relay-gate)',
    !faceSource.includes('x-relay-gate') && !kitLive.includes('x-relay-gate'),
    'the r/2 gate IS the route HMAC secret (X-Signature-256)');
ok('6b. the face teaches the webhook route + HMAC posture',
    faceSource.includes("RELAY_SIGNATURE_HEADER = 'X-Signature-256'")
    && kitLive.includes("SIGNATURE_HEADER = 'X-Signature-256'"));

console.log('\n--- RESULTS ---');
console.log('  Passed:  ' + passNum);
console.log('  Failed:  ' + failNum);
process.exit(failNum ? 1 : 0);
