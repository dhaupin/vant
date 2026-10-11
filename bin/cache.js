#!/usr/bin/env node
/**
 * Vant Cache CLI - Cache and compression operations
 *
 * (pass 189) FIXED. The 0.8.6 T13b removal of the `defaultCache` singleton
 * left `require('../lib/cache')` exporting ONLY the Cache class — the old
 * `cache.get/set/clear` module-level calls were all "not a function"
 * crashes in disguise (get/set worked pre-0.8.6 only). Every verb now
 * constructs one `new Cache()` per process and calls the real methods;
 * `stats` reads the real stats() surface.
 *
 * NOTE: per-process instance — a value set in this run dies with it. For
 * cross-call persistence use a store, not a cache.
 *
 * Usage:
 *   vant cache get <key>          Get cache value
 *   vant cache set <key> <val>    Set cache value
 *   vant cache clear              Clear cache
 *   vant cache stats              Show cache statistics
 *   vant cache compress <str>     Compress string (gzip→base64)
 *   vant cache decompress <b64>   Decompress base64→string
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'stats';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Cache CLI - Cache and compression

Usage:
  vant cache get <key>          Get cache value
  vant cache set <key> <val>    Set cache value
  vant cache clear              Clear all cache
  vant cache stats              Show cache statistics
  vant cache compress <str>     Compress string (gzip->base64)
  vant cache decompress <b64>   Decompress base64 -> string

Per-process instance: a value set here dies with the process.
`);
    process.exit(0);
}

let cache;
try {
    const { Cache } = require('../lib/cache');
    cache = new Cache();
} catch (e) {
    console.error('Cache module not available: ' + e.message);
    process.exit(1);
}

function run() {
    if (subcmd === 'get') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant cache get <key>');
            process.exit(1);
        }
        const val = cache.get(key);
        console.log(val === undefined || val === null ? '(not found)' : JSON.stringify(val));
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
        const s = cache.stats();
        console.log('Cache stats (this process):');
        console.log(JSON.stringify(s, null, 2));
    } else if (subcmd === 'compress') {
        const str = args.slice(1).join(' ');
        if (!str) {
            console.error('Usage: vant cache compress <string>');
            process.exit(1);
        }
        // compress() returns a gzip Buffer — base64 it so the CLI round-trips
        // through a printable wire (and so decompress can consume the print).
        console.log(cache.compress(str).toString('base64'));
    } else if (subcmd === 'decompress') {
        const b64 = args[1];
        if (!b64) {
            console.error('Usage: vant cache decompress <base64>');
            process.exit(1);
        }
        // Decompress() expects the raw gzip Buffer — decode the base64 back.
        const decompressed = cache.decompress(Buffer.from(b64, 'base64'));
        console.log(decompressed.toString('utf8'));
    } else {
        console.log('Usage: vant cache <command>');
        console.log('Commands: get | set | clear | stats | compress | decompress');
        process.exit(1);
    }
}

run();
