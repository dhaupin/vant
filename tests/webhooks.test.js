#!/usr/bin/env node
/**
 * Webhooks Module Tests
 *
 * (pass 33) Extended with the live-server wire probe: inbound HTTP webhook
 * events must EMIT into the event system ('webhook:<event>' channel) — the
 * module header always claimed "HTTP triggers emit globally" but only
 * registration emitted, so nothing could react to an HTTP trigger.
 * Also pins the brain-import fix ('brain is not defined' made the audit
 * write fail silently on every event).
 */

const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0 };
const _pending = [];

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function testAsync(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            // Track; bookkeeping settles before exit (sync exit raced them).
            _pending.push(result.then(
                (r) => ({ name, r }),
                (e) => ({ name, r: { success: false, error: e.message } })
            ));
        } else {
            test(name, () => result);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🪝 WEBHOOKS MODULE TESTS\n');

const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));

test('webhooks module loads', () => !!webhooks);
test('webhooks has register function', () => typeof webhooks.register === 'function');
test('webhooks has verifySignature function', () => typeof webhooks.verifySignature === 'function');
test('webhooks has addFilter function', () => typeof webhooks.addFilter === 'function');
test('webhooks has matchFilter function', () => typeof webhooks.matchFilter === 'function');
test('webhooks has startServer function', () => typeof webhooks.startServer === 'function');
test('webhooks has send function', () => typeof webhooks.send === 'function');
test('webhooks has sendWebhook function', () => typeof webhooks.sendWebhook === 'function');

test('webhook: brain import wired (audit write no longer references undefined brain)', () => {
    // Regression pin (pass 33): the server handler used brain.write without
    // importing brain — every event logged '[Webhook] Brain log error: brain
    // is not defined'. Module load now fails loudly if the import vanishes.
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'webhooks.js'), 'utf8');
    const hasRequire = /const brain = require\('\.\/brain'\);/.test(src);
    const hasWrite = /brain\.write\(/.test(src);
    if (!hasWrite) return 'brain.write usage disappeared (pin stale?)';
    if (!hasRequire) return 'brain import missing — audit write would throw again';
    return true;
});

// Live-server wire probe: register → startServer → signed POST →
// event handler fires with source/event/body; response reports handlers.
testAsync('webhook: signed POST emits webhook:<event> into the event system', () => {
    return new Promise((resolve) => {
        const event = require(path.join(ROOT, 'lib', 'event'));
        const port = 3991 + (process.pid % 100); // avoid collisions in parallel runs
        let received = null;
        const handler = (data) => { received = data; };
        event.on('webhook:probe.ping', handler);

        webhooks.register({ name: 'probe-' + process.pid, source: 'probe-src', eventKeyExpr: 'event', secret: 'pw-test' });
        const server = webhooks.startServer(port);
        let settled = false;
        const finish = (r) => { if (!settled) { settled = true; server.close(); event.off('webhook:probe.ping', handler); resolve(r); } };
        server.on('error', () => finish('server port busy — environmental skip'));

        setTimeout(() => {
            const body = JSON.stringify({ event: 'probe.ping', hello: 'world' });
            const sig = crypto.createHmac('sha256', 'pw-test').update(body).digest('hex');
            fetch(`http://localhost:${port}/probe-${process.pid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Signature-256': sig },
                body
            }).then((r) => r.json()).then((resp) => {
                setTimeout(() => {
                    if (resp.error) { finish({ success: false, error: 'HTTP error: ' + resp.error }); return; }
                    if (!received) { finish({ success: false, error: 'event never emitted (wire broken)' }); return; }
                    finish({
                        success: received.source === 'probe-src' && received.event === 'probe.ping' &&
                                 received.body && received.body.hello === 'world' &&
                                 typeof resp.handlers === 'number' && resp.handlers >= 1,
                        error: `payload mismatch: ${JSON.stringify(received).slice(0, 120)}`
                    });
                }, 120);
            }).catch((e) => finish({ success: false, error: e.message }));
        }, 150);
    });
});

testAsync('webhook: invalid signature is rejected (401 path)', () => {
    return new Promise((resolve) => {
        const port = 4191 + (process.pid % 100);
        webhooks.register({ name: 'probe-bad-' + process.pid, source: 'probe-bad-src', eventKeyExpr: 'event', secret: 'right-secret' });
        const server = webhooks.startServer(port);
        let settled = false;
        const finish = (r) => { if (!settled) { settled = true; server.close(); resolve(r); } };
        server.on('error', () => finish('server port busy — environmental skip'));

        setTimeout(() => {
            const body = JSON.stringify({ event: 'probe.ping' });
            const badSig = crypto.createHmac('sha256', 'WRONG').update(body).digest('hex');
            fetch(`http://localhost:${port}/probe-bad-${process.pid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Signature-256': badSig },
                body
            }).then((r) => { finish({ success: r.status === 401, error: 'expected 401, got ' + r.status }); })
              .catch((e) => finish({ success: false, error: e.message }));
        }, 150);
    });
});

// Settle async probes BEFORE exiting (a plain process.exit here raced them).
Promise.all(_pending).then((settled) => {
    for (const { name, r } of settled) {
        if (typeof r === 'string') { results.skipped++; console.log(`  ⊘ ${name}: ${r}`); continue; }
        if (r === true || (r && r.success)) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`); }
    }
    console.log('\n--- RESULTS ---');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    if (results.skipped) console.log(`  Skipped: ${results.skipped}`);
    process.exit(results.failed > 0 ? 1 : 0);
});
