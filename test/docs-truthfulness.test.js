#!/usr/bin/env node
/**
 * Docs truthfulness gate pins (R3-F9, #193).
 *
 * A gate without a negative control is a rubber stamp (pass-79 lesson),
 * so the pins run the checker against a throwaway tree three ways:
 *   1. PASS on the real tree (clean state)
 *   2. FAIL on a fixture that promises a lib module that does not exist
 *   3. FAIL on a fixture that promises an unroutable vant verb
 *   4. Exemption honored (TRUTHFULNESS-OK comment suppresses one line)
 *
 * Run: node test/docs-truthfulness.test.js
 */

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
function report(name, ok, detail) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}: ${detail || 'failed'}`); }
}

const CHECK = path.join(__dirname, '..', 'scripts', 'check-docs-truthfulness.js');

function runChecker() {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8', timeout: 120000 });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const fixtures = [];

function stageFixture(fileRel, content) {
    const abs = path.join(__dirname, '..', fileRel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content + '\n<!-- TRUTH-PIN-TEMP -->\n');
    fixtures.push(abs);
    return abs;
}

function dropFixture(abs) { fs.unlinkSync(abs); const i = fixtures.indexOf(abs); if (i !== -1) fixtures.splice(i, 1); }

async function main() {
    console.log('\nDOCS TRUTHFULNESS GATE PINS (R3-F9)\n');

    // 1) Clean-tree PASS (real tree is truthful after the r1-r4 sweep)
    {
        const { code, out } = runChecker();
        report('checker passes on the real (swept) tree',
            code === 0 && /PASS/.test(out), `exit=${code} ${out.slice(0, 120)}`);
    }

    // 2) Negative control: fictional lib module must FAIL
    const badLib = stageFixture('docs/_truth-fixture-lib.md',
        '```javascript\nconst x = require(\'./lib/definitely-not-real\');\n```\n');
    {
        const { code, out } = runChecker();
        report('fictional lib module fails the gate',
            code === 1 && /definitely-not-real/.test(out), `exit=${code} ${out.slice(0, 160)}`);
    }
    fs.unlinkSync(badLib);

    // 3) Negative control: unroutable vant verb must FAIL
    const badVerb = stageFixture('docs/_truth-fixture-verb.md',
        '```bash\nvant fly-to-moon --fuel 100\n```\n');
    {
        const { code, out } = runChecker();
        report('unroutable vant verb fails the gate',
            code === 1 && /fly-to-moon/.test(out), `exit=${code} ${out.slice(0, 160)}`);
    }
    fs.unlinkSync(badVerb); fixtures.pop();

    // 4) Exemption comment honored on the NEXT line
    const exempt = stageFixture('docs/_truth-fixture-exempt.md',
        '<!-- TRUTHFULNESS-OK: deliberate demo -->\n```bash\nvant fly-to-moon --fuel 100\n```\n');
    {
        const { code, out } = runChecker();
        report('TRUTHFULNESS-OK exemption suppresses the next line',
            code === 0 && /PASS/.test(out), `exit=${code} ${out.slice(0, 160)}`);
    }
    dropFixture(exempt);

    console.log(`\n--- RESULTS ---\n\n  Passed:  ${passed}\n  Failed:  ${failed}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
