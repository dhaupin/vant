#!/usr/bin/env node
/**
 * TRAVELER LIB SUITE — TRIMMED (2026-10-27 retirement pass).
 *
 * The in-process families (A. content-address, B. ledger law, C.
 * persistence, D. the schema-rizer, E. auditReport, G. door verbs,
 * G+. carry/replay/roster, H. OS integration, I. identity + durability)
 * RETIRED WHOLE to the vant-carriers pack rows (slices 4-6, 2026-10-26:
 * the coverage lives in the packs now — `scripts/crashtest-run.js --pack
 * vant-carriers`, rows traveler-content-address-law /
 * traveler-ledger-law-and-ceiling /
 * traveler-persistence-append-only /
 * traveler-schema-rizer-law / traveler-audit-verbatim /
 * traveler-door-verbs-carried /
 * traveler-os-integration /
 * traveler-scope-escrow-durability).
 *
 * What stays native here per the reverse-verification law: the
 * REAL-PROCESS CLI family (F1-F4) — `bin/traveler.js` open/hop/audit via
 * spawnSync rides real OS processes, so it stays with this file the way
 * the guests' socket-door families stayed with theirs. Not pinned here:
 * the wire/kit law (test/traveler.test.js — the tr/1 structural law)
 * stays the web-side suite; this file is the WORKING lib's last
 * real-process pin list.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'lib', 'traveler'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    console.log('\n\u2708 TRAVELER LIB SUITE (retired to packs; the real-process CLI family stays native)\n');

    // ---------- F. the CLI contract (real processes; the kept family) ----------
    const cli = (sub, extra) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'traveler.js'), sub].concat(extra || []), { encoding: 'utf8' });
    const open = cli('open', ['--title', 'suite job', '--data', 'part=suite-NSC9']);
    const openId = /id: ([0-9a-f]{64})/.exec(open.stdout || '');
    ok('F1. open mints + persists (id printed)', open.status === 0 && openId !== null);
    const hop = cli('hop', ['--op', 'kit', '--by', 'suite-station', '--detail', 'fit=ok']);
    const hopId = /new id: ([0-9a-f]{64})/.exec(hop.stdout || '');
    ok('F2. hop re-addresses (new id printed, seq rides)', hop.status === 0 && hopId !== null && hopId[1] !== openId[1]);
    const audit = cli('audit', []);
    ok('F3. audit prints the clause + VERIFIED integrity', (audit.stdout || '').includes('8.5.2') && (audit.stdout || '').includes('VERIFIED'));
    // tamper at a landing: hand-edited current-file must refuse the hop
    const cur = JSON.parse(fs.readFileSync(path.join(path.dirname(T._ledgerPath()), 'traveler-current.json'), 'utf8'));
    cur.slots.tampered = true;
    fs.writeFileSync(path.join(path.dirname(T._ledgerPath()), 'traveler-current.json'), JSON.stringify(cur));
    const ref = cli('hop', ['--op', 'sneak', '--by', 'attacker']);
    ok('F4. a tampered traveler refuses the landing (typed, loud)', ref.status !== 0 && /refused/.test(ref.stderr || ''));

    console.log('\n--- RESULTS ---');
    console.log('  Passed:  ' + pass);
    console.log('  Failed:  ' + fail);
    process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e.message); process.exit(1); });
