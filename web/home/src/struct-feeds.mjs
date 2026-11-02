/**
 * src/struct-feeds.mjs (vant-home)
 * ================================
 * The pure-data underbelly of the combined STRUCT audit page (vant issue
 * #264, step a - the mock-feed static skeleton). Shrugs at the same law
 * walk.mjs/showcase.mjs hold: no React, no network, prerender-safe,
 * importable in plain vitest.
 *
 * SHAPE SOURCE: web/kit/components/struct-audit.tsx (kit head)  -
 * consumed by the dashboard flavor through the vendored, hash-pinned
 * copy web/dashboard/src/frame/StructAudit.tsx. THIS module is the home
 * flavor's own data palm (JSX-free pure data the prerender can read);
 * its mock rows mirror the kit contract shape exactly:
 *
 *   { source, ok, version?, generatedAt?, counts?, findings?, mock?, error?, sourceHref? }
 *   findings: [{ id, page?, level: 'fail'|'warn'|'info', message }]
 *   verdict derivation: verdictOf - PASS | FINDINGS | ABSENT
 *
 * EPOCH LAW: inline data wears its MOCK SKELETON badge. THREE rows are
 * now LIVE (issue #264 steps b, c, d): the crashtest stamped verdict
 * ledger, the packstruct dual-emit row (lint --deep --json + the audit
 * gate's own verdict line) and the eyestruct gate row -- all written by
 * scripts/struct-feed-stamp.js into src/generated/struct-feed*.json with
 * .sha256 pin sidecars, all carrying NO mock flag. poststruct is PRD-
 * staged until its npm lands: its row is the honest inline absence and
 * still rides the badge, because it is the skeleton's shape, not a tool's
 * emit. There are four and only four sources - the kit's own typed
 * refusal law, mirrored here: E_STRUCT_SOURCE on anything else.
 */

import liveCrashFeed from './generated/struct-feed.json'
import livePackstructFeed from './generated/struct-feed-packstruct.json'
import liveEyestructFeed from './generated/struct-feed-eyestruct.json'

export const STRUCT_SOURCES = ['packstruct', 'crashtest', 'eyestruct', 'poststruct']

export const STRUCT_LABELS = {
    packstruct: 'packstruct - pack conformance',
    crashtest: 'crashtest - the packs floor',
    eyestruct: 'eyestruct - the vision battery',
    poststruct: 'poststruct - the render audit',
}

/** Pure verdict family, pinned to the kit's verdictOf. */
export function verdictOf(feed) {
    if (!feed || feed.ok !== true) return 'ABSENT'
    if ((feed.counts && feed.counts.fail > 0)
        || (Array.isArray(feed.findings) && feed.findings.some((f) => f.level === 'fail'))) {
        return 'FINDINGS'
    }
    return 'PASS'
}

/** Evidence slice: the first n findings render; the rest stay unter the tool's URL. */
export function evidenceSlice(feed, n) {
    if (!Array.isArray(feed.findings)) return []
    return feed.findings.slice(0, n)
}

/**
 * The board's feed rows - one per family. Three are LIVE stamps written
 * byte-identically by scripts/struct-feed-stamp.js (a shape drift there
 * breaks its own --check gate in CI); the poststruct row is the inline
 * honest absence until the npm package publishes (the badge stays on:
 * it is the skeleton's shape previewing the feed, not a tool's data).
 */
export const STRUCT_FEEDS = [
    {
        // (step c, LIVE) the packstruct row: the dual-emit stamp (machine
        // lint + the gate's own verdict line). No mock flag - the badge
        // stays off, and the counts are the tools' own arithmetic.
        ...livePackstructFeed,
    },
    {
        // (step b, LIVE) the crashtest row rides the stamped verdict
        // ledger; no mock flag, the badge stays off, and the counts
        // statement is the ledger's own.
        ...liveCrashFeed,
    },
    {
        // (step d, LIVE) the eyestruct gate row: {ok, artifacts, rows,
        // pin} emit + the tool's own verdict line. No mock flag; zero
        // artifacts/rows is the battery's true state - the gate treats
        // that lane as wired, and the stamp records exactly what it saw.
        ...liveEyestructFeed,
    },
    {
        source: 'poststruct',
        ok: false,
        mock: true,
        // Gate note (check-home rule 4): the home gate only admits github
        // links under dhaupin/vant, so this row states the repo in words
        // and carries NO cross-repo anchor; the tool's link lands with its
        // npm feed (steps b-d) as an npmjs.com sourceHref instead.
        error: 'absent: the poststruct npm package is pre-publish (staged 0.9.0 in the dhaupin/poststruct repo, PRD-staged). The page states the absence; nothing is graded.',
        sourceHref: null,
    },
]
