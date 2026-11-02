#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - fixed --sync flag only
/**
 * Vant Start
 * Full startup: migrate → health → sync → ready
 *
 * NOTE: Does NOT auto-sync. User must run vant sync manually
 * to comply with GitHub TOS.
 *
 * Migration auto-run: brain layout migrations (lib/migrations.js) are
 * idempotent, content-detected, and dry-runnable — running them on start
 * means a pre-multibrain (old single-public-brain) user's brain is imported
 * automatically instead of silently invisible. Opt out: --no-migrate.
 *
 * Usage: vant start
 *        vant start --sync  (if you want to sync)
 *        vant start --no-migrate  (skip layout migration)
 *
 * (pass 121) Seeding happens AFTER the migrate child closes (never before:
 * the starter placeholder must never shadow a legacy import), and the
 * imported brain is named by migrate.js in the same order the seed's brain
 * resolver already uses: --brain-name flag, then VANT_BRAIN, then 'vant'.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const BIN_DIR = __dirname;

const BRAIN_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

/**
 * First-run brain seed.
 *
 * A brand-new project gets an empty models/ tree, which makes `vant start`
 * a silent no-op: the agent wakes with no identity, no goals, nothing to
 * read (smoke-tested: a fresh dir produced only orgchart/escrow.json).
 * Seed a minimal starter brain (private side) when there is nothing to
 * load. Idempotent: never touches a brain that already has any .md file.
 *
 * Resolved against process.cwd() - the brain runtime (lib/brain.js) reads
 * CWD-relative models/ paths, so seeding must match that root.
 *
 * (issues #257/#297) The seed used to be a silent side effect that always
 * wrote a brain named "vant" into whatever directory you were standing in.
 * On a first run with an interactive terminal it now ASKS for the brain
 * name (with a here-and-now consent line) before writing anything. The
 * non-interactive and scripted paths are unchanged and explicit:
 *   --brain-name <name>  pin the name (no prompt)
 *   --seed-starter       seed without prompting (explicit opt-in)
 *   --no-seed            never seed (explicit opt-out)
 *   VANT_BRAIN=<name>    pin the name
 *   VANT_SEED=off        never seed
 * A non-TTY stdin (pipes, CI, tests) keeps the legacy silent seed so every
 * existing fresh-boot pin still holds.
 */

/** Should we seed at all? Env + flags are the escape hatch; TTY asks. */
function _seedDecision(args) {
    if (args.includes('--no-seed')) return 'never';
    if (process.env.VANT_SEED === 'off' || process.env.VANT_SEED === '0') return 'never';
    if (args.includes('--seed-starter')) return 'seed';
    return 'ask';
}

