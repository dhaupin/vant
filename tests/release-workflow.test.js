#!/usr/bin/env node
/**
 * Release workflow receipt (vant#343).
 *
 * The publish lane (`.github/workflows/release.yml`) red-flagged a cut that
 * had already landed: `verify` declared `needs: publish` only, so it ran
 * CONCURRENTLY with `release` and judged the registry + GH release before
 * either had settled (first seen on packstruct's v1.1.0 pilot). The family
 * fix - `needs: [publish, release]` - plus a widened poll budget is the law
 * this receipt pins, so a regression fails by name instead of in review.
 *
 * Every assertion below fails on the pre-fix shape (verified by reverting the
 * three edits locally):
 *   - verify.needs must be [publish, release] (the race);
 *   - the attach step must interpolate its env with ${{ ... }} - the pre-fix
 *     single-brace `${ needs... }` printed the expression LITERALLY, so the
 *     attach step could never pack and exited 1 on every cut;
 *   - the attach step must carry GH_TOKEN (the `gh release upload` it ends on
 *     authenticates with it);
 *   - the attach poll budget is the family's 60 x 5s = 300s;
 *   - verify-release.cjs's registry poll default is the family's 60 x 6s = 360s.
 *
 * Run: node tests/release-workflow.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows', 'release.yml');
const VERIFY = path.join(ROOT, 'scripts', 'verify-release.cjs');

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    try {
        fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}
function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const wf = fs.readFileSync(WF, 'utf8');

test('verify waits for release (the ladder dependency that closes the cut race)', () => {
    const verifyJob = wf.slice(wf.indexOf('\n  verify:'));
    assert(verifyJob.length > 0, 'release.yml has no verify job');
    assert(
        /needs: \[publish, release\]/.test(verifyJob),
        'verify must declare needs: [publish, release] - a bare needs: publish let it race release (vant#343)'
    );
    assert(
        /verify-only/.test(verifyJob),
        'verify must still stand alone in verify-only mode (the if: keeps publish/release skippable)'
    );
});

test('no single-brace ${{ }}-class typo anywhere in the workflow', () => {
    // `${{ needs.x }}` is correct; `${ needs.x }` prints literally. The typo
    // that shipped in the attach step is a `${` followed by whitespace and an
    // identifier - never a valid GitHub expression.
    const typos = wf.match(/\$\{\s+[a-zA-Z_]/g) || [];
    assert(typos.length === 0, `single-brace expression(s) will interpolate literally: ${typos.join(', ')}`);
});

test('the attach step interpolates its env with real expressions', () => {
    const start = wf.indexOf('attach the served tarball');
    assert(start > -1, 'release.yml has no "attach the served tarball" step');
    const attach = wf.slice(start, wf.indexOf('gh release upload', start));
    assert(
        /BLOCK_VERSION: \$\{\{ needs\.publish\.outputs\.version \}\}/.test(attach),
        'BLOCK_VERSION must be ${{ needs.publish.outputs.version }} (not a literal ${ ... })'
    );
    assert(
        /BLOCK_TAG: \$\{\{ needs\.publish\.outputs\.tag \}\}/.test(attach),
        'BLOCK_TAG must be ${{ needs.publish.outputs.tag }} (not a literal ${ ... })'
    );
    assert(
        /GH_TOKEN: \$\{\{ github\.token \}\}/.test(attach),
        'the attach step ends on `gh release upload`, which authenticates with GH_TOKEN'
    );
});

test('the attach poll budget is the family 60 x 5s = 300s', () => {
    const start = wf.indexOf('attach the served tarball');
    const attach = wf.slice(start, wf.indexOf('gh release upload', start));
    assert(/seq 1 60/.test(attach), 'attach poll must run seq 1 60 (was 24 = 120s, too short on a slow registry day)');
    assert(/"60"\]/.test(attach) || /attempt \$i\/60/.test(attach), 'attach poll must name its 60-attempt budget in the failure line');
});

test('the registry poll default is the family 60 x 6s = 360s', () => {
    const src = fs.readFileSync(VERIFY, 'utf8');
    assert(
        /function registryPollAttempts\(\)[\s\S]*?: 60\n/.test(src),
        'verify-release.cjs registryPollAttempts must default to 60 (was 20 = 120s)'
    );
    assert(
        /VERIFY_RELEASE_ATTEMPTS/.test(src) && /VERIFY_RELEASE_DELAY_MS/.test(src),
        'the env knobs VERIFY_RELEASE_ATTEMPTS / VERIFY_RELEASE_DELAY_MS must stay overridable'
    );
});

console.log(`\nPassed: ${results.passed}\nFailed: ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
