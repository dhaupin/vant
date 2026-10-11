#!/usr/bin/env node
/**
 * Vant Export CLI — Provenance / Compliance Bundle (Wave U5, prd-universe.md)
 *
 * Usage:
 *   vant export bundle --out <dir> [--label <text>] [--no-horcrux] [--password <pw>] [--json]
 *       Assemble a self-verifying bundle:
 *         manifest.json        registry export (point-in-time who-is-who)
 *         citations.json       citation ledger (provenance of knowledge)
 *         audit-excerpt.json   audit ledger excerpt (scoped, default last 100)
 *         horcrux.svg          encrypted brain snapshot (password-gated)
 *         content-manifest.json — L-hashed running hash chain over the files
 *         bundle.json          one-file handle (names the chain digest)
 *
 *   vant export verify <dir> [--json]
 *       Recompute the hash chain, fail-closed on tamper (E_BUNDLE_TAMPERED).
 *
 * The L-hash is a RUNNING list: entry i folds the previous entry's digest
 * (sha256(prev + file + ":" + fileHash)), so any byte change, deletion,
 * insertion, or reordering breaks the terminal digest. Every hash rides
 * lib/hash.js — one hash source.
 *
 * Exit codes: 0 ok; 1 typed lib error (code on stderr); 2 usage error.
 *
 * Password note: --password goes in through argv (shell history exposure is
 * the operator's environment choice); omit it and lib/secret.js resolves the
 * brain secret instead. Horcrux can be omitted entirely with --no-horcrux
 * (the bundle still verifies — it just carries no brain snapshot).
 */
const vaf = require('../lib/vaf');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

function flagValue(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const positionals = [];
for (let i = 0; i < args.length; i++) {
    if (['--out', '--label', '--password'].includes(args[i])) { i++; continue; }
    if (args[i] === '--json' || args[i] === '--no-horcrux') continue;
    positionals.push(args[i]);
}

if (args.includes('-h') || args.includes('--help') || positionals.length === 0) {
    console.log(`Vant Export — Provenance / Compliance Bundle (Wave U5, prd-universe.md)

Usage:
  vant export bundle --out <dir> [--label <text>] [--no-horcrux] [--password <pw>] [--json]
        Assemble a self-verifying bundle (registry manifest, citations, audit
        excerpt, encrypted horcrux snapshot, L-hashed running content manifest)

  vant export verify <dir> [--json]
        Recompute the hash chain over the actual bytes — tampon byte drifts
        FAIL CLOSED (E_BUNDLE_TAMPERED), never a warning.

What a bundle contains:
  manifest.json          registry export (point-in-time)
  citations.json         citation ledger
  audit-excerpt.json     audit ledger excerpt (scoped, default last 100)
  horcrux.svg            encrypted brain snapshot (password-gated)
  content-manifest.json  L-hashed running chain (lib/hash.js only)
  bundle.json            handle: names the chain's terminal digest

The chain is a RUNNING list — entry i folds entry i-1's digest — so any
byte change, delete, insert, or reorder breaks the terminal digest.

Exit codes: 0 ok · 1 typed lib error (code on stderr) · 2 usage error
`);
    process.exit(0);
}

const cmd = positionals[0];
vaf.check(cmd, { type: 'string', name: 'cmd', maxLength: 8 });

(async () => {
    try {
        const eb = require('../lib/export-bundle');
        if (cmd === 'bundle') {
            const out = flagValue('--out');
            if (!out) { console.error('Usage: vant export bundle --out <dir> [--label <text>] [--no-horcrux] [--password <pw>]'); process.exit(2); }
            vaf.check(out, { type: 'string', name: 'out dir', maxLength: 200 });
            const label = flagValue('--label');
            const password = flagValue('--password');
            const r = await eb.exportBundle({
                out,
                label,
                horcruxPassword: password,
                includeHorcrux: !args.includes('--no-horcrux')
            });
            if (!r.ok) { console.error('export bundle: ' + r.error + (r.code ? ' [' + r.code + ']' : '')); process.exit(1); }
            if (jsonOut) { console.log(JSON.stringify(r, null, 2)); }
            else {
                console.log(`\nBundle exported: ${r.dir}`);
                console.log(`  digest:        ${r.digest}`);
                console.log(`  files hashed:  ${r.files.length} (L-hashed running chain)`);
                console.log(`  registry:      ${r.registry} registered agent(s)`);
                console.log(`  citations:     ${r.citations} source(s)`);
                console.log(`  audit excerpt: ${r.auditEntries} entr(y|ies)`);
                console.log(`  horcrux:       ${r.files.includes('horcrux.svg') ? 'encrypted brain snapshot included' : 'omitted (--no-horcrux)'}`);
                console.log('\nVerify any time: vant export verify ' + r.dir);
            }
            process.exit(0);
        }

        if (cmd === 'verify') {
            const dir = positionals[1];
            if (!dir) { console.error('Usage: vant export verify <bundle-dir>'); process.exit(2); }
            vaf.check(dir, { type: 'string', name: 'bundle dir', maxLength: 200 });
            const r = eb.verifyBundle({ dir });
            if (jsonOut) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
            if (!r.ok) {
                console.error('\n✗ Bundle verification FAILED: ' + r.error);
                console.error('  code: ' + (r.code || 'E_BUNDLE'));
                process.exit(1);
            }
            console.log(`\n✓ Bundle verified: ${dir}`);
            console.log(`  digest:  ${r.digest}`);
            console.log(`  files:   ${r.verified.length} L-hashed (${r.verified.join(', ')})`);
            console.log(`  horcrux: ${r.includesHorcrux ? 'included in the chain' : 'omitted'}  ·  label: ${r.label || '(none)'}`);
            process.exit(0);
        }

        console.error('Unknown subcommand: ' + cmd + ' (try: vant export --help)');
        process.exit(2);
    } catch (e) {
        console.error('export: ' + e.message + (e.code ? ' [' + e.code + ']' : ''));
        process.exit(1);
    }
})();