/** Is there ANY private brain with .md content to load? If so, never seed. */
function _anyPrivateBrainExists() {
    const root = path.join('models', 'private');
    try {
        if (!fs.existsSync(root)) return false;
        return fs.readdirSync(root, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .some((d) => fs.readdirSync(path.join(root, d.name), { recursive: true })
                .some((f) => String(f).endsWith('.md')));
    } catch (e) {
        return false;
    }
}

/**
 * Resolve the brain to seed: flags/env pin the name; otherwise `ask` runs
 * when an interactive terminal should consent. Returns { name } or null
 * when the operator declined at the prompt.
 */
async function _resolveSeedTarget(args, ask, defaultName = 'vant') {
    const flagIdx = args.indexOf('--brain-name');
    const flagName = flagIdx !== -1 ? args[flagIdx + 1] : null;
    const candidate = flagName || process.env.VANT_BRAIN || null;
    if (candidate) {
        if (BRAIN_NAME_RE.test(candidate)) return { name: candidate };
        console.log(`[Start] Ignoring invalid brain name "${candidate}" (use letters, digits, . _ -).`);
    }
    if (ask) {
        const answer = (await ask(
            '\n[Start] No brain found here. Create a starter brain in models/private/?\n' +
            `        Name it [${defaultName}] (or "no" to skip): `
        )).trim();
        if (/^(no|n|skip|nope)$/i.test(answer)) return null;
        if (!answer) return { name: defaultName };
        if (BRAIN_NAME_RE.test(answer)) return { name: answer };
        console.log(`[Start] "${answer}" is not a valid brain name (letters, digits, . _ -) — using "${defaultName}".`);
    }
    return { name: defaultName };
}

/** One-shot readline prompt (resolves the trimmed answer). */
function _askUser(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

function _seedStarterBrain(brainName) {
    const brainDir = path.join('models', 'private', brainName);

    try {
        if (fs.existsSync(brainDir)) {
            const existing = fs.readdirSync(brainDir, { recursive: true })
                .filter(f => String(f).endsWith('.md'));
            if (existing.length > 0) return; // already has a brain
        }
    } catch (e) { /* unreadable dir: leave it alone */ }

    try {
        fs.mkdirSync(brainDir, { recursive: true });
        fs.writeFileSync(path.join(brainDir, 'identity.md'),
`# identity.md

NAME: ${brainName}
ROLE: Persistent Memory Agent

## About
- Fresh brain, seeded by "vant start".
- Replace this file with your own identity as you learn.
`);
        fs.writeFileSync(path.join(brainDir, 'goals.md'),
`# goals.md

## Current
- (empty) Write what you are working on here.
`);
        fs.writeFileSync(path.join(brainDir, 'start.md'),
`# start.md

Quick start for agents waking here:

1. Read identity.md, goals.md, lessons.md in this directory.
2. Work on whatever goals.md points at.
3. Keep what matters: "vant learn <key> <insight>" writes a lesson.
4. Search your own memory: "vant search <query>".

Full guide: https://docs.creadev.org/vant/getting-started/agent-onboarding
`);
        fs.writeFileSync(path.join(brainDir, 'lessons.md'),
`# lessons.md

## Learned
- (empty) Lessons land here via "vant learn <key> <content>".
`);
        console.log(`[Start] Seeded starter brain: models/private/${brainName}/ (start, identity, goals, lessons).`);
        console.log('        Edit them freely — they are yours.');
        return true;
    } catch (e) {
        // Seeding is a convenience, never a hard failure.
        console.log(`[Start] Starter brain seed skipped: ${e.message}`);
        return false;
    }
}

/**
 * The seed gate. Never clobbers a brain with content; honors --no-seed /
 * VANT_SEED; and on a genuine first run (no private brain anywhere) with an
 * interactive terminal, ASKS for consent + the brain name. A pinned
 * VANT_BRAIN / --brain-name seeds that brain silently (the pass-93 env-brain
 * path), and a non-TTY stdin keeps the legacy silent seed for pipes / CI.
 */
async function _maybeSeed(args) {
    if (_seedDecision(args) === 'never') {
        console.log('[Start] Seeding disabled (--no-seed / VANT_SEED=off).');
        return;
    }

    let defaultName = 'vant';
    try {
        const stateStore = require('../lib/state-store');
        defaultName = stateStore.currentBrain() || 'vant';
    } catch (e) { /* no state yet - default name */ }

    const firstRun = !_anyPrivateBrainExists();
    const interactive = process.stdin.isTTY && process.stdout.isTTY;
    const ask = (firstRun && _seedDecision(args) !== 'seed' && interactive) ? _askUser : null;

    const target = await _resolveSeedTarget(args, ask, defaultName);
    if (!target) {
        console.log('[Start] Skipped starter brain seed (run "vant start" again anytime).');
        return;
    }
    const seeded = _seedStarterBrain(target.name); // idempotent: no-ops on a brain with content

    // A brand-new brain with a NON-default name must become the pointer, or
    // the runtime would seed <name> and then read the template/default brain
    // (the #297 split, reintroduced by the name choice). VANT_BRAIN resolves
    // by env and needs no state write; an interactive name must persist.
    if (seeded && !process.env.VANT_BRAIN && target.name !== defaultName) {
        try {
            const brain = require('../lib/brain');
            brain.switchBrain(target.name, 'private');
            if (brain.flushStateSave) await brain.flushStateSave();
            console.log(`[Start] Brain "${target.name}" is now current (models/state.json).`);
        } catch (e) {
            console.log(`[Start] Could not set "${target.name}" current: ${e.message.split('\n')[0]}`);
        }
    }
}

/**
 * Main
 */
function main() {
    const args = process.argv.slice(3);
    const doSync = args.includes('--sync');
    const doMigrate = !args.includes('--no-migrate');

    console.log(`
╔═══════════════════════════════════════╗
║         Vant Starting             ║
╚═══════════════════════════════════════╝
`);

    // (pass 120) Seed AFTER the migration step completes (mig.on('close')
    // below, and immediately in the --no-migrate branch). Seeding BEFORE the
    // legacy import let the starter placeholder shadow the user's real flat
    // brain files (existing-wins skipped identity.md/lessons.md, stranding
    // them at the private root with the tree still detected legacy) and
    // nested the seeded default dir inside a --brain-name import.
    // Post-migration the seed resolves the imported brain from the
    // synthesized stack and stays a no-op there.

    const runHealth = () => {
        // Run health check
        console.log('\n[Start] Running health check...');
        const health = spawn('node', [path.join(BIN_DIR, 'health.js')], {
            stdio: 'inherit'
        });
        health.on('close', (code) => {
            console.log(`\n[Start] Health: ${code === 0 ? 'OK' : 'WARNINGS'}`);

            if (doSync) {
                console.log('\n[Start] Syncing...');
                const sync = spawn('node', [path.join(BIN_DIR, 'sync.js'), 'pull'], {
                    stdio: 'inherit'
                });

                sync.on('close', (code) => {
                    console.log(`\n[Start] Sync: ${code === 0 ? 'OK' : 'FAILED'}`);
                    console.log('\n[Start] Ready!\n');
                });
            } else {
                console.log('\n[Start] Ready!');
                console.log('[Start] Run "vant sync pull" manually when ready');
                console.log('');
            }
        });
    };

    // (pass 35) Install state via the onboard hub (lib/onboard) — one honest
    // "where am I" line instead of ad-hoc state guessing in bin/. Computed
    // AFTER seeding/migration so a freshly seeded or just-migrated tree
    // reports its real state. Cosmetic: never blocks or fails startup.
    const showInstallState = async () => {
        try {
            const onboard = require('../lib/onboard');
            const install = await onboard.getInstallStatus();
            const icons = { fresh: '🌱', legacy: '⏳', current: '🧠' };
            console.log(`[Start] Install: ${icons[install.state] || '•'} ${install.state} — brain: ${install.brain.files} files`);
            if (install.state === 'legacy') {
                console.log('        Run "vant migrate" — your brain is on the old layout and invisible to the loader.');
            }
        } catch (e) { /* install status is cosmetic; startup continues */ }
    };

    const proceed = () => showInstallState().then(runHealth);
    const boot = async () => { await _maybeSeed(args); await proceed(); };

    if (!doMigrate) {
        boot();
        return;
    }

    // Brain layout migration (idempotent; no-op when layout is current).
    // stdio pipe (not inherit) so we can detect whether the import actually
    // moved anything and give legacy users a clear, friendly alert.
    console.log('[Start] Checking brain layout...');
    const mig = spawn('node', [path.join(BIN_DIR, 'migrate.js')], {
        stdio: ['ignore', 'pipe', 'inherit']
    });

    let migOut = '';
    mig.stdout.on('data', d => { migOut += d; process.stdout.write(d); });

    mig.on('close', (code) => {
        if (code === 0) {
            console.log('[Start] Brain layout OK.');
            // Legacy import happened? Tell the user what changed, warmly.
            // Requires a NON-ZERO file count — a 0-file import is a no-op,
            // not a migration worth banner space.
            const m = migOut.match(/legacy\.multibrain-import[^{]*\{[^}]*\}/);
            if (m) {
                let imported = null, brainName = 'vant';
                try {
                    const parsed = JSON.parse(m[0].slice(m[0].indexOf('{')));
                    imported = parsed.imported;
                    brainName = parsed.brain || brainName;
                } catch (e) { /* cosmetic only */ }
                if (imported > 0) {
                    console.log('');
                    console.log('╔═══════════════════════════════════════════════════╗');
                    console.log('║  🧠 BRAIN MIGRATED to the multi-brain layout      ║');
                    console.log('╚═══════════════════════════════════════════════════╝');
                    console.log(`  Your old-style brain was imported${imported != null ? ` (${imported} files)` : ''} as brain "${brainName}".`);
                    console.log(`  Files now live in models/public/${brainName}/ and models/private/${brainName}/.`);
                    console.log('  Nothing was lost — verify with: vant migrate --status');
                    console.log(`  Prefer a different name? vant migrate --brain-name <name>${brainName === 'vant' && process.env.VANT_BRAIN ? ' (note: VANT_BRAIN=' + process.env.VANT_BRAIN + ' is set; the import used it as the default name)' : ''}`);
                    console.log('');
                }
            } else if (/could not verify/.test(migOut)) {
                console.log('');
                console.log('⚠  Brain layout migration ran but could NOT verify your brain is readable.');
                console.log('   Your files were moved but the layout was not marked migrated.');
                console.log('   Inspect models/{public,private}/ and re-run `vant migrate`.');
                console.log('');
            }
        } else {
            // Migrate exits 1 on real failures; layout problems should be
            // visible, not fatal — health check reports the state next.
            console.log(`[Start] Brain layout migration exited ${code} — continuing (see output above).`);
        }
        // (pass 120) Seed after migration: on a fresh tree the no-op migrate
        // leaves models/private empty and the seed creates the starter
        // brain; on a legacy tree the import owns the brain dir and the
        // seed skips (never shadows imported content).
        boot();
    });

    mig.on('error', () => {
        console.log('[Start] Could not run layout migration — continuing.');
        boot();
    });
}

main();