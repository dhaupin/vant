#!/usr/bin/env node
/**
 * Docs style linter for the QC pass. Checks every docs/*.md file:
 *   - every opening code fence carries a language tag (closing fences exempt)
 *   - no heading level skips (h1 -> h3)
 *   - no trailing whitespace
 *   - no tabs in prose (frontmatter/markdown)
 * Exit 1 on findings.
 */
const fs = require('fs');
const path = require('path');
const DOCS = path.resolve(__dirname, '..', 'docs');

const files = [];
(function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_plugins') walk(p);
        else if (f.name.endsWith('.md')) files.push(p);
    }
})(DOCS);

let issues = 0;
for (const f of files) {
    const rel = f.replace(DOCS + '/', '');
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let inFence = false;
    let lastHeading = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const n = i + 1;
        if (/^\s*```/.test(line)) {
            if (!inFence && /^```\s*$/.test(line)) {
                console.log(`${rel}:${n} opening fence missing language tag`);
                issues++;
            }
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        if (/[ \t]+$/.test(line)) { console.log(`${rel}:${n} trailing whitespace`); issues++; }
        if (/\t/.test(line)) { console.log(`${rel}:${n} tab character`); issues++; }
        const h = line.match(/^(#{1,6})\s/);
        if (h) {
            const level = h[1].length;
            if (lastHeading && level > lastHeading + 1) {
                console.log(`${rel}:${n} heading skips h${lastHeading} to h${level}`);
                issues++;
            }
            lastHeading = level;
        }
    }
}

console.log(issues === 0
    ? 'DOCS STYLE: PASS (' + files.length + ' files)'
    : 'DOCS STYLE: FAIL (' + issues + ' issues)');
process.exit(issues === 0 ? 0 : 1);
