#!/usr/bin/env node
/**
 * Stateful-helper gate (pass 79)
 *
 * Blocks module-level `=> new X()` helper exports on STATEFUL classes -
 * the throwaway-instance pattern that caused:
 *   - escrow hold/release losing every hold between calls (pass 77)
 *   - server use/listen/stop never sharing middleware or stopping what
 *     listen started (pass 78)
 *   - error.js onError dropping custom handlers before any call (pass 78)
 *
 * Statefulness is detected from the class body: `this._field =` /
 * `this._field +=` etc. assignments (Map/Set/arrays included) make a
 * class stateful. A class with only methods reading its args is
 * stateless and may keep throwaway helpers.
 *
 * Allowlist: `// HELPER-MODEL: <reason>` on the export line opts a
 * helper out. Used where fresh-instance-per-call is the DOCUMENTED
 * contract (escrow's disk-coherent budget helpers) or the class is
 * stateless-by-intent even if heuristic says otherwise.
 *
 * Run: node scripts/check-stateful-helpers.js
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');

function listLibFiles() {
    return fs.readdirSync(LIB_DIR).filter(f => f.endsWith('.js')).map(f => path.join(LIB_DIR, f));
}

/** Extract `class Name { ... }` body braces so nested braces stay balanced. */
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

/**
 * Heuristic: does the class body assign instance state?
 * Matches this._x =, this.x =, this._x +=, this.map.set(, push( on this.
 * Method definitions (`this.x = function` excluded via `=` shape) still
 * count: assigning a function to this IS state.
 */
function classIsStateful(src, className) {
    const declIdx = src.indexOf('class ' + className);
    if (declIdx === -1) return null; // not defined in this file
    const body = extractClassBody(src, declIdx);
    if (!body) return null;
    const text = src.slice(body.start, body.end);
    const stateful =
        /this\.[a-zA-Z_$][\w$]*\s*=[^=]/.test(text) ||
        /this\.[a-zA-Z_$][\w$]*\.(set|push|add|delete|incr)\s*\(/.test(text);
    return stateful;
}

function main() {
    const files = listLibFiles();
    // class name -> { file, stateful } (first definition wins; cross-file
    // requires stay conservative: unknown = treated stateful unless the
    // class is found in another lib file we already scanned)
    const classes = new Map();
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        const re = /\bclass\s+([A-Z][\w$]*)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            if (!classes.has(m[1])) {
                classes.set(m[1], { file: path.relative(process.cwd(), f), stateful: classIsStateful(src, m[1]) });
            }
        }
    }

    const violations = [];
    for (const f of files) {
        const rel = path.relative(process.cwd(), f);
        const lines = fs.readFileSync(f, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match both `new X()` and `new ns.X()` (member-expression
            // constructors) - the negative control caught the second shape
            // slipping past a naive pattern.
            const m = line.match(/=>\s*new\s+(?:[\w$]+\.)?([A-Z][\w$]*)\s*\(\s*\)/);
            if (!m) continue;
            // Factories are exempt: the instance escapes to the CALLER, so
            // nothing is laundered (create: () => new X()). The pattern this
            // gate blocks is CALL-THROUGH helpers where the throwaway dies
            // inside the arrow: (x) => new X().method(x).
            const isFactory = !/=>\s*new\s+(?:[\w$]+\.)?[A-Z][\w$]*\s*\(\s*\)\s*\./.test(line);
            if (isFactory) continue;
            const cls = m[1];
            const info = classes.get(cls);
            const stateful = info ? info.stateful : true; // unknown class → assume stateful
            if (stateful === false) continue;
            if (/HELPER-MODEL:/.test(line)) continue; // documented exception
            violations.push(`${rel}:${i + 1}  helper builds throwaway ${cls} (${info ? (info.stateful ? 'class carries this.-state' : 'state unknown') : 'class not found in lib/ — verify it is stateless'})`);
        }
    }

    if (violations.length) {
        console.log('STATEFUL-HELPER GATE: FAIL (' + violations.length + ')');
        for (const v of violations) console.log('  ' + v);
        console.log('\nFix: route helpers through a shared/singleton instance, or add');
        console.log('`// HELPER-MODEL: <reason>` on the export line if fresh-per-call is');
        console.log('the documented contract (e.g. escrow disk-coherent budget helpers).');
        process.exit(1);
    }

    console.log('STATEFUL-HELPER GATE: PASS (no throwaway helpers on stateful classes)');
}

main();
