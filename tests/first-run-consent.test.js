#!/usr/bin/env node
/**
 * First-run seed consent + brain-name pins (issues #257 / #297).
 *
 * `vant start` used to write a starter brain into the current directory
 * with no prompt: no consent, no name, no opt-out. The seed now asks on an
 * interactive terminal and exposes explicit escape hatches. These pins
 * drive the REAL `bin/vant.js start` against throwaway trees and assert:
 *
 *   - --brain-name <x>   seeds models/private/<x> and makes it current
 *   - --no-seed          writes no brain (explicit opt-out)
 *   - VANT_SEED=off      writes no brain (env opt-out)
 *   - non-TTY stdin      keeps the legacy silent seed (CI / pipes / tests)
 *   - interactive TTY    prompts for consent + name (via `script`)
 *   - a pinned VANT_BRAIN seeds that brain without a state write
 *
 * Run: node tests/first-run-consent.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  ✓ ' + name); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')); }

function tree() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vant-consent-')); }

function start(dir, args, extraEnv = {}) {
    const env = { ...process.env };
    delete env.VANT_BRAIN;
    delete env.VANT_SEED;
    Object.assign(env, extraEnv);
    return spawnSync('node', [path.join(ROOT, 'bin', 'vant.js'), 'start', '--no-migrate', ...args], {
        cwd: dir, env, encoding: 'utf8', timeout: 60000
    });
}

/** Run `vant start` with stdin attached to a PTY (so isTTY is true). */
function startTTY(dir, input, args = []) {
    const env = { ...process.env };
    delete env.VANT_BRAIN;
    delete env.VANT_SEED;
    const cmd = `node ${path.join(ROOT, 'bin', 'vant.js')} start --no-migrate ${args.join(' ')}`;
    return spawnSync('bash', ['-c', `printf '%b' ${JSON.stringify(input)} | script -qec ${JSON.stringify(cmd)} /dev/null`], {
        cwd: dir, env, encoding: 'utf8', timeout: 60000
    });
}

const mdCount = (dir) => {
    const root = path.join(dir, 'models', 'private');
    if (!fs.existsSync(root)) return 0;
    return fs.readdirSync(root, { recursive: true }).filter((f) => String(f).endsWith('.md')).length;
};

/** md files inside a specific brain dir (health may create an empty sibling). */
const brainMd = (dir, name) => {
    const d = path.join(dir, 'models', 'private', name);
    if (!fs.existsSync(d)) return 0;
    return fs.readdirSync(d, { recursive: true }).filter((f) => String(f).endsWith('.md')).length;
};

console.log('\n🌱 FIRST-RUN SEED CONSENT PINS (issues #257/#297)\n');

// ---------- 1. non-TTY keeps the legacy silent seed ----------
{
    const dir = tree();
    const r = start(dir, []);
    if (/Seeded starter brain: models\/private\/vant\//.test(r.stdout || '')) ok('non-TTY fresh run still seeds the default brain (legacy behavior preserved)');
    else bad('non-TTY default seed', (r.stdout || '').slice(0, 200));
    if (fs.existsSync(path.join(dir, 'models', 'private', 'vant', 'identity.md'))) ok('the seeded brain has identity.md');
    else bad('seeded identity.md present');
}

// ---------- 2. --brain-name seeds that brain AND makes it current ----------
{
    const dir = tree();
    const r = start(dir, ['--brain-name', 'mybrain']);
    if (fs.existsSync(path.join(dir, 'models', 'private', 'mybrain', 'identity.md'))) ok('--brain-name seeds models/private/<name>');
    else bad('--brain-name seeds the named brain', (r.stdout || '').slice(0, 200));
    let current = null;
    try { current = JSON.parse(fs.readFileSync(path.join(dir, 'models', 'state.json'), 'utf8')).currentBrain; } catch (e) { /* surfaced below */ }
    if (current === 'mybrain') ok('--brain-name makes the new brain current in state.json (no split pointer)');
    else bad('--brain-name sets currentBrain', String(current));
}

// ---------- 3. --no-seed writes nothing ----------
{
    const dir = tree();
    const r = start(dir, ['--no-seed']);
    if (/Seeding disabled/.test(r.stdout || '')) ok('--no-seed reports seeding disabled');
    else bad('--no-seed reports disabled', (r.stdout || '').slice(0, 160));
    if (mdCount(dir) === 0) ok('--no-seed writes no brain files');
    else bad('--no-seed wrote brain files');
}

// ---------- 4. VANT_SEED=off writes nothing ----------
{
    const dir = tree();
    const r = start(dir, [], { VANT_SEED: 'off' });
    if (/Seeding disabled/.test(r.stdout || '')) ok('VANT_SEED=off reports seeding disabled');
    else bad('VANT_SEED=off reports disabled', (r.stdout || '').slice(0, 160));
    if (mdCount(dir) === 0) ok('VANT_SEED=off writes no brain files');
    else bad('VANT_SEED=off wrote brain files');
}

// ---------- 5. interactive TTY: prompts and honors a typed name ----------
{
    const dir = tree();
    const r = startTTY(dir, 'ttybrain\n');
    const out = (r.stdout || '') + (r.stderr || '');
    if (/Create a starter brain/.test(out)) ok('interactive first run ASKS before writing (consent prompt)');
    else bad('interactive consent prompt shown', out.slice(0, 200));
    if (fs.existsSync(path.join(dir, 'models', 'private', 'ttybrain', 'identity.md'))) ok('the typed brain name is seeded');
    else bad('typed name seeded', out.slice(0, 200));
}

// ---------- 6. interactive TTY: "no" declines, nothing written ----------
{
    const dir = tree();
    const r = startTTY(dir, 'no\n');
    const out = (r.stdout || '') + (r.stderr || '');
    if (/Skipped starter brain seed/.test(out)) ok('declining the prompt skips the seed');
    else bad('decline skips the seed', out.slice(0, 200));
    if (mdCount(dir) === 0) ok('declining writes no brain files');
    else bad('declining wrote brain files');
}

// ---------- 7. pinned VANT_BRAIN seeds that brain (pass-93 env path) ----------
{
    const dir = tree();
    const r = start(dir, [], { VANT_BRAIN: 'envbrain' });
    if (fs.existsSync(path.join(dir, 'models', 'private', 'envbrain', 'identity.md'))) ok('VANT_BRAIN seeds the env-named brain');
    else bad('VANT_BRAIN seeds env brain', (r.stdout || '').slice(0, 200));
    if (brainMd(dir, 'vant') === 0) ok('VANT_BRAIN does not also seed the default brain');
    else bad('VANT_BRAIN seeded the default brain too');
}

console.log('\n=== first-run consent: ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail > 0 ? 1 : 0);
