#!/usr/bin/env node
/**
 * Vant Sudo CLI
 * Sudo/privilege management
 * 
 * Usage:
 *   vant sudo status               # Show sudo status
 *   vant sudo enable              # Enable sudo
 *   vant sudo disable            # Disable sudo
 *   vant sudo template <def|list|show|rm|apply> ...
 *   vant sudo policies <load|status|reset>
 *   vant sudo audit [n]           # Recent escalation audit entries
 *   vant sudo metrics             # Sudo metrics (grants, escalations, latency)
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';
const sudo = require('../lib/sudo');

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Sudo CLI - Privilege management

  vant sudo metrics               Grants active, escalation counters, latency

Usage:
  vant sudo status                 Show sudo status
  vant sudo enable                Enable sudo
  vant sudo disable               Disable sudo
  vant sudo run <cmd>             Run command with sudo

Escalation templates (prd-sudo.md):
  vant sudo template def <name> <service> <scope> [ttlMs] [reason]
                                  Define a template (ttl is clamped to policy)
  vant sudo template list          List all templates
  vant sudo template show <name>   Show one template
  vant sudo template rm <name>     Delete a template
  vant sudo template apply <name> [taskId]
                                  Escalate through the template

Policies as code (prd-sudo.md):
  vant sudo policies load          Apply ${'{'}models/private/sudo/policies.json${'}'} (tighten-only)
  vant sudo policies status        Show effective whitelist + override state
  vant sudo policies reset         Restore built-in whitelist

Audit:
  vant sudo audit [n]              Last n escalation audit entries (default 20)
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'metrics') {
    const m = sudo.getSudoMetrics();
    console.log('Sudo metrics (in-process):');
    console.log('  grants active: ' + m.grantsActive);
    for (const [svc, n] of Object.entries(m.byService)) console.log('    ' + svc + ': ' + n);
    const find = (name) => m.registry.counters.find(c => c.name === name);
    const req = find('vant_sudo_escalations_total');
    if (req) console.log('  escalations: requested=' + req.value + ' (see vant metrics for full breakdown)');
    for (const c of m.registry.counters.filter(c => c.name === 'vant_sudo_escalations_total' || c.name === 'vant_sudo_revalidations_total')) {
        const lbl = Object.keys(c.labels || {}).sort().map(k => c.labels[k]).join('/');
        console.log('    ' + c.name.replace('vant_sudo_', '') + '[' + lbl + '] = ' + c.value);
    }
    const h = m.registry.histograms.find(h => h.name === 'vant_sudo_escalation_duration_ms');
    if (h) console.log('  escalation latency: count=' + h.count + ' avgMs=' + (h.count ? (h.sum / h.count).toFixed(2) : '0'));
    process.exit(0);
}

if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const scopes = sudo.getScopes();
        console.log('Sudo status:');
        console.log('  Scopes:', scopes.length);
        console.log('  can(>):', sudo.can('test') ? 'allowed' : 'denied');
    } else if (subcmd === 'enable' || subcmd === 'on' || subcmd === 'activate') {
        console.log('Enabling sudo...');
    } else if (subcmd === 'disable' || subcmd === 'off' || subcmd === 'deactivate') {
        console.log('Disabling sudo...');
    } else if (subcmd === 'run' || subcmd === 'exec') {
        const cmd = args.slice(1).join(' ');
        if (!cmd) {
            console.error('Usage: vant sudo run <command>');
            process.exit(1);
        }
        console.log('Running with sudo:', cmd);
    } else if (subcmd === 'template') {
        runTemplate(args.slice(1));
    } else if (subcmd === 'policies') {
        runPolicies(args.slice(1));
    } else if (subcmd === 'audit') {
        const limit = parseInt(args[1], 10) || 20;
        const entries = sudo.getEscalationAuditLog(limit);
        if (entries.length === 0) {
            console.log('No escalation audit entries.');
        } else {
            for (const e of entries) {
                const time = new Date(e.time).toISOString().replace('T', ' ').slice(0, 19);
                console.log(`  ${time}  ${String(e.kind || 'escalation').padEnd(16)} ${String(e.taskId || e.name || '').padEnd(14)} ${String(e.scope || '')}${e.service ? ' @' + e.service : ''} ${e.outcome || ''}${e.deniedReason ? ' (' + e.deniedReason + ')' : ''}`);
            }
        }
    } else {
        console.log('Usage: vant sudo <command>');
        process.exit(1);
    }
}

function runTemplate(args) {
    const op = args[0] || 'list';

    if (op === 'list' || op === 'ls') {
        const templates = sudo.listTemplates();
        if (templates.length === 0) {
            console.log('No escalation templates defined.');
            return;
        }
        for (const t of templates) {
            console.log(`  ${t.name.padEnd(24)} ${t.service.padEnd(10)} ${t.scope.padEnd(8)} ttl=${t.ttl}${t.description ? '  — ' + t.description : ''}`);
        }
    } else if (op === 'def' || op === 'define' || op === 'set') {
        const [name, service, scope, ttlArg, ...reasonRest] = args.slice(1);
        if (!name || !service || !scope) {
            console.error('Usage: vant sudo template def <name> <service> <scope> [ttlMs] [reason]');
            process.exit(1);
        }
        const ttl = ttlArg ? parseInt(ttlArg, 10) : undefined;
        if (ttlArg && !Number.isFinite(ttl)) {
            console.error('ttl must be a number (ms)');
            process.exit(1);
        }
        const t = sudo.defineTemplate(name, { service, scope, ttl, reason: reasonRest.join(' ') });
        console.log(`✓ Template '${t.name}': ${t.service}/${t.scope} ttl=${t.ttl}`);
    } else if (op === 'show' || op === 'get') {
        const t = sudo.getTemplate(args[1]);
        if (!t) {
            console.error(`Template not found: ${args[1]}`);
            process.exit(1);
        }
        console.log(JSON.stringify(t, null, 2));
    } else if (op === 'rm' || op === 'delete' || op === 'del') {
        const r = sudo.deleteTemplate(args[1]);
        if (!r.deleted) {
            console.error(`Template not found: ${args[1]}`);
            process.exit(1);
        }
        console.log(`✓ Deleted template: ${args[1]}`);
    } else if (op === 'apply') {
        const [name, taskId] = args.slice(1);
        if (!name) {
            console.error('Usage: vant sudo template apply <name> [taskId]');
            process.exit(1);
        }
        sudo.applyTemplate(name, taskId || 'cli').then(out => {
            console.log(JSON.stringify(out, null, 2));
        }).catch(e => {
            console.error('Apply failed:', e.message);
            process.exit(1);
        });
    } else {
        console.log('Usage: vant sudo template <def|list|show|rm|apply>');
        process.exit(1);
    }
}

function runPolicies(args) {
    const op = args[0] || 'status';

    if (op === 'load') {
        try {
            const r = sudo.loadPolicies({ source: 'cli' });
            if (!r.applied) {
                console.log('No policies file — built-in whitelist in effect.');
            } else {
                console.log(`✓ Applied ${r.changes} tightening change(s) to: ${r.services.join(', ')}`);
            }
        } catch (e) {
            console.error('✗ Policies refused (nothing applied):', e.message);
            process.exit(1);
        }
    } else if (op === 'reset') {
        sudo.resetPolicies();
        console.log('✓ Built-in whitelist restored.');
    } else if (op === 'status' || op === 'show') {
        const st = sudo.getPoliciesStatus();
        console.log(`Policies file: ${st.file}`);
        console.log(`Overrides applied: ${st.applied ? 'yes (' + st.source + ')' : 'no'}`);
        console.log('Effective whitelist:');
        for (const [service, p] of Object.entries(st.services)) {
            console.log(`  ${service.padEnd(10)} scopes=[${p.allowedScopes.join(',')}] auto=[${p.autoApprove.join(',')}] cb=[${p.requiresCallback.join(',')}] ttl=${p.maxTTL} revalidate=${p.revalidate}`);
        }
    } else {
        console.log('Usage: vant sudo policies <load|status|reset>');
        process.exit(1);
    }
}

run();
