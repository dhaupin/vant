#!/usr/bin/env node
/**
 * Version Module Unit Tests
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🏷️  VERSION MODULE TESTS\n');

test('version module loads', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: !!version };
});

test('version is string like', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: typeof version === 'string' || typeof version === 'number' };
});

test('version has length or is string', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: typeof version === 'string' && version.length > 0 };
});

// (wave 15, #270) VERSION-TRUTH RULING: package.json is THE single
// version truth. Living surfaces may DERIVE it but may never hand-copy
// a stale copy of it: the Docker ARG VERSION, the compose VANT_VERSION,
// and any root "Status:"/badge pin. Dated era rows (CHANGELOG, wave
// ledgers, pass journals), range pins, and self-contained web components
// (vant-home etc. carry their OWN versions) are lawful, not scanned.
// Built fixture-first (docs-truthfulness pin lesson): the same checker
// must FAIL a throwaway tree with a drifted claim and PASS a clean one.
function readCurrent(base) {
    return JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).version;
}

function checkVersionTruth(base) {
    const drifts = [];
    const current = readCurrent(base);
    const claimFile = (rel) => {
        const p = path.join(base, rel);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    // 1) docker ARG VERSION
    const docker = claimFile('Dockerfile');
    if (docker) {
        const m = docker.match(/^ARG\s+VERSION=(\S+)/m);
        if (m && m[1] !== current) drifts.push(`Dockerfile ARG VERSION=${m[1]} (package.json says ${current}) - set it to ${current} or delete the hand-copy`);
    }
    // 2) compose VANT_VERSION
    const compose = claimFile('docker-compose.yml');
    if (compose) {
        const m = compose.match(/VANT_VERSION=(\S+)/);
        if (m && m[1] !== current) drifts.push(`docker-compose.yml VANT_VERSION=${m[1]} - set it to ${current} or delete the hand-copy`);
    }
    // 3) openapi info.version (only refusal if the field exists)
    const openapi = claimFile('openapi.yaml');
    if (openapi) {
        const m = openapi.match(/^\s*version:\s*['"]?([\w.\-]+)/m);
        if (m && m[1] !== current) drifts.push(`openapi.yaml info.version=${m[1]} - set it to ${current}`);
    }
    // 4) root living surfaces: a hard "Status:" claim or a shield badge pin
    for (const rel of ['README.md', 'AGENTS.md', 'CLAUDE.md']) {
        const txt = claimFile(rel);
        if (!txt) continue;
        const m = txt.match(/^.*(?:Status:|shields\.io\/badge\/(?:version|npm)-)[^0-9]*v?(\d+\.\d+\.\d+).*$/m);
        if (m && m[1] !== current) drifts.push(`${rel} pins v${m[1]} on a living surface - drop the number or pin ${current}`);
    }
    return { ok: drifts.length === 0, drifts, current };
}

console.log('\nVERSION-TRUTH LEG (#270)\n');

test('single truth: package.json and lib/version agree', () => {
    const pkg = readCurrent(ROOT);
    const lib = String(require(path.join(ROOT, 'lib', 'version')));
    return { success: pkg === lib, pkg, lib };
});

test('living version claims derive from package.json (Dockerfile ARG, compose env, openapi, root status/badge pins)', () => {
    const r = checkVersionTruth(ROOT);
    if (r.ok) return { success: true, current: r.current };
    return { success: false, error: r.drifts.join('; ') };
});

test('negative control: a drifted claim FAILS the leg (throwaway tree)', () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-version-truth-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '9.9.9' }));
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'ARG VERSION=9.9.8\n');
    fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services:\n  vant:\n    environment:\n      - VANT_VERSION=9.9.7\n');
    fs.writeFileSync(path.join(dir, 'README.md'), '# x\n\nStatus: **9.9.6, locked**\n');
    const r = checkVersionTruth(dir);
    const caught = !r.ok && r.drifts.length === 3;
    fs.rmSync(dir, { recursive: true, force: true });
    return { success: caught, drifts: r.drifts };
});

test('negative control: a clean throwaway tree PASSES the leg', () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-version-truth-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '9.9.9' }));
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'ARG VERSION=9.9.9\n');
    fs.writeFileSync(path.join(dir, 'README.md'), 'era rows mention 9.9.8 and ^1.x stays lawful');
    const r = checkVersionTruth(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    return { success: r.ok, drifts: r.drifts };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);