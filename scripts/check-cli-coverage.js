#!/usr/bin/env node
/**
 * CLI docs coverage gate (docs pass 191 follow-through, pass 192).
 *
 * Same contract as check-mcp-coverage.js, for the CLI: every binary in
 * bin/ that is a real user-facing command must be mentioned in
 * docs/reference/cli.md. The dispatcher surface (vant <command>) maps
 * 1:1 to bin/<command>.js, so the reference page's "Every user-facing
 * vant command" claim is machine-checkable.
 *
 * Mentions counted: `vant <name>`, `node bin/<name>.js`, or a bare
 * `<name>` table row mention. Dispositions cover bins that are NOT
 * routed commands / not user-facing:
 *   - cli-standard: a REFERENCE doc rendered as text, explicitly "NOT a
 *     routed command" in its own header
 *   - vant: the dispatcher itself (it owns every other row); documenting
 *     "vant vant" is noise
 *   - test-core / summary / watch (bin): internal helpers invoked by
 *     scripts or already covered under a different name in the doc
 *
 * Anything else = exit 1 with the missing list.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'reference', 'cli.md');

const dispositions = {
    // Text of a reference doc itself - header says NOT a routed command.
    'cli-standard': 'reference text rendered as bin; explicitly not routed',
    // The dispatcher: every other row IS "vant <x>". No self-row.
    'vant': 'the dispatcher itself',
    // Internal test helper invoked via package scripts/docs, not a user verb.
    'test-core': 'internal CI test driver',
    // Internal CI smoke helper (test/ci.js consumes it, not humans).
    'summary': 'internal CI summary helper',
    // bot.js is documented as `vant telegram` (the routed command);
    // the row notes the module is the Telegram bot.
    'bot': 'documented as `vant telegram` (routed name)',
    // agent-spawner.js / test-all.js are now doc-row'd by routed+file name
    // (pass 192), so no disposition needed - left here as an example.
};

function mentioned(doc, name) {
    // "vant <name>" as a routed command or a table row / code mention
    if (new RegExp('vant ' + name + '([^a-zA-Z-]|$)').test(doc)) return true;
    if (new RegExp('bin/' + name + '\\.js').test(doc)) return true;
    return false;
}

function main() {
    const doc = fs.readFileSync(DOC, 'utf8');
    const bins = fs.readdirSync(path.join(ROOT, 'bin'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => f.replace(/\.js$/, ''));

    const missing = bins.filter((b) => dispositions[b] === undefined && !mentioned(doc, b));

    const covered = bins.length - missing.length - Object.keys(dispositions).filter((d) => bins.includes(d)).length;

    if (missing.length > 0) {
        console.error(`CLI DOCS COVERAGE: FAIL (${missing.length} of ${bins.length} bin CLIs undocumented in docs/reference/cli.md)`);
        console.error('  Add each to cli.md (a command table row or example) — or add a');
        console.error('  disposition with the reason in scripts/check-cli-coverage.js.');
        for (const b of missing) console.error('  - ' + b);
        process.exit(1);
    }

    console.log(`CLI DOCS COVERAGE: PASS (${covered} documented + ${Object.keys(dispositions).length} dispositioned = ${bins.length} bins)`);
    process.exit(0);
}

main();
