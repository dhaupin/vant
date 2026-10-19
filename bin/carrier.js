#!/usr/bin/env node
/**
 * Vant Carrier CLI — the ops surface for the carrier lanes (the plate
 * authoring + encode/decode that previously only existed through the MCP
 * door). Every verb calls the lib; the CLI owns NO laws of its own.
 *
 * Usage:
 *   vant carrier list                        # the full carrier roster (built-ins + plates)
 *   vant carrier plates                      # the persisted plates (this brain)
 *   vant carrier gate <id> <carries> [--prefix S] [--suffix S] [--note N]
 *                                            # define a plate lane (frame data only — the walls are the lib's)
 *   echo '<packet json>' | vant carrier encode <lane> [--out frame]
 *   echo '<frame>' | vant carrier decode <lane> [--pass P]   # svg lanes take --pass
 *
 * The define verb's law (owner rulings, passes 262-265): a plate is PURE
 * DATA — frame prefix/suffix around the lib's own packet wall; a definer
 * never writes crypto, and reserved ids can never shadow the roster (the
 * lib refuses typed). encode/decode read the packet/frame on stdin as
 * JSON so the CLI never guesses a packet shape.
 */

'use strict';

// (house pass-270 CLI contract) bin/carrier has STRUCTURED verbs — their
// stdout is a JSON artifact a script consumes. The lib audit logger writes
// its [INFO] lines to process.stdout by default; on THIS CLI those lines
// are stderr (logs are logs — stdout stays the artifact). The reroute MUST
// precede the carriers require: plate hydration logs at module load.
try { require('../lib/audit').setOutput(process.stderr); } catch (e) { /* logger absent: nothing to reroute */ }

const carriers = require('../lib/carriers');

const args = process.argv.slice(2);
const sub = args[0];

if (sub === '-h' || sub === '--help' || !sub) {
    console.log(`
Vant Carrier CLI — the lane surface (roster, plates, encode/decode)

Usage:
  vant carrier list            The carrier roster (built-ins + this brain's plates)
  vant carrier plates          Persisted plates only (brain store state/carrier-plates.json)
  vant carrier plate <id> <full-object|id-pointer> [--prefix S] [--suffix S] [--note N]
  vant carrier encode <lane>   Packet JSON on STDIN -> the lane's frame artifact
  vant carrier decode <lane>   Frame on STDIN -> the packet JSON back (--pass for svg)

Examples:
  vant carrier list
  vant carrier plate plc-press full-object --prefix "+PRESS " --suffix " END"
  echo '{"id":"abc","tr":"tr/1",...}' | node bin/vant.js carrier encode json
`);
    process.exit(sub ? 0 : 1);
}

if (sub === 'list') {
    const roster = carriers.list();
    console.log(`Carrier roster (${Array.isArray(roster) ? roster.length : 0}):`);
    for (const c of (Array.isArray(roster) ? roster : [])) {
        console.log(`  ${c.id}   ${c.generation || ''}${c.plate ? '  [plate]' : ''}${c.available ? '' : '  (unavailable)'}`);
    }
    process.exit(0);
}

if (sub === 'plates') {
    const plates = carriers.plateList();
    if (!plates.length) { console.log('No plates defined in this brain yet (vant carrier plate <id> ...).'); process.exit(0); }
    console.log(`Persisted plates (${plates.length}):`);
    for (const p of plates) {
        console.log(`  ${p.id}   carries=${p.carries}   frame=${JSON.stringify(p.frame.prefix || '')}…${JSON.stringify(p.frame.suffix || '')}   (brain ${p.definedBy || '?'})`);
    }
    process.exit(0);
}

if (sub === 'plate') {
    const id = args[1];
    const carries = args[2];
    if (!id || !carries) { console.error('usage: vant carrier plate <id> <full-object|id-pointer> [--prefix P] [--suffix S] [--note N]'); process.exit(1); }
    const flag = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
    // (house law) a CLI write routes the same capability check as every lib
    // write: the untouched default sandbox stub allows (gate.js posture);
    // an explicitly locked-down host refuses here, not midway.
    try {
        const sandbox = require('../lib/sandbox');
        const gate = require('../lib/gate');
        const sb = sandbox.defaultSandbox || sandbox;
        const verdict = gate.checkCapability('canWrite', { scope: 'carrier-cli', sandbox: sb });
        if (verdict.allowed === false) { console.error('❌ write capability denied (canWrite): ' + (verdict.reason || 'sandbox says no')); process.exit(1); }
    } catch (e) { /* gate unavailable = the default allow posture */ }
    try {
        const persisted = carriers.plateDefine({
            id,
            carries,
            frame: { prefix: flag('--prefix') || '', suffix: flag('--suffix') || '' },
            note: flag('--note')
        });
        console.log(`✅ plate defined: ${persisted.id} (carries=${persisted.carries}) — the row is in the brain store and the lane is live in this process.`);
    } catch (e) {
        console.error('❌ plate refused: ' + e.message + ' (' + (e.code || 'E_CARRIER') + ')');
        process.exit(1);
    }
    process.exit(0);
}

if (sub === 'encode' || sub === 'decode') {
    const lane = args[1];
    if (!lane) { console.error('usage: vant carrier ' + sub + ' <lane>   (packet/frame on STDIN as JSON)'); process.exit(1); }
    const passIdx = args.indexOf('--pass');
    const extra = passIdx !== -1 ? [args[passIdx + 1]] : [];
    let stdin = '';
    try { stdin = require('fs').readFileSync(0, 'utf8'); } catch (e) { /* empty */ }
    if (!stdin.trim()) { console.error('vant carrier ' + sub + ': nothing on STDIN (the packet/frame arrives as stdin JSON).'); process.exit(1); }
    let input = (() => { try { return JSON.parse(stdin); } catch (e) { return stdin.trim(); } })();
    // the encode output wraps { carrier, frame, ... }: unwrap the frame for
    // the decode lane (the lib gate wants the artifact TEXT — the frame law,
    // line for line; a bare string frame on stdin rides as-is)
    if (sub === 'decode' && input && typeof input === 'object' && typeof input.frame === 'string') input = input.frame;
    if (sub === 'encode' && typeof input === 'object' && input.frame && !input.tr) input = input.frame;
    try {
        const out = (sub === 'encode')
            ? carriers.encode(input, lane)
            : carriers.decode(lane, input, ...extra);
        console.log(JSON.stringify(out, null, 2));
    } catch (e) {
        console.error('❌ refused: ' + e.message + ' (' + (e.code || 'E_CARRIER') + ')');
        process.exit(1);
    }
    process.exit(0);
}

console.error('Usage: vant carrier list|plates|plate|encode|decode  (rose: every verb rides the lib; the CLI owns no laws)');
process.exit(1);
