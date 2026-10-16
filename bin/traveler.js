#!/usr/bin/env node
/**
 * vant traveler CLI — the auditable pin through a distributed workflow.
 *
 *   node bin/traveler.js open   [--from <station>] [--title <t>] [--data <key=val>]...
 *   node bin/traveler.js hop    <id|latest> --op <op> --by <station> [--detail <k=v>]... [--file <path>]
 *   node bin/traveler.js status <id|latest>                      (ISO 8.5.2 trace)
 *   node bin/traveler.js audit  <id|latest>                      (the auditor's copy)
 *   node bin/traveler.js finger                                  (one-line: current traveler)
 *
 * The traveler is the job envelope that rides station-to-station:
 * immutable, append-only ledger, content-addressed (any edit = a new
 * address, proven by rehash). The ISO 9001 clause 8.5.2 spine.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const sub = args[0] || 'help';

// ---- flag helpers ----
function flag(name, def) {
    const i = args.indexOf('--' + name);
    if (i === -1 || i + 1 >= args.length) return def;
    return args[i + 1];
}
function keyvals(name) {
    const out = {};
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--' + name) {
            const kv = String(args[i + 1]);
            const m = /^([^=]+)=(.*)$/.exec(kv);
            if (m) out[m[1]] = m[2];
        }
    }
    return out;
}

const T = require(path.join(__dirname, '..', 'lib', 'traveler'));

const LEDGER = (() => {
    const p = T._ledgerPath();
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    const idx = path.join(dir, 'traveler-current.json');   // the latest traveler of the session
    return { dir, idx, ledger: p };
})();

function loadCurrent() {
    try { return JSON.parse(fs.readFileSync(LEDGER.idx, 'utf8')); } catch (e) { return null; }
}
function saveCurrent(t) {
    fs.writeFileSync(LEDGER.idx, JSON.stringify(t, null, 2));
    console.log('   (pin: ' + t.id.slice(0, 16) + '…  current-file: ' + path.relative(process.cwd(), LEDGER.idx) + ')');
}

function main() {
    if (sub === 'open') {
        const data = keyvals('data');
        const t = T.mint({
            from: flag('from', process.env.VANT_STATION || 'operator'),
            slots: Object.assign({ title: flag('title', 'untitled job') }, data)
        });
        const p = T.persist(t);
        saveCurrent(t);
        console.log('✅ traveler OPENED');
        console.log('   id: ' + t.id);
        console.log('   ledger: ' + path.relative(process.cwd(), p.ledger));
        return;
    }
    if (sub === 'hop') {
        let t = loadCurrent();
        const file = flag('file', null);
        if (file) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            const v = T.verify(raw);
            if (!v.ok) { console.error('❌ refused at landing: ' + v.error); process.exit(1); }
            t = raw;
        }
        if (!t) { console.error('❌ no current traveler — run `traveler open` first.'); process.exit(1); }
        // (pass 255) VERIFY AT EVERY LANDING (the lib law) — the current
        // file is as untrusted as a passed file: a station receiving a
        // tampered envelope refuses loudly instead of advancing it.
        const legal = T.verify(t);
        if (!legal.ok) {
            console.error('❌ landing refused — the traveler does not verify: ' + legal.error + ' (' + legal.code + ')');
            console.error('   the pin in this file is tampered or corrupt; the ledger keeps the last GOOD address.');
            process.exit(1);
        }
        try {
            const next = T.advance(t, {
                op: flag('op', 'step'),
                by: flag('by', process.env.VANT_STATION || this_station()),
                detail: Object.keys(keyvals('detail')).length ? keyvals('detail') : undefined
            });
            T.persist(next);
            saveCurrent(next);
            console.log('✅ hop recorded — station to station');
            console.log('   new id: ' + next.id + '  (re-addressed by content, seq=' + next.seq + ')');
            console.log('   ledger law intact: append-only, nothing rewritten.');
        } catch (e) {
            console.error('❌ hop refused: ' + e.message + ' (' + (e.code || 'E_LOCAL') + ')');
            process.exit(1);
        }
        return;
    }
    if (sub === 'status') {
        const t = loadCurrent();
        if (!t) { console.error('❌ no current traveler.'); process.exit(1); }
        const st = T.status(t);
        console.log('id: ' + t.id);
        console.log('in pin-ledger: ' + (st.seen ? 'YES' : 'no (not yet persisted here)'));
        for (const s of st.stations) {
            console.log('  ' + String(s.seq).padStart(3) + '. [' + new Date(s.ts).toISOString() + '] ' + s.op + ' — ' + s.by);
        }
        return;
    }
    if (sub === 'audit') {
        const t = loadCurrent();
        if (!t) { console.error('❌ no current traveler.'); process.exit(1); }
        console.log(T.auditReport(t));
        return;
    }
    if (sub === 'finger') {
        const t = loadCurrent();
        if (!t) { console.log('no current traveler'); return; }
        const v = T.verify(t);
        console.log(t.id.slice(0, 16) + '… seq=' + t.seq + ' ' + (v.ok ? 'verified' : 'TAMPERED'));
        return;
    }
    console.log('usage: node bin/traveler.js open|hop|status|audit|finger  (the auditable pin, ISO 8.5.2)');
}

function this_station() {
    try { return require('../lib/brain').getCurrentBrain() || 'unknown-station'; } catch (e) { return 'unknown-station'; }
}

main();
