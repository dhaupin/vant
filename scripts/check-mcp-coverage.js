#!/usr/bin/env node
/**
 * MCP docs coverage gate (docs pass 191 follow-through, pass 192).
 *
 * The pass-191 coverage recheck was a one-off node snippet. This makes it
 * a durable gate with the same contract: EVERY tool registered in
 * lib/mcp.js must be mentioned in docs/reference/mcp-tools.md — either
 * as a `| name |...` param-table row, in a code fence example, or in
 * inline prose/tool reference — OR explicitly disposition-listed here.
 *
 * Why "mentioned" (word match) rather than stricter formats: sections
 * deliberately use different shapes (prose groups, code examples, param
 * tables). The gate guarantees the QUESTION can't regress: a tool exists
 * in the registry that no doc page says anything about. Duct looks (can
 * a doc LIE while mentioning?) are separately caught by
 * check-fiction-signatures and spot-firing (see the pass-191 CHANGELOG).
 *
 * Dispositions (below) are tools where "not in the catalog" is the
 * documented intent: internal/test seams hidden from the public table.
 * Anything else = exit 1 with the missing list inline.
 *
 * Exit 0 = full catalog covered; exit 1 = gaps (with names).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'reference', 'mcp-tools.md');

const dispositions = {
    // lib/mcp.js internal seams, not user-facing catalog entries.
    // Each is load-bearing machinery (the umbrella caller, the test-DI
    // seams, the e2e server hook) — documenting them per-verb would claim
    // a public contract that is deliberately reserved for lib callers.
};

function main() {
    const doc = fs.readFileSync(DOC, 'utf8');

    // Require the lib lazily; the registry self-assembles on require.
    const mcp = require(path.join(ROOT, 'lib', 'mcp.js'));
    const tools = [...mcp.methods.entries()]
        .filter(([n]) => !n.startsWith('_'))
        .map(([n]) => n);

    const missing = tools.filter((t) => {
        if (dispositions[t] !== undefined) return false;
        // word-boundary match so agent_kill does not "cover" agent_kill_extra
        const re = new RegExp('(^|[^a-zA-Z_])' + t + '([^a-zA-Z_]|$)');
        return !re.test(doc);
    });

    const registered = tools.length;
    const disposed = tools.filter((t) => dispositions[t] !== undefined).length;
    const covered = registered - missing.length - disposed;

    if (missing.length > 0) {
        console.error(`MCP DOCS COVERAGE: FAIL (${missing.length} of ${registered} registered tools undocumented)`);
        console.error('  Add each to docs/reference/mcp-tools.md (a param-table row, an');
        console.error('  example, or a Mention in prose) — or add a disposition comment');
        console.error('  in scripts/check-mcp-coverage.js explaining why it stays out.');
        for (const t of missing) console.error('  - ' + t);
        process.exit(1);
    }

    console.log(`MCP DOCS COVERAGE: PASS (${covered} documented + ${disposed} dispositioned = ${registered} registered tools)`);
    process.exit(0);
}

main();
