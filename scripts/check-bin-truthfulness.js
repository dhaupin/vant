#!/usr/bin/env node
/**
 * bin/ truthfulness gate (pass 80) — extends lint:helpers to bin/.
 *
 * Two checks, both born from bugs that actually shipped:
 *
 * 1. THROWAWAY HELPERS in bin/ — the pass 77/78 genre (escrow hold/release,
 *    server use/listen/stop, error onError) with the same detection as
 *    scripts/check-stateful-helpers.js, applied to bin/*.js. Catch-through
 *    helpers `=> new X().method(...)` on stateful classes are blocked;
 *    factories (`() => new X()`) stay exempt.
 *
 * 2. STATUS-FIELD TRUTHFULNESS — the bin/escrow.js genre (pass 77): status
 *    code reading `status.held` / `status.budgets` / `status.approvals` /
 *    `status.quotas` fields that NEVER existed on the real status shape, so
 *    the CLI printed hardcoded zeros forever. The gate now:
 *      a. Tripwires the exact phantom-field family on getStatus()/
 *         getLayerStatus() results in the same file (gatherState is the
 *         correct primitive for ledger fields).
 *      b. Cross-checks every bin/ read of a status object's fields against
 *         the object keys the lib function actually returns. Unknown
 *         internals (spread, dynamic keys, unresolved method) are skipped —
 *         the gate only flags fields PROVEN absent from every lib body that
 *         defines the method.
 *
 * Escape hatch: `// STATUS-FIELD-OK: <reason>` on the line opts out of (a).
 *
 * Negative controls live in test/run-all.js-adjacent history: before
 * trusting a PASS, temporarily drop a violating file into bin/ and confirm
 * the gate FAILS (pass 79 lesson — a gate without a negative control is a
 * rubber stamp; the first helpers gate missed member-expression `new ns.X()`
 * until one was tried).
 *
 * Run: node scripts/check-bin-truthfulness.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const LIB_DIR = path.join(ROOT, 'lib');

// ---- shared with check-stateful-helpers.js (kept standalone on purpose) ----

function extractClassBody(src, classIdx) {
    let i = src.indexOf('{', classIdx);
    if (i === -1) return null;
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return { start: src.indexOf('{', classIdx) + 1, end: i };
        }
    }
    return null;
}

function classIsStateful(src, className) {
    const declIdx = src.indexOf('class ' + className);
    if (declIdx === -1) return null;
    const body = extractClassBody(src, declIdx);
    if (!body) return null;
    const text = src.slice(body.start, body.end);
    return /this\.[a-zA-Z_$][\w$]*\s*=[^=]/.test(text) ||
           /this\.[a-zA-Z_$][\w$]*\.(set|push|add|delete|incr)\s*\(/.test(text);
}

// ---- check 1: throwaway helpers in bin/ ----

function scanThrowawayHelpers() {
    const violations = [];
    const binFiles = fs.readdirSync(BIN_DIR).filter(f => f.endsWith('.js'));
    const libFiles = fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.js'));

    const classes = new Map();
    for (const f of libFiles.concat(binFiles)) {
        const full = f.endsWith('.js') && fs.existsSync(path.join(BIN_DIR, f)) && binFiles.includes(f)
            ? path.join(BIN_DIR, f) : path.join(LIB_DIR, f);
        const src = fs.readFileSync(full, 'utf8');
        const re = /\bclass\s+([A-Z][\w$]*)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            if (!classes.has(m[1])) {
                classes.set(m[1], { stateful: classIsStateful(src, m[1]) });
            }
        }
    }

    for (const f of binFiles) {
        const rel = 'bin/' + f;
        const lines = fs.readFileSync(path.join(BIN_DIR, f), 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const m = line.match(/=>\s*new\s+(?:[\w$]+\.)?([A-Z][\w$]*)\s*\(\s*\)/);
            if (!m) continue;
            const isFactory = !/=>\s*new\s+(?:[\w$]+\.)?[A-Z][\w$]*\s*\(\s*\)\s*\./.test(line);
            if (isFactory) continue;
            const cls = m[1];
            const info = classes.get(cls);
            const stateful = info ? info.stateful : true;
            if (stateful === false) continue;
            if (/HELPER-MODEL:/.test(line)) continue;
            violations.push(`${rel}:${i + 1}  helper builds throwaway ${cls} (${info ? (info.stateful ? 'class carries this.-state' : 'state unknown') : 'class not found — verify it is stateless'})`);
        }
    }
    return violations;
}

// ---- check 2: status-field truthfulness ----

// Fields from the escrow hardcode genre that never existed on any
// getStatus()/getLayerStatus() shape — ledger data lives in gatherState().
const PHANTOM_FIELDS = ['held', 'budgets', 'approvals', 'quotas'];

// Accessors that are methods/behavior, not data fields — never truth-check.
const NON_FIELD = new Set(['length', 'map', 'filter', 'reduce', 'forEach', 'join',
    'trim', 'split', 'slice', 'includes', 'indexOf', 'toUpperCase', 'toLowerCase',
    'replace', 'then', 'catch', 'json', 'keys', 'values', 'entries', 'has',
    'get', 'set', 'add', 'delete', 'size', 'toString', 'status']);

const STATUS_METHODS = ['getStatus', 'getLayerStatus', 'gatherState',
    'getRateLimiterStatus', 'remoteStatus', 'getStatusSnapshot'];

/**
 * Balanced-brace body of `function NAME` / method `NAME(` in src.
 * (pass 80) Module-level `function name(` at column 0 is preferred over
 * same-name class methods — bin/qos.js reads the MODULE getStatus(), and
 * picking the first class-method body produced a false positive on a real
 * field. Falls back to the 4-space method form when no module fn exists.
 */
