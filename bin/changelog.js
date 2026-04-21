#!/usr/bin/env node
const vaf = require("../lib/vaf");
/**
 * Vant Changelog
 * Generate session changelog from git history
 * 
 * Usage: vant changelog
 *        vant changelog --since v0.7.0
 *        vant changelog --format=short
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_LIMIT = 20;

/**
 * Get git log since tag
 */
function getLog(since = null, limit = DEFAULT_LIMIT) {
    const args = ['log', `--pretty=format:%h|%s|%an|%ai`, `-n`, limit.toString()];
    if (since) {
        vaf.check(since, {type: 'string', name: 'since', maxLength: 20});
        args.push(`${since}..HEAD`);
    }
    
    try {
        const log = execSync(args.join(' '), { encoding: 'utf8' });
        return log.trim().split('\n').filter(l => l);
    } catch (e) {
        return [];
    }
}

/**
 * Parse log entry
 */
function parseEntry(line) {
    const [hash, subject, author, date] = line.split('|');
    return { hash, subject, author, date };
}

/**
 * Generate markdown changelog
 */
function generateMarkdown(entries, since = null) {
    let md = '# Vant Changelog\n\n';
    
    if (since) {
        md += `Since: ${since}\n\n`;
    }
    
    md += '## Changes\n\n';
    
    if (entries.length === 0) {
        md += 'No changes found.\n';
        return md;
    }
    
    entries.forEach(e => {
        md += `- \`${e.hash}\` ${e.subject} (${e.date.split(' ')[0]})\n`;
    });
    
    return md;
}

/**
 * Generate short format
 */
function generateShort(entries) {
    if (entries.length === 0) return 'No changes found.';
    
    return entries.map(e => `${e.hash} ${e.subject}`).join('\n');
}

/**
 * Get all tags
 */
function getTags() {
    try {
        const tags = execSync('tag -l', { encoding: 'utf8' });
        return tags.trim().split('\n').filter(t => t);
    } catch (e) {
        return [];
    }
}

/**
 * Main
 */
function main() {
    const args = process.argv.slice(3);
    let since = null;
    let format = 'markdown';
    let limit = DEFAULT_LIMIT;
    
    // Parse args
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--since' && args[i + 1]) {
            since = args[i + 1];
            i++;
        } else if (args[i] === '--format' && args[i + 1]) {
            format = args[i + 1];
            i++;
        } else if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1]);
            i++;
        } else if (args[i].startsWith('--since=')) {
            since = args[i].split('=')[1];
        } else if (args[i].startsWith('--format=')) {
            format = args[i].split('=')[1];
        }
    }
    
    const entries = getLog(since, limit).map(parseEntry);
    
    if (format === 'short') {
        console.log(generateShort(entries));
    } else {
        console.log(generateMarkdown(entries, since));
    }
}

main();