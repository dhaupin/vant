#!/usr/bin/env node
/**
 * audit-host-loader.js - vant's host-loader face for packstruct
 * `audit-conformance` (packstruct SPEC section 7).
 *
 * The conformance harness materializes verdict-claiming fixture packs
 * (one clean bundle, one per section-5 refusal norm, a name-collision
 * pair) into scratch roots and runs THIS command over each, with the
 * scratch root passed as the `{packs}` placeholder:
 *
 *   node scripts/audit-host-loader.js <packs-dir>
 *
 * Loader contract (SPEC section 5 / section 7):
 *   - exit 0 on a conforming bundle;
 *   - non-zero on a violation bundle, output naming the offending pack
 *     (identity matches; refusal wording stays host-owned).
 *
 * The loader we delegate to is CRASHTEST'S REAL LOADER - the engine this
 * repo's packs are actually consumed by (`crashtest` devDependency, the
 * npm consumption path; clone/CRASHTEST_DIR stays the HEAD-test
 * fallback). We hand-launch nothing: a broken manifest fails the run
 * loudly per the loader's own rule 3, and we relay the failure naming
 * the pack. This file is a face over the one engine, not a second
 * validation implementation (one truth per concern - the packstruct
 * boundary charter).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// Same locate-and-fallback shape as scripts/crashtest-run.js: npm install
// is the consumption path; a sibling clone / CRASHTEST_DIR serves HEAD tests.
function findCrashtestDir() {
    if (process.env.CRASHTEST_DIR && fs.existsSync(path.join(process.env.CRASHTEST_DIR, 'src', 'packs', 'loader.js'))) {
        return process.env.CRASHTEST_DIR;
    }
    try {
        const pkg = require.resolve('crashtest/package.json');
        const dir = path.dirname(pkg);
        if (fs.existsSync(path.join(dir, 'src', 'packs', 'loader.js'))) return dir;
    } catch (_e) { /* fall through */ }
    return path.resolve(__dirname, '..', 'node_modules', 'crashtest');
}

async function main() {
    const packsRoot = process.argv[2];
    if (!packsRoot) {
        console.error('usage: node scripts/audit-host-loader.js <packs-dir>');
        process.exit(2);
    }
    if (!fs.existsSync(packsRoot)) {
        console.error(`packs dir not found: ${packsRoot}`);
        process.exit(2);
    }

    const CT_DIR = findCrashtestDir();
    const loaderHref = pathToFileURL(path.join(CT_DIR, 'src', 'packs', 'loader.js')).href;
    const packsMod = await import(loaderHref).catch((e) => {
        console.error(`engine import failed (${CT_DIR}): ${e.message}`);
        process.exit(2);
    });

    // loadPacks scans <root>/public/ + <root>/local/ under each root passed;
    // fixture bundles are laid out as <bundle>/public/<name>/ by the
    // materializer, so the bundle dir IS the packs root. `seen` is fresh on
    // every invocation - one bundle, one run, no shared state.
    const seen = new Map();
    let loaded;
    try {
        loaded = await packsMod.loadPacks([packsRoot], seen);
    } catch (err) {
        // Rule 3 loud manifest failure. The error message carries the pack
        // origin (e.g. "pack manifest at <dir>/unlisted/pack.json: ..."),
        // which is the offending-pack identity SPEC section 7 wants named.
        console.error(`host-loader REFUSED: ${err.message}`);
        process.exit(1);
    }

    // Load is the whole verdict: loadPacks both validates each manifest
    // (loud failures per the loader's own rule 3) AND imports/censuses the
    // entries, so the face adds no second validation - one truth per
    // concern. The contract shape is the engine's call, not the face's.

    console.log(`host-loader OK: ${loaded.length} pack(s) loaded from ${packsRoot} (${[...seen.keys()].length} named)`);
    process.exit(0);
}

main().catch((e) => {
    console.error(`host-loader fault: ${e.name}: ${e.message}`);
    process.exit(1);
});
