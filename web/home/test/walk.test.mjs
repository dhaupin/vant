/**
 * web/home walk pins (pass 350, the #3 insurance round): the contracts the
 * /brain-missing-walk and white-page bugs broke, now locked at the SOURCE
 * level. Pure-data import: src/walk.mjs is JSX-free so vitest reads it
 * without a React transform (same shape as test/config.test.mjs).
 */
import { describe, expect, it } from 'vitest'
import { WALK, LEARN, routeKey } from '../src/walk.mjs'
import config from '../ssr.config.js'

const routes = config.routes.map((r) => r.path)

describe('src/walk.mjs - the walk contract (one list, four surfaces)', () => {
    it('is a non-empty tour with unique labels and unique hrefs', () => {
        expect(WALK.length).toBeGreaterThan(3)
        const labels = WALK.map((s) => s.label)
        const hrefs = WALK.map((s) => s.href)
        expect(new Set(labels).size).toBe(labels.length)
        expect(new Set(hrefs).size).toBe(hrefs.length)
        for (const s of WALK) {
            expect(s.label.length).toBeGreaterThan(0)
            expect(s.href.length).toBeGreaterThan(0)
        }
    })

    it('starts the tour at Home and loops back to it from the last stop', () => {
        expect(WALK[0]).toEqual({ label: 'Home', href: '/' })
    })

    it('only contains internal stops that exist as shipped routes', () => {
        const internal = WALK.filter((s) => s.href.startsWith('/')).map((s) => s.href)
        for (const href of internal) {
            expect(routes).toContain(href)
        }
    })

    it('carries only ONE Home origin (footer renders the same list)', () => {
        // PageWalk skips index 0; anything else would double-render Home
        expect(WALK.filter((s) => s.href === '/')).toHaveLength(1)
    })
})

describe('src/walk.mjs - the footer Learn contract (nine docs doors)', () => {
    it('is the same count as the menu (the owner same-count rule)', () => {
        expect(LEARN.length).toBe(WALK.length)
    })

    it('is ALL external docs.creadev.org deep links, unique', () => {
        const hrefs = LEARN.map((l) => l.href)
        expect(new Set(hrefs).size).toBe(hrefs.length)
        for (const l of LEARN) {
            expect(l.href.startsWith('https://docs.creadev.org/vant/')).toBe(true)
        }
    })
})

describe('routeKey - the trailing-slash normalizer (pass 348 closeout)', () => {
    it('folds directory URLs and SPA navigations into one key', () => {
        expect(routeKey('/brain')).toBe('/brain')
        expect(routeKey('/brain/')).toBe('/brain')
        expect(routeKey('/brain//')).toBe('/brain')
    })

    it('keeps the root as the root', () => {
        expect(routeKey('/')).toBe('/')
        expect(routeKey('////')).toBe('/')
        expect(routeKey('')).toBe('/')
    })

    it('passes non-strings through unchanged (defensive)', () => {
        expect(routeKey(undefined)).toBe(undefined)
        expect(routeKey(null)).toBe(null)
    })
})
