#!/usr/bin/env node
/**
 * Rook QC issue family 168–171 — CLI contract pins (QC pass 206)
 *
 * Each pin drives the REAL CLI (fresh process, execFileSync — the same
 * interface an operator uses), asserting the exact drift each GitHub issue
 * reported is gone:  #168 sync --status, #169 config list, #170 msg verbs,
 * #171 encrypt verify.
 *
 * Run: node test/qc-cli-contracts.test.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function cli(bin, args, opts = {}) {
    // execFileSync THROWS on nonzero exit (that throwing IS the exit-status
    // assertion for pins that require failure).
    return execFileSync('node', [path.join(ROOT, 'bin', bin), ...args], {
        encoding: 'utf8', timeout: 60000, ...opts
    });
}

console.log('\n🧷 QC CLI CONTRACT PINS (issues 168–171)\n');

// ---- #171: encrypt verify ----------------------------------------------
test('#171 encrypt verify accepts a hash of the same data (was always Invalid)', () => {
    const h = cli('encrypt.js', ['hash', 'qc-171-data']).trim().split('\n').pop().split(' ')[0];
    if (!/^[0-9a-f]+:[0-9a-f]+/.test(h)) throw new Error('hash layout unexpected: ' + h.slice(0, 40));
    const out = cli('encrypt.js', ['verify', h, 'qc-171-data']);
    if (!out.includes('Valid')) throw new Error('verify rejected own hash: ' + out);
});

test('#171 encrypt verify rejects wrong data AND exits nonzero', () => {
    const h = cli('encrypt.js', ['hash', 'qc-171-data']).trim().split('\n').pop().split(' ')[0];
    try {
        const out = cli('encrypt.js', ['verify', h, 'imposter-data']);
        throw new Error('verify ACCEPTED wrong data (should exit 1): ' + out);
    } catch (e) {
        // execFileSync throws Error with status for the real failure...
        if (e.status === 1) return; // correct: refused + nonzero
        // ...and rethrows OUR synthetic error for the accept case
        if (/should exit 1/.test(e.message)) throw e;
        throw new Error('unexpected failure shape: ' + e.message);
    }
});

// ---- #169: config list --------------------------------------------------
test('#169 config list never prints [object Object]', () => {
    const out = cli('config.js', ['list']);
    if (out.includes('[object Object]')) throw new Error('list still prints [object Object]');
    if (!/\w+=[^=]/.test(out)) throw new Error('list lost key=value shape entirely');
});

test('#169 config list flattens nested keys one level (section.key=value)', () => {
    const out = cli('config.js', ['list']);
    if (!out.includes('github.repo=')) throw new Error('nested keys not flattened (github.repo missing)');
});

// ---- #170: msg verbs ----------------------------------------------------
require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({ canRead: true, canWrite: true });

test('#170 msg send actually delivers (list shows the conversation)', () => {
    const dest = 'qc-17x-' + Date.now().toString(36);
    const out = cli('msg.js', ['send', dest, 'qc pin message']);
    if (!/Sent to/.test(out)) throw new Error('send did not confirm delivery: ' + out);
    const listing = cli('msg.js', ['list']);
    if (!listing.includes(dest)) throw new Error('sent message invisible in fresh-process list: ' + listing.slice(0, 200));
});

test('#170 msg read finds a sent message by id across the fresh process', () => {
    // Send via the CLI (the send verb echoes the message id), then read by
    // that id through a fresh CLI process.
    const dest = 'qc-readback-' + Date.now().toString(36);
    const sentOut = cli('msg.js', ['send', dest, 'readback body']);
    const mid = (sentOut.match(/message (msg_\S+)/) || [])[1];
    if (!mid) throw new Error('send output lost the message id: ' + sentOut);
    const readOut = cli('msg.js', ['read', mid]);
    if (!readOut.includes('readback body')) throw new Error('read lost the body: ' + readOut);
});

test('#170 msg channels/unread never crash on null info() (clean counts)', () => {
    const ch = cli('msg.js', ['channels']);
    if (!/^Channels: \d+/.test(ch.trim())) throw new Error('channels output shape: ' + ch.slice(0, 80));
    const un = cli('msg.js', ['unread']);
    if (!/^Unread: \d+/.test(un.trim())) throw new Error('unread output shape: ' + un.slice(0, 80));
});

test('#170 channels persist — fresh process sees a sent channel message', () => {
    // write a channel through the lib, then count channels via the CLI
    execFileSync('node', ['-e', `require('./lib/sandbox').defaultSandbox.setCapabilities({canRead:true,canWrite:true});
        const msg = require('./lib/msg'); msg.send('qc-ch-' + process.env.QC_TAG, { from: 'cli', text: 'x' });`],
        { encoding: 'utf8', timeout: 60000, env: { ...process.env, QC_TAG: String(Date.now()) } });
    const ch = cli('msg.js', ['channels']);
    const n = Number((ch.match(/Channels: (\d+)/) || [])[1]);
    if (!(n >= 1)) throw new Error('fresh process sees 0 channels (channels still volatile): ' + ch);
});

// ---- #168: sync --status ------------------------------------------------
test('#168 sync --status prints real git status (was "status: not found")', () => {
    const out = cli('sync.js', ['--status']);
    if (/not found|Command failed/.test(out)) throw new Error('status output still shell-garbage: ' + out.slice(0, 120));
    if (!out.includes('On branch') && !out.includes('nothing to commit')) {
        throw new Error('status did not print git output: ' + out.slice(0, 120));
    }
});

// ---- #190 EW8: truth-in-help (auth posture named on every door) ----------
test('#190 EW8 root help names the auth posture of every network door', () => {
    const out = cli('vant.js', ['help']);
    if (!out.includes('Security posture')) throw new Error('root help lost the EW8 posture block');
    for (const key of ['server', 'mcp', 'loopback']) {
        if (!new RegExp(key).test(out)) throw new Error(`posture block missing "${key}"`);
    }
});

test('#190 EW8 server help names VANT_SERVER_AUTH_REQUIRED + VANT_API_KEY', () => {
    const out = cli('vant.js', ['server', '--help']);
    if (!out.includes('VANT_SERVER_AUTH_REQUIRED')) throw new Error('server help does not name VANT_SERVER_AUTH_REQUIRED');
    if (!out.includes('VANT_API_KEY')) throw new Error('server help does not name VANT_API_KEY');
});

test('#190 EW8 mcp help names the requireKey config + header shape', () => {
    const out = cli('mcp.js', ['--help']);
    if (!out.includes('mcp.requireKey')) throw new Error('mcp help does not name mcp.requireKey');
    if (!out.includes('X-API-Key')) throw new Error('mcp help does not show the header shape');
});

console.log(`\n=== QC CLI contract pins: ${results.passed} passed, ${results.failed} failed ===\n`);
process.exit(results.failed > 0 ? 1 : 0);
