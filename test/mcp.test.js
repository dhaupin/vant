#!/usr/bin/env node
/**
 * MCP Module Unit Tests
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

console.log('\n🔌 MCP MODULE TESTS\n');

test('mcp module loads', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: !!mcp };
});

test('mcp has start function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.start === 'function' };
});

test('mcp has stop function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.stop === 'function' };
});

test('mcp has listTools function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.listTools === 'function' };
});

test('mcp has methods', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.methods === 'object' };
});

test('mcp has addMethod function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.addMethod === 'function' };
});

// ============================================
// EW1 BODY CAP PINS (#190) - live HTTP against the real door
// ============================================

async function asyncTest(name, fn) {
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

(async () => {
    console.log('\nEW1 MCP DOOR BODY-CAP TESTS\n');

    await asyncTest('oversized POST body answers 413, not OOM (EW1, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + (process.pid % 500);
        await mcp.start({ port, silent: true });
        try {
            // 2MB of junk exceeds the 1MB cap; the door must refuse early
            const junk = 'x'.repeat(2 * 1024 * 1024);
            const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: 'vant_health', args: {}, junk })
            });
            const status = res.status;
            const payload = await res.text();
            const ok = status === 413 && /too large/i.test(payload);
            return { success: ok, error: ok ? undefined : `status=${status} body=${payload.slice(0, 80)}` };
        } finally {
            await mcp.stop();
        }
    });

    await asyncTest('malformed JSON body answers 400 parse error (EW1, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + ((process.pid + 1) % 500);
        await mcp.start({ port, silent: true });
        try {
            const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{not-json'
            });
            const status = res.status;
            const payload = await res.text();
            const ok = status === 400 && /invalid json/i.test(payload);
            return { success: ok, error: ok ? undefined : `status=${status} body=${payload.slice(0, 80)}` };
        } finally {
            await mcp.stop();
        }
    });

    await asyncTest('per-client fixed-window limiter answers 429 + Retry-After beyond the budget; env=0 disables (EW4, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + ((process.pid + 2) % 500);
        process.env.VANT_MCP_RATE_LIMIT = '3'; // tiny budget so the pin trips
        await mcp.start({ port, silent: true });
        try {
            const codes = [];
            for (let i = 0; i < 5; i++) {
                const res = await fetch(`http://127.0.0.1:${port}/health`, {
                    headers: { 'x-forwarded-for': '10.0.0.77' } // same client key
                });
                codes.push({ status: res.status, retry: res.headers.get('retry-after') });
                await res.text();
            }
            const firstThreeOk = codes.slice(0, 3).every(c => c.status === 200);
            const [fourth, fifth] = codes.slice(3);
            const limited = fourth && fourth.status === 429
                && fourth.retry && parseInt(fourth.retry, 10) >= 1
                && fifth && fifth.status === 429;
            if (!(firstThreeOk && limited)) {
                return { success: false, error: 'got ' + codes.map(c => c.status).join(',') };
            }
            // Budget disabled: a fresh door (new port) with limit=0 never 429s.
            process.env.VANT_MCP_RATE_LIMIT = '0';
            const port2 = 13457 + ((process.pid + 3) % 500);
            await mcp.start({ port: port2, silent: true });
            try {
                const codes2 = [];
                for (let i = 0; i < 5; i++) {
                    const res = await fetch(`http://127.0.0.1:${port2}/health`, {
                        headers: { 'x-forwarded-for': '10.0.0.78' }
                    });
                    codes2.push(res.status);
                    await res.text();
                }
                return { success: codes2.every(s => s === 200), error: 'disabled-mode codes: ' + codes2.join(',') };
            } finally {
                await mcp.stop();
            }
        } finally {
            delete process.env.VANT_MCP_RATE_LIMIT;
            await mcp.stop();
        }
    });

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();