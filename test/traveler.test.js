#!/usr/bin/env node
/**
 * TRAVELER SUITE - the enterprise router object (pass 254, prd-web.md)
 *
 * Pins the traveler-contract kit (web/kit/relay/traveler-contract.js):
 *   1. the builder composes the schema-stamped packet, shape law null
 *   2. the LEDGER law: append-only, ascending seq, seq == ledger length
 *      (re-open / rewrite / gap refusals are typed E_TRAVELER_STEP)
 *   3. the ADDRESS law: id is an opaque hex content address (traversal
 *      attempts refuse E_TRAVELER_ADDRESS)
 *   4. THE SCHEMA-RIZER: legacy tr/0 migrates + stamps; unknown FUTURE
 *      versions refuse typed E_TRAVELER_SCHEMA (never guesses forward)
 *   5. runtime-agnostic kit (same scan law as the r/2 contract)
 *   6. vendored copies are byte-identical to kit head, pins at head
 *   7. the pod face's plain-copy agrees with kit head (constants + law)
 *
 * Run: node test/traveler.test.js (after node scripts/vendor-relay-kit.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const kitPath = path.join(ROOT, 'web', 'kit', 'relay', 'traveler-contract.js');
const T = require(kitPath);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('\n\u2708 TRAVELER SUITE (the enterprise router object, tr/1)\n');

// ---- 1. builder + shape law ----
const t = T.wireTraveler({ id: 'aabbccdd11223344', from: 'bolete-browser', slots: { wish: 'hello' } });
ok('1a. builder stamps tr/1 + ledger birth step', t.tr === 'tr/1' && t.seq === 1 && t.steps[0].op === 'open');
ok('1b. shape law: a legal packet refuses nothing', T.travelerShape(t) === null);
ok('1c. shape law: non-object refuses SHAPE', T.travelerShape(null) !== null && T.travelerShape('x').code === 'E_TRAVELER_SHAPE');
ok('1d. slots ceiling enforced (state > 512KiB refuses)',
    T.travelerShape(Object.assign({}, t, { slots: { wall: 'x'.repeat(T.TRAVEL_MAX_CTEXT + 1) } })).code === 'E_TRAVELER_SHAPE');

// ---- 2. ledger law ----
const two = Object.assign({}, t, { steps: t.steps.concat([{ seq: 2, op: 'hop', by: 'relay-1', ts: 1 }]) });
two.seq = two.steps.length;
ok('2a. an appended hop stays legal', T.travelerShape(two) === null);
ok('2b. re-opened seq refuses STEP', T.travelerShape(Object.assign({}, two, { steps: two.steps.concat([{ seq: 2, op: 'hop', by: 'evil', ts: 2 }]) })).code === 'E_TRAVELER_STEP');
ok('2c. seq stamp != ledger length refuses STEP', T.travelerShape(Object.assign({}, two, { seq: 99 })).code === 'E_TRAVELER_STEP');
ok('2d. gapped seq refuses STEP',
    T.travelerShape(Object.assign({}, two, { steps: [{ seq: 7, op: 'hop', by: 'x', ts: 0 }] })).code === 'E_TRAVELER_STEP');

// ---- 3. address law ----
ok('3a. traversal-shaped id refuses ADDRESS', T.travelerShape(Object.assign({}, t, { id: '../etc/passwd' })).code === 'E_TRAVELER_ADDRESS');
ok('3b. short id refuses ADDRESS', T.travelerShape(Object.assign({}, t, { id: 'abcd' })).code === 'E_TRAVELER_ADDRESS');
ok('3c. a legit 32-hex id is opaque-legal', T.travelerShape(Object.assign({}, t, { id: '0123456789abcdef0123456789abcdef' })) === null);

// ---- 4. the schema-rizer ----
const legacy = { tr: 'tr/0', id: 'aabbccdd11223344', from: 'old-front', slots: { x: 1 }, steps: [{ seq: 1, op: 'open', by: 'old-front', ts: 0 }] };
const rized = T.schemaRize(legacy);
ok('4a. legacy migrates forward + stamps truthfully', rized.tr === 'tr/1' && rized.rized && rized.rized.from === 'tr/0' && rized.rized.to === 'tr/1');
ok('4b. the migration lands IN the ledger (append, never rewrite)', rized.steps.length === 2 && rized.steps[1].op === 'rize');
ok('4c. slots ride verbatim through the rize', JSON.stringify(rized.slots) === JSON.stringify(legacy.slots));
ok('4d. current-version input is untouched (no phantom stamp)', T.schemaRize(t).tr === 'tr/1' && !T.schemaRize(t).rized);
ok('4e. unknown FUTURE version refuses typed (never guesses forward)',
    T.travelerShape(Object.assign({}, t, { tr: 'tr/9' })).code === 'E_TRAVELER_SCHEMA');

// ---- 5. runtime-agnostic kit ----
const kitSource = fs.readFileSync(kitPath, 'utf8');
ok('5. the traveler kit stays runtime-agnostic (no Node/Workers APIs)',
    !(/require\(|process\.|Buffer|Response|caches|crypto\.subtle/).test(kitSource));

// ---- 6. vendored copies + pins ----
const vendoredTargets = [
    'web/dashboard/functions/lib/traveler-contract.cjs',
    'web/dashboard/functions/lib/traveler-contract.d.cts',
    'web/relay/functions/lib/traveler-contract.cjs',
    'web/relay/functions/lib/traveler-contract.d.cts'
];
const crypto = require('crypto');
const kitHead = crypto.createHash('sha256').update(kitSource).digest('hex');
const typesSource = fs.readFileSync(path.join(ROOT, 'web', 'kit', 'relay', 'traveler-contract.d.ts'));
const typesHead = crypto.createHash('sha256').update(typesSource).digest('hex');
for (const rel of vendoredTargets) {
    const abs = path.join(ROOT, rel);
    const isTypes = rel.endsWith('.d.cts');
    const head = isTypes ? typesHead : kitHead;
    const pinFile = abs + '.sha256';
    const present = fs.existsSync(abs) && fs.existsSync(pinFile);
    const pin = present ? fs.readFileSync(pinFile, 'utf8').trim().split(/\s+/)[0] : null;
    const actual = present ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex') : null;
    ok('6. vendored+pin at kit head: ' + rel, pin === head && actual === head, 'rerun: node scripts/vendor-relay-kit.js');
}

// ---- 7. the pod face's plain-copy agrees with kit head ----
const face = require(path.join(ROOT, 'lib', 'api')).relay;
ok('7a. face event + version mirror kit head', face.EVENT_TRAVEL === T.TRAVEL_WIRE_EVENT && face.TRAVEL_VERSION === T.TRAVEL_VERSION);
ok('7b. face known-schema set mirrors kit head', JSON.stringify(face.TRAVEL_KNOWN) === JSON.stringify(T.TRAVEL_KNOWN));
const faceVerdict = face.TRAVEL_SHAPE_LAW(two);
ok('7c. the face law agrees with the kit law on a legal packet', faceVerdict === null);
ok('7d. the face law agrees on a rewrite attempt (typed code)',
    String(face.TRAVEL_SHAPE_LAW(Object.assign({}, two, { seq: 99 }))).includes('E_TRAVELER_STEP'));
// the bridge family dispatches the traveler onto the door's verbs
const fam = face.BRIDGE_FAMILIES || [];
ok('7e. relay.travel is a registered bridge family', fam.indexOf('relay.travel') !== -1, 'families=' + fam.join(','));

console.log('\n--- RESULTS ---');
console.log('  Passed:  ' + pass);
console.log('  Failed:  ' + fail);
process.exit(fail > 0 ? 1 : 0);
