#!/usr/bin/env node
/**
 * Backbone wiring pins (pass 169).
 *
 * Pins the four-quadrant unification:
 *   ERRORS  — previously-raw modules throw VantError with codes
 *             (NOT_IMPLEMENTED for capability-refusal stubs)
 *   EVENTS  — silent modules now emit lifecycle events on the shared bus
 *             (state-store, wal, sidecar, lock, genesis, migrations, metrics,
 *             horcrux-safe, habitat)
 *   AUDIT   — protocol-state mutations land in the ledger via the
 *             state-store choke point; external I/O audits at the connector
 *   WAL     — state-store opts into the write-ahead journal (protocol state
 *             is journaled by default, no env flag needed)
 *
 * Exit code is the verdict, per house test conventions.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const errors = require('../lib/error');
const events = require('../lib/event');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, detail) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }

async function main() {
    // ============ QUADRANT 1: ERRORS ============
    {
        const pc = require('../lib/connectors/pinecone.js');
        const inst = new pc.VectorConnector({});
        const err = await inst.connect().then(() => null, e => e);
        if (err instanceof errors.VantError && err.code === 'NOT_IMPLEMENTED') {
            ok('errors: pinecone stub throws VantError NOT_IMPLEMENTED');
        } else fail('errors: pinecone stub', err && (err.code || err.message));

        const sh = require('../lib/connectors/selfhosted.js');
        const shErr = await new sh.SelfHostedProvider({}).getIssue('x').then(() => null, e => e);
        if (shErr && shErr.code === 'NOT_IMPLEMENTED') {
            ok('errors: selfhosted unsupported op throws NOT_IMPLEMENTED');
        } else fail('errors: selfhosted stub', shErr && shErr.code);

        const agora = require('../lib/agora-sync');
        const busErr = (() => { try { agora.install(null); return null; } catch (e) { return e; } })();
        if (busErr instanceof errors.VantError && busErr.code === 'INPUT_VALIDATION_FAILED') {
            ok('errors: agora-sync bus-required throws INPUT_VALIDATION_FAILED');
        } else fail('errors: agora-sync bus-required', busErr && busErr.code);

        const qc = require('../lib/geometry/quasicrystal');
        const bcErr = (() => { try { qc.getStorageKey('not-a-barcode!!'); return null; } catch (e) { return e; } })();
        if (bcErr && bcErr.code === 'VAF_INPUT_INVALID') {
            ok('errors: quasicrystal invalid barcode throws VAF_INPUT_INVALID');
        } else fail('errors: quasicrystal barcode', bcErr && bcErr.code);

        // every VantError still instanceof Error (behavior compatibility)
        if (err instanceof Error) ok('errors: VantError instanceof Error holds');
        else fail('errors: instanceof Error');
    }

    // ============ QUADRANT 2: EVENTS ============
    {
        const fired = [];
        const onState = d => fired.push('state:saved:' + d.moduleName);
        const onHyd = () => fired.push('state:hydrated');
        events.on('state:saved', onState);
        events.on('state:hydrated', onHyd);

        const ss = require('../lib/state-store');
        ss.persist({ moduleName: 'pin-events', stateFile: 'state/pin-events.json', data: { n: 1 } });
        ss.hydrate({ moduleName: 'pin-events', stateFile: 'state/pin-events.json', apply: () => {} });
        await new Promise(r => setTimeout(r, 100));

        if (fired.includes('state:saved:pin-events')) ok('events: state-store persist emits state:saved');
        else fail('events: state:saved', JSON.stringify(fired));
        if (fired.includes('state:hydrated')) ok('events: state-store hydrate emits state:hydrated');
        else fail('events: state:hydrated', JSON.stringify(fired));

        events.off('state:saved', onState);
        events.off('state:hydrated', onHyd);
        try { ss.clear('state/pin-events.json'); } catch (e) { /* cleanup */ }
    }

    // sidecar lifecycle events (no rustc needed — spawn failure still emits
    // sidecar:spawning before failing)
    {
        const fired = [];
        const onSpawn = () => fired.push('sidecar:spawning');
        events.on('sidecar:spawning', onSpawn);
        const sidecar = require('../lib/sidecar');
        try {
            await sidecar.spawnAndWait(sidecar.buildSpec('no-such-lang-xyz', { startTimeout: 1500 }));
        } catch (e) { /* expected: language missing */ }
        await new Promise(r => setTimeout(r, 100));
        events.off('sidecar:spawning', onSpawn);
        if (fired.includes('sidecar:spawning')) ok('events: sidecar spawn emits sidecar:spawning');
        else fail('events: sidecar:spawning', JSON.stringify(fired));
    }

    // ============ QUADRANT 3: AUDIT ============
    {
        const ss = require('../lib/state-store');
        ss.persist({ moduleName: 'pin-audit', stateFile: 'state/pin-audit.json', data: { n: 3 } });
        const audit = require('../lib/audit');
        const ledger = audit.getLedger();
        const hit = ledger.entries.filter(e => e.action === 'state:persist' && e.data.moduleName === 'pin-audit');
        if (hit.length >= 1) ok('audit: protocol-state persist lands in the ledger');
        else fail('audit: state:persist entry');
        try { ss.clear('state/pin-audit.json'); } catch (e) { /* cleanup */ }
    }

    // ============ QUADRANT 4: WAL ============
    {
        const ss = require('../lib/state-store');
        ss.persist({ moduleName: 'pin-wal', stateFile: 'state/pin-wal.json', data: { n: 4 } });
        const store = ss.getStore('state/pin-wal.json');
        const walDir = path.join(store.store.basePath, '.wal');
        if (fs.existsSync(walDir)) {
            ok('wal: state-store FileStorage opts into the journal (.wal dir present)');
        } else fail('wal: .wal dir missing', walDir);
        try { ss.clear('state/pin-wal.json'); } catch (e) { /* cleanup */ }
    }

    // ============ RAW-THROW REGRESSION GATE ============
    {
        const { execFileSync } = require('child_process');
        let out = '';
        try {
            out = execFileSync('grep', [
                '-rn', 'throw new Error(', 'lib/', '--include=*.js'
            ], { encoding: 'utf8' });
        } catch (e) { out = e.stdout || ''; } // grep exits 1 on no matches — that's the pass
        const offenders = out.split('\n').filter(Boolean)
            .filter(l => !l.includes('throw new Error') || l.includes('.js:'));
        if (out.trim() === '') {
            ok('gate: zero raw throw new Error( in lib/ (backbone discipline holds)');
        } else {
            // tolerate none — this pin holds the sweep
            fail('gate: raw throws reintroduced', out.trim().split('\n').slice(0, 3).join(' | '));
        }
    }

    console.log('\n  Backbone wiring pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
