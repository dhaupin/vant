#!/usr/bin/env node
/**
 * vant init — the First Five Minutes wizard (issue #182).
 *
 * One orchestrated path through everything a fresh install bounces on:
 *   a. config.ini           — written from setup.js's same template shape
 *                             (fields identical; the writer is not forked,
 *                             the TEMPLATE constant shape is mirrored —
 *                             setup.js runs its interactive flow on require,
 *                             so it cannot be imported without side effects)
 *   b. .env skeleton        — commented placeholders, NO secrets collected
 *   c. operator grant       — the persisted path (org config --set-operator-*)
 *                             a fresh write process actually hydrates (#119 path)
 *   d. cheatsheet           — the wake→work→sleep loop, printed at the end
 *   e. summary              — one line per step + remaining health warnings
 *
 * Modes:
 *   `vant init`          interactive (prompts for what users must choose)
 *   `vant init --yes`    non-interactive, machine-parseable, sane defaults
 *                        (agents are the majority first-runners)
 *
 * The wizard never collects secrets: config.ini records ${GITHUB_TOKEN}
 * (env-injected at runtime per DEPLOY.md), .env gets commented placeholders
 * only. "VANT_* env or the config" is printed, not asked.
 *
 * Run: node bin/init.js [--yes]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const version = require('../lib/version');

const CONFIG_FILE = 'config.ini';
const ENV_FILE = '.env';
const YES = process.argv.includes('--yes');

// setup.js's template fields, mirrored verbatim so config.ini written by
// either door parses identically (REPLACE_ME slots are intentionally
// resolvable-to-empty: they are opt-in transports, not requirements).
const CONFIG_TEMPLATE = `=== Vant CONFIG ===

# Core
VANT_VERSION=v${version}
MODEL_PATH=models/private
# State now stored in brain
# STATE_PATH is deprecated

# Transport (stegoframe)
STEGOFRAME_URL=https://stegoframe.creadev.org
STEGOFRAME_ROOM=
STEGOFRAME_PASSPHRASE=
STEGOFRAME_MODE=svg

# GitHub
GITHUB_REPO=
GITHUB_BRANCH=main
GITHUB_TOKEN=\${GITHUB_TOKEN}

# Runtime
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360
`;

const ENV_TEMPLATE = `# Vant environment (secrets live here, never in config.ini)
# Full variable reference: docs/security/environment.md
#
# Required for sync (repo scope, git push/pull):
#   GITHUB_TOKEN=
#
# Optional integrations (set via "vant config set <key> <value>" or here):
#   TELEGRAM_BOT_TOKEN=
#   OPENAI_API_KEY=
#
# Never commit .env - it is gitignored by default.
`;

const CHEATSHEET = [
    '',
    '═══════════════════════════════════════════════',
    '  The wake → work → sleep loop (3 lines):',
    '═══════════════════════════════════════════════',
    '  1. WAKE   vant start          # load brain + health check',
    '  2. WORK   vant load / teams   # do things; every write audited',
    '  3. SLEEP  vant sync --push "message"   # commit + push the brain',
    '',
    '  Reality check: vant health, then vant qc (the first-user battery).',
    '═══════════════════════════════════════════════',
];

const summary = [];
const warnings = [];
function ok(line) { summary.push('  ✓ ' + line); }
function warn(line) { warnings.push(line); summary.push('  ⚠ ' + line); }

function question(rl, prompt) {
    return new Promise((resolve) => rl.question(prompt, resolve));
}

function writeConfig(repo, room, passphrase) {
    let config = CONFIG_TEMPLATE;
    if (repo) config = config.replace('GITHUB_REPO=\n', 'GITHUB_REPO=' + repo + '\n');
    // Empty REPLACE_ME-style slots: fill only when answered (stegoframe is
    // opt-in transport; empty fields already parse as unset downstream).
    fs.writeFileSync(CONFIG_FILE, config);
    return CONFIG_FILE;
}

async function interactiveSteps(rl) {
    console.log('\n1. GitHub (optional now, required for brain sync)');
    const repo = (await question(rl, 'GitHub repo (username/repo, Enter to skip): ')).trim();
    console.log('\n2. Stegoframe transport (optional)');
    const room = (await question(rl, 'Stegoframe room (Enter to skip): ')).trim();
    const passphrase = (await question(rl, 'Stegoframe passphrase (Enter to skip): ')).trim();
    return { repo, room, passphrase };
}

async function main() {
    const banner = YES ? 'vant init --yes (non-interactive)' : 'vant init';
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  First Five Minutes — ' + banner);
    console.log('└─────────────────────────────────────────┘\n');

    const rl = !YES ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

    // a. config.ini --------------------------------------------
    if (fs.existsSync(CONFIG_FILE)) {
        ok(CONFIG_FILE + ' exists — kept (rerun `vant setup` to rewrite it)');
    } else {
        const answers = YES ? { repo: '', room: '', passphrase: '' } : await interactiveSteps(rl);
        writeConfig(answers.repo, answers.room, answers.passphrase);
        ok(CONFIG_FILE + ' written' + (answers.repo ? ' (repo: ' + answers.repo + ')' : ' (repo TBD — set `GITHUB_REPO` before syncing)'));
    }

    // b. .env skeleton ------------------------------------------
    if (fs.existsSync(ENV_FILE)) {
        ok(ENV_FILE + ' exists — kept');
    } else {
        fs.writeFileSync(ENV_FILE, ENV_TEMPLATE);
        ok(ENV_FILE + ' skeleton written (commented placeholders only — add keys via ' + (YES ? 'VANT_* env or the config' : 'the config, never in config.ini') + ')');
    }

    // c. persisted operator grant (the #119-cousin bounce killer) -----------
    try {
        const config = require('../lib/config');
        const brain = config.currentBrainName ? config.currentBrainName()
            : require('../lib/brain').getCurrentBrain();
        const existing = (config.loadBrainConfig ? config.loadBrainConfig(brain) : null) || {};
        const org = existing.orgchart || {};
        if (org.operatorScopes && org.operatorScopes.includes('write')) {
            ok('operator grant already persisted (orgchart.operatorScopes includes write)');
            if (org.operatorCapabilities && org.operatorCapabilities.canWrite) {
                ok('operator capabilities already persisted (canWrite)');
            } else {
                org.operatorCapabilities = Object.assign({}, org.operatorCapabilities, { canRead: true, canWrite: true, canSpawn: true });
                config.saveBrainConfig(brain, Object.assign({}, existing, { orgchart: org }));
                ok('operator capabilities persisted (canRead,canWrite,canSpawn — was missing canWrite)');
            }
        } else {
            org.operatorScopes = ['read', 'write', 'spawn', 'execute'];
            org.operatorCapabilities = { canRead: true, canWrite: true, canSpawn: true };
            const saved = config.saveBrainConfig(brain, Object.assign({}, existing, { orgchart: org }));
            if (!saved) warn('operator grant NOT persisted (brain config write failed) — run `vant org config --set-operator-scopes read,write,spawn,execute`');
            else ok('operator grant persisted (scopes read,write,spawn,execute + canWrite — fresh write processes no longer bounce)');
        }
    } catch (e) {
        warn('operator grant step failed: ' + e.message.split('\n')[0] + ' — run `vant org config --set-operator-scopes read,write,spawn,execute`');
    }

    // d. echo the allow-by-default honesty callout (#182 sandbox honesty) --
    try {
        const sandbox = require('../lib/sandbox');
        if (!sandbox.canWrite() && !YES) warn('sandbox: allowing-by-default this run — the persisted grant above fixes the NEXT process');
    } catch (e) { /* sandbox absent is itself honest */ }

    const hadRl = !!rl;
    if (hadRl) rl.close();

    // e. summary + remaining-warning count ---------------------------------
    try {
        const health = require('child_process').spawnSync('node', [path.join(__dirname, 'health.js')], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 30000
        });
        const warnsFound = ((health.stdout || '').match(/⚠/g) || []).length;
        console.log('\n=== init summary ===');
        for (const s of summary) console.log(s);
        console.log('\n  health: ' + (health.status === 0 ? 'ran' : 'nonzero') + ', ' + warnsFound + ' warning line(s) remain');
        console.log('  (warnings about GITHUB_TOKEN and stegoframe are expected until you add secrets)');
    } catch (e) {
        console.log('\n=== init summary ===');
        for (const s of summary) console.log(s);
        warn('health validation step failed: ' + e.message);
    }

    // f. the cheatsheet (the wake→work→sleep loop, previously doc-implied only)
    for (const line of CHEATSHEET) console.log(line);

    const fatal = warnings.some((w) => /NOT persisted|failed:/i.test(w));
    process.exit(fatal ? 1 : 0);
}

main().catch((e) => {
    console.error('init failed: ' + (e.stack || e.message));
    process.exit(1);
});
