/**
 * test/struct-feeds.test.mjs (vant-home)
 * ======================================
 * The struct-audit skeleton's data laws (vant issue #264, step a). Pins:
 *   1. four sources AND ONLY four (the E_STRUCT_SOURCE law mirrored)
 *   2. every mock row self-declares mock: true (the epoch badge)
 *   3. the ABSENT row (poststruct, pre-npm) states its absence in words
 *      and carries NO cross-repo anchor (check-home rule 4 admits only
 *      github links under dhaupin/vant)
 *   4. verdictOf: PASS / FINDINGS / ABSENT escalation exactly
 *   5. evidenceSlice caps and never mutates
 *   6. all source links land on npmjs.com (the feeds' real carriers)
 */

import { describe, it, expect } from 'vitest'
import {
    STRUCT_SOURCES,
    STRUCT_LABELS,
    STRUCT_FEEDS_MOCK,
    verdictOf,
    evidenceSlice,
} from '../src/struct-feeds.mjs'

const REQUIRED = ['source', 'ok', 'mock']

describe('struct-feeds (the /audit skeleton laws)', () => {
    it('carries four sources and only four', () => {
        expect(STRUCT_SOURCES).toEqual(['packstruct', 'crashtest', 'eyestruct', 'poststruct'])
        expect(STRUCT_FEEDS_MOCK).toHaveLength(4)
        for (const feed of STRUCT_FEEDS_MOCK) expect(STRUCT_SOURCES).toContain(feed.source)
        const names = STRUCT_FEEDS_MOCK.map(f => f.source)
        expect(new Set(names).size).toBe(4)
        for (const s of STRUCT_SOURCES) expect(STRUCT_LABELS[s]).toBeTruthy()
    })

    it('every skeleton row self-declares mock: true', () => {
        for (const feed of STRUCT_FEEDS_MOCK) {
            for (const key of REQUIRED) expect(feed, feed.source).toHaveProperty(key)
            expect(feed.mock, feed.source).toBe(true)
        }
    })

    it('the ABSENT row names its absence in words, anchorless (gate rule 4)', () => {
        const post = STRUCT_FEEDS_MOCK.find(f => f.source === 'poststruct')
        expect(post.ok).toBe(false)
        expect(String(post.error)).toMatch(/absent/i)
        expect(String(post.error)).toMatch(/poststruct/)
        expect(post.sourceHref).toBeFalsy()
        const blob = JSON.stringify(STRUCT_FEEDS_MOCK)
        expect(blob).not.toMatch(/https:\/\/github\.com\/dhaupin\/poststruct/)
    })

    it('the three ok rows anchor npmjs.com feeds only', () => {
        for (const feed of STRUCT_FEEDS_MOCK.filter(f => f.ok)) {
            expect(feed.sourceHref, feed.source).toMatch(/^https:\/\/www\.npmjs\.com\//)
        }
    })

    it('verdictOf escalates exactly: ABSENT / FINDINGS(via counts.fail) / FINDINGS(via a fail row) / PASS', () => {
        const base = { source: 'eyestruct', mock: true }
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

    it('the mock mocks mirror the kit contract keys exactly', () => {
        // shape pins from web/kit/components/struct-audit.tsx (kit head):
        // findings rows: { id, page?, level: fail|warn|info, message }
        for (const feed of STRUCT_FEEDS_MOCK.filter(f => Array.isArray(f.findings))) {
            for (const f of feed.findings) {
                expect(typeof f.id).toBe('string')
                expect(['fail', 'warn', 'info']).toContain(f.level)
                expect(typeof f.message).toBe('string')
            }
        }
    })
})
