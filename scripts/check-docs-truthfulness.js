#!/usr/bin/env node
/**
 * Docs truthfulness gate (R3-F9, #193) - the checker the docs-parity
 * rounds (#191-#194) kept asking for: verify what the prose PROMISES
 * exists against the actual tree, mechanically.
 *
 * Three check classes (all conservative: unknown shapes are skipped,
 * only PROVEN-absent findings fail):
 *
 * 1. LIB REFERENCES - every `require('./lib/x')` inside docs markdown
 *    must resolve to a real file (lib/x.js, lib/x/index.js, lib/x.mjs).
 *
 * 2. CLI VERBS - every `vant <verb> [sub...]` fenced/inline in docs must
 *    route to something real: bin/vant.js COMMANDS table, or a routed
 *    bin/<verb>.js with a matching subcommand in its sample, or a
 *    known dispatcher built-in. Only flags verbs whose FIRST token is
 *    entirely unknown (proven-absent class).
 *
 * 3. LIB MODULE EXPORTS - for `require('./lib/x')` mentions, named
 *    method call docs (lib/x.method(` or `x.method(` right after an
 *    intro) are NOT checked yet (too shape-dependent); this checker's
 *    job is the cheap PROVEN classes: module existence + command
 *    existence. Deeper export checking stays with the round process.
 *
 * Fenced code blocks and inline code spans are the scan targets (the
 * same data-domain check-docs-style.js uses). Prose without code is not
 * parsed.
 *
 * Escape hatch: `<!-- TRUTHFULNESS-OK: reason -->` line exempts the
 * single line after it.
 *
 * Run: node scripts/check-docs-truthfulness.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const README = path.join(ROOT, 'README.md');

// ---------------------------------------------------------------------------
// CLI-verb truth source
// ---------------------------------------------------------------------------

function vantCommands() {
    const src = fs.readFileSync(path.join(ROOT, 'bin', 'vant.js'), 'utf8');
    const names = new Set();
    // COMMANDS maps like: `name: 'bin/foo.js',` - keep loose. Values may be
    // 'foo.js' (relative), 'bin/foo.js', null (inline handler), or comment-suffixed.
    const re = /([a-z][a-z0-9-]*)\s*:\s*(?:'[^']*'|null)\s*,?/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        // Only take keys that appear inside the COMMANDS object slice (first
        // ~250 lines), otherwise random object keys in handlers drip in.
        if (m.index > 12000) break;
        names.add(m[1]);
    }
    // Dispatcher built-ins seen in help/routing code ("case 'xxx'" anywhere)
    const caseRe = /case\s+'([a-z][a-z0-9-]*)'\s*:/g;
    while ((m = caseRe.exec(src)) !== null) names.add(m[1]);
    // Cross-tool verbs advertised in bin/help.js (help-cards - the secondary
    // truth source the dispatcher delegates to)
    try {
        const help = fs.readFileSync(path.join(ROOT, 'bin', 'help.js'), 'utf8');
        const cardRe = /name\s*:\s*'([a-z][a-z0-9-]*)'/g;
        while ((m = cardRe.exec(help)) !== null) names.add(m[1]);
    } catch (e) { /* help.js unavailable - first source only */ }
    return names;
}

function routedBinVerbs() {
    const dir = path.join(ROOT, 'bin');
    const set = new Set();
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        set.add(f.replace(/\.js$/, ''));
    }
    return set;
}

const BIN_ALLOW = new Set(['vant', 'all', 'help', 'version', '-h', '--help',
    // non-vant tools that appear in fenced install blocks with a vant shape
    'npm', 'npx', 'git', 'docker', 'node', 'yarn', 'pnpm', 'bun'
]);

function libResolves(rel) {
    // rel like './lib/foo' (no extension) or with one
    const candidates = [
        path.join(ROOT, rel + '.js'),
        path.join(ROOT, rel, 'index.js'),
        path.join(ROOT, rel + '.mjs'),
        path.join(ROOT, rel + '.json')
    ];
    return candidates.some(p => fs.existsSync(p) && fs.statSync(p).isFile());
}

// ---------------------------------------------------------------------------
// Scan one markdown file
// ---------------------------------------------------------------------------

