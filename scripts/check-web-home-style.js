#!/usr/bin/env node
/**
 * web/home style gate (pass 344): the docs-style voice rules, applied to the
 * marketing site. scripts/check-docs-style.js enforces them for docs/*.md;
 * this gate enforces the enforceable subset for every web/home source file a
 * human reads as text - JSX/JS/CSS/MJS/HTML prose, comments included, because
 * a comment is copy the next editor inherits.
 *
 * Contract (mirrors check-docs-style.js):
 *   - no em/en dashes in prose or comments (voice rule: use commas, colons,
 *     periods, or the plain hyphen). CHANGELOG.md stays exempt in the docs
 *     gate, and src/generated/ (its JSON artifact) plus the frozen design
 *     reference index.bak.html stay exempt here.
 *   - no tab characters, no trailing whitespace.
 *   - the site's arrowGlyph affordances (learn-more arrows, walk buttons)
 *     are DESIGN, not prose decoration, so the docs emoji/glyph rule does
 *     not apply to the site (arrows are load-bearing UI here).
 *
 * Failure contract: `path:line rule: <trimmed line>`; exit 1 on findings.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'web', 'home');
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'generated']);
const EXCLUDE_FILES = new Set(['index.bak.html']);
const SCAN_EXT = /\.(jsx|js|mjs|css|html)$/;

const files = [];
(function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) {
            if (!EXCLUDE_DIRS.has(f.name)) walk(path.join(d, f.name));
        } else if (SCAN_EXT.test(f.name) && !EXCLUDE_FILES.has(f.name)) {
            files.push(path.join(d, f.name));
        }
    }
})(ROOT);

let issues = 0;
for (const f of files) {
    const rel = path.relative(ROOT, f);
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const n = i + 1;
        if (/[\u2013\u2014]/.test(line)) { console.log(`${rel}:${n} em/en dash (use comma, colon, period, or hyphen)`); issues++; }
        if (/\t/.test(line)) { console.log(`${rel}:${n} tab character`); issues++; }
        if (/[ \t]+$/.test(line)) { console.log(`${rel}:${n} trailing whitespace`); issues++; }
    }
}

console.log(issues === 0
    ? `WEB-HOME STYLE: PASS (${files.length} files scanned)`
    : `WEB-HOME STYLE: FAIL (${issues} issues in ${files.length} files)`);
process.exit(issues === 0 ? 0 : 1);
