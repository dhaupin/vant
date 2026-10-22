#!/usr/bin/env node
/**
 * web/ home gate (pass 150, moved pass 321).
 *
 * web/home/index.html is the public home page (vant.creadev.org) and sits
 * OUTSIDE the docs lint scope (check-docs-style/check-docs-links walk
 * docs/*.md only). That gap let real fiction ship twice: the `npm install
 * -g vant` wrong-package trap re-seeded in the hero terminal + HowTo
 * JSON-LD (uprooted again in pass 149), and a stale stat row survived four
 * passes. This gate closes the blind spot.
 *
 * Checks, on every *.html under web/home/:
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
const HOME = path.join(ROOT, 'web', 'home');
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

// ---- walk web/home/*.html (the reference backup) + the built artifact ----
// The v-home site is now React + prestruct: the checked-in web/home/index.html
// moved to index.bak.html (design reference), and the deploy artifact is the
// generated web/home/dist/index.html (gitignored, npm run build:home). When a
// build exists locally, gate BOTH so the shipped HTML keeps every fiction
// check; without a build the backup still gets swept.
const landing = [];
const distIndex = path.join(HOME, 'dist', 'index.html');
const distIndexExists = fs.existsSync(distIndex);
if (distIndexExists) landing.push(distIndex);
(function walkHome(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.name === 'node_modules' || f.name === 'vendor') continue; // dependency payloads, not site HTML
        const p = d + '/' + f.name;
        if (f.isDirectory()) walkHome(p);
        else if (f.name.endsWith('.html')) landing.push(p);
    }
})(HOME);
if (landing.length === 0) {
    console.log('HOME PAGE: no .html files under web/home/ — nothing to check. PASS (empty).');
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
        // In the built multi-route site (web/home/dist), a root-relative ref
        // is either a prerendered ROUTE (/status -> dist/status/index.html)
        // or a copied asset (/vant-og.png -> dist/vant-og.png). Try the route
        // shapes first, then the raw path; outside dist the raw path rule
        // applies unchanged.
        const cands = [ref.startsWith('/') ? path.join(ROOT, ref.slice(1)) : path.resolve(path.dirname(file), ref.split('#')[0].split('?')[0])];
        // The vite app shell references its own source tree (/src/main.jsx is
        // the module entry vite resolves at build time) - try a web/home-
        // relative resolution before flagging it.
        if (ref.startsWith('/')) cands.push(path.join(HOME, ref.slice(1)));
        if (ref.startsWith('/') && distIndexExists) {
            const rel = ref.slice(1).replace(/\?.*$/, '');
            cands.push(path.join(HOME, 'dist', rel, 'index.html'));
            cands.push(path.join(HOME, 'dist', rel + '.html'));
            cands.push(path.join(HOME, 'dist', rel));
        }
        if (!cands.some(c => fs.existsSync(c))) problems.push(`${rel}: local ref "${ref}" does not exist on disk (or as a built route)`);
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
    console.error(`HOME PAGE: FAIL (${problems.length} issue${problems.length === 1 ? '' : 's'})`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
}
console.log(`HOME PAGE: PASS (${landing.length} file${landing.length === 1 ? '' : 's'}, ${permalinks.size} docs permalinks)`);
