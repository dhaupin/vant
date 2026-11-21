#!/usr/bin/env node
/**
 * Network Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
const _asyncTests = [];

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

async function _asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const { name, fn } of _asyncTests) {
        try {
            const result = await fn();
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
}

console.log('\n🌐 NETWORK MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('network module loads', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: !!network };
});

test('network has isOnline function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.isOnline === 'function' };
});

test('network has checkOnline function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.checkOnline === 'function' };
});

test('network has getLatency function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.getLatency === 'function' };
});

test('network has measureLatency function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.measureLatency === 'function' };
});

test('network has retry function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.retry === 'function' };
});

test('network has fetch function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.fetch === 'function' };
});

test('network has fetchJson function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.fetchJson === 'function' };
});

test('network has getStatus function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.getStatus === 'function' };
});

test('network has isOperationAllowed function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.isOperationAllowed === 'function' };
});

test('network has getLayerStatus function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.getLayerStatus === 'function' };
});

test('network has getCircuitStatus function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.getCircuitStatus === 'function' };
});

test('network has isDomainAllowed function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.isDomainAllowed === 'function' };
});

test('network has setAllowedDomains function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.setAllowedDomains === 'function' };
});

test('network has healthCheck function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.healthCheck === 'function' };
});

test('network has clear function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.clear === 'function' };
});

// ============================================
// STATUS
// ============================================

test('getStatus returns object', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    const status = network.getStatus();
    return { success: typeof status === 'object' };
});

test('isOperationAllowed returns object', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    const result = network.isOperationAllowed('read');
    return { success: typeof result === 'object' };
});

test('getLayerStatus returns object', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    const status = network.getLayerStatus();
    return { success: typeof status === 'object' };
});

// ============================================
// DOMAINS
// ============================================

test('isDomainAllowed works for string', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    const allowed = network.isDomainAllowed('google.com');
    return { success: typeof allowed === 'boolean' };
});

// ============================================
// ALLOWLIST / DNS REBINDING
// ============================================

_asyncTest('allowlisted host skips DNS rebinding refusal', async () => {
    const dns = require('dns');
    const http = require('http');
    const network = require(path.join(ROOT, 'lib', 'network'));
    const real4 = dns.resolve4;
    const real6 = dns.resolve6;
    const previous = network.getAllowedDomains();
    const server = http.createServer((req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    // CI's resolver answers a literal loopback lookup with 127.0.0.1; the
    // local resolver usually returns ENOTFOUND. Pin the CI shape so this
    // regression is reproducible on every machine.
    dns.resolve4 = (hostname, cb) => cb(null, ['127.0.0.1']);
    dns.resolve6 = (hostname, cb) => cb(null, []);
    network.setAllowedDomains(['127.0.0.1']);
    try {
        const body = await network.fetch(`http://127.0.0.1:${port}/`, {
            system: true, cache: false, circuit: false
        });
        return { success: body === 'ok' };
    } finally {
        dns.resolve4 = real4;
        dns.resolve6 = real6;
        network.setAllowedDomains(previous);
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
});

// ============================================
// SUMMARY
// ============================================

async function _printResults() {
    await _runAsyncTests();
    
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

    process.exit(results.failed > 0 ? 1 : 0);
}

// Stack tests
test('network has getStackNetworkStatus function', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    return { success: typeof network.getStackNetworkStatus === 'function' };
});

test('getStackNetworkStatus returns object with source stack', () => {
    const network = require(path.join(ROOT, 'lib', 'network'));
    const result = network.getStackNetworkStatus();
    return { success: result && result.source === 'stack' };
});

_printResults();