#!/usr/bin/env node
/**
 * Vant Horcrux CLI
 * Horcrux management - inspect, restore, create, refresh
 * 
 * Usage:
 *   vant horcrux inspect [path] [password]  # Preview horcrux
 *   vant horcrux restore [path] [password]  # Restore from horcrux
 *   vant horcrux create [path] [password]   # Create horcrux from current state
 *   vant horcrux refresh [password]         # Regenerate boot horcrux in place
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

const path = require('path');
const fs = require('fs');

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Horcrux CLI - Brain backup/restore

Multibrain-aware: if no path is given, scans the brain stack
(from models/state.json) and uses the first <agent>-p_*.svg
found in models/public/<brain>/boot/.

Filename convention (per models/public/vant/boot/README.md):
  <agent>-p_<password>.svg  → the literal text after p_ is the
                              decryption key. So
  axolotl-p_axolotl2026.svg  → password is 'axolotl2026'.

Usage:
  vant horcrux inspect [path]            Preview horcrux contents
  vant horcrux restore [path] [password] Restore from horcrux
  vant horcrux create [path] [password]  Create horcrux from current state
  vant horcrux refresh [password]        Regenerate the boot horcrux in place
                                         (fresh brain snapshot, same path —
                                         without this, point-in-time boot
                                         backups go stale forever)
  vant horcrux verify                    Verify the CURRENT brain against the
                                         last anchor (#166 tier): recompute the
                                         content root, compare to the anchor
                                         ledger. Exit 1 on divergence — CI-safe.

Password resolution (in order):
  1. Positional arg
  2. VANT_BRAIN_PASSWORD env var
  3. p_<password> in the filename (the convention)
  4. lib/secret.js (interactive prompt)

Examples:
  vant horcrux inspect
  vant horcrux inspect models/public/vant/boot/axolotl-p_axolotl2026.svg
  vant horcrux restore models/public/vant/boot/axolotl-p_axolotl2026.svg
  vant horcrux create models/public/vant/boot/axolotl-p_axolotl2026.svg axolotl2026
  vant horcrux refresh
`);
    process.exit(0);
}

/**
 * Read the brain stack from models/state.json. Falls back to
 * a single-element stack with 'vant' (the canonical default).
 */
function readBrainStack(repoRoot) {
    // (R-6/O-9) stack entries become path segments (models/public/<brain>/boot)
    const safe = (n) => typeof n === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(n) && !n.includes('..');
    try {
        const statePath = path.join(repoRoot, 'models', 'state.json');
        if (!fs.existsSync(statePath)) return ['vant'];
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (Array.isArray(state.stack) && state.stack.length > 0) {
            const valid = state.stack.filter(safe);
            return valid.length > 0 ? valid : ['vant'];
        }
        if (safe(state.currentBrain)) return [state.currentBrain];
        return ['vant'];
    } catch (e) {
        return ['vant'];
    }
}

/**
 * Find the default horcrux by scanning the brain stack in order.
 * Multibrain-aware: tries models/public/<stack-entry>/boot/*.svg
 * for any file containing the p_ password-in-name token.
 * Returns the first match (current brain wins) or null.
 */
function findDefaultHorcrux(repoRoot) {
    const stack = readBrainStack(repoRoot);
    for (const brain of stack) {
        const bootDir = path.join(repoRoot, 'models', 'public', brain, 'boot');
        if (!fs.existsSync(bootDir)) continue;
        try {
            const entries = fs.readdirSync(bootDir);
            for (const f of entries) {
                // (pass 23) skip safe-write tmp files (crashed runs)
                if (f.endsWith('.tmp.svg')) continue;
                if (f.endsWith('.svg') && f.includes('p_')) {
                    return path.join(bootDir, f);
                }
            }
        } catch (e) { /* skip unreadable */ }
    }
    return null;
}

