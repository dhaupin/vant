#!/usr/bin/env node
/**
 * Vant Summary
 * Session summary using auto-update module
 * 
 * Usage: vant summary
 *        vant summary --json
 */

const autoUpdate = require('../lib/auto-update');
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
    md += `**Messages:** ${summary.messageCount}\n`;
    md += `**Tokens (est):** ${summary.tokens}\n`;
    md += `**Decisions:** ${summary.decisions}\n\n`;
    
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