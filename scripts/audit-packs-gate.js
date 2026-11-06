#!/usr/bin/env node
/**
 * audit-packs-gate.js - run packstruct `audit-conformance` (SPEC section 7)
 * as a CI-grade gate over the repo, with the KNOWN-FINDING allowlist from
 * the same house pattern as scripts/crashtest-run.js KNOWN_FINDINGS and
 * tests/ci-crashtest-gate.js ALLOWED_FINDINGS.
 *
 * The run is honest in both directions:
 *   - a violation OUTSIDE the allowlist fails the job (exit 1) - a regressing
 *     loader cannot ride a stale pin;
 *   - a violation INSIDE the allowlist is allowed but PINNED in the output -
 *     it must stay cited here until its engine fix lands, and the allowlist
 *     line is deleted (never weakened) when that pass happens.
 *
 * Allowlist entries are case names from packstruct's bundled conformance
 * corpus (one clean bundle, one per SPEC-5 refusal norm, a name-collision
 * pair, and one env-claims accept bundle). crashtest 1.3.0's host-profile
 * load (`validateProfile: false`, packstruct SPEC section 7 / crashtest
 * #33) closes the old `clean` pin and honors the env-claims accept case.
 * It also exposes three SPEC section-2 manifest norms that crashtest's
 * `validatePackManifest()` does not enforce: non-empty description,
 * name/dir parity, and a dotted version. Those three cases are pinned
 * below; the old `clean` row was deleted in the same pass.
 *
 * Usage: node scripts/audit-packs-gate.js
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// The loader face (scripts/audit-host-loader.js) delegates to crashtest's
// REAL loader - the engine this repo's packs are actually consumed by.
const LOADER = 'node scripts/audit-host-loader.js {packs}';

// Known engine gaps, each still nameable and still open. Never widen a pin
// to hide a regression; delete a row on the pass that closes its upstream
// finding. This pass deletes `clean` (the host-profile load closed it) and
// pins the three SPEC section-2 gaps that path exposed.
const ALLOWED_VIOLATIONS = new Set([
    'description',    // crashtest accepts an empty manifest description (SPEC section 2 requires non-empty)
    'name-dir-match', // crashtest does not compare manifest name to its directory (SPEC section 2/5)
    'version',        // crashtest does not require the dotted MAJOR.MINOR[.PATCH] shape
]);

function main() {
    const res = spawnSync('npx', ['packstruct@1.1.0', 'audit-conformance', '.', '--loader', LOADER], {
        cwd: ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env, { NO_COLOR: '1' }),
    });

    const out = `${res.stdout || ''}${res.stderr || ''}`;
    if (out.trim()) process.stdout.write(out);

    if (res.error) {
        console.error(`audit gate could not run packstruct: ${res.error.message}`);
        process.exit(1);
    }
    if (res.status === 2) {
        // usage error - the gate itself is misconfigured, fail loudly
        console.error('audit gate: USAGE ERROR from packstruct (exit 2), not a loader verdict');
        process.exit(1);
    }

    // Parse the human summary line; the machine truth is the violation list.
    const violations = [];
    const lineRe = /loader .* on case "([^"]+)" - the spec verdict is (accept|refuse)/g;
    let m;
    while ((m = lineRe.exec(out))) violations.push(m[1]);

    const expectedCaseCount = 9;
    const unknown = violations.filter((c) => !ALLOWED_VIOLATIONS.has(c));
    const pinned = violations.filter((c) => ALLOWED_VIOLATIONS.has(c));

    if (res.status === 0 && violations.length === 0 && out.includes('honored')) {
        // full pass: the allowlist must be empty - a fully honored run with a
        // non-empty allowlist means a case got deleted upstream and the pin
        // is now fiction (the house law: delete the row, never park it).
        if (ALLOWED_VIOLATIONS.size > 0) {
            console.error(`audit gate: ALL ${expectedCaseCount} case(s) honored but the allowlist still pins ${[...ALLOWED_VIOLATIONS].join(', ')} - delete the stale allowlist line(s) in scripts/audit-packs-gate.js`);
            process.exit(1);
        }
        console.log('audit gate: GREEN (all conformance cases honored, allowlist empty)');
        process.exit(0);
    }

    // Non-zero from packstruct = at least one case failed. The gate holds
    // only if every failure is a known pinned row and the case count matches
    // (an upstream case-listing change shifts the corpus - re-audit then).
    if (!out.includes(`${violations.length ? '' : '0/'}${expectedCaseCount}`) && !/(\d+)\/(\d+) case/.test(out)) {
        // corpus shape may have changed; report honestly and fail the gate
        console.error('audit gate: unrecognized audit output shape - re-audit manually');
        process.exit(1);
    }
    if (unknown.length) {
        console.error(`audit gate: REGRESSION - ${unknown.length} violation(s) outside the allowlist: ${unknown.join(', ')}`);
        console.error('  Fix the loader or the engine, or file the finding and pin it (same commit as the pass).');
        process.exit(1);
    }
    console.log(`audit gate: ALLOWED (${expectedCaseCount} case(s), ${pinned.length} pinned known finding(s): ${pinned.join(', ')}, rest honored)`);
    process.exit(0);
}

main();
