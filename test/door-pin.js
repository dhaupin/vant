#!/usr/bin/env node
/**
 * Door-pin engine (issue #181 Part A).
 *
 * A "door" is one CLI invocation. A door pin asserts the door's DOCUMENTED
 * contract: argv sample → expected exit code + stdout regex, sourced from
 * the door's own help/docs. This is the output-shape half `testBin` was
 * missing: testBin covers "did it exit as promised"; door pins cover "did
 * it SAY the right thing on the way out".
 *
 * Policy (from #181): a pin failing is a BUG, never a pin-weakening. The
 * pin asserts documented behavior; if doc and lib disagree, the fix may
 * land on either side, but the pin only changes when the documented
 * contract changes.
 *
 * The pin table lives in test/door-pins.js (data only); this engine is the
 * runner half and is wired into test/runner.js via runDoorPins().
 *
 * Exit: process.exitCode is set (never thrown) — the caller (runner) owns
 * the process verdict.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 60000;

// State for the summary surfaced through the runner.
let _passed = 0;
let _failed = 0;

/**
 * Run ONE door pin.
 *
 * @param {object} door  entry from the door-pin table:
 *   {
 *     name:    pin label (unique),
 *     bin:     path under bin/ (e.g. 'encrypt.js'),
 *     args:    argv after the bin path,
 *     exit:    expected exit code (default 0),
 *     match:   pattern(s) the COMBINED stdout must satisfy. STRING
 *              entries are LITERAL substrings (so '[object Object]'
 *              means the literal string, never a character-class regex);
 *              RegExp entries are regexes as written.
 *     matchErr: regex the stderr must satisfy (optional),
 *     env:     extra env vars for the child,
 *     cwdRel:  run from a subdir of ROOT (default ROOT itself),
 *   }
 * @returns {boolean} true = pin held
 */
function runDoorPin(door) {
    const bin = path.join(ROOT, 'bin', door.bin);
    const child = spawnSync('node', [bin, ...(door.args || [])], {
        cwd: door.cwdRel ? path.join(ROOT, door.cwdRel) : ROOT,
        encoding: 'utf8',
        timeout: door.timeoutMs || DEFAULT_TIMEOUT_MS,
        env: Object.assign({}, process.env, door.env || {}),
        input: door.input || undefined
    });

    // Robustness: a spawn failure (ENOENT etc.) is a FAIL, not a crash.
    const out = (child.stdout || '') + (child.stderr || '');
    let code = child.status;
    if (code === null && child.error) code = -1;

    const problems = [];
    if (code !== (door.exit !== undefined ? door.exit : 0)) {
        problems.push('exit ' + code + ' (want ' + (door.exit !== undefined ? door.exit : 0) + ')');
    }
    const patterns = door.match === undefined ? []
        : Array.isArray(door.match) ? door.match : [door.match];
    for (const p of patterns) {
        if (p instanceof RegExp) {
            if (!p.test(out)) problems.push('stdout missing /' + p.source + '/');
        } else {
            // String = literal substring. NEVER coerce to RegExp: a
            // literal like '[object Object]' compiled as a regex becomes
            // a character class + 'Object' and false-positives on plain
            // 'Object' text (live-caught on the config list pin).
            if (!out.includes(String(p))) problems.push('stdout missing literal ' + JSON.stringify(p));
        }
    }
    // notMatch: forbidden outputs (crash strings, [object Object] class).
    // A hit is a failure even when exit code and positive regexes hold.
    // Same literal/regex split as match.
    const banned = door.notMatch === undefined ? []
        : Array.isArray(door.notMatch) ? door.notMatch : [door.notMatch];
    for (const b of banned) {
        if (b instanceof RegExp) {
            if (b.test(out)) problems.push('stdout contains forbidden /' + b.source + '/');
        } else {
            if (out.includes(String(b))) problems.push('stdout contains forbidden literal ' + JSON.stringify(b));
        }
    }

    if (problems.length === 0) {
        _passed++;
        console.log('  \u2713 door: ' + door.name);
        return true;
    }
    _failed++;
    console.log('  \u2717 door: ' + door.name);
    for (const p of problems.slice(0, 3)) console.log('      ' + p);
    console.log('      out: ' + out.replace(/\s+/g, ' ').slice(0, 150));
    return false;
}

/**
 * Run the whole door-pin table (bad batches stop nothing; doors are
 * independent one-shot processes).
 *
 * @param {Array<object>} doors      the pin table
 * @param {object} [opts] { only: substring filter, skip: substring filter }
 * @returns {{ passed: number, failed: number }}
 */
function runDoorPins(doors, opts = {}) {
    const only = opts.only || null;
    const skip = opts.skip || [];
    const chosen = doors
        .filter((d) => !only || d.name.includes(only) || (d.bin || '').includes(only))
        .filter((d) => !skip.some((s) => (d.name + ' ' + (d.bin || '')).includes(s)));

    console.log('\n\uD83D\uDD17 DOOR PINS (' + chosen.length + ' doors)\n');
    for (const d of chosen) runDoorPin(d);
    return { passed: _passed, failed: _failed };
}

module.exports = { runDoorPin, runDoorPins, ROOT, DEFAULT_TIMEOUT_MS };
