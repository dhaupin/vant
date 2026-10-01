#!/usr/bin/env node
/**
 * MCP surface audit (pass 80) - run from the vant repo root.
 *
 * The escrow audit (pass 77) found broken handlers by live-probing. This
 * script scales that to the WHOLE registry: execute every tool with
 * minimal/empty args and classify the outcome:
 *
 *   OK         - structured result back
 *   REFUSED    - structured { error } / { code } shape (correct fail-closed)
 *   INVALID    - MCP_INPUT_INVALID schema rejection (handler alive, needs args)
 *   THREW      - a real exception - inspect: phantom/wrong-shape signature
 *                is TypeError / ReferenceError; a thrown VantError is
 *                classified REFUSED instead (coded fail-closed domain gate,
 *                e.g. 'query too short' VAF blocking on empty args) — the
 *                same refusal idiom as { error } returns, just thrown.
 *   TIMEOUT    - no response in 4s
 *
 * Destructive/state-wrecking tools are skipped. Exit 1 if any tool THREW
 * with TypeError/ReferenceError. Read-only probe.
 */
const SKIP = new Set([
    'vant_brain_clear', 'vant_brain_clear_dropbox', 'vant_brain_clear_handlers',
    'vant_brain_delete_file', 'vant_brain_drop_file', 'vant_brain_restore',
    'vant_brain_backup', 'vant_brain_stash', 'vant_memory_clear',
    'vant_tmp_cacheClear', 'vant_tmp_dropboxClear', 'vant_tmp_myStuffDelete',
    'vant_tmp_yourStuffDelete', 'vant_storage_rm', 'vant_delete_island',
    'vant_bulk_create_islands', 'vant_export_islands', 'vant_boot_reset',
    'agent_kill', 'vant_shell_exec', 'vant_shell_spawn', 'vant_shell_capture',
    'vant_environment_exec', 'compute_invoke', 'vant_compute_invoke',
    'compute_eval', 'vant_compute_eval', 'cron_run', 'cron_cancel',
    'vant_sync_pushAll', 'vant_sync_rebase', 'vant_sync_pullAny', 'vant_sync',
    'vant_branch_auto', 'agora_push', 'agora_pull', 'vant_update_island_triggers',
    'vant_network_fetch', 'vant_network_fetchJson', 'vant_remote_call',
    'vant_remote_addProvider', 'vant_remote_removeProvider', 'stream_watch',
    'vant_stego_encode', 'vant_stego_decode', 'skill_proto_load',
    'agent_proto_load', 'vant_load_island', 'brain_load', 'vant_brain_backup',
    'vant_environment_register', 'vant_connector_connect', 'vant_commit',
    'vant_create_branch', 'vant_switch_branch', 'vant_sudo_revoke',
    'sudo_revoke', 'vant_sudo_grant', 'sudo_grant', 'governance_decide',
    'trust_setRequired', 'vant_environment_use', 'vant_sandbox_status'
]);

async function main() {
    const mcp = require(path.join(process.cwd(), 'lib', 'mcp'));
    const names = mcp.listTools().map(t => t.name).sort();
    if (!names.length) { console.error('NO TOOLS DISCOVERED'); process.exit(2); }

    const buckets = { THREW: [], TIMEOUT: [], INVALID: [], REFUSED: [], OK: [], SKIP: [] };
    for (const name of names) {
        if (SKIP.has(name)) { buckets.SKIP.push(name); continue; }
        const res = await Promise.race([
            (async () => {
                try {
                    const r = await mcp.execute(name, {});
                    if (r && typeof r === 'object' && (r.error || r.code) && !r.ok) {
                        return { cls: 'REFUSED', msg: JSON.stringify(r).slice(0, 70) };
                    }
                    return { cls: 'OK', msg: JSON.stringify(r).slice(0, 50) };
                } catch (e) {
                    const cname = e && e.constructor ? e.constructor.name : 'Unknown';
                    const isPhantom = cname === 'TypeError' || cname === 'ReferenceError';
                    const isSchema = e.code === 'MCP_INPUT_INVALID' || /MCP input schema violation/i.test(e.message || '');
                    if (isSchema) return { cls: 'INVALID', msg: (e.message || '').slice(0, 70) };
                    // (pass 80) thrown VantError = coded fail-closed gate,
                    // the throw-flavored sibling of the { error } return.
                    // Bare Error (MODULE_NOT_FOUND etc.) stays THREW — that
                    // class is how the environment-module rot surfaced.
                    if (cname === 'VantError') {
                        return { cls: 'REFUSED', msg: '[thrown] ' + (e.code ? e.code + ': ' : '') + (e.message || '').slice(0, 60) };
                    }
                    return { cls: 'THREW', msg: cname + ': ' + (e.message || '').slice(0, 80) };
                }
            })(),
            new Promise(resolve => setTimeout(() => resolve({ cls: 'TIMEOUT', msg: 'no response in 4s' }), 4000))
        ]);
        buckets[res.cls].push(name + '  [' + res.msg + ']');
    }

    console.log('=== MCP SURFACE AUDIT (pass 80) ===');
    console.log('total registered:', names.length, '| skipped (destructive):', buckets.SKIP.length);
    for (const cls of ['THREW', 'TIMEOUT', 'INVALID', 'REFUSED', 'OK']) {
        console.log('\n' + cls + ' (' + buckets[cls].length + '):');
        for (const line of buckets[cls]) console.log('  ' + line);
    }
    const phantomCount = buckets.THREW.filter(l => /TypeError|ReferenceError/.test(l)).length;
    console.log('\nPHANTOM-SIGNATURE THROWS:', phantomCount);
    process.exit(phantomCount ? 1 : 0);
}

const path = require('path');
main().catch(e => { console.error('audit crashed:', e); process.exit(2); });
