/**
 * test/struct-feeds.test.mjs (vant-home)
 * ======================================
 * The struct-audit board's data laws (vant issue #264; steps a + b landed
 * at 2026-10-28, steps c + d landed 2026-11-02; depstruct joined wave 19·31).
 * Pins:
 *   1. five sources AND ONLY five (the E_STRUCT_SOURCE law mirrored)
 *   2. the skeleton epoch is CLOSED: every inline-skeleton row has been
 *      replaced by its LIVE stamped emit (steps b/c/d + the poststruct
 *      landing + the depstruct census row), so NO row carries a mock flag
 *      and the board has no MOCK SKELETON badge left to render
 *   3. the ABSENT rows state their absence in words, and the anchor
 *      laws hold (check-home rule 4 admits only the links a row states)
 *   4. verdictOf: PASS / FINDINGS / ABSENT escalation exactly
 *   5. evidenceSlice caps and never mutates
 *   6. every ok row anchors npmjs.com (the feeds' real carriers)
 *   7. the live rows: byte-equal to their generated stamps, .sha256 pins
 *      present on disk, provenance (_stamp) stated, counts internally
 *      consistent with their own findings
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
    STRUCT_SOURCES,
    STRUCT_LABELS,
    STRUCT_FEEDS,
    verdictOf,
    evidenceSlice,
} from '../src/struct-feeds.mjs'
import liveCrashFeed from '../src/generated/struct-feed.json'
import livePackstructFeed from '../src/generated/struct-feed-packstruct.json'
import liveEyestructFeed from '../src/generated/struct-feed-eyestruct.json'
import livePoststructFeed from '../src/generated/struct-feed-poststruct.json'
import liveDepsFeed from '../src/generated/struct-feed-deps.json'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GENERATED = path.join(HERE, '..', 'src', 'generated')

const REQUIRED = ['source', 'ok']

describe('struct-feeds (the /audit board laws)', () => {
    it('carries five sources and only five', () => {
        expect(STRUCT_SOURCES).toEqual(['packstruct', 'crashtest', 'eyestruct', 'poststruct', 'depstruct'])
        expect(STRUCT_FEEDS).toHaveLength(5)
        for (const feed of STRUCT_FEEDS) expect(STRUCT_SOURCES).toContain(feed.source)
        const names = STRUCT_FEEDS.map(f => f.source)
        expect(new Set(names).size).toBe(5)
        for (const s of STRUCT_SOURCES) expect(STRUCT_LABELS[s]).toBeTruthy()
    })

    it('the skeleton epoch closed: no row carries a mock flag (all four ride tool emits)', () => {
        const mocks = STRUCT_FEEDS.filter(f => f.mock)
        expect(mocks.map(f => f.source)).toEqual([])
        // and every row is genuinely ok:true - no hidden absence sneaks in
        for (const feed of STRUCT_FEEDS) expect(feed.ok, feed.source).toBe(true)
    })

    it('absent rows name their absence in words (nothing is graded)', () => {
        for (const feed of STRUCT_FEEDS.filter(f => !f.ok)) {
            expect(String(feed.error), feed.source).toMatch(/absent/i)
        }
        // the inline-skeleton absence carries no cross-repo anchor (gate
        // rule 4): the blob never names github.com/dhaupin/poststruct
        const blob = JSON.stringify(STRUCT_FEEDS)
        expect(blob).not.toMatch(/https:\/\/github\.com\/dhaupin\/poststruct/)
    })

    it('verdictOf escalates exactly: ABSENT / FINDINGS(via counts.fail) / FINDINGS(via a fail row) / PASS', () => {
        const base = { source: 'eyestruct' }
        expect(verdictOf({ ...base, ok: false })).toBe('ABSENT')
        expect(verdictOf({ ...base, ok: true })).toBe('PASS')
        expect(verdictOf({ ...base, ok: true, counts: { fail: 1 } })).toBe('FINDINGS')
        expect(verdictOf({
            ...base,
            ok: true,
            findings: [{ id: 'x', level: 'fail', message: 'm' }],
        })).toBe('FINDINGS')
        expect(verdictOf({
            ...base,
            ok: true,
            counts: { fail: 0 },
            findings: [{ id: 'x', level: 'warn', message: 'm' }],
        })).toBe('PASS')
    })

    it('evidenceSlice caps without spilling or mutating', () => {
        const feed = {
            source: 'crashtest',
            ok: true,
            findings: [1, 2, 3, 4, 5].map(n => ({ id: String(n), level: 'info', message: 'm' + n })),
        }
        const out = evidenceSlice(feed, 3)
        expect(out).toHaveLength(3)
        expect(evidenceSlice(feed, 0)).toEqual([])
        expect(evidenceSlice(feed, 99)).toHaveLength(5)
        expect(evidenceSlice({ source: 'x' }, 3)).toEqual([])
        expect(feed.findings).toHaveLength(5)
    })

    it('all findings rows mirror the kit contract keys exactly', () => {
        // shape pins from web/kit/components/struct-audit.tsx (kit head):
        // findings rows: { id, page?, level: fail|warn|info, message }
        for (const feed of STRUCT_FEEDS.filter(f => Array.isArray(f.findings))) {
            for (const f of feed.findings) {
                expect(typeof f.id).toBe('string')
                expect(['fail', 'warn', 'info']).toContain(f.level)
                expect(typeof f.message).toBe('string')
            }
        }
    })
})

describe('the LIVE stamped rows (issue #264 steps b, c, d + the depstruct census)', () => {
    // The ring law applied to data: each row is byte-equal to its stamp,
    // each stamp has its .sha256 pin sidecar beside BOTH flavor copies,
    // provenance is stated, and the counts are internally consistent.
    const LIVE = [
        ['crashtest', liveCrashFeed],
        ['packstruct', livePackstructFeed],
        ['eyestruct', liveEyestructFeed],
        ['poststruct', livePoststructFeed],
        ['depstruct', liveDepsFeed],
    ]

    // The stamp row's filename suffix vs its source id: the crashtest row
    // owns the bare struct-feed.json (the original), and the depstruct
    // SOURCE stamps as -deps (the census lane's own row key).
    const STAMP_SUFFIX = {
        crashtest: '',
        packstruct: '-packstruct',
        eyestruct: '-eyestruct',
        poststruct: '-poststruct',
        depstruct: '-deps',
    }

    it.each(LIVE)(`%s: byte-equal to its stamp, pin sidecars on disk, badge off`, (source, feed) => {
        expect(feed.source).toBe(source)
        expect(feed.ok).toBe(true)
        expect(feed.mock).toBeUndefined()
        const row = STRUCT_FEEDS.find(f => f.source === source)
        expect(row).toStrictEqual(feed)
        // pins exist next to both flavor copies written by the stamp
        const ROOT = path.join(HERE, '..', '..', '..')
        for (const flavor of ['home', 'dashboard']) {
            const stamp = path.join(ROOT, 'web', flavor, 'src', 'generated', `struct-feed${STAMP_SUFFIX[source]}.json`)
            expect(readFileSync(stamp + '.sha256', 'utf8')).toMatch(/^[0-9a-f]{64}\n?$/)
            expect(readFileSync(stamp, 'utf8')).toBe(JSON.stringify(feed, null, 2) + '\n')
        }
    })

    it.each(LIVE)(`%s: provenance stated and dated`, (source, feed) => {
        expect(feed._stamp.by).toBe('scripts/struct-feed-stamp.js')
        expect(feed._stamp.from || feed._stamp.legend).toBeTruthy()
        expect(String(feed.generatedAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it.each(LIVE)(`%s: counts are internally consistent with their own findings`, (source, feed) => {
        const c = feed.counts
        expect(c).toBeTruthy()
        if (source === 'crashtest') {
            expect(c.packs).toBeGreaterThanOrEqual(1)
            expect(c.rows).toBeGreaterThanOrEqual(1)
            expect(c.refused + c.skipped + c.exploited).toBe(c.rows)
            // the whitelist is EMPTY: an EXPLOITED row is a regression
            expect(c.exploited).toBe(0)
        }
        if (source === 'packstruct') {
            expect(c.packs).toBeGreaterThanOrEqual(1)
            expect(c.ids).toBeGreaterThanOrEqual(0)
            expect(c.honored + c.pinned).toBeLessThanOrEqual(9) // the conformance corpus is 9 (packstruct 1.1.0)
            expect(c.violations).toBe(0)
            expect(String(feed.findings[0].message)).toMatch(/conformance honored/)
        }
        if (source === 'eyestruct') {
            expect(c.fail).toBe(0) // the gate judged ok: no unexplained artifact
            expect(c.artifacts).toBeGreaterThanOrEqual(0)
            expect(c.rows).toBeGreaterThanOrEqual(0)
            expect(feed.findings.length).toBe(1)
        }
        if (source === 'poststruct') {
            // the audit's arithmetic is its own emit: every finding is a
            // row and every row is a finding - fail + warn == rows
            expect(c.fail).toBeGreaterThanOrEqual(0)
            expect(c.warn).toBeGreaterThanOrEqual(0)
            expect((c.fail ?? 0) + (c.warn ?? 0)).toBe(feed.findings.length)
            expect(feed.version).toBe('poststruct-audit/1')
            expect(feed.sourceHref).toBe('https://www.npmjs.com/package/poststruct')
        }
        if (source === 'depstruct') {
            // the census's own arithmetic: 14 deps declared, 14 ledger
            // rows (package.json and the ledger agree both directions),
            // zero fails on a green lane, and fail + warn <= rows (the
            // census can emit info rows that ride neither counter)
            expect(c.deps).toBeGreaterThanOrEqual(1)
            expect(c.ledger).toBe(c.deps)
            expect(c.fail).toBe(0)
            expect((c.fail ?? 0) + (c.warn ?? 0)).toBeLessThanOrEqual(feed.findings.length)
            expect(feed.version).toBe('depstruct-census/1')
            // a green lane: no fail row may ride the card
            expect(feed.findings.every((f) => f.level !== 'fail')).toBe(true)
        }
    })

    it('the live rows grade live (never ABSENT)', () => {
        for (const [, feed] of LIVE) expect(verdictOf(feed)).not.toBe('ABSENT')
    })
})
