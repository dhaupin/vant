#!/usr/bin/env node
/**
 * struct-feed-stamp.js - stamps the LIVE crashtest feed row for the
 * STRUCT audit page (vant issue #264, step b).
 *
 * The machine truth it stamps: test/crashtest-packs.test.js's own
 * verdict ledger (the same sentinel dump CRASHTEST_PACKS_JSON=1 gives
 * the CI gate). Nothing here is invented: the counters derive from the
 * measured rows, and the stamp date is the day the ledger ran.
 *
 * Writes the SAME feed row byte-identically into every flavor (the
 * vendoring-ring law, applied to data):
 *   web/home/src/generated/struct-feed.json
 *   web/dashboard/src/generated/struct-feed.json
 * each with its own .sha256 pin sidecar. --check verifies pins (CI).
 *
 * Cost note: default mode runs the FULL contract suite (the CI gate's
 * phase-A body, minutes). `--from-json <file>` accepts a captured
 * sentinel dump when a suite run already happened (this run's stamps).
 *
 * Usage:
 *   node scripts/struct-feed-stamp.js [--from-json dump.json] [--check]
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SUITE = 'test/crashtest-packs.test.js';
const SENTINEL = /CRASHTEST_PACKS_GATE<<([\s\S]*?)>>END/;
const TARGETS = [
    'web/home/src/generated/struct-feed.json',
    'web/dashboard/src/generated/struct-feed.json',
];

// ---- shape (mirrors the kit contract, StructFeed) ----
// { source: 'crashtest', ok, version, generatedAt, counts{packs,rows,refused,skipped,exploited}, findings[], sourceHref, _stamp }
// The crashtest SOURCE row: keys ordered so the two flavor copies stay byte-identical.

function parseDump(text) {
    const hit = SENTINEL.exec(text);
    if (!hit) return null;
    try { return JSON.parse(hit[1]); } catch { return null; }
}

function deriveFeed(dump, when) {
    const packs = Object.keys(dump).length;
    let rows = 0;
    let refused = 0;
    let skipped = 0;
    let exploited = 0;
    const findings = [];
    for (const [pack, entry] of Object.entries(dump)) {
        for (const [attack, row] of Object.entries(entry.verdicts || {})) {
            rows += 1;
            if (row.skipped) { skipped += 1; continue; }
            if (row.verdict === 'EXPLOITED') {
                exploited += 1;
                findings.push({
                    id: `${pack}/${attack}`,
                    page: pack,
                    level: 'fail',
                    message: String(row.detail || '').slice(0, 300),
                });
            } else {
                refused += 1;
            }
        }
    }
    const verdict = exploited > 0 ? 'FINDINGS-basis' : 'PASS-basis';
    findings.push({
        id: 'contract-table',
        level: exploited > 0 ? 'fail' : 'info',
        message: `Contract table ${verdict === 'PASS-basis' ? 'held' : 'SURVEY'}: ${packs} packs, ${rows} rows — ${refused} REFUSED, ${skipped} honest skips, ${exploited} EXPLOITED. Measured live by ${SUITE} (two-cycle deterministic).`,
    });
    return {
        source: 'crashtest',
        ok: true,
        version: 'crashledger/1',
        generatedAt: when,
        counts: { packs, rows, refused, skipped, exploited },
        findings,
        sourceHref: 'https://www.npmjs.com/package/crashtest',
        _stamp: {
            by: 'scripts/struct-feed-stamp.js',
            from: SUITE,
            legend: 'values derive from the measured verdict ledger run this stamp\'s date; restamp with npm run struct:stamp after a campaign wave',
        },
    };
}

function writeFlavors(feed) {
    const bytes = Buffer.from(JSON.stringify(feed, null, 2) + '\n', 'utf8');
    for (const rel of TARGETS) {
        const target = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        fs.writeFileSync(target + '.sha256', crypto.createHash('sha256').update(bytes).digest('hex') + '\n');
        console.log('[stamped] ' + rel + ' (pin ' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12) + '...)');
    }
}

function main() {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const fromIdx = args.indexOf('--from-json');
    const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;

    if (check) {
        let ok = true;
        for (const rel of TARGETS) {
            const target = path.join(ROOT, rel);
            const pin = target + '.sha256';
            if (!fs.existsSync(target) || !fs.existsSync(pin)) {
                console.error('[drift] missing feed/pin: ' + rel);
                ok = false;
                continue;
            }
            const want = fs.readFileSync(pin, 'utf8').trim();
            const got = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
            if (want !== got) { console.error('[drift] pin mismatch: ' + rel); ok = false; }
            const a = fs.readFileSync(path.join(ROOT, TARGETS[0]));
            const b = fs.readFileSync(path.join(ROOT, TARGETS[1]));
            if (!a.equals(b)) { console.error('[drift] flavor copies diverged'); ok = false; }
        }
        process.exit(ok ? 0 : 1);
    }

    let dump;
    if (fromFile) {
        dump = parseDump(fs.readFileSync(fromFile, 'utf8'));
        if (!dump) { console.error('struct-feed-stamp: no sentinel ledger in ' + fromFile); process.exit(1); }
    } else {
        console.log('struct-feed-stamp: measuring the live contract suite (this is the CI gate\'s phase-A body; minutes)...');
        const r = spawnSync(process.execPath, [SUITE], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 12 * 60 * 1000,
            env: { ...process.env, CRASHTEST_PACKS_JSON: '1' },
            maxBuffer: 64 * 1024 * 1024,
        });
        if (r.error) { console.error('suite fault: ' + r.error); process.exit(1); }
        if (r.status !== 0) { console.error('suite exited ' + r.status + ' — refusing to stamp a RED ledger'); process.exit(1); }
        dump = parseDump(r.stdout || '');
        if (!dump) { console.error('suite gave no sentinel ledger'); process.exit(1); }
    }

    const feed = deriveFeed(dump, new Date().toISOString().slice(0, 10));
    writeFlavors(feed);
    const c = feed.counts;
    console.log(`stamped: crashtest feed — ${c.packs} packs, ${c.rows} rows, ${c.refused} REFUSED, ${c.skipped} skips, ${c.exploited} EXPLOITED (as of ${feed.generatedAt})`);
}

main();
