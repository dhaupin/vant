#!/usr/bin/env node
/**
 * Vant Version Bump
 * Bump version and tag
 * 
 * Usage: vant bump [patch|minor|major]
 */

const { execSync } = require('child_process');
const fs = require('fs');
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
 */
function main() {
    const args = process.argv.slice(3);
    const bumpType = args[0] || DEFAULT_BUMP;
    
    const current = getVersion();
    const newVersion = bump(bumpType);
    
    console.log(`[Bump] ${current} → ${newVersion}`);
    
    // Only update if different
    if (newVersion !== current) {
        updatePackageJson(newVersion);
        
        const tagged = tag(newVersion);
        
        console.log(`\n[Bump] Version ${newVersion} set!\n`);
        console.log('Next: git push && git push --tags');
    }
}

main();