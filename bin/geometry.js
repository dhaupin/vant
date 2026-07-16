#!/usr/bin/env node
/**
 * Vant Geometry CLI
 * Brain-Quasicrystal duality bridge
 * 
 * Usage:
 *   vant geometry duality       # Show duality status
 *   vant geometry remember <key> <value>  # Store in both
 *   vant geometry recall <key>            # Recall from both
 *   vant geometry barcode <content>        # Generate quasicrystal barcode
 *   vant geometry generate <name> <type>   # Generate pattern
 *   vant geometry stats                   # Show geometry stats
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'duality';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Geometry CLI - Brain-Quasicrystal duality bridge

Usage:
  vant geometry duality       Show duality status
  vant geometry remember <key> <val>  Store in both brain & quasicrystal
  vant geometry recall <key>          Recall from both
  vant geometry barcode <content>      Generate quasicrystal barcode
  vant geometry generate <name> <type> Generate pattern (spiral|barcode|tiling)
  vant geometry stats                 Show geometry stats
  vant geometry quasicrystal          NSC9 quasicrystal operations

Duality:
  Brain (models/*.md) = Human-readable, editable
  Geometry (NSC9) = Machine-addressable, infinite scale

Examples:
  vant geometry remember lessons "Use NSC9 for barcodes"
  vant geometry recall lessons
  vant geometry barcode "hello world"
`);
    process.exit(0);
}

async function run() {
    try {
        const duality = require('../lib/geometry/duality');
        
        if (subcmd === 'duality' || subcmd === 'status') {
            console.log('=== Brain-Geometry Duality ===');
            console.log('Bridge: lib/geometry/duality.js');
            console.log('Status: Ready');
        } else if (subcmd === 'remember' || subcmd === 'store') {
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key || !value) {
                console.error('Usage: vant geometry remember <key> <value>');
                process.exit(1);
            }
            await duality.remember(key, 'default', value);
            console.log('Stored in duality:', key);
        } else if (subcmd === 'recall' || subcmd === 'get') {
            const key = args[1];
            if (!key) {
                console.error('Usage: vant geometry recall <key>');
                process.exit(1);
            }
            const result = await duality.recall(key);
            console.log(result);
        } else if (subcmd === 'barcode') {
            const content = args.slice(1).join(' ');
            if (!content) {
                console.error('Usage: vant geometry barcode <content>');
                process.exit(1);
            }
            const geo = require('../lib/geometry');
            // Generate barcode using projection
            const barcode = geo.generateBarcodeFromContent(content);
            console.log(barcode);
        } else if (subcmd === 'generate' || subcmd === 'gen') {
            const name = args[1] || 'default';
            const type = args[2] || 'spiral';
            const geo = require('../lib/geometry');
            console.log('Generating', type, 'pattern:', name);
        } else if (subcmd === 'stats' || subcmd === 'status') {
            const geo = require('../lib/geometry');
            console.log('Geometry modules:');
            console.log('  - quasicrystal (NSC9)');
            console.log('  - duality (brain bridge)');
            console.log('  - tilings');
            console.log('  - icosahedral');
            console.log('  - projection');
            console.log('  - fragmenter');
        } else if (subcmd === 'quasicrystal' || subcmd === 'qc') {
            const geo = require('../lib/geometry');
            // Get quasicrystal instance
            const qc = geo.quasicrystal();
            console.log('NSC9 Quasicrystal:');
            console.log('  Instance methods: store, retrieve, list');
            console.log('  Use: const qc = geometry.quasicrystal()');
        } else {
            console.log('Usage: vant geometry <command>');
            console.log('Run with -h for help');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