async function run() {
    const path = require('path');
    const REPO_ROOT = path.resolve(__dirname, '..');
    const defaultPath = findDefaultHorcrux(REPO_ROOT);

    // The defaultPath helper handles multibrain scanning below. Keeping
    // the variable so the inspect/restore branches stay readable.    
    if (subcmd === 'inspect') {
        const horcruxPath = args[1] || defaultPath;
        const positionalPw = args[2];

        if (!horcruxPath) {
            console.error('❌ No horcrux found.');
            console.error('   Searched models/public/<stack>/boot/ for <agent>-p_*.svg');
            console.error('   Pass a path explicitly: vant horcrux inspect <path>');
            process.exit(1);
        }

        console.log('Inspecting:', horcruxPath);

        const transform = require('../lib/transform');
        // Pass empty options when no positional pw: transform.inspectHorcrux
        // falls through to p_<pw> filename, env, then secret.js.
        const opts = positionalPw ? { password: positionalPw } : {};
        const result = await transform.inspectHorcrux(horcruxPath, opts);

        if (!result.valid) {
            console.log('\n❌ Invalid horcrux:', result.error);
            if (result.passwordRequired) {
                console.log('   Password required — supply one of:');
                console.log('     • positional arg:    vant horcrux inspect <path> <password>');
                console.log('     • env var:            VANT_BRAIN_PASSWORD=...');
                console.log('     • p_<password> in the filename (the convention)');
            }
            process.exit(1);
        }
        
        console.log('\n✅ Valid Horcrux');
        console.log('Format:', result.format);
        console.log('Version:', result.version);
        console.log('Created:', new Date(result.timestamp));
        console.log('\n--- Contents Preview ---');
        console.log('Brains:', result.preview.brainCount);
        console.log('Agents (registered roster):', result.preview.agentCount);
        if (result.preview.delegationCount) console.log('Delegation records:', result.preview.delegationCount);
        console.log('Islands:', result.preview.islandCount);
        console.log('Corpus:', result.preview.corpusCount);
        console.log('Config:', result.preview.hasConfig ? 'Yes' : 'No');
        console.log('Runtime:', result.preview.hasRuntime ? 'Yes' : 'No');
        console.log('Consensus:', result.preview.hasConsensus ? result.preview.consensusCount + ' ledgers' : 'No');
        console.log('Escrow:', result.preview.hasEscrow ? result.preview.escrowCount + ' budgets' : 'No');
        console.log('Msg:', result.preview.hasMsg ? result.preview.msgCount + ' conversations' : 'No');
        console.log('Market:', result.preview.hasMarket ? result.preview.marketCount + ' listings' : 'No');
        console.log('Teams/Orgs:', result.preview.hasTeams ? `${result.preview.orgCount} orgs, ${result.preview.teams2Count} teams` : 'No');
        if (result.teamsError) {
            console.log('⚠️ Teams error:', result.teamsError);
        }
        if (result.legacyBrainData) {
            console.log('⚠️ Legacy brain data detected. Convert before restoring:');
            console.log('   const { converted } = require("vant/lib/transform").migrateLegacyBrainStorage(data);');
        }
        
    } else if (subcmd === 'restore') {
        const horcruxPath = args[1] || defaultPath;
        const positionalPw = args[2];

        if (!horcruxPath) {
            console.error('❌ No horcrux found to restore from.');
            console.error('   Searched models/public/<stack>/boot/ for <agent>-p_*.svg');
            console.error('   Pass a path explicitly: vant horcrux restore <path>');
            process.exit(1);
        }

        console.log('Restoring from:', horcruxPath);

        const boot = require('../lib/boot');
        const opts = positionalPw ? { password: positionalPw } : {};
        const result = await boot.restoreFromHorcrux(horcruxPath, opts);
        console.log('Version:', result.version);
        console.log('Timestamp:', new Date(result.timestamp));
        console.log('Restored:', result.restored.join(', '));
        
    } else if (subcmd === 'create') {
        // (pass 21) Default lands in the CURRENT BRAIN's boot dir with the
        // p_<password> naming convention, so boot-time discovery can find it.
        // The old default (models/public/boot/brain-<ts>.svg) was outside
        // every brain's boot/ dir — undetectable by _discoverBootHorcruxes().
        const currentBrain = (() => {
            try {
                const brainMod = require('../lib/brain');
                const name = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : null;
                if (typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return name;
            } catch (e) { /* fall through */ }
            const stack = readBrainStack(REPO_ROOT);
            return stack[0] || 'vant';
        })();
        // (pass 71, issue #93) Resolve the password BEFORE the default-path
        // template (which embeds it) and before the guard below. The create
        // branch never assigned `password`, so every documented path -
        // positional arg, env var, p_ filename - died on
        // 'Error: password is not defined'. Chain mirrors the refresh
        // branch: arg -> env -> p_ filename.
        const positionalPw = args[2];
        let password = positionalPw || process.env.VANT_BRAIN_PASSWORD || null;
        if (!password) {
            const guessed = args[1] || path.join(REPO_ROOT, 'models', 'public', currentBrain, 'boot', `${currentBrain}-p_.svg`);
            const m = path.basename(guessed).match(/-p_([^.]+)\.svg$/);
            if (m) password = m[1];
        }
        const outputPath = args[1] || path.join(REPO_ROOT, 'models', 'public', currentBrain, 'boot', `${currentBrain}-p_${password}.svg`);
        if (!password) {
            console.log('❌ Password required');
            console.log('Usage: vant horcrux create <path> <password>');
            console.log('   Or set VANT_BRAIN_PASSWORD env var');
            process.exit(1);
        }
        
        console.log('Creating horcrux:', outputPath);
        
        const transform = require('../lib/transform');
        // Gather full corpus (now default)
        const result = await transform.toHorcrux(outputPath, { password });
        
        console.log('\n✅ Created!');
        console.log('Path:', result.path);
        console.log('Size:', result.size);
        console.log('Format:', result.format || 'steganography');

        // (pass 89 — prime #100) Search hygiene: stones are one huge line of
        // ciphertext; a repo-wide match echoes the whole wall. Auto-ensure a
        // repo-root .ignore covers the stone's directory (ripgrep honors it,
        // git does NOT — the stone stays tracked for disaster recovery).
        // (pass 91 — prime #113) The .ignore must live at the WORKSPACE root
        // (where the caller runs vant / where rg walks), NOT the install
        // root: REPO_ROOT is __dirname/.., so when vant runs from a global
        // install or a cwd unrelated to the install tree, path.relative
        // produced '../../..' escape chains and the file landed nowhere
        // (mounted sandbox roots). Resolve the workspace from the caller's
        // cwd — nearest ancestor (inclusive) holding .git or models/ — and
        // write workspace-root-relative globs. Stone outside the workspace
        // → skip with a hint instead of silently writing the wrong tree;
        // no ancestor marker at all → fall back to the stone's own dir
        // (rg applies the nearest .ignore, so a sibling .ignore still works).
        try {
            const fs = require('fs');
            let wsRoot = path.resolve(process.cwd());
            while (true) {
                if (fs.existsSync(path.join(wsRoot, '.git')) || fs.existsSync(path.join(wsRoot, 'models'))) break;
                const parent = path.dirname(wsRoot);
                if (parent === wsRoot) { wsRoot = null; break; }
                wsRoot = parent;
            }
            const stoneAbs = path.resolve(result.path || outputPath);
            if (!wsRoot) wsRoot = path.dirname(stoneAbs);
            const relStone = path.relative(wsRoot, stoneAbs);
            if (relStone.startsWith('..') || path.isAbsolute(relStone)) {
                console.log('Search hygiene skipped: stone is outside the workspace root (' + wsRoot + ').');
            } else {
                const dirPattern = path.dirname(relStone).split(path.sep).join('/') + '/*.svg';
                const ignorePath = path.join(wsRoot, '.ignore');
                let ignore = '';
                if (fs.existsSync(ignorePath)) ignore = fs.readFileSync(ignorePath, 'utf8');
                if (!ignore.split(/\r?\n/).some(l => l.trim() === dirPattern)) {
                    const note = ignore.trimEnd()
                        + '\n\n# horcrux stone (auto-added by vant horcrux create, prime #100):\n'
                        + '# one ~800KB+ base64 line per stone — search tools: skip, git: keep tracking.\n'
                        + dirPattern + '\n';
                    fs.writeFileSync(ignorePath, note);
                    console.log('Search hygiene: added ' + dirPattern + ' to ' + ignorePath + ' (stones stay git-tracked).');
                }
            }
        } catch (e) { /* non-fatal — hint only */ }

    } else if (subcmd === 'refresh') {
        // (pass 21) Boot horcruxes are point-in-time snapshots that ONLY ever
        // get restored, never regenerated — the backup drifts further from the
        // live brain every session. refresh regenerates the discovered boot
        // horcrux in place: fresh gather, same path, same password (from the
        // filename convention / env / arg), written to a temp file first and
        // renamed only after a successful encode, so a failed gather can never
        // destroy the only backup.
        const positionalPw = args[1];
        const target = defaultPath;
        if (!target) {
            console.error('❌ No boot horcrux to refresh.');
            console.error('   Searched models/public/<stack>/boot/ for <agent>-p_*.svg');
            console.error('   Create one first: vant horcrux create models/public/<brain>/boot/<agent>-p_<pw>.svg <pw>');
            process.exit(1);
        }

        // Resolve password by the SAME chain as restore: arg → env → filename.
        let password = positionalPw || process.env.VANT_BRAIN_PASSWORD || null;
        if (!password) {
            const m = path.basename(target).match(/-p_([^.]+)\.svg$/);
            if (m) password = m[1];
        }
        if (!password) {
            console.error('❌ Password required (refresh must re-encrypt with the same key):');
            console.error('     • positional arg: vant horcrux refresh <password>');
            console.error('     • env var:        VANT_BRAIN_PASSWORD=...');
            console.error('     • p_<password> in the target filename (the convention)');
            process.exit(1);
        }

        const transform = require('../lib/transform');
        // (pass 23) Shared safe-write flow via lib/horcrux-safe.js:
        // tmp → round-trip validate → rename. Also cwd-safe: the helper
        // resolves every path against VANT_REPO_ROOT/install root, so a
        // refresh invoked through the dispatcher from a foreign cwd no
        // longer depends on process.cwd() being the repo (the pass-21
        // version was cwd-fragile).
        // (pass 21) vaf.checkPathTraversal blocks ABSOLUTE paths (toHorcrux
        // runs it on its input), so encode/decode always receive
        // REPO-RELATIVE tmp paths from the helper.
        const { safeWriteHorcrux } = require('../lib/horcrux-safe');
        console.log('Refreshing boot horcrux:', target);

        await safeWriteHorcrux(path.relative(REPO_ROOT, target), {
            label: 'horcrux',
            log: (m) => console.log(m.replace(/^ {3}/, '  ')),
            password,
            encode: (rel, o) => transform.toHorcrux(rel, { password: o.password }),
            decode: (rel, o) => transform.validateHorcruxFile(rel, { password: o.password }),
            validate: (check) => (check && check.valid !== false)
                ? true
                : { valid: false, errors: [check && check.error || 'unknown'] }
        });
        console.log('\n✅ Refreshed!');
        console.log('Path:', target);
        console.log('Timestamp:', new Date(Date.now()).toISOString());
    } else if (subcmd === 'verify') {
        // (pass 176) #166 acceptance as a command: recompute the current
        // brain root, compare to the last anchor in the anchor ledger.
        // CI-safe exit codes: 0 verified, 1 diverged/unreadable, 2 no
        // anchor yet (fresh install — anchor it first with the printed
        // command; deliberately NOT an error exit so cron/CI can
        // distinguish "integrity failure" from "no baseline").
        let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || null;
        if (!brainPath) {
            try { brainPath = require('../lib/brain').getBrainPath(); } catch (e) { brainPath = 'models/private'; }
        }
        const { BrainVerifier } = require('../lib/state/brain-verify');
        const bv = new BrainVerifier(brainPath);
        const v = bv.verify();
        if (v.ok) {
            console.log('✅ Brain verified: current root matches the last anchor.');
            console.log('   root: ' + v.current);
            console.log('   anchored: ' + new Date(v.lastAnchored.timestamp).toISOString()
                + ' (' + (v.lastAnchored.cause || 'unspecified') + ')');
            process.exit(0);
        }
        if (v.lastAnchored === null) {
            console.log('⚠️  No anchors recorded yet for ' + brainPath + ' — nothing to verify against.');
            console.log('   Anchor a baseline first:');
            console.log('     vant horcrux anchor');
            process.exit(2);
        }
        console.log('❌ Brain DIVERGED from the last anchor.');
        console.log('   ' + v.divergence);
        console.log('   current:  ' + v.current);
        console.log('   anchored: ' + v.lastAnchored.root_hash);
        console.log('   If the change was intentional, re-anchor: vant horcrux anchor');
        process.exit(1);
    } else if (subcmd === 'anchor') {
        // (pass 176) re-anchor after an intentional change (the escape hatch
        // verify's divergence message points at). Not silent: prints what
        // got anchored so an accidental re-anchor is visible in logs.
        let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || null;
        if (!brainPath) {
            try { brainPath = require('../lib/brain').getBrainPath(); } catch (e) { brainPath = 'models/private'; }
        }
        const { BrainVerifier } = require('../lib/state/brain-verify');
        const bv = new BrainVerifier(brainPath);
        const cause = args[1] || 'manual re-anchor (vant horcrux anchor)';
        const entry = bv.anchorNow(cause);
        console.log('✅ Anchored.');
        console.log('   root: ' + entry.root_hash);
        console.log('   cause: ' + entry.cause);
        process.exit(0);
    } else {
        console.log('Unknown command:', subcmd);
        console.log('Run "vant horcrux --help" for usage');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
