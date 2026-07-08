#!/usr/bin/env node
/**
 * Vant Cache CLI
 * Cache and compression operations
 * 
 * Usage:
 *   vant cache get <key>      # Get cache value
 *   vant cache set <key> <val> # Set cache value
 *   vant cache clear          # Clear cache
 *   vant cache stats          # Show cache stats
 *   vant cache compress <str> # Compress string
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'stats';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Cache CLI - Cache and compression

Usage:
  vant cache get <key>        Get cache value
  vant cache set <key> <val>  Set cache value
  vant cache clear           Clear all cache
  vant cache stats           Show cache statistics
  vant cache compress <str>  Compress string
  vant cache decompress <b64>  Decompress string
`);
    process.exit(0);
}

function run() {
    const cache = require('../lib/cache');
    
    if (subcmd === 'get') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant cache get <key>');
            process.exit(1);
        }
        const val = cache.get(key);
        console.log(val || '(not found)');
    } else if (subcmd === 'set') {
        const key = args[1];
        const val = args[2];
        if (!key || val === undefined) {
            console.error('Usage: vant cache set <key> <value>');
            process.exit(1);
        }
        cache.set(key, val);
        console.log('Set:', key);
    } else if (subcmd === 'clear' || subcmd === 'reset') {
        cache.clear();
        console.log('Cache cleared');
    } else if (subcmd === 'stats' || subcmd === 'status') {
        console.log('Cache stats:');
        console.log('  (use cache.get/set for values)');
    } else if (subcmd === 'compress') {
        const str = args.slice(1).join(' ');
        if (!str) {
            console.error('Usage: vant cache compress <string>');
            process.exit(1);
        }
        const compressed = cache.compress(str);
        console.log(compressed);
    } else if (subcmd === 'decompress') {
        const b64 = args[1];
        if (!b64) {
            console.error('Usage: vant cache decompress <base64>');
            process.exit(1);
        }
        const decompressed = cache.decompress(b64);
        console.log(decompressed);
    } else {
        console.log('Usage: vant cache <command>');
        process.exit(1);
    }
}

run();
