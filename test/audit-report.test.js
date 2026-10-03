#!/usr/bin/env node
/**
 * Audit Report Generator Tests (pass 24)
 *
 * Two contracts are pinned here:
 *
 * 1. lib/audit-report.js generates the AUDIT.md report (extracted from
 *    bin/audit.js) — pure functions, install-tree-anchored reads, opts.root
 *    override for isolation.
 *
 * 2. lib/audit.js is STILL the shared audit/logger module. The first
 *    extraction attempt overwrote it with the report generator, which would
 *    have broken ~30 require('./audit') callers (branch, lock, boot, server,
 *    sync, ...) at runtime while tests stayed green. The negative assertion
 *    at the bottom makes that clobber a test failure, not a silent break.
 *
 * Run: node test/audit-report.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: (r && r.error) || 'assertion failed' });
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n📊 AUDIT REPORT GENERATOR TESTS\n');

const report = require(path.join(ROOT, 'lib', 'audit-report'));

// ============================================
// MODULE SHAPE
// ============================================

test('exports generateAuditReport function', () => {
    return { success: typeof report.generateAuditReport === 'function' };
});

test('exports gatherAuditData / buildReport / countTryCatch', () => {
    return {
        success: typeof report.gatherAuditData === 'function'
            && typeof report.buildReport === 'function'
            && typeof report.countTryCatch === 'function'
    };
});

// ============================================
// REPORT GENERATION (REAL INSTALL TREE)
// ============================================

test('generateAuditReport returns { report, data, date }', () => {
    const out = report.generateAuditReport();
    return {
        success: out && typeof out.report === 'string'
            && out.report.length > 0
            && typeof out.data === 'object'
            && typeof out.date === 'string'
    };
});

test('report contains the standard markdown header + version', () => {
    const { report: md } = report.generateAuditReport();
    const version = require(path.join(ROOT, 'lib', 'version'));
    return {
        success: md.includes('# VANT CODE AUDIT REPORT')
            && md.includes('**Version:** ' + version)
            && md.includes('| Core Modules |')
    };
});

test('data census counts real lib/ and bin/ files', () => {
    const { data } = report.generateAuditReport();
    const expectedLibs = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js')).length;
    const expectedBins = fs.readdirSync(path.join(ROOT, 'bin')).filter(f => f.endsWith('.js')).length;
    return {
        success: Array.isArray(data.libs) && data.libs.length === expectedLibs
            && data.libs.includes('audit') && data.libs.includes('audit-report')
            && data.bins.length === expectedBins
    };
});

test('date override is respected', () => {
    const { date } = report.generateAuditReport({ date: '2001-01-01' });
    return { success: date === '2001-01-01' };
});

// ============================================
// ISOLATED TREE (opts.root)
// ============================================

test('opts.root audits THAT tree, not the install tree', () => {
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-audit-root-'));
    try {
        fs.mkdirSync(path.join(fake, 'lib'));
        fs.mkdirSync(path.join(fake, 'bin'));
        fs.writeFileSync(path.join(fake, 'lib', 'solo.js'), 'try { x(); } catch (e) {}\n');
        fs.writeFileSync(path.join(fake, 'bin', 'tool.js'), '#!/usr/bin/env node\n');
        fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({
            name: 'fake-vant', version: '9.9.9',
            dependencies: { chalk: '^4.1.2' },
            repository: 'git+https://github.com/example/fake.git'
        }));

        const out = report.generateAuditReport({ root: fake });
        const ok = out.data.libs.length === 1
            && out.data.libs[0] === 'solo'
            && out.data.bins.length === 1
            && out.data.deps.length === 1
            && out.data.tryCatch === 1
            && out.data.repoUrl === 'https://github.com/example/fake'
            && out.report.includes('| Core Modules | 1 |');
        return { success: ok };
    } finally {
        try { fs.rmSync(fake, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

test('countTryCatch: missing dir returns 0 (no throw)', () => {
    return { success: report.countTryCatch(os.tmpdir(), 'definitely-not-here-xyz') === 0 };
});

// ============================================
// THE CLOBBER GUARD (the reason this file exists)
// ============================================

test('lib/audit.js is STILL the shared logger (30+ callers depend on it)', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const missing = ['log', 'info', 'warn', 'error', 'getLedger', 'getLayerStatus']
        .filter(k => typeof audit[k] !== 'function');
    if (missing.length > 0) {
        return { error: 'lib/audit.js lost logger exports: ' + missing.join(', ') };
    }
    return { success: true };
});

test('lib/audit.js does NOT export the report generator (module separation)', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    if (typeof audit.generateAuditReport === 'function') {
        return { error: 'report generator leaked into lib/audit.js — the logger was clobbered again' };
    }
    return { success: true };
});

// ============================================
// SUMMARY
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
process.exit(results.failed > 0 ? 1 : 0);
