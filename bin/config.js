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
// (pass 95) Resolver of record for the active brain (VANT_BRAIN env > current).
const currentBrain = () => {
    try { const ss = require('../lib/state-store'); if (ss.currentBrain) return ss.currentBrain(); } catch (e) {}
    try { return config.brainGetCurrent ? config.brainGetCurrent() : 'vant'; } catch (e) { return 'vant'; }
};

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
            // (pass 95) Consult the current brain's persisted config too —
            // `vant config set` writes there (setConfig); a fresh CLI process
            // has no runtime flags, so get() without the brain option always
            // returned null for anything the CLI itself had set.
            const val = config.get(key, null, { brain: currentBrain() });
            console.log(`${key}=${val}`);
            break;

        case 'set':
            if (!key || !value) {
                console.log('Usage: vant config set <key> <value>');
                process.exit(1);
            }
            // (pass 95) config.set was setFlag — an in-process Map that died
            // with this very process while the CLI printed success. setConfig
            // persists into the current brain's config.json.
            const setRes = config.setConfig(key, value);
            if (setRes && setRes.error) {
                console.log(theme.status.err('Set failed: ' + setRes.error));
                process.exit(1);
            }
            console.log(theme.status.ok('Set ' + key + ' ' + value + (setRes.persisted ? ' (persisted to ' + setRes.brain + ')' : ' (runtime only)')));
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