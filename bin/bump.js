#!/usr/bin/env node
/**
 * Vant Bump - Version bump and tag release
 * Updates version in package.json and creates git tag
 *
 * Usage: vant bump [major|minor|patch]
 */

const vaf = require("../lib/vaf");

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("Usage: vant bump <major|minor|patch> [--yes]");
    console.log("  An explicit bump type plus --yes is required to apply.");
    process.exit(0);
}
/**
 * Vant Version Bump
 * Bump version and tag
 * 
 * Usage: vant bump [-h|--help] [-p|--patch|-m|--minor|-M|--major]
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("../lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');

const PACKAGE_JSON = 'package.json';
const DEFAULT_BUMP = 'patch';

/**
 * Get current version from package.json
 */
function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    return pkg.version;
}

/**
 * Parse version string
 */
function parseVersion(version) {
    const [major, minor, patch] = version.split('.');
    return { major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch) };
}

/**
 * Format version
 */
function formatVersion(v) {
    return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Bump version
 */
function bump(type = DEFAULT_BUMP) {
    vaf.check(type, {type: "string", name: "type", maxLength: 10});
    const current = getVersion();
    const v = parseVersion(current);
    
    if (type === 'major') {
        v.major++;
        v.minor = 0;
        v.patch = 0;
    } else if (type === 'minor') {
        v.minor++;
        v.patch = 0;
    } else {
        v.patch++;
    }
    
    return formatVersion(v);
}

/**
 * Update package.json
 */
function updatePackageJson(version) {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Create git tag
 */
function tag(version) {
    try {
        execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'pipe' });
        console.log(`[Bump] Created tag v${version}`);
        return true;
    } catch (e) {
        console.log(`[Bump] Tag failed: ${e.message}`);
        return false;
    }
}

/**
 * Main
 * SAFETY: bare invocation mutates nothing. A release must explicitly name
 * the bump type AND pass --yes. (Previously `node bin/bump.js` with no args
 * silently bumped the version and created a git tag - this once fired from
 * CI's binary smoke test and bumped the repo to 0.8.12.)
 */
function main() { _checkRead();
    const argv = process.argv.slice(2);
    const positional = argv.filter(a => !a.startsWith('-'));
    const bumpType = positional.find(a => ['major', 'minor', 'patch'].includes(a));
    const confirmed = argv.includes('--yes');

    if (!bumpType) {
        console.log('Usage: vant bump <major|minor|patch> [--yes]');
        console.log('  (no changes made - an explicit bump type is required)');
        return;
    }
    if (!confirmed) {
        console.log(`[Bump] Would bump version (${bumpType}). Re-run with --yes to apply.`);
        return;
    }

    const current = getVersion();
    const newVersion = bump(bumpType);

    console.log(`[Bump] ${current} → ${newVersion}`);

    // Only update if different
    if (newVersion !== current) {
        // (1b) write path gates on write capability (main() already checked read)
        _checkWrite();
        updatePackageJson(newVersion);

        const tagged = tag(newVersion);

        console.log(`\n[Bump] Version ${newVersion} set!\n`);
        console.log('Next: git push && git push --tags');
    }
}

main();