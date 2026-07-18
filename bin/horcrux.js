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

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Horcrux CLI - Brain backup/restore

Usage:
  vant horcrux inspect [path] [password]   Preview horcrux contents
  vant horcrux restore [path] [password]   Restore from horcrux
  vant horcrux create [path]               Create horcrux from current state

Examples:
  vant horcrux inspect                                        # Inspect default boot/horcrux
  vant horcrux inspect models/public/boot/hypha-brain-horcrux.svg password
  vant horcrux restore models/public/boot/hypha-brain-horcrux.svg password
`);
    process.exit(0);
}

async function run() {
    const path = require('path');
    const defaultPath = path.join(__dirname, '..', 'models', 'public', 'boot', 'hypha-brain-horcrux.svg');
    
    if (subcmd === 'inspect') {
        const horcruxPath = args[1] || defaultPath;
        const password = args[2] || '$brAin_sEed!!';
        
        console.log('Inspecting:', horcruxPath);
        
        const result = await boot.inspectHorcrux(horcruxPath, password);
        
        if (!result.valid) {
            console.log('❌ Invalid horcrux:', result.error);
            if (result.passwordRequired) {
                console.log('   Password may be required');
            }
            process.exit(1);
        }
        
        console.log('\n✅ Valid Horcrux');
        console.log('Format:', result.format);
        console.log('Version:', result.version);
        console.log('Created:', new Date(result.timestamp));
        console.log('\n--- Contents Preview ---');
        console.log('Agents:', result.preview.agentCount);
        console.log('Islands:', result.preview.islandCount);
        console.log('Corpus:', result.preview.corpusCount);
        console.log('Config:', result.preview.hasConfig ? 'Yes' : 'No');
        console.log('Runtime:', result.preview.hasRuntime ? 'Yes' : 'No');
        
    } else if (subcmd === 'restore') {
        const horcruxPath = args[1] || defaultPath;
        const password = args[2] || '$brAin_sEed!!';
        
        console.log('Restoring from:', horcruxPath);
        
        const result = await boot.restoreFromHorcrux(horcruxPath, password);
        
        console.log('\n✅ Restored!');
        console.log('Version:', result.version);
        console.log('Timestamp:', new Date(result.timestamp));
        console.log('Restored:', result.restored.join(', '));
        
    } else if (subcmd === 'create') {
        console.log('Create horcrux - not yet implemented');
        console.log('Use: transform.toHorcrux() in code');
        
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
