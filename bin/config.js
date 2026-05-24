#!/usr/bin/env node
/**
 * Vant Config CLI
 *
 * Usage:
 *   vant config get <key>
 *   vant config set <key> <value>
 *   vant config list
 */

const config = require('../lib/config');
const theme = require('../lib/theme');

const args = process.argv.slice(2);
const action = args[0];
const key = args[1];
const value = args[2];

async function main() {
    switch (action) {
        case 'get':
            if (!key) {
                console.log('Usage: vant config get <key>');
                process.exit(1);
            }
            const val = config.get(key);
            console.log(`${key}=${val}`);
            break;

        case 'set':
            if (!key || !value) {
                console.log('Usage: vant config set <key> <value>');
                process.exit(1);
            }
            config.set(key, value);
            console.log(theme.status.ok('Set ' + key + ' '+ value));
            break;

        case 'list':
        case 'ls':
            const all = config.getAll();
            Object.entries(all).forEach(([k, v]) => {
                console.log(`${k}=${v}`);
            });
            break;

        default:
            console.log('Usage: vant config get <key>');
            console.log('       vant config set <key> <value>');
            console.log('       vant config list');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});