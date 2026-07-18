#!/usr/bin/env node
/**
 * Vant Transform CLI
 * 
 * Usage:
 *   node bin/transform.js gather           # Gather basic data
 *   node bin/transform.js full            # Gather EVERYTHING (full state)
 *   node bin/transform.js horcrux <svg>   # Create horcrux from SVG
 *   node bin/transform.js full-horcrux <svg> <pass>  # Create FULL horcrux
 *   node bin/transform.js extract <svg>  # Extract from SVG
 *   node bin/transform.js restore <svg>   # Restore from SVG
 *   node bin/transform.js full-restore <svg> <pass>  # Full restore from SVG
 *   node bin/transform.js backup          # Full backup to JSON
 *   node bin/transform.js status         # Show security status
 */

const path = require('path');
const transform = require('../lib/transform');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    switch (command) {
        case 'gather': {
            console.log('=== GATHERING DATA ===');
            const data = await transform.gather();
            console.log(JSON.stringify(data, null, 2));
            break;
        }
            
        case 'full': {
            console.log('=== GATHERING FULL STATE ===');
            const data = await transform.gather({ full: true });
            console.log('Keys:', Object.keys(data));
            console.log('Size:', JSON.stringify(data).length, 'bytes');
            console.log(JSON.stringify(data, null, 2));
            break;
        }
            
        case 'horcrux': {
            const svgPath = args[1] || './hypha-brain.svg';
            const password = args[2] || 'brain';
            console.log('=== CREATING HORCRUX ===');
            console.log('SVG:', svgPath);
            console.log('Password:', password);
            const result = await transform.embedToSvg(svgPath, password);
            console.log('Result:', result);
            break;
        }
            
        case 'full-horcrux': {
            const svgPath = args[1] || './hypha-brain.svg';
            const password = args[2] || 'brain';
            console.log('=== CREATING FULL HORCRUX ===');
            console.log('SVG:', svgPath);
            console.log('Password:', password);
            const result = await transform.embedToSvgFull(svgPath, password);
            console.log('Result:', result);
            break;
        }
            
        case 'backup': {
            console.log('=== FULL BACKUP ===');
            const backup = await transform.toBackup();
            console.log(JSON.stringify(backup, null, 2));
            break;
        }
            
        case 'status': {
            console.log('=== SECURITY STATUS ===');
            const status = transform.getLayerStatus();
            console.log(JSON.stringify(status, null, 2));
            break;
        }
            
        case 'extract': {
            const extractPath = args[1] || './hypha-brain-horcrux.svg';
            const extractPass = args[2] || 'brain';
            console.log('=== EXTRACT FROM HORCRUX ===');
            console.log('SVG:', extractPath);
            const extracted = await transform.fromSvg(extractPath, extractPass);
            console.log('Keys:', Object.keys(extracted));
            console.log(JSON.stringify(extracted, null, 2));
            break;
        }
            
        case 'restore': {
            const restorePath = args[1] || './hypha-brain-horcrux.svg';
            const restorePass = args[2] || 'brain';
            console.log('=== RESTORE FROM HORCRUX ===');
            console.log('SVG:', restorePath);
            const data = await transform.fromSvg(restorePath, restorePass);
            const restored = await transform.restore(data);
            console.log('Restored:', restored);
            break;
        }
            
        case 'full-restore': {
            const restorePath = args[1] || './hypha-brain-horcrux.svg';
            const restorePass = args[2] || 'brain';
            console.log('=== FULL RESTORE FROM HORCRUX ===');
            console.log('SVG:', restorePath);
            console.log('Password:', restorePass);
            try {
                const data = await transform.fromSvg(restorePath, restorePass);
                if (!data) {
                    console.log('❌ ERROR: Could not extract data - check password');
                    process.exit(1);
                }
                if (!data.timestamp) {
                    console.log('❌ ERROR: Invalid password or corrupted horcrux');
                    process.exit(1);
                }
                console.log('Extracted keys:', Object.keys(data));
                const restored = await transform.restoreFull(data);
                console.log('Restored:', restored);
            } catch(e) {
                console.log('❌ ERROR:', e.message);
                process.exit(1);
            }
            break;
        }
            
        default:
            console.log('Vant Transform CLI');
            console.log('');
            console.log('Usage:');
            console.log('  node bin/transform.js gather              # Gather basic data');
            console.log('  node bin/transform.js full               # Gather EVERYTHING');
            console.log('  node bin/transform.js horcrux <svg>     # Create horcrux from SVG');
            console.log('  node bin/transform.js full-horcrux <svg> <pass>  # Create FULL horcrux');
            console.log('  node bin/transform.js extract <svg>      # Extract from SVG');
            console.log('  node bin/transform.js restore <svg>     # Restore from SVG');
            console.log('  node bin/transform.js full-restore <svg> <pass>   # Full restore');
            console.log('  node bin/transform.js backup            # Full backup to JSON');
            console.log('  node bin/transform.js status            # Show security status');
            process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
