#!/usr/bin/env node
/**
 * Vant Islands Boot - Componentized Brain Boot
 *
 * Boot from islands instead of single brain.
 * Lazy hydrates only what's needed.
 *
 * Usage:
 *   node bin/islands-boot.js                  # Auto based on prompt
 *   node bin/islands-boot.js --prompt "fix github pr"
 *   node bin/islands-boot.js --island github
 */
const args = process.argv.slice(2);

// Simple arg parser supporting both --key=value and --key value formats
function getArg(key) {
    const idx = args.indexOf('--' + key);
    if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    const match = args.find(a => a.startsWith('--' + key + '='));
    if (match) return match.split('=')[1];
    return undefined;
}

const promptArg = getArg('prompt');
const islandArg = getArg('island');
const listArg = args.includes('--list');
const helpArg = args.includes('--help') || args.includes('-h');

const islands = require('../lib/islands');
const state = require("../lib/storage").get("state");
const brain = require('../lib/storage').get('brain');
const gallery = require('../lib/stego');

/**
 * Boot with islands
 */
async function bootBoot(prompt) {
    console.log('[Islands] Componentized Brain Boot');
    console.log('[Islands] ======================================');
    
    // 1. Load static state
    console.log('\n[Islands] Loading static state...');
    state.set("current", {
        mode: 'islands',
        prompt: prompt,
        hydrated: []
    });
    
    // 2. Auto-hydrate based on prompt
    const toHydrate = islands.autoHydrate(prompt || promptArg || 'identity');
    console.log('[Islands] Islands to hydrate:', toHydrate.join(', '));
    
    // 3. Hydrate each island
    for (const name of toHydrate) {
        const result = islands.hydrate(name);
        console.log('[Islands] ' + name + ':', result.success ? 'hydrated' : 'failed');
    }
    
    // 4. Show state summary
    console.log('\n[Islands] State:');
    console.log('  - Static:', state.get("current"));
    console.log('  - Available:', islands.getAvailable().length);
    console.log('  - Hydrated:', islands.getHydrated().length);
    
    
    console.log('\n[Islands] === Componentized Brain Ready ===');
    console.log('[Islands] Mode: Islands (lazy load)');
    
    return { success: true, hydrated: toHydrate };
}

/**
 * List islands
 */
function listIslands() {
    const manifest = islands.getManifest();
    console.log('\n[Islands] Registry:');
    console.log('===============');
    
    for (const [name, config] of Object.entries(manifest.islands)) {
        const status = manifest.hydrated?.includes(name) ? '[hydrated]' : '[static  ]';
        const type = config.type || 'lazy';
        console.log('  ' + status + ' ' + name.padEnd(15) + ' ' + (config.description || ''));
    }
    
    console.log('\n[Islands] ' + Object.keys(manifest.islands).length + ' islands total');
    console.log('[Islands] ' + (manifest.hydrated?.length || 0) + ' hydrated');
}

/**
 * Help
 */
function help() {
    console.log(`
Vant Islands - Componentized Brain Boot

Boot Vant as a componentized brain with lazy-loaded islands.

Usage:
  node bin/islands-boot.js [--prompt <text>] [--island <name>] [--list]

Options:
  --prompt=<text>    Prompt context for auto-hydration
  --island=<name>    Hydrate specific island
  --list            List all islands
  --help            Show help

Examples:
  # Auto-hydrate based on prompt
  node bin/islands-boot.js --prompt "fix github pr"

  # Hydrate just GitHub island
  node bin/islands-boot.js --island github

  # List all islands
  node bin/islands-boot.js --list

Architecture:
  - Static: identity, learnings, decisions (always loaded)
  - Lazy: github, herbalism, vesc, etc (on trigger)
  - Gallery: individual PNGs per island
`);
}

/**
 * Main
 */
async function main() {
    if (helpArg) { help(); return; }
    if (listArg) { listIslands(); return; }
    if (islandArg) {
        console.log('[Islands] Hydrating:', islandArg);
        const result = await islands.hydrate(islandArg);
        console.log('[Islands] Files:', result?.join(', ') || 'none');
        return;
    }
    
    await bootBoot(promptArg);
}

main().catch(e => console.error('[Islands] Error:', e.message));