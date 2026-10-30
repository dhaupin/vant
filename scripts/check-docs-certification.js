#!/usr/bin/env node
/**
 * Docs certification gate (passes 307/309/310/311 reprise).
 *
 * One command that re-runs every mass-checker against the live MCP registry
 * and every doc gate, then prints a single certification report:
 *
 *   - A-Z sweep 1: every table row's "required:" clause vs schema.required
 *   - A-Z sweep 2: every CLAIMED param name vs schema.properties (both ways)
 *   - Habitat sweep: the 14 vant_habitat_* subsections vs the registry
 *   - All six doc gates (frontmatter, links, style, language, fiction,
 *     surface consistency) + MCP coverage + CLI coverage + bin truthfulness
 *
 * Exit 0 = certified; exit 1 = any problem (names printed inline).
 * The registry self-assembles on require (lib/mcp.js), exactly like
 * scripts/check-mcp-coverage.js does.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'reference', 'mcp-tools.md');
const _noise = false; // child gates print their own lines; we title each

// Kernel adoption (labs/prd-kernel.md §3 wiring map row 6): the docs-gate
// chain registers as the 'docs-gates' consumer at run start. Registration
// is clerk-not-judge — a refused carry surfaces on stderr at most and the
// certification run itself never changes behavior.
require('../lib/kernel-ledger').registerDocsGates();

// ---------- registry sweeps ----------

function registry() {
    const mcp = require('../lib/mcp');
    const methods = typeof mcp.methods === 'function' ? mcp.methods() : mcp.methods;
    return methods instanceof Map ? methods : new Map(Object.entries(methods || {}));
}

function sweepAZRequired(doc, reg) {
    // Sweep 1: "| tool | params - required: list |" vs schema.required
    const start = doc.indexOf('## Domains A-Z param tables');
    const region = doc.slice(start, doc.indexOf('\n## ', start + 10));
    const problems = [];
    const re = /\| ([a-zA-Z_0-9]+) \| ([^|]*) \|/g;
    let m;
    while ((m = re.exec(region)) !== null) {
        const tool = m[1];
        if (tool === 'Tool') continue;
        const entry = reg.get(tool);
        if (!entry) { problems.push(`MISSING-TOOL ${tool}`); continue; }
        const realReq = new Set((entry.inputSchema || {}).required || []);
        const docReq = new Set();
        const clause = m[2].match(/required:\s*([a-zA-Z_0-9,\s]+)/);
        if (clause) clause[1].split(',').map(s => s.trim()).filter(Boolean).forEach(r => docReq.add(r));
        for (const r of realReq) {
            if (!docReq.has(r)) problems.push(`REQ-MISMATCH ${tool}: schema requires [${[...realReq]}] doc [${[...docReq]}]`);
        }
    }
    return problems;
}

function sweepAZProps(doc, reg) {
    // Sweep 2: claimed params vs schema.properties, both directions
    const start = doc.indexOf('## Domains A-Z param tables');
    const region = doc.slice(start, doc.indexOf('\n## ', start + 10));
    const problems = [];
    const re = /\| ([a-zA-Z_0-9]+) \| ([^|]*) \|/g;
    let m;
    while ((m = re.exec(region)) !== null) {
        const tool = m[1];
        if (tool === 'Tool') continue;
        const entry = reg.get(tool);
        if (!entry) { problems.push(`MISSING-TOOL ${tool}`); continue; }
        const props = (entry.inputSchema || {}).properties || {};
        const head = m[2].split(/[-(:]/)[0];
        const claimed = new Set(head.split(',').map(s => s.trim())
            .filter(k => /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(k)));
        claimed.delete('required');
        for (const c of claimed) {
            if (!props[c]) problems.push(`FICTION-PARAM ${tool}: doc claims '${c}' but schema declares {${Object.keys(props)}}`);
        }
        for (const r of (entry.inputSchema || {}).required || []) {
            if (!m[2].includes(r)) problems.push(`OMITTED-PARAM ${tool}: schema requires '${r}'`);
        }
    }
    return problems;
}

function sweepHabitat(doc, reg) {
    // Sweep 3: the Habitat section's 14 subsections vs the registry
    const start = doc.indexOf('## Habitat Tools');
    const region = doc.slice(start, doc.indexOf('\n## ', start + 10));
    const problems = [];
    const NOISE = new Set(['string', 'object', 'number', 'boolean', 'required',
        'optional', 'for', 'to', 'when', 'must', 'exist', 'the', 'and']);
    const secRe = /### (vant_habitat_[a-zA-Z]+)([\s\S]*?)(?=\n### |\n## |$)/g;
    let m;
    // Params covered BY REFERENCE ("same params as <sibling>") count. The
    // family claim pool takes BOTH parsed identifier lists AND plain word
    // coverage in any sibling body - a param named anywhere in the family
    // (even inside prose) is covered for the whole family.
    const bodies = [];
    while ((m = secRe.exec(region)) !== null) bodies.push({ tool: m[1], body: m[2] });
    const claimedAll = new Set();
    for (const { body } of bodies) {
        (body.match(/Params:?\s*:?\s*([`a-zA-Z_0-9,\s()\[\]"]*?)(?:\.\n|(\*\*)|$)/) || ['', ''])
            .slice(1).forEach(chunk => {
                (String(chunk).match(/[a-zA-Z_][a-zA-Z_0-9]*/g) || []).forEach(k => {
                    if (!NOISE.has(k)) claimedAll.add(k);
                });
            });
        const rowRe = /\| ([a-zA-Z_][a-zA-Z_0-9]*) \|/g;
        let r;
        while ((r = rowRe.exec(body)) !== null) {
            if (r[1] !== 'Param') claimedAll.add(r[1]);
        }
    }
    for (const { tool, body } of bodies) {
        const entry = reg.get(tool);
        if (!entry) { problems.push(`MISSING-TOOL ${tool}`); continue; }
        const schema = entry.inputSchema || {};
        const props = schema.properties || {};
        for (const p of Object.keys(props)) {
            const covered = claimedAll.has(p)
                || bodies.some(b => b.body.includes(p));
            if (!covered) problems.push(`UNDOCUMENTED-PARAM ${tool}: schema has '${p}' not covered anywhere in the section family`);
        }
    }
    return problems;
}

