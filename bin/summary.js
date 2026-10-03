#!/usr/bin/env node
/**
 * Vant summary - session summary from the ACTIVE brain
 *
 * Usage: vant summary [-h|--help] [-j|--json]
 *
 * (pass 93) REAL brain-derived summary. This was a hard stub returning
 * "Session tracking not yet implemented" — and bin/test-all.js pinned the
 * stub string, locking the placeholder in place. The summary now reads
 * what the brain actually contains: identity NAME, goals, lessons, and
 * the audit ledger entry count. Nothing is invented: an empty brain gets
 * an honest empty-brain message with next actions.
 *
 * (pass 93) Also fixed: --json was parsed from argv.slice(3), so a plain
 * `vant summary --json` never entered JSON mode (only `vant summary x
 * --json` did). Short form -j now honored too.
 */

const fs = require('fs');
const path = require('path');

// -h/--help
const argv = process.argv.slice(2);
if (argv[0] === '-h' || argv[0] === '--help') {
    console.log('Usage: vant summary [-h|--help] [-j|--json]');
    console.log('');
    console.log('  -h, --help   Show this help');
    console.log('  -j, --json   Output machine-readable JSON');
    process.exit(0);
}

/**
 * Build the session summary from the active brain's real content.
 */
function getSessionSummary() {
    // Brain resolution via state-store's path-active resolver (pass 88/93
    // seam: VANT_BRAIN env > currentBrain — a bare default would summarize
    // the wrong brain under env-scoped runs).
    let brainName = 'vant';
    try {
        brainName = require('../lib/state-store').currentBrain() || 'vant';
    } catch (e) { /* default name */ }

    const brainDir = path.join('models', 'private', brainName);
    const readMd = (f) => {
        try { return fs.readFileSync(path.join(brainDir, f), 'utf8'); }
        catch (e) { return ''; }
    };

    const identity = readMd('identity.md');
    const nameMatch = identity.match(/^NAME:\s*(.+)$/m);

    const bullets = (md) => md.split(/\r?\n/)
        .filter(l => /^- .+/.test(l))
        .map(l => l.slice(2).trim())
        .filter(l => l && !/\(empty\)/.test(l));

    const learnings = bullets(readMd('lessons.md'));
    const goals = bullets(readMd('goals.md'));

    // Audit ledger activity — how many entries this brain has logged.
    let decisions = 0;
    try {
        const audit = require('../lib/audit');
        const ledger = audit.getLedger();
        decisions = (ledger.entries || []).length;
    } catch (e) { /* ledger unavailable — report 0 */ }

    const summary = {
        brain: brainName,
        name: nameMatch ? nameMatch[1].trim() : null,
        decisions,
        learnings,
        goals,
        filesModified: []
    };

    if (!identity && !learnings.length && !goals.length && !decisions) {
        summary.message = 'Session summary: brain "' + brainName +
            '" is empty — write identity.md or run `vant learn <key> <insight>` to populate it.';
    }
    return summary;
}

/**
 * Format markdown output
 */
function formatMarkdown(summary) {
    let md = '# Vant Session Summary\n\n';
    md += `**Brain:** ${summary.brain}${summary.name ? ' (' + summary.name + ')' : ''}\n`;
    md += `**Ledger entries:** ${summary.decisions || 0}\n\n`;

    if (summary.goals && summary.goals.length) {
        md += '## Goals\n\n';
        summary.goals.forEach(g => {
            md += `- ${g}\n`;
        });
        md += '\n';
    }

    if (summary.learnings && summary.learnings.length) {
        md += '## Learnings\n\n';
        summary.learnings.forEach(l => {
            md += `- ${l}\n`;
        });
    }

    return md;
}

/**
 * Main
 */
function main() {
    // (pass 93) argv.slice(2): the old slice(3) dropped the FIRST argument,
    // so `vant summary --json` silently stayed in text mode.
    const json = argv.includes('--json') || argv.includes('-j');

    const summary = getSessionSummary();

    if (json) {
        console.log(JSON.stringify(summary, null, 2));
    } else if (summary.message) {
        console.log(summary.message);
    } else {
        console.log(formatMarkdown(summary));
    }
}

main();
