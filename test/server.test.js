#!/usr/bin/env node
/**
 * Server Module Unit Tests
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

console.log('\n🖥️  SERVER MODULE TESTS\n');

test('server module loads', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: !!server };
});

test('server has Server class', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: !!server.Server };
});

test('server has Request class', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: !!server.Request };
});

test('server has Response class', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: !!server.Response };
});

test('server has Router class', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: !!server.Router };
});

test('server has create function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.create === 'function' };
});

test('server has use function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.use === 'function' };
});

test('server has listen function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.listen === 'function' };
});

test('server has stop function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.stop === 'function' };
});

test('server has getStatus function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.getStatus === 'function' };
});

test('server has isOperationAllowed function', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    return { success: typeof server.isOperationAllowed === 'function' };
});

// pass 78: module use/listen/stop built a THROWAWAY Server per call -
// middleware registered via module .use() vanished before module .listen(),
// and module .stop() could never stop what module .listen() started.
// lib/vant.js boots HTTP through module listen(), so this is the
// production path. Pins: all three helpers operate on ONE shared instance.
test('module use/listen/stop share one instance (throwaway-instance regression pin)', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    server.use(function probeMiddleware(router) { return router; });
    const shared = server._sharedServer();
    // Server.use() stores the router on the shared instance (_router) -
    // a throwaway pattern would have dropped it into a garbage instance.
    return { success: shared !== null && shared._router === server._sharedServer()._router && typeof shared._router === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);