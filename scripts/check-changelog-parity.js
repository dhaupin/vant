#!/usr/bin/env node
/**
 * scripts/check-changelog-parity.js (repo root)
 * =============================================
 * The /changelog route's parity law, plus the npm-compat pins.
 *
 *  1. PARITY — web/home/src/generated/changelog.json must be byte-identical
 *     to a fresh parse of CHANGELOG.md (web/home/scripts/parse-changelog.mjs).
 *     The site page renders ONLY that JSON, so this gate makes hand-drift on
 *     /changelog impossible: edit CHANGELOG.md, regenerate (npm run
 *     build:home does it), commit both. A stale committed copy fails.
 *  2. NPM COMPAT:
 *     a. package.json "version" must exist as a release heading in
 *        CHANGELOG.md (## [x.y.z] ...) — version truth in one place.
 *     b. The Keep a Changelog + Semantic Versioning statements must be
 *        present (the machine-readable contract npm-adjacent tooling
 *        greps for). (Keep a Changelog 1.1.0's own template pairs with
 *        SemVer 2.0.0, so that link is the EXPECTED shape - only its
 *        absence is a failure.)
 *
 * Exit 1 on any failure, evidence inline. Wired as `npm run lint:changelog`
 * and stepped into test.yml next to the web/home gate.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const PKG = require(path.join(ROOT, 'package.json'));
const PARSER = path.join(ROOT, 'web', 'home', 'scripts', 'parse-changelog.mjs');
const COMMITTED = path.join(ROOT, 'web', 'home', 'src', 'generated', 'changelog.json');

const problems = [];

// ---- 1. parity: fresh parse vs committed generated file ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-parity-'));
const committedJson = fs.readFileSync(COMMITTED, 'utf8');

// Re-run the parser against a synthetic tree identical to the real one
// (its output path is fixed relative to itself, so compare via a temp checkout
// of just the script + a fresh generate into the REAL location is too invasive;
// instead: parse in-place, capture the file's bytes, and restore the committed
// file exactly afterwards. The mtime churn is acceptable; content is honest.)
const freshBytes = (() => {
    const before = fs.readFileSync(COMMITTED, 'utf8');
    try {
        execFileSync(process.execPath, [PARSER], { cwd: ROOT, stdio: 'pipe' });
        return fs.readFileSync(COMMITTED, 'utf8');
    } finally {
        fs.writeFileSync(COMMITTED, before); // restore committed bytes
    }
})();
fs.rmSync(tmp, { recursive: true, force: true });

if (freshBytes !== committedJson) {
    // Pinpoint the drift so the fix is one read away.
    const a = committedJson.split('\n');
    const b = freshBytes.split('\n');
    let line = 0;
    while (line < Math.min(a.length, b.length) && a[line] === b[line]) line++;
    problems.push(
        `web/home/src/generated/changelog.json is STALE vs CHANGELOG.md (first drift at generated line ${line + 1}).`,
        `  committed: ${JSON.stringify((a[line] || '').slice(0, 90))}`,
        `  fresh:     ${JSON.stringify((b[line] || '').slice(0, 90))}`,
        `  fix: run "npm run build:home" (parses + rebuilds), commit the regenerated json.`
    );
}

// ---- 2a. version truth: package.json version is a release heading ----
const changelogText = fs.readFileSync(CHANGELOG, 'utf8');
const versionHeading = new RegExp(`^## \\[${PKG.version.replace(/\./g, '\\.')}\\]`, 'm');
if (!versionHeading.test(changelogText)) {
    problems.push(
        `package.json version "${PKG.version}" has no matching "## [${PKG.version}]" release heading in CHANGELOG.md.`,
        `  npm consumers read release truth from the changelog headings — pin both sides.`
    );
}

// ---- 2b. keep-a-changelog + semver statements ----
if (!/keepachangelog\.com\/en\/1\.1\.0/.test(changelogText)) {
    problems.push('CHANGELOG.md lost its "based on Keep a Changelog 1.1.0" header statement.');
}
if (!/semver\.org\/spec\//.test(changelogText)) {
    problems.push('CHANGELOG.md lost its Semantic Versioning adherence statement.');
}

// ---- 2c. (retired: keep-a-changelog 1.1.0 -> semver 2.0.0 is correct) ----

if (problems.length) {
    console.error(`CHANGELOG PARITY: FAIL (${problems.length} issue${problems.length === 1 ? '' : 's'})`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
}
console.log('CHANGELOG PARITY: PASS (generated json in sync, version truth pinned, format statements intact)');
