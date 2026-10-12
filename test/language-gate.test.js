#!/usr/bin/env node
/**
 * Language gate (issue #184) fixture tests.
 *
 * Pins scripts/check-language.js:
 *   - script-block detector flags Han/Cyrillic/Greek runs >= MIN_RUN in prose
 *   - single/glyph-level characters are NOT flagged (transliterated names)
 *   - text in fenced code blocks and inline-code spans is exempt
 *   - the LINT_LANGUAGE_ALLOW_RE env regex exempts lines by construction
 *   - PASS contract: exit 0 + "LANGUAGE GATE: PASS" summary
 *   - FAIL contract: exit 1 + `path:line <Script> (N chars): <line>` format
 *
 * The gates themselves run against a throwaway fixture tree, never the
 * real docs (the real tree is validated by `npm run lint:docs` in CI).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CHECKER = path.resolve(__dirname, '..', 'scripts', 'check-language.js');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.ok)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(result && result.error) || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

/**
 * Run the checker against a scratch tree: ROOT is remapped by pointing
 * cwd-based resolution at a temp dir. The script resolves ROOT from its
 * own __dirname, so instead we copy the script into the fixture root and
 * run it there — its relative paths (scripts/, docs/) then hit our tree.
 */
function runChecker(fixtureRoot, envExtra = []) {
    const scriptsDir = path.join(fixtureRoot, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(CHECKER, path.join(scriptsDir, 'check-language.js'));
    const cp = execFileSync('node', [path.join(scriptsDir, 'check-language.js')], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: { ...process.env, ...Object.fromEntries(envExtra) }
    });
    return { out: cp };
}

/** Same, but expects failure and captures the throw for exit code. */
function runCheckerFail(fixtureRoot, envExtra = []) {
    const scriptsDir = path.join(fixtureRoot, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(CHECKER, path.join(scriptsDir, 'check-language.js'));
    try {
        let out;
        try {
            out = execFileSync('node', [path.join(scriptsDir, 'check-language.js')], {
                cwd: fixtureRoot,
                encoding: 'utf8',
                env: { ...process.env, ...Object.fromEntries(envExtra) }
            });
        } catch (e) {
            return { exit: e.status, out: e.stdout + e.stderr, err: true };
        }
        return { exit: 0, out, err: false };
    } catch (catcher) {
        return { exit: 1, out: '', err: catcher.message };
    }
}

function fixture() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gate-'));
}

console.log('\n🌐 LANGUAGE GATE (issue #184) FIXTURE TESTS\n');

test('pass contract: English-only tree exits 0 with PASS summary', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'clean.md'), '# Title\n\nJust plain English prose here.\n');
    const r = runChecker(root);
    return { ok: r.out.includes('LANGUAGE GATE: PASS') && r.out.includes('English-only') };
});

test('flags Han run of >= 3 chars in prose', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'labs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'labs', 'drift.md'), 'Note: 状态连接 started mid-session\n');
    const r = runCheckerFail(root);
    const hit = r.out.split('\n').find((l) => /drift\.md:1 Han \(4 chars\)/.test(l));
    return { ok: r.err && r.exit === 1 && !!hit };
});

test('flags Cyrillic run (long-run detector, not wordlist)', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'ru.md'), 'Pins: suite 4 to 9 включая restart notes\n');
    const r = runCheckerFail(root);
    const hit = r.out.split('\n').find((l) => /ru\.md:1 Cyrillic \(\d+ chars\)/.test(l));
    return { ok: r.err && r.exit === 1 && !!hit };
});

test('flags Greek run of >= 3 chars', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'gr.md'), 'Delta section: Δελτάφη reads as writing\n');
    const r = runCheckerFail(root);
    const hit = r.out.split('\n').find((l) => /gr\.md:1 Greek \(\d+ chars\)/.test(l));
    return { ok: r.err && r.exit === 1 && !!hit };
});

test('short runs (< 3 chars) are not flagged (transliterated names)', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'names.md'), 'From 任务 and Ψυ concepts.\n');
    const r = runChecker(root);
    return { ok: r.out.includes('LANGUAGE GATE: PASS') };
});

test('fenced code blocks are exempt (literal data)', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'fenced.md'),
        '```js\nconst label = "状态连接";\n```\nProse stays English.\n');
    const r = runChecker(root);
    return { ok: r.out.includes('LANGUAGE GATE: PASS') };
});

test('inline-code spans are exempt (literal data)', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'inline.md'), 'Use `状态连接` as the label.\n');
    const r = runChecker(root);
    return { ok: r.out.includes('LANGUAGE GATE: PASS') };
});

test('LINT_LANGUAGE_ALLOW_RE opt-out exempts matching lines', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'bilingual.md'), '状态连接 drift marker\n');
    const r = runCheckerFail(root, [['LINT_LANGUAGE_ALLOW_RE', '状态连接']]);
    return { ok: !r.err && r.out.includes('LANGUAGE GATE: PASS') };
});

test('root meta files (README/AGENTS/CHANGELOG etc.) are scanned', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'README.md'), '# Vant\n\n状态连接 drifted here\n');
    const r = runCheckerFail(root);
    const hit = r.out.split('\n').find((l) => /README\.md:\d+ Han/.test(l));
    return { ok: r.err && r.exit === 1 && !!hit };
});

test('.github markdown (any depth) is scanned', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'w.md'), 'Poll prompt: 状态连接\n');
    const r = runCheckerFail(root);
    const hit = r.out.split('\n').find((l) => /w\.md:\d+ Han/.test(l));
    return { ok: r.err && r.exit === 1 && !!hit };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
