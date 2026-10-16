#!/usr/bin/env node
/**
 * relay-kit vendoring (prd-relay.md 4.0, pass 230)
 *
 * Copies the kit SOURCE (web/kit/relay/relay-contract.js) byte-identically
 * into each renderer target and writes a .sha256 pin sidecar beside the
 * vendored copy. Apps stay self-contained: they never read each other's
 * sources, only the vendored, hash-pinned kit copies. The parity pins
 * (test/relay-parity.test.js) FAIL when a pin does not match kit head -
 * re-run this script after changing the kit.
 *
 * TARGETS (cwd this repo):
 *   web/dashboard/functions/lib/relay-contract.(cjs|d.cts)  (the dashboard
 *      edge flavor) + .sha256 pins
 *   web/relay/functions/lib/ (R1 the SOLO flavor, functions/api/r/*) + pins
 *
 * Extension note (verified in the live CF Pages functions bundler): both
 * frontend packages are ESM ("type": "module"), and the vendored kit bytes
 * are CommonJS (module.exports). An ESM worker that inlines a CJS .js dies
 * with `module is not defined`, so vendored copies carry the FORMAT-HONEST
 * .cjs extension (bytes stay byte-identical; only the name carries).
 * Keep the sourcing .d.cts twin beside it for `moduleResolution: bundler`.
 *
 * Usage: node scripts/vendor-relay-kit.js [--check]
 *   --check: do not write; only verify pins (for CI - exits 1 on drift)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const KIT_DIR = path.join(ROOT, 'web', 'kit', 'relay');
const KIT = path.join(KIT_DIR, 'relay-contract.js');
const KIT_TYPES = path.join(KIT_DIR, 'relay-contract.d.ts');

// (pass 254) the kit now carries TWO sources: the r/2 contract and the
// Traveler contract (the enterprise router object). Each pair vendors
// byte-identically into every renderer target with its own pin sidecar.
const SOURCES = [
    {
        source: KIT,
        types: KIT_TYPES,
        targets: [
            'web/dashboard/functions/lib/relay-contract.cjs',
            'web/dashboard/functions/lib/relay-contract.d.cts',
            // R1 (pass 233): the solo flavor vendors the same kit by the same script
            'web/relay/functions/lib/relay-contract.cjs',
            'web/relay/functions/lib/relay-contract.d.cts'
        ]
    },
    {
        source: path.join(KIT_DIR, 'traveler-contract.js'),
        types: path.join(KIT_DIR, 'traveler-contract.d.ts'),
        targets: [
            'web/dashboard/functions/lib/traveler-contract.cjs',
            'web/dashboard/functions/lib/traveler-contract.d.cts',
            'web/relay/functions/lib/traveler-contract.cjs',
            'web/relay/functions/lib/traveler-contract.d.cts'
        ]
    }
];

const check = process.argv.includes('--check');

function sha(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
    let drift = false;
    for (const pair of SOURCES) {
        if (vendorPair(pair)) drift = true;
    }
    if (drift) process.exit(1);
}

function vendorPair(pair) {
    const source = fs.readFileSync(pair.source);
    const typesSrc = fs.readFileSync(pair.types);
    const head32 = sha(source);
    const headTypes32 = sha(typesSrc);

    let drift = false;
    for (const rel of pair.targets) {
        // each target carries its OWN kit source (contract vs declaration)
        // and pins those vendored bytes to that source's own head
        const srcFor = rel.endsWith('.d.cts') ? typesSrc : source;
        const head = srcFor === typesSrc ? headTypes32 : head32;
        const target = path.join(ROOT, rel);
        const pinFile = target + '.sha256';
        if (check) {
            if (!fs.existsSync(target) || !fs.existsSync(pinFile)) {
                console.error('[drift] missing vendored copy/pin: ' + rel);
                drift = true;
                continue;
            }
            // sidecar format: '<sha256> <repo-relative target>' - the pin is
            // the leading field; the rest is provenance text
            const pin = fs.readFileSync(pinFile, 'utf8').trim().split(/\s+/)[0];
            const actual = sha(fs.readFileSync(target));
            if (pin !== actual) {
                console.error('[drift] pin mismatch vs vendored bytes: ' + rel);
                drift = true;
                continue;
            }
            if (pin !== head) {
                console.error('[drift] vendored copy is pinned to an OLDER kit head: ' + rel);
                console.error('        run: node scripts/vendor-relay-kit.js');
                drift = true;
                continue;
            }
            console.log('[ok] pinned to kit head: ' + rel);
        } else {
            // containment: writes stay inside web/
            if (!rel.startsWith('web/')) {
                console.error('vendor-relay-kit: refusing non-web target (one-way boundary): ' + rel);
                process.exit(1);
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, srcFor);
            fs.writeFileSync(pinFile, head + ' ' + path.relative(ROOT, rel) + '\n');
            console.log('[vendored] ' + rel + '  pins: ' + head.slice(0, 12) + '...');
        }
    }
    if (drift) process.exit(1);
    return drift;
}

main();