function stripExemptLines(text) {
    // TRUTHFULNESS-OK exempts the SINGLE line after the comment (agents
    // cite the exact promise they are waiving).
    const lines = text.split('\n');
    return lines.map((line, i) => {
        if (/TRUTHFULNESS-OK/.test(line) && lines[i + 1] !== undefined) {
            lines[i + 1] = '';
        }
        return /TRUTHFULNESS-OK/.test(line) ? '' : null;
    }).map((v, i) => (v === null ? lines[i] : '')).join('\n');
}

function codeSpans(text) {
    // Inline code + fenced blocks (fenced blocks have no backticks to nest
    // for our hapless prose target)
    const spans = [];
    // Fenced blocks
    const fenceRe = /```[\s\S]*?```/g;
    let m;
    while ((m = fenceRe.exec(text)) !== null) spans.push(m[0]);
    // Inline spans (single passes)
    const inlineRe = /`[^`\n]+`/g;
    while ((m = inlineRe.exec(text)) !== null) spans.push(m[0]);
    return spans;
}

function checkFile(file, ctx) {
    const findings = [];
    const raw = fs.readFileSync(file, 'utf8');
    const text = stripExemptLines(raw);
    const rel = path.relative(ROOT, file);

    for (const span of codeSpans(text)) {
        // 1) lib requires
        const reqRe = /require\('\.\/(lib\/[a-z0-9-]+)'\)/g;
        let m;
        while ((m = reqRe.exec(span)) !== null) {
            const relPath = m[1];
            const line = raw.substr(0, raw.indexOf(m[0])).split('\n').length;
            if (!libResolves(m[1])) {
                findings.push(`${rel}:${line} lib module does not exist: ${relPath}`);
            }
        }

        // 2) CLI verbs: `vant <verb> ...`. Guard: the token "vant" must
        // not be an arbitrary word ("environment", "vantage") - require a
        // shell prompt context or bin/vant.js path or start-of-line
        const verbRe = /(?:^|\n|&&|;|\$ )\s*(?:vant|node\s+bin\/vant\.js)\s+([a-z][a-z0-9-]*)(\s+[a-z-][a-z0-9-]*)?/g;
        const scannable = ' ' + span.replace(/^\s*```[a-z]*\s*\n?/, '').replace(/```\s*$/, '');
        while ((m = verbRe.exec(scannable)) !== null) {
            const verb = m[1];
            const sub = m[2] ? m[2].trim() : null;
            if (BIN_ALLOW.has(verb)) continue;
            if (ctx.commands.has(verb) || ctx.bins.has(verb)) continue;
            // m[0] is relative to scannable - backtrack via verb occurrence in span
            const verbIdx = span.indexOf('vant ' + verb);
            const line = verbIdx === -1 ? 0 : raw.substr(0, raw.indexOf(span.slice(0, verbIdx + 12))).split('\n').length;
            findings.push(`${rel}:${line} unknown vant verb in docs: ${verb}${sub ? ' ' + sub : ''}`);
        }
    }

    return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function walk(dir, out) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (f.endsWith('.md')) out.push(p);
    }
}

function main() {
    const files = [];
    walk(DOCS_DIR, files);
    files.push(README);

    const ctx = { commands: vantCommands(), bins: routedBinVerbs() };

    const findings = [];
    for (const f of files) {
        try { findings.push(...checkFile(f, ctx)); }
        catch (e) { findings.push(`${path.relative(ROOT, f)}: unreadable (${e.message})`); }
    }

    if (findings.length === 0) {
        console.log(`DOCS TRUTHFULNESS: PASS (${files.length} markdown files, ${ctx.commands.size} routed verbs cross-checked)`);
        process.exit(0);
    }
    console.log(`DOCS TRUTHFULNESS: FAIL (${findings.length} proven-absent promises)\n`);
    for (const f of findings) console.log('  ' + f);
    console.log('\nFix the promise in the doc OR add the missing thing to the tree.');
    console.log('Deliberate fiction/preview: exempt with <!-- TRUTHFULNESS-OK: reason --> on the line.');
    process.exit(1);
}

main();
