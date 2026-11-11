#!/usr/bin/env node
/**
 * Dispatcher arg-slice test — `vant start --brain-name <x>`.
 *
 * bin/start.js reads `process.argv.slice(3)`, but the dispatcher
 * (bin/vant.js) spawns it with `process.argv.slice(3)` too — the `start`
 * verb is already gone, so the slice drops the FIRST flag after the verb.
 * `vant start --brain-name openhands` arrived as `['openhands']`, the flag
 * never reached _resolveSeedTarget, and the seed landed on the default
 * brain (`vant`). Every other bin script (brain/health/migrate/sync) uses
 * slice(2); start.js was the lone outlier.
 *
 * The migrate-onboard-journey suite calls bin/start.js DIRECTLY, so it never
 * exercises the dispatcher slice and missed this. This test drives the REAL
 * `vant start` path through bin/vant.js — the path a user (or agent) hits.
 *
 * Run: node tests/start-brain-name-dispatch.test.js
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const FIXTURES = [];
function makeFixture(name) {
    const dir = path.join(ROOT, '.dispatch-' + name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
    for (const b of ['vant.js', 'start.js', 'health.js', 'migrate.js']) {
        fs.copyFileSync(path.join(ROOT, 'bin', b), path.join(dir, 'bin', b));
    }
    FIXTURES.push(dir);
    return dir;
}
process.on('exit', () => {
    for (const dir of FIXTURES) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
});

function childEnv() {
    const env = { ...process.env };
    delete env.VANT_BRAIN;          // resolve from the fixture tree, not the caller
    delete env.VANT_BRAIN_PASSWORD;
    env.NODE_PATH = [path.join(ROOT, 'node_modules'), env.NODE_PATH].filter(Boolean).join(path.delimiter);
    return env;
}

const results = { passed: 0, failed: 0 };
function check(name, ok, detail) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${detail}`); }
}

console.log('\n🧭 START DISPATCHER ARG-SLICE TEST\n');

// The bug: the flag after `start` is eaten, so the seed ignores the name.
const dir = makeFixture('brain-name');
const r = spawnSync(process.execPath, [path.join(dir, 'bin', 'vant.js'), 'start', '--brain-name', 'myagent', '--seed-starter', '--no-migrate'], {
    cwd: dir, encoding: 'utf8', timeout: 90000, env: childEnv()
});
const out = (r.stdout || '') + (r.stderr || '');
const named = fs.existsSync(path.join(dir, 'models', 'private', 'myagent', 'identity.md'));
const deflt = fs.existsSync(path.join(dir, 'models', 'private', 'vant', 'identity.md'));

check('exit code is 0', r.status === 0, `status=${r.status} out=${out.slice(0, 300)}`);
check('seeds the NAMED brain (models/private/myagent/identity.md)', named, `missing; out=${out.slice(0, 300)}`);
check('does NOT seed the default brain (models/private/vant/)', !deflt, 'a stray default brain was created');

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
