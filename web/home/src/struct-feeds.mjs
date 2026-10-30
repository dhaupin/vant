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
 * EPOCH LAW: every row that is inline data carries its MOCK SKELETON
 * badge. The crashtest row is LIVE (issue #264 step b): it rides the
 * stamped verdict ledger (src/generated/struct-feed.json, written by
 * scripts/struct-feed-stamp.js, pin sidecar beside it) and carries NO
 * mock flag. The three npm-live feeds (packstruct / eyestruct) wire
 * in at issue steps (c)-(d); poststruct is PRD-staged until its npm
 * lands. There are four and only four sources - the kit's own typed
 * refusal law, mirrored here: E_STRUCT_SOURCE on anything else.
 */

import liveCrashFeed from './generated/struct-feed.json'

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
 * The skeleton epoch's feed rows - one per family, each shaped exactly
 * as the landing feed will arrive. The crashtest row is LIVE (stamped
 * verdict ledger); the other three are inline mocks until their feeds
 * land (poststruct's row already follows the PRD contract's post-parse
 * shape).
 */
export const STRUCT_FEEDS = [
    {
        source: 'packstruct',
        ok: true,
        mock: true,
        generatedAt: '2026-10-28',
        counts: { packs: 21, ids: 291, honored: 7, pinned: 1 },
        findings: [
            {
                id: 'audit-conformance',
                page: 'vant-spine',
                level: 'info',
                message: '7/8 conformance honored; 1 pinned known finding, honest and tracked in packs/README.md.',
            },
        ],
        sourceHref: 'https://www.npmjs.com/package/packstruct',
    },
    {
        // (step b, LIVE) the crashtest row rides the stamped verdict
        // ledger (src/generated/struct-feed.json); no mock flag, the
        // badge stays off, and the counts statement is the ledger's own.
        ...liveCrashFeed,
    },
    {
        source: 'eyestruct',
        ok: true,
        mock: true,
        generatedAt: '2026-10-28',
        counts: { fail: 0, warn: 0 },
        findings: [
            {
                id: 'npm-landing',
                level: 'info',
                message: 'The eyestruct package is live on npm; the findings feed wires in at step (d). No vision findings are claimed by this mock.',
            },
        ],
        sourceHref: 'https://www.npmjs.com/package/eyestruct',
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
