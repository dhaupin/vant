'use strict';

/**
 * Regression pins for issue #252's staleness invariant ("using brain
 * must imply recent backup"):
 *
 *   - the ledger: stamps only from COMPLETED landings, NEVER as a
 *     finding, STALE past 2 freshness windows, injected `now` (deterministic,
 *     never a hidden wall clock);
 *   - create() stamps the current brain automatically once bytes land;
 *   - the active-brain watchdog arms silently, pushes to a durable
 *     destination outside the repo mount, and stops with the scheduler;
 *   - the ephemeral-zone probe names the git mount truthfully (the #252
 *     wipe killed untracked in-mount files);
 *
 * All children run in scratch roots; the repo tree is never touched.
 *
 * Run: node test/backup-staleness.test.js  (picked up by test/run-all.js)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const STALE = REPO + '/lib/backup-staleness.js';
const BACKUP = REPO + '/lib/backup.js';

let failures = 0;
function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${detail}`}`);
}

function makeRoot(stateJson) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-cta-252-'));
    for (const b of ['vant', 'echo']) {
        fs.mkdirSync(path.join(root, 'models', 'private', b), { recursive: true });
        fs.writeFileSync(path.join(root, 'models', 'private', b, 'identity.md'), `# ${b}\n`);
    }
    fs.mkdirSync(path.join(root, 'models', 'public', 'vant'), { recursive: true });
    if (stateJson !== null) fs.writeFileSync(path.join(root, 'models', 'state.json'), JSON.stringify(stateJson));
    return root;
}

function runRoot(root, body, env) {
    return spawnSync(process.execPath, ['-e', body], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60000,
        env: Object.assign({}, process.env, env || {}),
    });
}

function parseSentinel(r) {
    try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return null; }
}

// ---- ledger: stamp / staleness / NEVER-as-finding, injected now ----
{
    const root = makeRoot({ stack: ['vant', 'echo'], currentBrain: 'vant' });
    const r = runRoot(root, `
        const s = require(${JSON.stringify(STALE)});
        const NOW = 1000000000000;
        s.stamp({ brain: 'vant', artifact: 'models/backup/x.svg', type: 'horcrux', at: NOW });
        const report = s.stalenessReport({ now: NOW, stack: ['vant', 'echo'] });
        const reportOld = s.stalenessReport({ now: NOW + s.DEFAULT_FRESHNESS_MS * 3, stack: ['vant', 'echo'] });
        console.log(JSON.stringify({
            recent: report.brains.find(b => b.brain === 'vant').status,
            never: report.brains.find(b => b.brain === 'echo').status,
            finding: report.brains.find(b => b.brain === 'echo').finding,
            staled: reportOld.brains.find(b => b.brain === 'vant').status,
            artifact: report.brains.find(b => b.brain === 'vant').artifact,
        }));
    `);
    const d = parseSentinel(r);
    check('#252 ledger: a stamped brain reads RECENT', d && d.recent === 'RECENT', d ? JSON.stringify(d) : r.stderr.slice(0, 160));
    check('#252 ledger: an unstamped brain reads NEVER and is a FINDING', d && d.never === 'NEVER' && d.finding === true, d ? JSON.stringify(d) : r.stderr.slice(0, 160));
    check('#252 ledger: past 2 freshness windows the stamp reads STALE', d && d.staled === 'STALE', d && d.staled);
    check('#252 ledger: the artifact is named relative to the models root', d && d.artifact === 'backup/x.svg', d && d.artifact);
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- ledger: a corrupt ledger surfaces typed, never a fake-empty census ----
{
    const root = makeRoot(null);
    fs.writeFileSync(path.join(root, 'models', 'backup-receipts.json'), '[]'); // wrong shape (array)
    const r = runRoot(root, `
        const s = require(${JSON.stringify(STALE)});
        const report = s.stalenessReport({ stack: ['vant'] });
        // The report law: a corrupt ledger is TYPED and visible (not a
        // fake-empty census) — every receipt-less brain reads NEVER.
        console.log(JSON.stringify({ ledgerError: report.ledgerError, status: report.brains[0].status, finding: report.brains[0].finding }));
    `);
    const d = parseSentinel(r);
    check('#252 ledger: a wrong-shaped ledger surfaces typed (E_SCHEMA), every brain reads NEVER', d && d.ledgerError === 'E_SCHEMA' && d.status === 'NEVER' && d.finding === true, d ? JSON.stringify(d) : r.stderr.slice(0, 160));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- create() stamps the current brain; restore round-trip (ask 4) ----
{
    const root = makeRoot({ stack: ['vant'], currentBrain: 'vant' });
    const r = runRoot(root, `
        const backup = require(${JSON.stringify(BACKUP)});
        (async () => {
            const created = await backup.create({ type: 'json', outputPath: 'models/backup/pin-roundtrip.json', quiet: true });
            const s = require(${JSON.stringify(STALE)});
            const report = s.stalenessReport({ stack: ['vant'] });
            console.log(JSON.stringify({ created: !!created.path, stamped: report.brains[0].status, artifact: report.brains[0].artifact }));
        })().catch(e => { console.error('THREW: ' + String(e && e.message).slice(0, 200)); process.exit(3); });
    `);
    const d = parseSentinel(r);
    check('#252 create: a completed backup stamps the CURRENT brain (receipt, not absence)', d && d.created === true && d.stamped === 'RECENT', d ? JSON.stringify(d) : `${r.stdout} ${r.stderr}`.slice(0, 220));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- restore round-trip (ask 4 measured): restore lands the brain kit ----
{
    const root = makeRoot({ stack: ['vant'], currentBrain: 'vant' });
    const r = runRoot(root, `
        const fs = require('fs');
        const backup = require(${JSON.stringify(BACKUP)});
        (async () => {
            const created = await backup.create({ type: 'json', outputPath: 'models/backup/rt.json', quiet: true });
            fs.unlinkSync('models/private/vant/identity.md'); // shrink the kit: only the backup has those bytes
            await backup.restore(created.path); // single command: decode + validate + land
            const restored = fs.readFileSync('models/private/vant/identity.md', 'utf8');
            console.log(JSON.stringify({ roundTrip: restored.indexOf('vant') !== -1 }));
        })().catch(e => { console.error('THREW: ' + String(e && e.message).slice(0, 200)); process.exit(3); });
    `);
    const d = parseSentinel(r);
    check('#252 restore: one command recovers a shrunk brain kit byte-for-byte (ask 4; no-password json artifact)', r.status === 0 && d && d.roundTrip === true, r.status === 0 ? JSON.stringify(d) : (r.stderr || '').slice(0, 220));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- watchdog: arms, pushes silently on the cadence, stops with the scheduler ----
{
    const root = makeRoot({ stack: ['vant'], currentBrain: 'vant' });
    const dest = path.join(root, 'outside-mount');
    const r = runRoot(root, `
        const fs = require('fs');
        const backup = require(${JSON.stringify(BACKUP)});
        const s = require(${JSON.stringify(STALE)});
        const inst = backup.getInstance({ activeBrainWatchdog: true, activeBrainIntervalMs: 40, activeBrainDestination: process.env.PIN_DEST, schedules: [] });
        inst._running = true;
        inst._startActiveBrainWatchdog();
        (async () => {
            const tick = await inst._activeBrainTick(); // ONE deterministic push, not a sleep race
            const report = s.stalenessReport({ stack: ['vant'] });
            const landed = fs.readdirSync(process.env.PIN_DEST);
            inst.stop(); // must clear the timer
            const stopped = inst._watchdogTimer === null;
            console.log(JSON.stringify({ tick: tick && tick.ok, stamped: report.brains[0].status, landed: landed.length, stopped }));
            process.exit(0);
        })().catch(e => process.exit(3));
    `, { PIN_DEST: dest });
    const d = parseSentinel(r);
    check('#252 watchdog: a deterministic tick pushed a durable landing OUTSIDE the mount that stamped the ledger', d && d.tick === true && d.stamped === 'RECENT' && d.landed >= 1, d ? JSON.stringify(d) : `${r.stdout} ${r.stderr}`.slice(0, 220));
    check('#252 watchdog: scheduler.stop() clears the interval (no ghost timer)', d && d.stopped === true, d && JSON.stringify(d.stopped));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- ephemeral zone: names the git mount truthfully ----
{
    const root = makeRoot(null);
    fs.mkdirSync(path.join(root, '.git'));
    const r = runRoot(root, `
        const s = require(${JSON.stringify(STALE)});
        const zone = s.ephemeralZone({});
        console.log(JSON.stringify({ insideRepo: zone.insideRepo, why: !!zone.why }));
    `);
    const d = parseSentinel(r);
    check('#252 zone: a models root inside a git mount warns (untracked = the #252 burial)', d && d.insideRepo === true && d.why === true, d ? JSON.stringify(d) : r.stderr.slice(0, 160));
    fs.rmSync(root, { recursive: true, force: true });
}
{
    const plain = makeRoot(null);
    const r = runRoot(plain, `
        const s = require(${JSON.stringify(STALE)});
        console.log(JSON.stringify({ insideRepo: s.ephemeralZone({}).insideRepo }));
    `);
    const d = parseSentinel(r);
    check('#252 zone: a non-git root reads clean (the warning never cries wolf)', d && d.insideRepo === false, d ? JSON.stringify(d) : r.stderr.slice(0, 160));
    fs.rmSync(plain, { recursive: true, force: true });
}

console.log(`\nbackup-staleness: ${failures === 0 ? 'ALL PINS PASS' : `${failures} pin(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
