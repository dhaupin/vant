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
    if (sub === 'verify') {
        let t = loadCurrent();
        const file = flag('file', null);
        if (file) t = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!t) { console.error('❌ no current traveler (or pass --file).'); process.exit(1); }
        const v = T.verify(t);
        if (v.ok) { console.log('✅ verified: the address derives from the payload (' + t.id.slice(0, 16) + '…, seq=' + t.seq + ')'); }
        else { console.error('❌ TAMPERED or corrupt: ' + v.error); process.exit(1); }
        return;
    }
    if (sub === 'attach') {
        // (pass 260) THE PART at the tool boundary: a station attaches its
        // part AND signs off, in one landing. --part name k=v k=v ...
        let t = loadCurrent();
        const file = flag('file', null);
        if (file) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            const lv = T.verify(raw);
            if (!lv.ok) { console.error('❌ refused at landing: ' + lv.error); process.exit(1); }
            t = raw;
        }
        if (!t) { console.error('❌ no current traveler (or pass --file).'); process.exit(1); }
        const name = flag('part', null);
        if (!name) { console.error('usage: traveler attach --part <name> [--k=v ...] [--op <op>] [--by <station>] [--file <path>]'); process.exit(1); }
        const body = keyvals('partdata');
        for (const [k, v] of Object.entries(keyvals('data'))) body[k] = v;   // --data doubles as part body (the operator's habit)
        if (!Object.keys(body).length) body.attachedBy = flag('by', process.env.VANT_STATION || this_station());
        try {
            const next = T.advance(t, { op: flag('op', 'attach'), by: flag('by', process.env.VANT_STATION || this_station()), part: { name, ...body } });
            T.persist(next);
            saveCurrent(next);
            console.log('✅ part attached + signed off: ' + name + ' (assembly: ' + Object.keys(next.slots.assembly || {}).join(', ') + ')');
            console.log('   new id: ' + next.id + '  (seq=' + next.seq + ')');
        } catch (e) {
            console.error('❌ attach refused: ' + e.message + ' (' + (e.code || 'E_LOCAL') + ')');
            process.exit(1);
        }
        return;
    }
    if (sub === 'carry') {
        // (pass 261) THE ROUTE at the tool boundary: --template <jsonfile>
        // declares the bill of stations (in order); --stations <jsonfile> or
        // repeated --stage fills it. Super strict order, super flex parts.
        let t = loadCurrent();
        const file = flag('file', null);
        if (file) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            const lv = T.verify(raw);
            if (!lv.ok) { console.error('❌ refused at landing: ' + lv.error); process.exit(1); }
            t = raw;
        }
        if (!t) { console.error('❌ no current traveler (or pass --file).'); process.exit(1); }
        const C = require(path.join(__dirname, '..', 'lib', 'carriers'));
        let stations = [];
        const stationsFile = flag('stations', null);
        if (stationsFile) stations = JSON.parse(fs.readFileSync(stationsFile, 'utf8'));
        const templateFile = flag('template', null);
        const template = templateFile ? JSON.parse(fs.readFileSync(templateFile, 'utf8')) : undefined;
        // --stage by=..,op=..,part=.. (repeated); part may be a bare slot name
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === '--stage') {
                const parts = String(args[i + 1]).split(',');
                const st = {};
                for (const kv of parts) {
                    const [k, ...rest] = kv.split('=');
                    const v = rest.join('=');
                    if (k === 'part') st.part = v;
                    else if (k === 'privileged') st.privileged = v === 'true';
                    else st[k] = v;
                }
                stations.push(st);
            }
        }
        if (!stations.length) { console.error('usage: traveler carry [--template <bill.json>] --stage by=<station>,op=<op>[,part=<name>][,privileged=true] ...  (or --stations <route.json>)'); process.exit(1); }
        try {
            const rep = C.carry(t, { stations, template });
            if (rep.letter && rep.letter.id !== t.id) T.persist(rep.letter);
            saveCurrent(rep.letter);
            console.log((rep.ok ? '✅' : '⚠️ ') + ' letter routed: ' + rep.landed + '/' + rep.stations + ' stages' + (template ? ', built=' + rep.built : ''));
            for (const r of rep.route) {
                console.log('   ' + String(r.stage).padStart(2) + '. ' + r.verdict.toUpperCase() + (r.verdict === 'landed' ? ' seq ' + r.seq + ' ' + r.op + ' @ ' + r.by + (r.part ? ' +part:' + r.part : '') : ' (' + r.code + ')'));
            }
            if (rep.refused) console.log('   REFUSED at stage ' + rep.refused.stage + ': ' + rep.refused.code + ' — the letter DROPS there (fail-closed).');
            if (rep.unfilled) console.log('   unfilled slots: ' + rep.unfilled.join(', '));
            if (rep.letter && rep.letter.slots.assembly) console.log('   assembly: ' + Object.keys(rep.letter.slots.assembly).join(', '));
            console.log('   walk: ok=' + rep.walk.ok + ' stations=' + rep.walk.stations + ' gaps=' + rep.walk.gaps.length + ' rewrites=' + rep.walk.rewrites.length);
            if (!rep.ok) process.exit(1);
        } catch (e) {
            console.error('❌ carry refused: ' + e.message + ' (' + (e.code || 'E_LOCAL') + ')');
            process.exit(1);
        }
        return;
    }
    if (sub === 'replay') {
        // (pass 261) THE CONTINUITY WALK at the tool boundary: the auditor's
        // backtrack map over carried landings. --file handoff composes.
        const C = require(path.join(__dirname, '..', 'lib', 'carriers'));
        const arrivals = [];
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === '--landing') {
                const [k, v] = String(args[i + 1]).split('=');
                if (k === 'seq') arrivals.push({ seq: parseInt(v, 10) });
            }
            if (args[i] === '--file') {
                arrivals.push(JSON.parse(fs.readFileSync(args[i + 1], 'utf8')));
            }
        }
        if (!arrivals.length) {
            const t = loadCurrent();
            if (!t) { console.error('usage: traveler replay [--file <packet.json>]... [--landing seq=N]...  (or walk the current letter alone)'); process.exit(1); }
            arrivals.push(t);
        }
        try {
            const rep = C.replay(arrivals);
            console.log((rep.ok ? '✅' : '⚠️ ') + ' continuity walk: ' + rep.stations + ' stations, walkedTo=' + rep.walkedTo + ', ok=' + rep.ok);
            for (const gp of rep.gaps) console.log('   GAP: missing ' + JSON.stringify(gp.missing) + ' (after seq ' + gp.afterSeq + ', next seen ' + gp.arrivedAt + ')');
            for (const rw of rep.rewrites) console.log('   REWRITE at seq ' + rw.seq + ': canon ' + JSON.stringify(rw.canon) + ' vs arrived ' + JSON.stringify(rw.arrived));
            if (!rep.ok) process.exit(1);
        } catch (e) {
            console.error('❌ replay refused: ' + e.message + ' (' + (e.code || 'E_LOCAL') + ')');
            process.exit(1);
        }
        return;
    }
    console.log('usage: node bin/traveler.js open|hop|attach|carry|replay|status|audit|verify|finger  (the auditable pin + certified letter, ISO 8.5.2)');
}

function this_station() {
    try { return require('../lib/brain').getCurrentBrain() || 'unknown-station'; } catch (e) { return 'unknown-station'; }
}

main();
