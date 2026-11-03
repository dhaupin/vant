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
            // (round-2 audit) Secret keys are masked in terminal output, the
            // same posture the MCP config door (vant_config_get) and
            // `config list env` already take. config.get() stays raw for
            // internal callers; only this echo changes, so a secret never
            // lands in a scrollback buffer or a CI log. A SECTION key
            // (`github`) yields the nested object — deep-redact it and print
            // JSON (the old `[object Object]` was both unreadable and, worse,
            // unredacted).
            if (val !== null && typeof val === 'object') {
                console.log(`${key}=${JSON.stringify(config.redactSecrets(val))}`);
            } else {
                const shownVal = config.maskIfSecret(key, val);
                console.log(`${key}=${shownVal === null || shownVal === undefined ? val : shownVal}`);
            }
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
            // (round-2 audit) Echo the value masked for secret keys — the
            // confirmation still names the key, but a rotated token does not
            // land in scrollback or a CI log.
            const echoVal = config.maskIfSecret(key, value);
            console.log(theme.status.ok('Set ' + key + ' ' + (echoVal === null || echoVal === undefined ? value : echoVal) + (setRes.persisted ? ' (persisted to ' + setRes.brain + ')' : ' (runtime only)')));
            break;

        case 'list':
        case 'ls':
            const all = config.getAll();
            // (round-2 audit) Mask secret-valued keys (github.token,
            // mcp.apiKey, server.key …) before printing. `config list` used
            // to dump them in cleartext while `config list env` masked the
            // same values — a live token on screen is a disclosure even
            // locally (scrollback, shared terminal, CI log). Flatten the
            // tree to dotted leaf paths and redact EVERY leaf with
            // redactSecrets, so secrets buried more than one level deep or
            // sitting inside arrays (providers.github.token, keys:[{token}])
            // are masked too — the old one-level flatten printed those
            // verbatim.
            const redacted = config.redactSecrets(all);
            const walk = (node, prefix) => {
                // Arrays stay on one line (redactSecrets already masked any
                // secret leaves inside), matching the old output shape.
                if (Array.isArray(node)) {
                    console.log(`${prefix}=${JSON.stringify(node)}`);
                    return;
                }
                if (node !== null && typeof node === 'object') {
                    for (const [k, v] of Object.entries(node)) {
                        walk(v, prefix ? `${prefix}.${k}` : k);
                    }
                    if (Object.keys(node).length === 0) console.log(`${prefix}=${JSON.stringify(node)}`);
                    return;
                }
                console.log(`${prefix}=${node}`);
            };
            walk(redacted, '');
            // env  — the pass-179 registry view: every VANT_* env var vant
            // consumes, resolved with source (env vs fallback) + typo flags
            if (args[1] === 'env') {
                const reg = config.listEnvConfig({ maskSecrets: true, includeUnset: true });
                console.log('\n# environment registry (VANT_* vars)');
                for (const e of reg) {
                    const mark = e.source === 'env' ? '●' : ' ';
                    const sec = e.secret ? ' (secret)' : '';
                    console.log(`${mark} ${e.env} → ${e.key}${sec} = ${JSON.stringify(e.value)}${e.source === 'fallback' ? '  [default]' : ''}`);
                }
                const unknown = config.unknownEnvVars();
                if (unknown.length) {
                    console.log('\n⚠ unknown VANT_* vars (typo?): ' + unknown.map(u => u.env).join(', '));
                }
            }
            break;

        default:
            console.log('Usage: vant config get <key>');
            console.log('       vant config set <key> <value>');
            console.log('       vant config list');
            console.log('       vant config list env   # registry view of VANT_* env vars');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});