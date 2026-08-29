#!/usr/bin/env node
/**
 * Vant Horcrux CLI
 * Horcrux management - inspect, restore, create
 * 
 * Usage:
 *   vant horcrux inspect [path] [password]  # Preview horcrux
 *   vant horcrux restore [path] [password] # Restore from horcrux
 *   vant horcrux create [path]             # Create horcrux from current state
 */

const boot = require('../lib/boot');

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
`);
    process.exit(0);
}

/**
 * Read the brain stack from models/state.json. Falls back to
 * a single-element stack with 'vant' (the canonical default).
 */
function readBrainStack(repoRoot) {
    try {
        const statePath = path.join(repoRoot, 'models', 'state.json');
        if (!fs.existsSync(statePath)) return ['vant'];
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (Array.isArray(state.stack) && state.stack.length > 0) return state.stack;
        if (state.currentBrain) return [state.currentBrain];
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
    const fs = require('fs');
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
        console.log('Agents:', result.preview.agentCount);
        console.log('Islands:', result.preview.islandCount);
        console.log('Corpus:', result.preview.corpusCount);
        console.log('Config:', result.preview.hasConfig ? 'Yes' : 'No');
        console.log('Runtime:', result.preview.hasRuntime ? 'Yes' : 'No');
        console.log('Teams/Orgs:', result.preview.hasTeams ? `${result.preview.orgCount} orgs, ${result.preview.teams2Count} teams` : 'No');
        if (result.teamsError) {
            console.log('⚠️ Teams error:', result.teamsError);
        }
        if (result.hasBothFormats) {
            console.log('⚠️ Warning: Both brainStorage and privateBrains present (duplicate)');
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
        const outputPath = args[1] || path.join(__dirname, '..', 'models', 'public', 'boot', `brain-${Date.now()}.svg`);
        const password = args[2]; // Must be provided or via secret.js
        
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
