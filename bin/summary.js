#!/usr/bin/env node
/**
 * Vant summary - summary module
 *
 * Usage: vant summary
 */
const vaf = require("../lib/vaf");

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("'Usage: vant summary [-h|--help] [-j|--json] [options]'");
    process.exit(0);
}
/**
 * Vant Summary
 * Session summary using auto-update module
 * 
 * Usage: vant summary [-h|--help] [-j|--json]
 *        vant summary --json
 */

const autoUpdate = require('../lib/update');
const fs = require('fs');
const path = require('path');

const MODELS_PATH = process.env.MODEL_PATH || 'models';

/**
 * Get session summary from brain
 */
function getSessionSummary() {
    const summary = autoUpdate.getSessionSummary();
    
    if (!summary) {
        return { message: 'No session data. Start a session first.' };
    }
    
    return summary;
}

/**
 * Format markdown output
 */
function formatMarkdown(summary) {
    let md = '# Vant Session Summary\n\n';
    md += `**Messages:** ${summary.messages || 0}\n`;
    md += `**Tokens (est):** ${summary.tokens || 0}\n`;
    md += `**Decisions:** ${summary.decisions || 0}\n\n`;
    
    if (summary.filesModified && summary.filesModified.length) {
        md += '## Files Modified\n\n';
        summary.filesModified.forEach(f => {
            md += `- ${f}\n`;
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
    const args = process.argv.slice(3);
    const format = args.includes('--json') ? 'json' : 'text';
    
    const summary = getSessionSummary();
    
    if (format === 'json') {
        console.log(JSON.stringify(summary, null, 2));
    } else if (summary.message) {
        console.log(summary.message);
    } else {
        console.log(formatMarkdown(summary));
    }
}

main();