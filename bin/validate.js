#!/usr/bin/env node
/**
 * Vant Validate CLI
 * Schema enforcement + audit
 */

const path = require('path');
const DIR = path.join(__dirname, '..');

const args = process.argv.slice(2);
const action = args[0];

async function run() {
    const schema = require(path.join(DIR, 'lib', 'schema'));
    const audit = require(path.join(DIR, 'lib', 'audit'));
    const sync = require(path.join(DIR, 'lib', 'sync'));
    
    if (!action || action === '--check') {
        console.log(`
╔═══════════════════════════════════════╗
║        Vant Validate                ║
╚═══════════════════════════════════════╝
`);
        
        // Schema check
        console.log('\n[Schema]');
        const schemaResult = schema.isValid();
        if (schemaResult.valid) {
            console.log('  ✓ All schemas valid');
        } else {
            console.log('  ✗ Validation failed:');
            for (const r of schemaResult.results) {
                if (!r.valid) {
                    console.log('    ' + r.file + ': ' + r.errors.join(', '));
                }
            }
        }
        
        // Audit check
        console.log('\n[Audit]');
        const auditHealth = audit.healthCheck();
        if (auditHealth.healthy) {
            console.log('  ✓ Ledger sound (' + auditHealth.entries + ' entries)');
        } else {
            console.log('  ✗ Issues:');
            for (const issue of auditHealth.issues) {
                console.log('    ' + issue);
            }
        }
        
        // Circuit breaker check
        console.log('\n[Circuit Breaker]');
        const circuits = sync.getAllCircuits();
        let hasOpen = false;
        for (const [provider, state] of Object.entries(circuits.providers || {})) {
            if (state.open) {
                console.log('  ⚠ ' + provider + ': OPEN');
                hasOpen = true;
            } else if (state.failures > 0) {
                console.log('  ~ ' + provider + ': ' + state.failures + ' failures');
            }
        }
        if (!hasOpen) {
            console.log('  ✓ All circuits closed');
        }
        
        process.exit(schemaResult.valid ? 0 : 1);
    }
    
    if (action === '--schema') {
        const result = schema.isValid();
        console.log(result.valid ? 'valid' : 'invalid');
        process.exit(result.valid ? 0 : 1);
    }
    
    if (action === '--ledger') {
        const entries = audit.getLedger(10);
        console.log('Last ' + entries.length + ' entries:');
        for (const e of entries) {
            console.log('  ' + e.timestamp.substring(11, 19) + ' ' + e.action);
        }
        process.exit(0);
    }
    
    if (action === '--circuits') {
        const circuits = sync.getAllCircuits();
        console.log(JSON.stringify(circuits, null, 2));
        process.exit(0);
    }
    
    console.log('Usage: vant validate [--check|--schema|--ledger|--circuits]');
    process.exit(1);
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});