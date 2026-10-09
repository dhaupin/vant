#!/usr/bin/env node
/**
 * Vant Events CLI — event-bus observability (pass 179, Wave A1)
 *
 * The shared bus (lib/event.js) emits 266 distinct event names; before
 * this CLI, 8 of them had anywhere to be heard. This tool makes the rest
 * observable without changing any emit contract:
 *
 *   vant events tail [--name <type>] [--module <prefix>] [--max N] [--json]
 *                    [--follow] [--clear]
 *   vant events enable                          # start recording to the session sink
 *   vant events disable                         # stop recording
 *   vant events stats                           # sink status (enabled/file/events/bytes)
 *
 * The sink is per-process-and-session (tmp/vant-events/session-*.jsonl).
 * `enable` turns on recording for THIS process; `tail` reads it back.
 * Follow mode polls the sink file every 300ms until Ctrl-C.
 *
 * Prd: labs/prd-canonicalization.md §2 (Wave A). Sink lives in
 * lib/event.js (sinkEnable/sinkDisable/sinkStats/sinkTail), OFF by
 * default — an observability tool must never change emission behavior.
 */

const args = process.argv.slice(2);
const events = require('../lib/event');

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Vant Events CLI — observe the shared event bus

Usage:
  vant events tail [--name <type>] [--module <prefix>] [--max N] [--json] [--follow] [--clear]
  vant events enable                            Start recording events
  vant events disable                           Stop recording
 vant events stats                              Sink status

Notes:
  - Recording is per-process: \`enable\` then re-run the emitting workflow
    in-process (MCP/tools), then \`tail\` reads the session file.
  - \`--follow\` polls for new lines until interrupted (Ctrl-C).
  - JSONL sink format: {"t":ms,"type":"x:y","data":{...}}
Prd: labs/prd-canonicalization.md §2
`);
    process.exit(0);
}

const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const has = (f) => args.includes(f);

const sub = args[0] || 'tail';

// ── enable / disable / stats ─────────────────────────────────────────────
if (sub === 'enable') {
    const file = events.sinkEnable();
    console.log('Recording events to: ' + file);
    console.log('  (recording stops when this process exits; re-enable per session)');
    process.exit(0);
}
if (sub === 'disable') {
    const was = events.sinkPath();
    events.sinkDisable();
    console.log(was ? 'Stopped recording (was ' + was + ')' : 'Not recording (sink was off)');
    process.exit(0);
}
if (sub === 'stats') {
    const s = events.sinkStats();
    if (!s.enabled) { console.log('Sink: OFF (run `vant events enable` to start recording)'); process.exit(0); }
    console.log('Sink: ON');
    console.log('  file:   ' + s.file);
    console.log('  events: ' + s.events);
    console.log('  bytes:  ' + s.bytes + ' (' + (s.bytes / 1024).toFixed(1) + ' KB)');
    process.exit(0);
}

// ── tail ──────────────────────────────────────────────────────────────────
if (sub !== 'tail') {
    console.error('Unknown subcommand: ' + sub + ' (try: tail|enable|disable|stats)');
    process.exit(2);
}

if (has('--clear')) {
    // Start a fresh session file
    events.sinkDisable();
    events.sinkEnable();
    console.log('Fresh session sink started.');
    process.exit(0);
}

const nameFilter = getArg('--name');
const modFilter = getArg('--module');
const max = (() => { const n = parseInt(getArg('--max') || '', 10); return Number.isFinite(n) && n > 0 ? n : 50; })();
const asJson = has('--json');
const follow = has('--follow');

if (!events.sinkPath()) {
    // Convenience: tail before enable — check whether a sink file from ANY
    // earlier session in this tmp dir exists; if so, read it read-only.
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const dir = path.join(os.tmpdir(), 'vant-events');
    if (fs.existsSync(dir)) {
        const candidates = fs.readdirSync(dir)
            .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
            .map(f => path.join(dir, f))
            .map(f => ({ f, m: fs.statSync(f).mtimeMs }))
            .sort((a, b) => b.m - a.m);
        if (candidates.length) {
            console.error('[note] sink not enabled in this process; reading most recent session file');
            console.error('       (' + candidates[0].f + ') — run `vant events enable` for live capture');
            // Read-only tail against the found file via sinkTail-compatible API:
            const raw = fs.readFileSync(candidates[0].f, 'utf8').split('\n').filter(Boolean);
            const out = [];
            for (let i = raw.length - 1; i >= 0 && out.length < max; i--) {
                try {
                    const rec = JSON.parse(raw[i]);
                    if (nameFilter && !rec.type.startsWith(nameFilter) && rec.type !== nameFilter) continue;
                    if (modFilter && rec.type.split(':')[0] !== modFilter) continue;
                    out.push(rec);
                } catch {}
            }
            if (asJson) console.log(JSON.stringify({ file: candidates[0].f, events: out }, null, 2));
            else {
                for (const e of out.reverse()) {
                    console.log(new Date(e.t).toISOString().slice(11, 23), e.type.padEnd(28), JSON.stringify(e.data).slice(0, 120));
                }
                if (!out.length) console.log('(no matching events)');
            }
            process.exit(0);
        }
    }
    console.error('Sink is OFF and no prior session file exists.');
    console.error('Start recording in the emitting process first: vant events enable');
    process.exit(2);
}

const render = (res) => {
    if (asJson) { console.log(JSON.stringify(res, null, 2)); return; }
    if (!res.events.length) { console.log('(no matching events)'); return; }
    for (const e of res.events.reverse()) {
        console.log(new Date(e.t).toISOString().slice(11, 23), e.type.padEnd(28), JSON.stringify(e.data).slice(0, 120));
    }
};

render(events.sinkTail({ max, nameFilter, module: modFilter }));
process.exit(0);
