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
 *   6. (Wave OSS-B) Single-source facts agree across contributing
 *      surfaces: the same commit-format and test commands appear in
 *      both; each file carries a canonical-source marker; the front
 *      door stays short (a proxy for "didn't regrow into a full guide")
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

// ---------- 6. (Wave OSS-B) single sources of truth ----------
// The contribution flow has ONE full guide (docs/) and ONE short front
// door (root CONTRIBUTING.md). Shared facts must agree; each file must
// declare its role; the door must stay a door.
const contribRoot = read('CONTRIBUTING.md');
const contribDocs = read('docs/getting-started/contributing.md');

// Canonical-source markers (the "every surface names its source" rule).
check('root CONTRIBUTING.md declares itself the front door', /Canonical source note/i.test(contribRoot) && /docs\/getting-started\/contributing\.md/.test(contribRoot));
check('docs contributing guide declares itself canonical', /Canonical source note/i.test(contribDocs));

// Shared facts agree across both surfaces.
const sharedFacts = [
    ['commit format `type: description`', /type: description/.test(contribRoot) || false],
    ['agent commit format `agent-name:`', /agent-name/.test(contribRoot)],
    ['discussions door', contribRoot.includes('github.com/dhaupin/vant/discussions')],
    ['private vulnerability door', contribRoot.includes('/security/advisories/new')],
    ['security never via public issue', /never a public issue|Do not open a public issue/i.test(contribRoot) || /SECURITY\.md/.test(contribRoot)]
];
for (const [fact, ok] of sharedFacts) {
    check('shared fact in front door: ' + fact, ok);
}
const docsFacts = [
    ['commit format `type: description`', /type: description/.test(contribDocs)],
    ['agent pass format cross-reference', /agent-name/.test(contribDocs)]
];
for (const [fact, ok] of docsFacts) {
    check('shared fact in full guide: ' + fact, ok);
}

// The door stays a door: drift proxy is line count (full guide is ~150+;
// the front door drifted once already at 97 lines of full-guide content).
const rootLines = contribRoot.split('\n').length;
check('root CONTRIBUTING.md stays a front door (<= 80 lines)', rootLines <= 80,
    rootLines + ' lines — content leaked back in; move it to the docs guide');

// The two must LINK to each other (convergence, not duplication).
check('front door links the canonical guide', /docs\/getting-started\/contributing\.md/.test(contribRoot));

// ---------- 7. (Wave OSS-B) AGENTS.md <-> agent-onboarding alignment ----------
// AGENTS.md (the agent interface) and docs/getting-started/
// agent-onboarding.md (the human-readable loop doc) describe the same
// machine from two sides. The commands AGENTS.md advertises must exist
// in bin/ or the dispatcher; the brain-layout facts must agree.
const onboardDoc = read('docs/getting-started/agent-onboarding.md');
const vantRouter = read('bin/vant.js');

// Every `vant x` table row in AGENTS.md must resolve to bin/<x>.js or
// a dispatcher route.
const claimedCmds = [...agentsDoc.matchAll(/^\| `vant ([a-z-]+)`/gm)].map((m) => m[1]);
const seen = new Set();
for (const cmd of claimedCmds) {
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const binExists = fs.existsSync(path.join(ROOT, 'bin', cmd + '.js'));
    const routed = new RegExp("^\\s*" + cmd + ": '").test(vantRouter, 'm');
    check('AGENTS.md CLI claim resolves: vant ' + cmd, binExists || routed,
        'no bin/' + cmd + '.js and no dispatcher route');
}

// Brain layout: both docs must use the multi-brain layout paths (a
// stale flat-layout mention in either is a regression).
for (const [name, src] of [['AGENTS.md', agentsDoc], ['agent-onboarding.md', onboardDoc]]) {
    const flatLayout = /models\/private\/[a-z-]+\.md/.test(src);
    check('brain layout current in ' + name, !flatLayout,
        'mentions flat pre-0.9 layout models/private/<file>.md');
}
check('onboarding doc teaches migrate --status', onboardDoc.includes('vant migrate --status'));
check('AGENTS.md multi-brain layout matches onboarding', agentsDoc.includes('models/private/<brain>/') && onboardDoc.includes('models/public/<brain>/'));

// ---------- verdict ----------
console.log('');
if (failures > 0) {
    console.log('SURFACE CONSISTENCY: ' + failures + ' broken claim(s). Fix the docs or ship the code — one of the two.');
    process.exit(1);
}
console.log('SURFACE CONSISTENCY: all advertised claims resolve to reality.');
