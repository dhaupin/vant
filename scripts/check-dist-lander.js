#!/usr/bin/env node
/**
 * dist/ lander gate (pass 150).
 *
 * dist/index.html is the public lander (vant.creadev.org) and sits OUTSIDE
 * the docs lint scope (check-docs-style/check-docs-links walk docs/*.md
 * only). That gap let real fiction ship twice: the `npm install -g vant`
 * wrong-package trap re-seeded in the hero terminal + HowTo JSON-LD
 * (uprooted again in pass 149), and a stale stat row (93 CLI commands etc.)
 * survived four passes. This gate closes the blind spot.
 *
 * Checks, on every *.html under dist/:
 *   1. Local fragments     href="#x" must match an id="x" in the same file
 *   2. Local assets        href/src not http(s)# must exist on disk (vendor/, images, /-rooted)
 *   3. Docs links          https://docs.creadev.org/vant/<p> must match a real
 *                          frontmatter permalink in docs/ (permalink + baseurl
 *                          /vant, mirroring check-docs-links.js)
 *   4. GitHub links        https://github.com/dhaupin/vant... shape sanity
 *   5. Fiction grep        `npm install -g vant` must NEVER appear (the
 *                          wrong-package trap; grep it in copy and code blocks)
 *   6. Stat sanity         data-count attributes must be positive integers
 *
 * Exit 1 on any failure, with the evidence inline so the fix is one read away.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DOCS = path.join(ROOT, 'docs');

const problems = [];

// ---- permalink set (same normalization as check-docs-links.js) ----
const norm = (s) => {
    s = '/' + String(s).replace(/^\/+|\/+$/g, '');
    return s === '/' ? '/' : s;
};
const permalinks = new Set();
(function walkDocs(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_plugins') walkDocs(p);
        else if (f.name.endsWith('.md')) {
            const m = fs.readFileSync(p, 'utf8').match(/^permalink: (\S+)/m);
            if (m) permalinks.add(norm(m[1]));
        }
    }
})(DOCS);

// ---- walk dist/*.html ----
const landing = [];
(function walkDist(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory()) walkDist(p);
        else if (f.name.endsWith('.html')) landing.push(p);
    }
})(DIST);
if (landing.length === 0) {
    console.log('DIST LANDER: no .html files under dist/ — nothing to check. PASS (empty).');
    process.exit(0);
}

for (const file of landing) {
    const rel = path.relative(ROOT, file);
    const html = fs.readFileSync(file, 'utf8');

    // 1. fragments
    const ids = new Set();
    for (const m of html.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);
    for (const m of html.matchAll(/href="#([^"]+)"/g)) {
        if (!ids.has(m[1])) problems.push(`${rel}: fragment #${m[1]} has no matching id on the page`);
    }

    // 2. local assets / root-relative links
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const ref = m[1];
        if (/^(https?:)?\/\//.test(ref)) continue;      // absolute URL — other rules
        if (ref.startsWith('#')) continue;              // fragment — rule 1
        if (/^data:/.test(ref)) continue;               // inline data URI
        if (/^mailto:/.test(ref)) continue;
        const local = ref.startsWith('/') ? path.join(ROOT, ref.slice(1)) : path.resolve(path.dirname(file), ref.split('#')[0].split('?')[0]);
        if (!fs.existsSync(local)) problems.push(`${rel}: local ref "${ref}" does not exist on disk`);
    }

    // 3. docs.creadev.org/vant/<permalink> must resolve to a real page
    for (const m of html.matchAll(/https:\/\/docs\.creadev\.org(\/[^"<\s)]*)/g)) {
        const pathName = m[1] === '/vant' ? '/' : m[1];
        const withoutBase = norm(pathName.replace(/^\/vant/, '')) || '/';
        if (!permalinks.has(withoutBase)) {
            problems.push(`${rel}: docs link "https://docs.creadev.org${m[1]}" matches no docs permalink ("/vant" + permalink)`);
        }
    }

    // 4. github link shape (typos in owner/repo are the observed failure mode)
    for (const m of html.matchAll(/https:\/\/github\.com\/[^"<\s)]+/g)) {
        if (!/^https:\/\/github\.com\/dhaupin\/vant(\.git(\/|$|#)?|\/|$|[#?)])/.test(m[0])) {
            problems.push(`${rel}: github link "${m[0]}" is not under dhaupin/vant`);
        }
    }

    // 5. the wrong-package fiction, in any form
    if (/npm\s+install\s+(-g|--global)\s+vant/i.test(html)) {
        problems.push(`${rel}: references "npm install -g vant" — the vant npm package is an unrelated Vue UI library (install is clone + npm ci)`);
    }

    // 6. stat counters must ship positive integers as truth
    for (const m of html.matchAll(/data-count="([^"]+)"/g)) {
        if (!/^\d+$/.test(m[1]) || parseInt(m[1], 10) < 1) {
            problems.push(`${rel}: data-count="${m[1]}" is not a positive integer (markup must ship the real value)`);
        }
    }
}

if (problems.length) {
    console.error(`DIST LANDER: FAIL (${problems.length} issue${problems.length === 1 ? '' : 's'})`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
}
console.log(`DIST LANDER: PASS (${landing.length} file${landing.length === 1 ? '' : 's'}, ${permalinks.size} docs permalinks)`);
