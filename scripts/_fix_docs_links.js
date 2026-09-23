#!/usr/bin/env node
/**
 * One-shot link normalizer for the docs IA pass (T4).
 * Rewrites inter-doc markdown links to /vant/<permalink> site-absolute form
 * using each target's actual frontmatter permalink. Read-verify pattern:
 * run, then `git diff` and re-run the link checker.
 *
 * Resolution rules for a link token (anchor stripped, .md stripped):
 *   1. '/x'            -> docs-root-absolute key '/x'
 *   2. 'name'          -> same-dir key '/<dir>/name'
 *   3. 'a/b' where 'a' is a section dir -> root-relative key '/a/b'
 *   4. 'a/b' otherwise -> fs-resolve against the file's dir
 * Anything unresolved is logged and left untouched.
 * Lines inside ``` fences and backtick spans are skipped.
 */
const fs = require('fs');
const path = require('path');
const DOCS = path.resolve(__dirname, '..');

const SECTIONS = new Set([
    'getting-started', 'memory', 'runtime', 'multi-agent', 'essential',
    'operations', 'security', 'integrations', 'reference', 'advanced'
]);

const files = [];
(function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_plugins') walk(p);
        else if (f.name.endsWith('.md')) files.push(p);
    }
})(DOCS);

// Build alias map: key -> canonical /vant/<permalink> URL
const perm = new Map();
for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(/^permalink: (\S+)/m);
    if (!m) continue;
    const p = m[1];
    const canon = '/vant/' + p.replace(/^\//, '');
    const add = (k) => { if (k && !perm.has(k)) perm.set(k, canon); };
    add(p);
    add(p.replace(/\/$/, ''));
    const expected = f.replace(DOCS, '').replace(/\.md$/, '');
    add(expected);
    add(expected.replace(/^\//, ''));
}

function resolveKey(f, token) {
    if (!token || token.startsWith('#') || /^(https?:|mailto:)/.test(token)) return null;
    let t = token.replace(/\.md$/, '');
    if (!t) return null;
    if (t.startsWith('/')) return t;
    if (!t.includes('/')) {
        const dir = path.dirname(f).replace(DOCS, '');
        return dir + '/' + t;
    }
    const first = t.split('/')[0];
    if (SECTIONS.has(first)) return '/' + t.replace(/\/$/, '');
    const abs = path.resolve(path.dirname(f), t).replace(/\.md$/, '');
    return abs.replace(DOCS, '') || null;
}

let totalChanged = 0;
const unresolved = new Map();

for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let inFence = false;
    let changed = 0;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
        if (inFence) continue;
        const parts = lines[i].split('`');
        for (let s = 0; s < parts.length; s += 2) { // even indexes are outside inline code
            parts[s] = parts[s].replace(/\]\(([^)\s]+)\)/g, (whole, token) => {
                const anchor = token.includes('#') ? '#' + token.split('#').slice(1).join('#') : '';
                const base = anchor ? token.slice(0, token.length - anchor.length) : token;
                const key = resolveKey(f, base);
                if (!key) return whole;
                const target = perm.get(key) || perm.get(key.replace(/\/$/, ''));
                if (!target) {
                    const k = f.replace(DOCS + '/', '') + ' -> ' + token;
                    unresolved.set(k, (unresolved.get(k) || 0) + 1);
                    return whole;
                }
                changed++;
                return '](' + target + anchor + ')';
            });
        }
        lines[i] = parts.join('`');
    }
    if (changed) {
        fs.writeFileSync(f, lines.join('\n'));
        console.log('rewrote', changed, 'links in', f.replace(DOCS + '/', ''));
        totalChanged += changed;
    }
}

console.log('\ntotal links rewritten:', totalChanged);
if (unresolved.size) {
    console.log('\nunresolved (left as-is):');
    for (const [k, n] of [...unresolved].sort()) console.log('  ' + k + (n > 1 ? ' x' + n : ''));
} else {
    console.log('unresolved: none');
}
