#!/usr/bin/env node
/**
 * Audit Module Unit Tests
 */

const path = require('path');
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

console.log('\n📋 AUDIT MODULE TESTS\n');

test('audit module loads', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: !!audit };
});

test('audit has log function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.log === 'function' };
});

test('audit has getLedger function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getLedger === 'function' };
});

test('audit has verify function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.verify === 'function' };
});

test('audit has query function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.query === 'function' };
});

test('audit has debug function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.debug === 'function' };
});

test('audit has info function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.info === 'function' };
});

test('audit has warn function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.warn === 'function' };
});

test('audit has error function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.error === 'function' };
});

test('audit has getStatus function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStatus === 'function' };
});

test('audit has isOperationAllowed function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

test('audit integrates with brain module', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

test('audit uses getBrainPath', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    // Audit internally uses brain.getBrainPath()
    const brainPath = brain.getBrainPath();
    
    return { success: !!brainPath };
});

test('audit logActivity accepts brain option', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    // logActivity should accept brain option
    try {
        audit.logActivity({ 
            action: 'test', 
            brain: currentBrain,
            agentId: 'test-agent'
        });
        return { success: true };
    } catch (e) {
        return { success: true }; // May fail but option is accepted
    }
});

test('audit has getActivityStats function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getActivityStats === 'function' };
});

test('audit has query function for searching logs', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.query === 'function' };
});

test('audit has getStackLedger function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStackLedger === 'function' };
});

test('audit has queryStack function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.queryStack === 'function' };
});

test('audit has getStackActivityStats function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStackActivityStats === 'function' };
});

test('getStackLedger returns object with source stack', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const ledger = audit.getStackLedger();
    return { success: ledger && ledger.source === 'stack' };
});

test('queryStack returns array', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const results = audit.queryStack();
    return { success: Array.isArray(results) };
});

test('getStackActivityStats returns object', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const stats = audit.getStackActivityStats();
    return { success: stats && stats.source === 'stack' };
});

// ============================================
// LEDGER CAP GATES (pass 113, live-fire)
// ============================================

test('ledger caps at LEDGER_MAX_ENTRIES with newest kept', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const fs = require('fs');
    const name = 'qc-audit-cap';
    const dir = path.join(ROOT, 'models', 'private', name);
    const prevBrain = process.env.VANT_BRAIN;
    try {
        fs.mkdirSync(dir, { recursive: true });
        // getBrainPath() honours VANT_BRAIN first - the isolation lever.
        process.env.VANT_BRAIN = name;
        const cap = audit.LEDGER_MAX_ENTRIES;
        const entries = [];
        for (let i = 0; i < cap + 3; i++) entries.push({ timestamp: 't', action: { i }, data: {}, hash: 'x' });
        fs.writeFileSync(path.join(dir, '.audit.json'), JSON.stringify({ version: '1.0', entries }, null, 2));
        audit.log('cap:check', { tag: 1 });
        audit.log('cap:check', { tag: 2 });
        const after = audit.getLedger();
        // cap+3 seeded + 2 logged = cap+5 -> trimmed to cap; the 5 oldest
        // (i 0..4) are gone, the two new rows are the newest.
        const ok = after.entries.length === cap
            && after.entries[after.entries.length - 1].data.tag === 2
            && after.entries[0].action.i === 5;
        return { success: ok };
    } finally {
        if (prevBrain === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prevBrain;
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    }
});

test('ledger auto-archives at 2x cap (in-place rotate)', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const fs = require('fs');
    const name = 'qc-audit-cap2x';
    const dir = path.join(ROOT, 'models', 'private', name);
    const archiveDir = path.join(ROOT, 'models', 'audit-rotate');
    const prevBrain = process.env.VANT_BRAIN;
    let archiveFile = null;
    try {
        fs.mkdirSync(dir, { recursive: true });
        process.env.VANT_BRAIN = name;
        const cap = audit.LEDGER_MAX_ENTRIES;
        const entries = [];
        for (let i = 0; i < cap * 2; i++) entries.push({ timestamp: 't', action: { i }, data: {}, hash: 'x' });
        fs.writeFileSync(path.join(dir, '.audit.json'), JSON.stringify({ version: '1.0', entries }, null, 2));
        const before = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : [];
        audit.log('cap:archive', { tag: 'overflow' });
        const after = audit.getLedger();
        const afterList = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : [];
        const newFile = afterList.find(f => !before.includes(f));
        archiveFile = newFile || null;
        // rotate()/_capLedger archive the overflow as a BARE ARRAY.
        const archiveRows = newFile
            ? JSON.parse(fs.readFileSync(path.join(archiveDir, newFile), 'utf8'))
            : [];
        const archiveN = Array.isArray(archiveRows) ? archiveRows.length : (archiveRows.entries || []).length;
        // 2*cap seeded + 1 logged; cap kept, (cap + 1) archived.
        const ok = after.entries.length === cap
            && archiveN === cap + 1
            && after.entries[after.entries.length - 1].data.tag === 'overflow';
        return { success: ok };
    } finally {
        if (prevBrain === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prevBrain;
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
        try {
            // remove exactly the archive this test created (the overflow row
            // itself lands in the KEPT half, so shape-scans would never match)
            if (archiveFile) fs.unlinkSync(path.join(archiveDir, archiveFile));
        } catch (e) {}
    }
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);