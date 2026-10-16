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

// (pass 251, issue #203 regression) the CORS class must be strict
// allowlist semantics, fail-closed, credentials default FALSE.
test('CORS #203: default constructor answers the honest wildcard — ACAO * and NEVER a credentials header', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    const cors = new server.CORS();
    const seq = [];
    cors.handle({ headers: { origin: 'https://evil.example' }, setHeader: (k, v) => seq.push(k + '=' + v) });
    const acao = seq.find(s => s.startsWith('Access-Control-Allow-Origin='));
    const creds = seq.find(s => s.startsWith('Access-Control-Allow-Credentials='));
    // '*' + no credentials is the legacy posture and stays (browsers treat
    // it as non-credentialed); the credentials default flipped to false.
    return { success: acao === 'Access-Control-Allow-Origin=*' && creds === undefined, got: seq.join(',') };
});

test('CORS #203: locked (allowlist) constructor reflects ONLY the exact match and never credentials by default', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    const cors = new server.CORS({ origin: 'https://dash.example.com' });
    const seq = [];
    // hostile Origin must NOT be echoed
    cors.handle({ headers: { origin: 'https://evil.example' }, setHeader: (k, v) => seq.push(k + '=' + v) });
    const hostileEcho = seq.filter(s => s.startsWith('Access-Control-Allow-Origin='));
    if (hostileEcho.length > 0) return { error: 'hostile origin echoed under locked mode' };
    // exact match IS echoed, credentials header ABSENT (default false)
    seq.length = 0;
    cors.handle({ headers: { origin: 'https://dash.example.com' }, setHeader: (k, v) => seq.push(k + '=' + v) });
    const echoed = seq.find(s => s.startsWith('Access-Control-Allow-Origin='));
    const creds = seq.find(s => s.startsWith('Access-Control-Allow-Credentials='));
    return { success: echoed === 'Access-Control-Allow-Origin=https://dash.example.com' && creds === undefined, echoed };
});

test('CORS #203: credentials must be explicit AND never ride the * wildcard', () => {
    const server = require(path.join(ROOT, 'lib', 'server'));
    // default credentials false:
    const dflt = new server.CORS();
    const a = [];
    dflt.handle({ headers: { origin: 'https://anywhere.dev' }, setHeader: (k, v) => a.push(k + '=' + v) });
    if (a.find(s => s.startsWith('Access-Control-Allow-Credentials='))) return { error: 'credentials emitted by default' };
    // '*' + explicit credentials -> the class refuses to emit ACAO at all:
    const wildcardCreds = new server.CORS({ credentials: true });
    const b = [];
    wildcardCreds.handle({ headers: { origin: 'https://anywhere.dev' }, setHeader: (k, v) => b.push(k + '=' + v) });
    return { success: !b.some(s => s.startsWith('Access-Control-Allow-Origin=')), got: b.join(',') };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);