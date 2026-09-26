#!/usr/bin/env node
/**
 * Surface consistency checker (Wave OSS-C, labs/prd-oss.md)
 *
 * The public layer is the project's second codebase; this checker is its
 * test run. It mechanically verifies that what the docs ADVERTISE exists
 * in the code — the "no phantom endpoints" rule — plus a few specific
 * regressions already caught by hand:
 *
 *   1. MCP tools named in AGENTS.md resolve to registered mcp methods
 *   2. The MCP HTTP surface advertised is the one that exists
 *      (/mcp/exec, /tools, /health — and NOT the phantom /rpc)
 *   3. Env vars documented in SECURITY.md exist in lib/config.js or lib/
 *   4. Community docs never link the wrong repo (dhaupin/<x> links must
 *      be known-good repos)
 *   5. GitHub community files exist (SUPPORT, SECURITY, CONTRIBUTING,
 *      CODE_OF_CONDUCT)
 *
 * Exit 0 = consistent; exit 1 = a claim broke (printed loudly).
 * CI: runs in test.yml beside check-docs-links/style. Local: node
 * scripts/check-surface-consistency.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(name, cond, detail) {
    if (cond) {
        console.log('  ✓ ' + name);
    } else {
        failures++;
        console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
    }
}

// ---------- 1. MCP tools advertised in AGENTS.md exist ----------
const agentsDoc = read('AGENTS.md');
const mcpSource = read('lib/mcp.js');

// The agent-crew tools the Multi-Agent section advertises (must be
// registered _methods entries, not just words in a doc).
for (const tool of ['agent_spawn', 'agent_list', 'agent_kill']) {
    const inDoc = new RegExp('\\| `' + tool + '`').test(agentsDoc) || new RegExp("method: '" + tool + "'").test(agentsDoc);
    const inCode = new RegExp("_methods\\.set\\('" + tool + "'").test(mcpSource);
    check('MCP tool advertised + registered: ' + tool, inDoc && inCode,
        inDoc ? 'missing from lib/mcp.js' : 'missing from AGENTS.md');
}

// The old phantom names must never come back.
for (const phantom of ['brain_agent_spawn', 'brain_agent_list', 'brain_agent_kill']) {
    check('phantom tool retired: ' + phantom, !agentsDoc.includes(phantom),
        'AGENTS.md still documents ' + phantom + ' (no such method)');
}

// ---------- 2. The advertised HTTP surface is the real one ----------
check('MCP exec door: /mcp/exec documented', agentsDoc.includes('/mcp/exec'));
check('MCP exec door: /mcp/exec implemented', mcpSource.includes("req.url === '/mcp/exec'"));
check('tools listing: /tools documented + implemented', agentsDoc.includes('/tools') && mcpSource.includes("req.url === '/tools'"));
check('phantom route /rpc absent from docs', !/\brpc['"`]/.test(agentsDoc.replace(/["'`]rpc["'`]/g, '')) && !agentsDoc.includes('/rpc'),
    'AGENTS.md still advertises /rpc (never existed)');

// ---------- 3. Env vars documented in SECURITY.md exist ----------
const securityDoc = read('.github/SECURITY.md');
const envClaims = [...securityDoc.matchAll(/([A-Z][A-Z0-9_]{3,})/g)]
    .map((m) => m[1])
    .filter((v) => v.startsWith('VANT_'));
const configSource = read('lib/config.js') + read('lib/webhooks.js');
for (const env of new Set(envClaims)) {
    check('env var documented + real: ' + env, configSource.includes(env),
        'SECURITY.md documents ' + env + ' but no lib/ code reads it');
}

// ---------- 4. Community links point at the right repo ----------
const communityFiles = [
    'docs/getting-started/contributing.md',
    'docs/getting-started/faq.md',
    '.github/SUPPORT.md',
    'CONTRIBUTING.md'
];
for (const rel of communityFiles) {
    const src = read(rel);
    const bad = [...src.matchAll(/github\.com\/dhaupin\/(?!vant\b)(discussions|issues|pulls)/g)].map((m) => m[0]);
    check('no wrong-repo links in ' + rel, bad.length === 0, bad.join(', '));
}

// ---------- 5. Community doors exist ----------
for (const rel of ['.github/SUPPORT.md', '.github/SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md']) {
    check('community file exists: ' + rel, fs.existsSync(path.join(ROOT, rel)));
}

// ---------- verdict ----------
console.log('');
if (failures > 0) {
    console.log('SURFACE CONSISTENCY: ' + failures + ' broken claim(s). Fix the docs or ship the code — one of the two.');
    process.exit(1);
}
console.log('SURFACE CONSISTENCY: all advertised claims resolve to reality.');