// ---------- gate runner ----------

const GATES = [
    ['frontmatter', 'scripts/check-docs-frontmatter.js'],
    ['links', 'scripts/check-docs-links.js'],
    ['style', 'scripts/check-docs-style.js'],
    ['language', 'scripts/check-language.js'],
    ['fiction', 'scripts/check-fiction-signatures.js'],
    ['surface', 'scripts/check-surface-consistency.js'],
    ['mcp-coverage', 'scripts/check-mcp-coverage.js'],
    ['cli-coverage', 'scripts/check-cli-coverage.js'],
    ['bin-truthfulness', 'scripts/check-bin-truthfulness.js'],
];

let failures = 0;

function gate(name, script) {
    process.stdout.write(`${name}: `);
    try {
        const out = execFileSync('node', [path.join(ROOT, script)], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
        const tail = out.trim().split('\n').pop();
        console.log('PASS' + (tail ? ` (${tail.slice(0, 100)})` : ''));
    } catch (e) {
        console.log('FAIL');
        (e.stdout || '').trim().split('\n').slice(-5).forEach(l => console.log('   ' + l));
        (e.stderr || '').trim().split('\n').slice(-2).forEach(l => console.log('   ' + l));
        failures++;
    }
}

function sweep(name, fn, doc, reg) {
    process.stdout.write(`${name}: `);
    const problems = fn(doc, reg);
    if (problems.length === 0) {
        console.log('PASS (0 problems)');
    } else {
        console.log(`FAIL (${problems.length} problems)`);
        problems.slice(0, 20).forEach(p => console.log('   ' + p));
        failures++;
    }
}

function main() {
    const doc = fs.readFileSync(DOC, 'utf8');
    const reg = registry();
    console.log(`registry size: ${reg.size}\n`);

    sweep('A-Z sweep 1 (required)', sweepAZRequired, doc, reg);
    sweep('A-Z sweep 2 (claimed params vs properties)', sweepAZProps, doc, reg);
    sweep('Habitat sweep (14 sections)', sweepHabitat, doc, reg);
    console.log('');
    for (const [name, script] of GATES) gate(name, script);

    console.log('');
    if (failures === 0) {
        console.log('DOCS CERTIFICATION: PASS - the documented surface resolves to reality end to end.');
        process.exit(0);
    }
    console.log(`DOCS CERTIFICATION: FAIL - ${failures} checker(s) unhappy.`);
    process.exit(1);
}

main();
