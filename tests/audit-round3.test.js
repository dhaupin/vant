#!/usr/bin/env node
'use strict';

/**
 * Round-3 audit pins (MCP door: dead security chain + write misclassification).
 *
 * Run: node tests/audit-round3.test.js  (picked up by tests/run-all.js)
 *
 *   R3-1  The MCP security chain was DEAD CODE. `_executeWithSecurity()`
 *         (recursion guard -> sandbox capability -> VAF -> QoS -> escrow)
 *         was orphaned by the registry-census rewrite (9413ff8b): the doors
 *         (execute / call / the HTTP /mcp/exec route) all dispatch through
 *         `_executeTool`, which called `tool.handler(params)` directly. A
 *         measurement of pipeline.run/vaf.check/qos.check during a real
 *         dispatch was ZERO. Pin: the chain runs, and a locked sandbox
 *         (canWrite=false) refuses a write-class tool through the door.
 *
 *   R3-2  `_isMcpWriteMethod` classified only 34 of 347 tools as WRITE (a
 *         prefix allowlist + substring net), so ~71 mutating tools
 *         (vant_config_set, sudo_grant, agent_kill, cron_run, ...) ran under
 *         the read-only PUBLIC pipeline. Pin: the honest (fail-closed)
 *         classifier marks a curated set WRITE and read verbs READ.
 *
 *   R3-3  Because sudo_grant was read-classified, a locked sandbox could
 *         self-escalate: sudo_grant(canExec) widened the very sandbox that
 *         denied it, and a subsequent write then landed. Pin: with the
 *         chain wired + honest classification, sudo_grant is refused and the
 *         sudo/capability floor is unchanged.
 *
 *   R3-4  A non-string method reached rules.check and threw a raw
 *         `TypeError: Cannot read properties of undefined (reading
 *         'toLowerCase')`. Pin: typed refusal.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mcp = require(path.join(ROOT, 'lib', 'mcp'));
const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
const sudo = require(path.join(ROOT, 'lib', 'sudo'));
const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));

let failures = 0;
function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${detail}`}`);
}

const LOCKED = { canRead: true, canWrite: false, canExec: false, canAdmin: false, canSpawn: false };

(async () => {
    const prevCaps = sandbox.defaultSandbox.getCapabilities
        ? sandbox.defaultSandbox.getCapabilities()
        : null;

    try {
        // ---------- R3-1: the chain runs on every dispatch ----------
        let runs = 0;
        const origRun = pipeline.run;
        pipeline.run = function (...a) { runs++; return origRun.apply(this, a); };
        try {
            sandbox.defaultSandbox.setCapabilities(LOCKED);
            runs = 0;
            await mcp.execute('vant_health', {});
            check('R3-1a: pipeline.run is invoked by a door dispatch (chain wired)',
                runs >= 1, `pipeline.run invocations = ${runs} (expected >= 1)`);
        } finally {
            pipeline.run = origRun;
        }

        // A chain-ONLY-gated write tool is refused by the capability gate.
        // (event_sink_enable has no internal capability check — pre-fix it
        // was read-classified, rode the PUBLIC chain, and ran under
        // canWrite=false. Post-fix it is WRITE-classified and the private
        // chain's canWrite gate refuses it with a CODED error.)
        let writeThrew = null;
        try {
            await mcp.execute('event_sink_enable', {});
        } catch (e) { writeThrew = e; }
        check('R3-1b: locked sandbox (canWrite=false) refuses a chain-only-gated write tool',
            writeThrew !== null && writeThrew.code === 'CAPABILITY_NOT_ALLOWED',
            writeThrew ? `${writeThrew.name}: ${writeThrew.code || writeThrew.message}` : 'write tool ran under a locked sandbox');

        // A read-class tool still passes the read gate (no over-block).
        const readOk = await mcp.execute('vant_health', {});
        check('R3-1c: read-class tool still passes under the same locked sandbox',
            !!(readOk && (readOk.status === 'ok' || readOk.healthy !== undefined || readOk.ok !== undefined)),
            JSON.stringify(readOk).slice(0, 120));

        // ---------- R3-2: the classifier is honest (fail-closed) ----------
        // The classifier is a module-internal seam; if a future refactor
        // removes the export, the fail-closed stub marks everything WRITE so
        // the read pin below fails cleanly instead of crashing the suite.
        const isWrite = typeof mcp._isMcpWriteMethod === 'function'
            ? mcp._isMcpWriteMethod
            : () => true;
        const MUST_BE_WRITE = [
            'vant_config_set', 'sudo_grant', 'sudo_revoke', 'agent_kill',
            'cron_run', 'compute_eval', 'compute_invoke', 'vant_set_memory',
            'vant_sync', 'guest_revoke', 'escrow_setWorkspaceBudget',
            'event_sink_enable', 'brain_geo_store', 'recursion_register',
            'vant_boot_reset', 'vant_brain_restore',
            'market_skill_settle', 'trust_setRequired', 'vant_enable_island'
        ];
        const MUST_BE_READ = [
            'vant_health', 'brain_read', 'brain_list', 'agent_list',
            'vant_config_get', 'vant_storage_read', 'msg_list', 'escrow_status',
            'market_search', 'traveler_fetch'
        ];
        const wrongWrite = MUST_BE_WRITE.filter(t => isWrite(t) !== true);
        const wrongRead = MUST_BE_READ.filter(t => isWrite(t) !== false);
        check('R3-2a: mutating verbs classify WRITE (no read-only pipeline for writes)',
            wrongWrite.length === 0, `misclassified READ: ${wrongWrite.join(', ')}`);
        check('R3-2b: read verbs classify READ (no over-block of legitimate reads)',
            wrongRead.length === 0, `misclassified WRITE: ${wrongRead.join(', ')}`);
        check('R3-2c: unknown/empty method fails closed (WRITE)',
            isWrite('') === true && isWrite(null) === true && isWrite('totally_unknown_verb') === true,
            `empty=${isWrite('')} null=${isWrite(null)} unknown=${isWrite('totally_unknown_verb')}`);

        // ---------- R3-3: no privilege escalation through the door ----------
        sandbox.defaultSandbox.setCapabilities(LOCKED);
        const sudoWriteBefore = sudo.can('default', 'write');
        const sudoExecBefore = sudo.can('default', 'exec');
        let grantThrew = null;
        try {
            await mcp.execute('sudo_grant', { agentId: 'default', capability: 'canExec' });
        } catch (e) { grantThrew = e; }
        const sudoExecAfter = sudo.can('default', 'exec');
        const capExecAfter = sandbox.defaultSandbox.can('canExec');
        check('R3-3a: sudo_grant is refused under a locked sandbox (no self-escalation)',
            grantThrew !== null && grantThrew.code === 'CAPABILITY_NOT_ALLOWED',
            grantThrew ? `${grantThrew.code}` : 'grant SUCCEEDED under a locked sandbox');
        check('R3-3b: the sudo/capability floor is unchanged after the attempt',
            sudoWriteBefore === false && sudoExecBefore === false
                && sudoExecAfter === false && capExecAfter === false,
            `sudo.write=${sudoWriteBefore}->${sudoWriteBefore} sudo.exec=${sudoExecBefore}->${sudoExecAfter} canExec=${capExecAfter}`);

        // ---------- R3-4: non-string method -> typed refusal ----------
        const badResults = [];
        for (const bad of [null, 0, {}, undefined, '']) {
            try {
                const r = await mcp.execute(bad, {});
                badResults.push({ bad, threw: false, error: r && r.error });
            } catch (e) {
                badResults.push({ bad, threw: true, type: e && e.constructor && e.constructor.name });
            }
        }
        const untyped = badResults.filter(r => r.threw);
        const notTyped = badResults.filter(r => !r.threw && r.error !== 'MCP_INPUT_INVALID');
        check('R3-4: non-string method returns a typed MCP_INPUT_INVALID, never a TypeError',
            untyped.length === 0 && notTyped.length === 0,
            JSON.stringify(badResults).slice(0, 220));
    } finally {
        if (prevCaps) sandbox.defaultSandbox.setCapabilities(prevCaps);
    }

    console.log(`\n--- RESULTS ---\n\n  ${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}\n`);
    process.exit(failures > 0 ? 1 : 0);
})().catch(e => {
    console.error('HARNESS:', e && e.stack || e);
    process.exit(1);
});
