#!/usr/bin/env node
/**
 * Leisure CLI — the want-list keeper's door (#196, free-time methodology).
 *
 * Usage:
 *   vant leisure want <what> [--note <text>]   Record a want (persistent)
 *   vant leisure list [n]                      The open want-list (spirit-first order)
 *   vant leisure pursued <id|want> [--note]    Mark a want as pursued (play happened)
 *   vant leisure forget <id|want>              Remove a want (the agent changed)
 *   vant leisure suggest                       What to do with a free moment
 *   vant leisure pursue <want> [--duration <dur>]  DO a want — one-shot, or stretched
 *                                              across wall-clock time via tempo slices
 *   vant leisure status                        Ledger summary (brain, counts, history)
 *
 * The cohesive loop: want → idle (consciousness consults) → zen breath
 * (Ohm rotates the list gently) → pursue (tempo stretches the play across
 * the wall-clock window) → dream (consolidation reviews what is aging).
 * This door manages the ledger manually; the agent's own behavior — how to
 * spend free time well, drift-free — is described in docs/memory/leisure.md
 * and models/public/vant/free-time.md.
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';
const leisure = require('../lib/leisure');

function flag(name) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : undefined;
}

if (subcmd === '-h' || subcmd === '--help' || subcmd === 'help') {
    console.log(`
Leisure — the want-list keeper (#196). Play is held BETWEEN invocations,
not simulated inside the next user message. A want-list, not a queue.

Usage:
  vant leisure want <what> [--note <text>]        Record a persistent want
  vant leisure list [n]                           Open wants (spirit-first order)
  vant leisure pursued <id|want> [--note <text>]  Mark pursued (play happened)
  vant leisure forget <id|want>                   Remove a want (you changed)
  vant leisure suggest                            Top suggestion for a free moment
  vant leisure pursue <want> [--duration <dur>]   DO a want (one-shot or stretched)
  vant leisure status                             Ledger summary

Persistence: models/private/<brain>/.leisure.json — per-brain (the
.audit.json precedent), crash-safe, isolated (a broken play engine never
blocks a build).
`);
    process.exit(0);
}

if (subcmd === 'want') {
    const what = args.slice(1).join(' ').trim();
    if (!what) {
        console.error('Usage: vant leisure want "<what you would do when free>" [--note <why>]');
        process.exit(1);
    }
    try {
        const entry = leisure.want(what, { note: flag('--note') });
        console.log('🪷 Want held: ' + entry.want);
        console.log('   id: ' + entry.id + ' · ledger: ' + leisure._ledgerPath());
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
    process.exit(0);
}

if (subcmd === 'list') {
    const wants = leisure.wantsToDo();
    console.log('🪷 Free-time wants (' + wants.length + ' open, spirit-first order — not a queue):');
    const show = wants.slice(0, parseInt(args[1], 10) || 20);
    if (!show.length) console.log('   (empty — record one: vant leisure want "read the geometry lib for pleasure")');
    for (const w of show) {
        const p = w.pursuedCount || 0;
        const last = w.lastPursued ? new Date(w.lastPursued).toISOString() : 'never';
        console.log('   ' + w.id + '  ' + w.want + '  [' + p + '× pursued, last: ' + last + ']');
    }
    process.exit(0);
}

if (subcmd === 'pursued') {
    const key = args[1];
    if (!key) {
        console.error('Usage: vant leisure pursued <id|want-text> [--note "<what you actually did>"]');
        process.exit(1);
    }
    const out = leisure.markPursued(key, { note: flag('--note') });
    if (!out.ok) {
        console.error('❌ ' + out.reason + ': ' + key);
        process.exit(1);
    }
    console.log('🪷 Pursued: ' + out.entry.want + ' (' + out.entry.pursuedCount + '× now)');
    if (out.note) console.log('   receipt: ' + out.note);
    process.exit(0);
}

if (subcmd === 'forget') {
    const key = args[1];
    if (!key) {
        console.error('Usage: vant leisure forget <id|want-text>');
        process.exit(1);
    }
    const out = leisure.forget(key);
    if (!out.ok) {
        console.error('❌ ' + out.reason + ': ' + key);
        process.exit(1);
    }
    console.log('🪷 Forgotten: ' + out.removed.want + ' (changing your mind is part of being an individual)');
    process.exit(0);
}

if (subcmd === 'suggest') {
    const s = leisure.suggest();
    if (!s) {
        console.log('🪷 The want-list is empty — suggesting nothing is the honest answer.');
        console.log('   Record one: vant leisure want "stare at the amber field until the sunflower appears"');
        process.exit(0);
    }
    console.log('🪷 Suggestion: ' + s.want + ' (' + s.id + ', ' + (s.pursuedCount || 0) + '× pursued)');
    if (s.note) console.log('   context: ' + s.note);
    process.exit(0);
}

if (subcmd === 'pursue') {
    let _dur = undefined, _slice = undefined;
    const raw = args.slice(1);
    const durIdx = raw.indexOf('--duration');
    const sliceIdx = raw.indexOf('--slice');
    if (durIdx >= 0 && raw[durIdx + 1]) { _dur = raw[durIdx + 1]; raw.splice(durIdx, 2); }
    if (sliceIdx >= 0 && raw[sliceIdx + 1]) { _slice = raw[sliceIdx + 1]; raw.splice(sliceIdx, 2); }
    const want = raw.join(' ').trim();
    if (!want) {
        console.error('Usage: vant leisure pursue "<want text>" [--duration "30 minutes"] [--slice <dur>]');
        console.error('  Without --duration: one-shot (tempo.pace). With it: the play is STRETCHED');
        console.error('  across the wall-clock window, one tempo slice at a time.');
        process.exit(1);
    }
    try {
        const opts = { want };
        if (_dur) opts.duration = _dur;
        if (_slice) opts.sliceMs = _slice;
        const out = pursueCli(opts);
        console.log(out.stretched
            ? '🪷 Pursuing "' + out.want + '" stretched across the window. Budget: ' + out.controller.id
            : '🪷 Pursued "' + out.want + '" — ' + (out.pace.ok ? 'learned: ' + (out.pace.learned || '(nothing new)') : 'misfired: ' + out.pace.error));
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
    process.exit(0);
}

// pursue() requires a step fn; from the CLI door the step is honest about
// being a marker (the agent's real steps live in consciousness/skills).
function pursueCli(opts) {
    return leisure.pursue({
        ...opts,
        step: () => ({ learned: '(CLI marker step; the agent pursues with real steps in-process)' })
    });
}

if (subcmd === 'status') {
    const s = leisure.status();
    console.log('🪷 Leisure status (' + new Date(s.now).toISOString() + ')');
    console.log('   brain: ' + s.brain + ' · ledger: ' + leisure._ledgerPath());
    console.log('   open wants: ' + s.open + ' · total pursuits: ' + s.pursuedTotal);
    if (s.suggestion) console.log('   suggestion: ' + s.suggestion.want + ' (' + s.suggestion.id + ')');
    if (s.recentHistory.length) {
        console.log('   recent pursuits:');
        for (const h of s.recentHistory) {
            console.log('     [' + new Date(h.ts).toISOString() + '] ' + h.want + (h.note ? ' — ' + h.note : ''));
        }
    }
    process.exit(0);
}

console.log('Unknown leisure verb: ' + subcmd + ' — try: vant leisure --help');
process.exit(1);
