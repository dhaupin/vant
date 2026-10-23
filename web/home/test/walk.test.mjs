/**
 * web/home walk pins (pass 350, the #3 insurance round): the contracts the
 * /brain-missing-walk and white-page bugs broke, now locked at the SOURCE
 * level. Pure-data import: src/walk.mjs is JSX-free so vitest reads it
 * without a React transform (same shape as test/config.test.mjs).
 */
import { describe, expect, it } from 'vitest'
import { WALK, LEARN, routeKey, hopChain } from '../src/walk.mjs'
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

    it('reads the tour in the owner order (Status rides right after Showcase)', () => {
        expect(WALK.map((s) => s.label)).toEqual([
            'Home', 'Install', 'Brain', 'Security', 'Showcase',
            'Status', 'Releases', 'GitHub', 'Docs', 'Contact',
        ])
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

describe('hopChain - the menu-derived prev/next contract (externals ride along)', () => {
    const ix = (href) => WALK.findIndex((s) => s.href === href)

    it('walks internal stops directly (Showcase: Security <-> Status)', () => {
        const back = hopChain(ix('/showcase'), -1)
        const fwd = hopChain(ix('/showcase'), 1)
        expect(back.externals).toEqual([])
        expect(back.internal.label).toBe('Security')
        expect(fwd.externals).toEqual([])
        expect(fwd.internal.label).toBe('Status')
    })

    it('renders the externals, then the tour hop that skips them (Status next)', () => {
        const fwd = hopChain(ix('/status'), 1)
        expect(fwd.externals.map((s) => s.label)).toEqual(['Releases', 'GitHub', 'Docs'])
        expect(fwd.internal.href).toBe('/contact')
    })

    it('collects the externals behind a prev hop too (Contact prev)', () => {
        const back = hopChain(ix('/contact'), -1)
        expect(back.externals.map((s) => s.label)).toEqual(['Docs', 'GitHub', 'Releases'])
        expect(back.internal.href).toBe('/status')
    })

    it('wraps the tour back to Home after the last stop (Contact next)', () => {
        const fwd = hopChain(ix('/contact'), 1)
        expect(fwd.externals).toEqual([])
        expect(fwd.internal.href).toBe('/')
    })

    it('never returns an external as the internal hop and never loops forever', () => {
        for (let i = 0; i < WALK.length; i++) {
            for (const dir of [-1, 1]) {
                const { externals, internal } = hopChain(i, dir)
                expect(externals.length).toBeLessThan(WALK.length)
                for (const s of externals) { expect(s.href.startsWith('/')).toBe(false) }
                if (internal) { expect(internal.href.startsWith('/')).toBe(true) }
            }
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
