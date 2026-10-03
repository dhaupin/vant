#!/usr/bin/env node
/**
 * CLI Smoke Gate (pass 92)
 *
 * Stabilization gate for the bin/ surface — every CLI must (a) parse,
 * (b) answer --help with exit 0 and non-empty usage text. This is the
 * standing version of the pass-92 one-off sweep that verified lib → CLI
 * wiring after the #106/#107 stub-CLI class: a broken require, a syntax
 * error, or a CLI that stopped answering --help fails here FIRST.
 *
 * SKIP list (documented, not silent):
 *   - bot.js            token-gated daemon (TELEGRAM_BOT_TOKEN) — exits 1
 *     with an honest logged error when unset, by design.
 *   - cli-standard.js   a copy-paste TEMPLATE for new CLIs (its own header
 *     says "NOT a routed command... run nothing from it"), not a CLI.
 *   (test-all.js was originally skipped as a recursion hazard, but its
 *   --help handler exits before running anything — it is smoke-checked.)
 *
 * ISOLATION: VANT_BRAIN scratch so boot-flavored --help paths (mcp.js)
 * never touch a real brain.
 */

const SCRATCH_BRAIN = 'p92-cli-smoke';
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin');
const SKIP = new Set(['bot.js', 'cli-standard.js']);
const PER_FILE_TIMEOUT_MS = 20000;

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

async function main() {
    console.log('\n\ud83d\udee0\ufe07 CLI SMOKE GATE (pass 92)\n');

    const files = fs.readdirSync(BIN).filter(f => f.endsWith('.js')).sort();
    const runnable = files.filter(f => !SKIP.has(f));
    console.log(`  ${files.length} bin CLIs, ${runnable.length} smoke-checked ` +
        `(skipped: ${[...SKIP].join(', ')})`);

    // 1. Syntax: every file must parse (cheap, catches rot instantly).
    let badSyntax = [];
    for (const f of files) {
        const c = spawnSync(process.execPath, ['--check', path.join(BIN, f)], { timeout: 15000 });
        if (c.status !== 0) badSyntax.push(f + ': ' + (c.stderr || '').toString().split('\n')[0]);
    }
    await test(`node --check passes for all ${files.length} bin CLIs`,
        () => { if (badSyntax.length) throw new Error(badSyntax.join(' | ')); return true; });

    // 2. --help: exit 0 + non-empty usage output.
    const failures = [];
    let checked = 0;
    for (const f of runnable) {
        checked++;
        const r = spawnSync(process.execPath, [path.join(BIN, f), '--help'], {
            encoding: 'utf8',
            timeout: PER_FILE_TIMEOUT_MS,
            env: Object.assign({}, process.env, { VANT_BRAIN: SCRATCH_BRAIN })
        });
        if (r.error && r.error.code === 'ABORT') { failures.push(f + ': --help timed out'); continue; }
        if (r.status !== 0) {
            failures.push(f + ': --help exited ' + r.status + ' — ' +
                ((r.stderr || r.stdout || '').split('\n').filter(l => l.trim() && !l.startsWith('['))[0] || '').slice(0, 90));
            continue;
        }
        if (!((r.stdout || '') + (r.stderr || '')).trim()) {
            failures.push(f + ': --help produced no usage output');
        }
    }
    await test(`--help exits 0 with usage for all ${checked} runnable CLIs`,
        () => { if (failures.length) throw new Error(failures.slice(0, 6).join(' | ')); return true; });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
