#!/usr/bin/env node
/**
 * Vant Geometry CLI
 * NSC9 Quasicrystal geometric storage
 *
 * Usage:
 *   vant geometry store <key> <value>  # Store in NSC9
 *   vant geometry retrieve <key>         # Retrieve from NSC9
 *   vant geometry barcode <content>       # Generate quasicrystal barcode
 *   vant geometry generate <name> <type> # Generate pattern
 *   vant geometry stats                  # Show geometry stats
 *   vant geometry address <data>        # Store at geometric address
 *   vant geometry locate <barcode>      # Locate by barcode
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Geometry CLI - NSC9 Quasicrystal Storage

Usage:
  vant geometry store <key> <value>   Store in NSC9 (via memory)
  vant geometry retrieve <key>        Retrieve from NSC9 (via memory)
  vant geometry barcode <content>     Generate quasicrystal barcode
  vant geometry generate <name> <type> Generate pattern (spiral|barcode|tiling)
  vant geometry stats                Show geometry modules
  vant geometry address <data>       Store at geometric address (random barcode)
  vant geometry locate <barcode>     Locate by barcode

Memory Integration:
  Geometry now uses memory module for unified security (sandbox + RLS)

Examples:
  vant geometry store lessons "Use NSC9 for barcodes"
  vant geometry retrieve lessons
  vant geometry barcode "hello world"
  vant geometry address '{"note": "test"}'
  vant geometry locate 1-12345-67890-5
`);
    process.exit(0);
}

async function run() {
    try {
        const memory = require('../lib/memory');
        const geo = require('../lib/geometry');

        if (subcmd === 'store' || subcmd === 'remember') {
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key || !value) {
                console.error('Usage: vant geometry store <key> <value>');
                process.exit(1);
            }
            await memory.learn('geometry:' + key, value);
            console.log('Stored:', key);
        } else if (subcmd === 'retrieve' || subcmd === 'recall' || subcmd === 'get') {
            const key = args[1];
            if (!key) {
                console.error('Usage: vant geometry retrieve <key>');
                process.exit(1);
            }
            const result = await memory.query('geometry:' + key);
            console.log(result || '(not found)');
        } else if (subcmd === 'barcode') {
            const content = args.slice(1).join(' ');
            if (!content) {
                console.error('Usage: vant geometry barcode <content>');
                process.exit(1);
            }
            const barcode = geo.generateBarcodeFromContent(content);
            console.log(barcode);
        } else if (subcmd === 'generate' || subcmd === 'gen') {
            const name = args[1] || 'default';
            const type = args[2] || 'spiral';
            console.log('Generating', type, 'pattern:', name);
        } else if (subcmd === 'address') {
            const data = args.slice(1).join(' ');
            if (!data) {
                console.error('Usage: vant geometry address <data>');
                process.exit(1);
            }
            let parsed;
            try { parsed = JSON.parse(data); } catch(e) { parsed = data; }
            const barcode = await memory.address(parsed);
            console.log('Addressed:', barcode);
        } else if (subcmd === 'locate') {
            const barcode = args[1];
            if (!barcode) {
                console.error('Usage: vant geometry locate <barcode>');
                process.exit(1);
            }
            const result = await memory.locate(barcode);
            console.log(result || '(not found)');
        } else if (subcmd === 'stats') {
            console.log('Geometry modules:');
            console.log('  - quasicrystal (NSC9)');
            console.log('  - memory (unified storage)');
            console.log('  - tilings');
            console.log('  - icosahedral');
            console.log('  - projection');
            console.log('  - fragmenter');
        } else {
            console.log('Usage: vant geometry <command>');
            console.log('Run with --help for full help');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
