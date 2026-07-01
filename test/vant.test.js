#!/usr/bin/env node
/**
 * Vant Module Unit Tests
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

console.log('\n🧠 VANT MODULE TESTS\n');

test('vant module loads', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant };
});

test('vant has init function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.init === 'function' };
});

test('vant has think function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.think === 'function' };
});

test('vant has learn function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.learn === 'function' };
});

test('vant has remember function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.remember === 'function' };
});

test('vant has act function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.act === 'function' };
});

test('vant has getState function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getState === 'function' };
});

test('vant has getStatus function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getStatus === 'function' };
});

test('vant has Runtime class', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant.Runtime };
});

test('vant has storage module', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant.storage };
});

test('vant has getTools function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getTools === 'function' };
});

test('vant has executeTool function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.executeTool === 'function' };
});

test('vant has isOperationAllowed function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.isOperationAllowed === 'function' };
});

// TTL Tests (run separately with: node test/vant.test.js)
const vant = require(path.join(ROOT, 'lib', 'vant'));

if (require.main === module) {
    (async () => {
        await vant.init({ debug: false });
        
        console.log('\n🔐 TTL TESTS\n');
        
        const tests = [
            ['remember stores with TTL', async () => {
                const r = await vant.remember('ttl_test', 'test content');
                return r.success && r.ttl > 0;
            }],
            ['learn stores with TTL', async () => {
                const r = await vant.learn('ttl_test_learn', 'test content');
                return r.success && r.ttl > 0;
            }],
            ['TTL min bound (1ms -> 1min)', async () => {
                const r = await vant.remember('ttl_min', 'test', { ttl: 1 });
                return r.ttl === 60000;
            }],
            ['TTL max bound (huge -> 100 years)', async () => {
                const r = await vant.remember('ttl_max', 'test', { ttl: 999999999999999 });
                return r.ttl === 315360000000;
            }],
            ['TTL negative clamped to min', async () => {
                const r = await vant.remember('ttl_neg', 'test', { ttl: -100 });
                return r.ttl === 60000;
            }],
            ['TTL config override works', async () => {
                vant.config().set('memory.ttl', 3600000);
                const r = await vant.remember('ttl_config', 'test');
                vant.config().set('memory.ttl', null);
                return r.ttl === 3600000;
            }],
            ['expiresAt converts to TTL', async () => {
                const future = new Date(Date.now() + 300000);
                const r = await vant.remember('ttl_expires', 'test', { expiresAt: future });
                return r.ttl >= 290000 && r.ttl <= 310000;
            }]
        ];
        
        let passed = 0, failed = 0;
        for (const [name, fn] of tests) {
            try {
                const ok = await fn();
                if (ok) { passed++; console.log(`  ✓ ${name}`); }
                else { failed++; console.log(`  ✗ ${name}`); }
            } catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
        }
        
        console.log('\n--- RESULTS ---\n');
        console.log(`  Passed:  ${passed}`);
        console.log(`  Failed:  ${failed}`);
        process.exit(failed > 0 ? 1 : 0);
    })();
} else {
    console.log('\n⚠️  Run TTL tests with: node test/vant.test.js');
    process.exit(0);
}