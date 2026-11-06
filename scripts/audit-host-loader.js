#!/usr/bin/env node
/**
 * audit-host-loader.js - vant's host-loader face for packstruct
 * `audit-conformance` (packstruct SPEC section 7).
 *
 * The conformance harness materializes verdict-claiming fixture packs
 * (one clean bundle, one per section-5 refusal norm, a name-collision
 * pair, and an env-claims bundle) into scratch roots and runs THIS
 * command over each, with the scratch root passed as the `{packs}`
 * placeholder:
 *
 *   node scripts/audit-host-loader.js <packs-dir>
 *
 * Loader contract (SPEC section 5 / section 7):
 *   - exit 0 on a conforming bundle;
 *   - non-zero on a violation bundle, output naming the offending pack
 *     (identity matches; refusal wording stays host-owned).
 *
 * The bundle is loaded under the HOST (packstruct) profile: the manifest
 * contract stays fully enforced and the scenario-shape check is deferred to
 * the host's run-time validation (crashtest's `validateProfile: false`, issue
 * #33). The face adds no second validator - one truth per concern.
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

function collectPackDirs(root) {
    if (fs.existsSync(path.join(root, 'pack.json'))) return [root];
    const dirs = [];
    for (const visibility of ['public', 'local']) {
        const dir = path.join(root, visibility);
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_e) {
            continue; // optional visibility dir
        }
        for (const ent of entries) {
            if (ent.isDirectory()) dirs.push(path.join(dir, ent.name));
        }
    }
    return dirs.length ? dirs : [root];
}

// Load a conformance bundle under the HOST (packstruct) profile: the manifest
// contract stays fully enforced, the scenario-shape check is deferred to the
// host's run-time validation. crashtest names this the `validateProfile:
// false` host path (issue #33); we hand the ENGINE's own loader that option
// and add no second validator.
//
// The honest shape is the ROOT scan. crashtest 1.3.0's root scan drops the
// flag (only the one-pack-dir path forwards it; fixed on crashtest main but
// unreleased at this pin), so a profile-minimal accept fixture throws there.
// On that pin we fall back to enumerating the bundle's pack dirs and taking
// the one-pack path per dir. The fallback only turns a throw into a success
// when the enumeration itself succeeds, and a MANIFEST refusal throws on BOTH
// paths - so a refusal bundle still exits non-zero. A fresh `seen` map keeps a
// partial first attempt from leaking collision state into the retry.
async function loadWithHostProfile(packsMod, packsRoot) {
    try {
        return await packsMod.loadPacks([packsRoot], new Map(), null, { validateProfile: false });
    } catch (rootErr) {
        const packDirs = collectPackDirs(packsRoot);
        if (packDirs.length === 1 && packDirs[0] === packsRoot) throw rootErr;
        return packsMod.loadPacks(packDirs, new Map(), null, { validateProfile: false });
    }
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
    // materializer, so the bundle dir IS the packs root. Fresh `seen` maps on
    // every invocation - one bundle, one run, no shared state.
    let loaded;
    try {
        // (packstruct SPEC section 7) this face carries the packstruct
        // profile, not crashtest's scenario profile: the manifest contract
        // stays fully enforced, and the scenario-shape check is deferred to
        // the host's own run-time validation - crashtest's `validateProfile:
        // false` host path (issue #33). The helper tries the honest ROOT scan
        // first and only falls back to per-dir enumeration on the 1.3.0 pin,
        // whose root scan drops the flag.
        loaded = await loadWithHostProfile(packsMod, packsRoot);
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

    console.log(`host-loader OK: ${loaded.length} pack(s) loaded from ${packsRoot}`);
    process.exit(0);
}

main().catch((e) => {
    console.error(`host-loader fault: ${e.name}: ${e.message}`);
    process.exit(1);
});