function findFunctionBody(src, name) {
    const attempts = [
        new RegExp('^function\\s+' + name + '\\s*\\(', 'm'),          // module-level fn
        new RegExp('^\\s{4}(?:async\\s+)?' + name + '\\s*\\([^)]*\\)\\s*\\{', 'm') // class method
    ];
    for (const re of attempts) {
        const m = re.exec(src);
        if (!m) continue;
        let i = src.indexOf('{', m.index);
        if (i === -1) continue;
        let depth = 0;
        const start = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) return src.slice(start, i + 1);
            }
        }
    }
    return null;
}

/** Data-field keys an object literal in `body` returns. null = unknowable. */
function returnedKeys(body) {
    if (!body) return null;
    if (/\.\.\./.test(body)) return null; // spread → shape is dynamic
    const keys = new Set();
    const multiline = /^\s+([a-zA-Z_$][\w$]*)\s*:/gm;
    let m;
    while ((m = multiline.exec(body)) !== null) keys.add(m[1]);
    const inline = /[,{(]\s*([a-zA-Z_$][\w$]*)\s*:/g;
    while ((m = inline.exec(body)) !== null) keys.add(m[1]);
    // (pass 80 negative-control lesson) A body with NO object literal — e.g.
    // a one-line delegation `return this._x.getStatus()` — proves NOTHING
    // about the shape. Zero keys = unknowable, never "empty shape". Flagging
    // requires positive proof the field is absent from a real literal.
    if (keys.size === 0) return null;
    return keys;
}

/** All lib bodies defining `name`, preferring the file `receiver` maps to. */
function resolveMethod(receiver, name, varMap) {
    const bodies = [];
    const preferred = varMap.get(receiver);
    if (preferred) {
        const src = fs.readFileSync(path.join(LIB_DIR, preferred), 'utf8');
        const b = findFunctionBody(src, name);
        if (b) bodies.push({ file: preferred, keys: returnedKeys(b) });
    }
    if (!bodies.length) {
        for (const f of fs.readdirSync(LIB_DIR).filter(x => x.endsWith('.js'))) {
            const src = fs.readFileSync(path.join(LIB_DIR, f), 'utf8');
            const b = findFunctionBody(src, name);
            if (b) bodies.push({ file: f, keys: returnedKeys(b) });
        }
    }
    return bodies;
}

/**
 * Comment-stripped copy of the source, line-aligned. (pass 80) Without
 * this the gate flagged its OWN fix comments (`// status.running never
 * existed...`) — the escrow genre's documentation quote-marks the crime.
 * Handles // line comments and /* ... *​/ block comments; string literals
 * are left as-is (status code rarely hides '.field' inside strings, and
 * conservatism here only risks extra review, never a silent pass).
 */
function stripComments(src) {
    return src.split('\n').map(line => {
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return '';
        return line.replace(/\/\/.*$/, '');
    }).join('\n');
}

function scanStatusTruthfulness() {
    const violations = [];
    const binFiles = fs.readdirSync(BIN_DIR).filter(f => f.endsWith('.js'));

    for (const f of binFiles) {
        const rel = 'bin/' + f;
        const rawSrc = fs.readFileSync(path.join(BIN_DIR, f), 'utf8');
        const src = stripComments(rawSrc);
        const lines = src.split('\n');

        // receiver -> lib module file (const x = require('../lib/y') / const { C } = require + new C)
        // (parsed from RAW src: require lines are never inside comments that
        // matter, and raw keeps the regexes identical to the lib scanners)
        const varMap = new Map();
        const reqRe = /(?:const|let|var)\s+(?:\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*['"][^'']*\/lib\/([\w$.-]+)['"]\s*\)/g;
        let rm;
        while ((rm = reqRe.exec(src)) !== null) {
            const decl = rm[0];
            const libName = rm[1].replace(/\.js$/, '');
            const ids = decl.match(/(?:const|let|var)\s+([\w$]+)/);
            if (ids) varMap.set(ids[1], libName + '.js');
            const cls = decl.match(/\{\s*([\w$]+)/);
            if (cls) varMap.set(cls[1], libName + '.js');
            const ctor = new RegExp('(?:const|let|var)\\s+([\\w$]+)\\s*=\\s*new\\s+' + (cls ? cls[1] : ids ? ids[1] : '$') + '\\b').exec(src);
            if (ctor) varMap.set(ctor[1], libName + '.js');
        }

        // local function/const definitions — a bin-local getStatus() is NOT
        // the lib one (bin/branch-manager.js defines its own porcelain read).
        const localDefs = new Set();
        const defRe = /(?:function\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:function|\())|^\s*function\s+([\w$]+)/gm;
        let dm;
        while ((dm = defRe.exec(src)) !== null) {
            localDefs.add(dm[1] || dm[3]);
        }

        // (a) phantom-field tripwire: same file reads .held/.budgets/... off
        // a getStatus()/getLayerStatus() call or its result variable.
        const usesRealStatusMethod = /\.(?:getStatus|getLayerStatus)\s*\(\s*\)/.test(src);
        if (usesRealStatusMethod) {
            for (let i = 0; i < lines.length; i++) {
                if (/STATUS-FIELD-OK:/.test(lines[i])) continue;
                for (const fld of PHANTOM_FIELDS) {
                    const re = new RegExp('\\.\\s*' + fld + '\\b');
                    if (re.test(lines[i])) {
                        violations.push(`${rel}:${i + 1}  phantom field .${fld} next to getStatus()/getLayerStatus() — ledger fields live in gatherState(), not the status shape (bin/escrow.js pass-77 genre)`);
                    }
                }
            }
        }

        // (b) field cross-check: var = X.method() provenance, then var.field reads.
        const provenance = new Map(); // varName -> { method, receiver }
        const callRe = new RegExp('(?:const|let|var)\\s+([\\w$]+)\\s*=\\s*(?:await\\s+)?([\\w$]+)\\.(' + STATUS_METHODS.join('|') + ')\\s*\\(\\s*\\)', 'g');
        let cm;
        while ((cm = callRe.exec(src)) !== null) {
            provenance.set(cm[1], { method: cm[3], receiver: cm[2] });
        }

        for (const [varName, prov] of provenance) {
            if (localDefs.has(prov.method)) continue; // bin-local function, not the lib method
            const bodies = resolveMethod(prov.receiver, prov.method, varMap);
            if (!bodies.length) continue; // unresolved → conservative pass
            const keySets = bodies.map(b => b.keys).filter(k => k !== null);
            if (!keySets.length) continue; // all bodies dynamic → skip
            const union = new Set();
            for (const ks of keySets) for (const k of ks) union.add(k);
            const fieldRe = new RegExp('\\b' + varName + '\\.([a-zA-Z_$][\\w$]*)', 'g');
            let fm;
            while ((fm = fieldRe.exec(src)) !== null) {
                const field = fm[1];
                if (NON_FIELD.has(field)) continue;
                if (union.has(field)) continue;
                const lineNo = src.slice(0, fm.index).split('\n').length;
                if (/STATUS-FIELD-OK:/.test(lines[lineNo - 1] || '')) continue;
                violations.push(`${rel}:${lineNo}  status field .${field} does not exist on ${prov.method}() returns (${bodies.map(b => 'lib/' + b.file).join(', ')}) — verify the real shape before printing it`);
            }
        }
    }
    return violations;
}

// ---- main ----

function main() {
    const helperViolations = scanThrowawayHelpers();
    const truthViolations = scanStatusTruthfulness();
    const violations = helperViolations.concat(truthViolations);

    if (violations.length) {
        console.log('BIN-TRUTHFULNESS GATE: FAIL (' + violations.length + ')');
        for (const v of violations) console.log('  ' + v);
        console.log('\nFix: route helpers through a shared instance (HELPER-MODEL: tag if');
        console.log('fresh-per-call is the documented contract), and read status fields');
        console.log('that the lib shape actually returns (gatherState() for ledger data).');
        process.exit(1);
    }

    console.log('BIN-TRUTHFULNESS GATE: PASS (no throwaway helpers in bin/, status fields truthful)');
}

main();
