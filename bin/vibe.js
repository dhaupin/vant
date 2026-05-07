#!/usr/bin/env node
/**
 * Vant Vibe CLI
 * Show/set agent mood
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant vibe [experimental|safety_first]');
    console.log('');
    console.log('  experimental   Set experimental mode');
    console.log('  safety_first   Set safety-first mode');
    process.exit(0);
}

const path = require('path');
const DIR = path.join(__dirname, '..');
const vibe = require(path.join(DIR, 'lib', 'vibe'));

// Parse args
const vibeArgs = process.argv.slice(2);
const action = vibeArgs[0];

if (!action) {
    // Show current vibe
    const mood = vibe.getMood();
    const config = vibe.getVibeConfig(mood);
    
    console.log(`
╔═══════════════════════════════════════╗
║         Vant Vibe                 ║
╚═══════════════════════════════════════╝

Current: ${config.name}
Description: ${config.description}
Risk Tolerance: ${config.riskTolerance}
Creativity: ${config.creativity}
Caution: ${config.caution}

Available: ${vibe.getAvailableVibes().join(', ')}

Use: vant vibe <experimental|safety_first.focused|learning|debugging|review>
`);
    process.exit(0);
}

if (action === '--list' || action === '-l') {
    console.log('Available vibes:');
    for (const v of vibe.getAvailableVibes()) {
        const c = vibe.getVibeConfig(v);
        console.log('  ' + v + ': ' + c.name + ' (' + c.riskTolerance + ')');
    }
    process.exit(0);
}

if (action === '--commit' || action === '-c') {
    console.log(vibe.getCommitVibe());
    process.exit(0);
}

// Set vibe
try {
    vibe.setMood(action);
    const config = vibe.getVibeConfig(action);
    console.log('✓ Set vibe to: ' + config.name);
} catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
}