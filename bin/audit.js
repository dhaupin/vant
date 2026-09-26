#!/usr/bin/env node
/**
 * Vant Audit Generator
 *
 * Generates dynamic AUDIT.md report from codebase analysis.
 * Report logic lives in lib/audit-report.js (pass 24) — this CLI keeps
 * only arg parsing, repo containment, and output modes.
 * (lib/audit.js itself is the shared audit/logger — do not repurpose it.)
 *
 * USAGE:
 *   vant audit                  # Generate to stdout
 *   vant audit --out AUDIT.md   # Write to file (--out FILE or --out=FILE)
 *   vant audit --json           # JSON output
 *
 * INTEGRATION:
 *   - GitHub Actions: After build job
 *   - Scheduled: Weekly/monthly workflow
 *   - Manual: On demand
 */

const fs = require('fs');
const path = require('path');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("../lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }

// (pass 24) Install root via VANT_REPO_ROOT anchor (dispatcher sets it for
// routed commands; direct invocation falls back to this install tree).
const ROOT = require('../lib/anchor').getRepoRoot();
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Vant Audit Generator

USAGE:
  vant audit              # Generate to stdout
  vant audit --out FILE   # Write to file
  vant audit --json       # JSON output

EXAMPLES:
  vant audit --out AUDIT.md
  vant audit --json > audit.json
`);
    process.exit(0);
}

function main() {
    _getSandbox();
    if (_sandbox) _checkRead();

    // (pass 24) Report generation lives in lib/audit-report.js — importable
    // and unit-testable; the CLI is thin: args, containment, output.
    // (lib/audit.js is the shared logger; the report generator must not
    // live there — first extraction attempt clobbered it.)
    const { generateAuditReport } = require('../lib/audit-report');
    const { report } = generateAuditReport({ root: ROOT });

    // (pass 23 census) Accept both --out FILE and --out=FILE; validate the
    // path (repo containment + vaf) before the on-purpose raw fs write.
    const eqForm = args.find(a => a.startsWith('--out='))?.split('=')[1];
    const spForm = (() => { const i = args.indexOf('--out'); return i !== -1 ? args[i + 1] : undefined; })();
    const outFile = eqForm || spForm;
    const jsonMode = args.includes('--json');

    if (outFile) {
        _checkWrite();
        const rel = path.relative(ROOT, path.resolve(ROOT, outFile));
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            console.error('Error: --out must stay inside the repo (got: ' + outFile + ')');
            process.exit(1);
        }
        const vaf = require('../lib/vaf');
        const check = vaf.checkPathTraversal(rel);
        if (check.blocked) {
            console.error('Error: --out path blocked: ' + check.reason);
            process.exit(1);
        }
        fs.writeFileSync(path.join(ROOT, rel), report);
        console.error('Audit written to: ' + rel);
    } else if (jsonMode) {
        console.log(JSON.stringify({ generated: new Date().toISOString(), report: report }, null, 2));
    } else {
        console.log(report);
    }
}

main();
