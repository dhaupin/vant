/**
 * Vant Security Pipeline Scanner — "scan lib, confirm modules use the
 * middleware pipeline, display lib modules outside the pipeline (unless
 * whitelisted)." (Owner directive, 2026-10-16; spec: labs/prd-web.md 4.4)
 *
 * POD-SIDE truth for the dashboard's pipeline card. The frontend NEVER
 * reads the pod's source (web/dashboard one-way boundary); the door
 * exposes `security_pipeline_report` and the dashboard renders the
 * report verbatim — nothing greenwashed: an unwired module shows as
 * unwired, a whitelisted one as exempt (a stated operator choice, not
 * a colored-over gap).
 *
 * Wiring evidence is a require of the middleware chain named in
 * AGENTS.md's loading order: sandbox -> vaf -> qos -> escrow. Audit +
 * habitat adjacency are recorded as INFORMATIONAL, never gates. This is
 * an evidence scan, not a verdict: the scanner reports, the operator
 * decides (it never auto-flips config for an unwired module).
 */

const fs = require('fs');
const path = require('path');

const REPORT_VERSION = 1;

/** The middleware chain layers that count as "in the pipeline". */
const GATE_LAYERS = ['sandbox', 'vaf', 'qos', 'escrow'];

/** Informational-only adjacency (reported in `layers`, never in `wired`). */
const INFO_LAYERS = ['audit', 'habitat'];

const LAYERS = [...GATE_LAYERS, ...INFO_LAYERS];

function _layerRe(layer) {
    // A require whose argument ENDS IN the layer name (./vaf, ../lib/qos,
    // 'vaf.js'), in single or double quotes. Bounded so 'vaf-connect' or
    // 'require()' internals never match for vaf.
    return new RegExp(
        "require\\s*\\(\\s*['\"][^'\"]*?\\b" + layer +
        "(?:\\.js)?['\"]\\s*\\)", 'g');
}

function classifyFile(fullPath, baseDir) {
    const name = path
        .relative(baseDir, fullPath)
        .replace(/\.js$/, '')
        .split(path.sep)
        .join('/');
    let source = '';
    let readable = true;
    try {
        source = fs.readFileSync(fullPath, 'utf8');
    } catch {
        readable = false; // fail honest: unreadable file stays in the report
    }
    const layers = {};
    for (const layer of LAYERS) {
        layers[layer] = readable && _layerRe(layer).test(source);
    }
    const wired = readable ? GATE_LAYERS.filter((l) => layers[l]) : [];
    return { name, readable, layers, wired };
}

/**
 * Scan a directory tree of pod lib modules.
 * @param {string}   dir  directory to walk (pod passes ./lib; tests pass a tmp fixture)
 * @param {Object}   [opts]
 * @param {string[]} [opts.allow] module names (repo-relative, no .js) to
 *   exempt. Merged with the operator's `security.pipelineAllow` brain
 *   config by the door verb; scan() itself takes the flat list.
 * @param {number}   [opts.maxDepth] 1 = top-level only (default), deeper = recurse.
 * @returns {{v:number, generatedAt:string, dir:string, scanned:number,
 *   modules:Array, unwired:string[], exempt:string[]}}
 */
function scan(dir, opts = {}) {
    const allow = Array.isArray(opts.allow) ? opts.allow : [];
    const allowSet = new Set(allow.map((n) => String(n).replace(/\.js$/, '')));
    const maxDepth = Number.isInteger(opts.maxDepth) && opts.maxDepth > 0
        ? opts.maxDepth
        : 1;

    const modules = [];
    const exempt = [];
    const walk = (d, depth) => {
        let entries = [];
        try {
            entries = fs.readdirSync(d, { withFileTypes: true })
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch {
            return; // unreadable dir: honest zero, doors still shape the refusal
        }
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) {
                if (depth + 1 < maxDepth) walk(full, depth + 1);
                continue;
            }
            if (!e.name.endsWith('.js')) continue;
            // maxDepth 1 (default) = the top-level module set: only files AT
            // depth 0 are collected; deeper files are skipped unless maxDepth
            // reaches that level. Shallow is the DEFAULT so the report stays
            // a module-root census, and a nested file can never leak in.
            if (depth >= maxDepth) continue;
            const m = classifyFile(full, dir);
            const rule = (n) => n.startsWith('.') || n.endsWith('.test.js') || n.endsWith('.spec.js');
            if (rule(m.name) || allowSet.has(m.name)) {
                exempt.push(m.name);
                continue;
            }
            modules.push(m);
        }
    };
    walk(dir, 0);

    const unwired = modules.filter((m) => m.wired.length === 0).map((m) => m.name);
    return {
        v: REPORT_VERSION,
        generatedAt: new Date().toISOString(),
        dir,
        scanned: modules.length + exempt.length,
        modules,
        unwired,
        exempt,
    };
}

module.exports = { scan, GATE_LAYERS, INFO_LAYERS, LAYERS, REPORT_VERSION };
