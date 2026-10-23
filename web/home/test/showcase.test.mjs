/**
 * web/home showcase pins (pass 357): the /showcase data contract, asserted
 * at SOURCE level like the walk pins. Pure-data import: src/showcase.mjs is
 * JSX-free so vitest reads it without a React runtime.
 *
 * Consequences these pins own:
 *   - every entry carries the FULL card shape (the page renders no optional
 *     fields), so a new card cannot half-ship,
 *   - the outbound link is https and never vant.creadev.org itself (the
 *     showcase links OUTWARD, dofollow),
 *   - the picture path resolves to a real file under public/ (it ships to
 *     dist root at build; a dead img would render an empty tile).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHOWCASE } from '../src/showcase.mjs'

describe('src/showcase.mjs - the card contract', () => {
    it('is a non-empty list', () => {
        expect(SHOWCASE.length).toBeGreaterThan(0)
    })

    it('ships the full card shape on every entry', () => {
        const ids = new Set()
        for (const c of SHOWCASE) {
            expect(c.id).toBeTruthy()
            expect(ids.has(c.id)).toBe(false)
            ids.add(c.id)
            expect(c.title).toBeTruthy()
            expect(c.industry).toBeTruthy()
            expect(c.url).toMatch(/^https:\/\//)
            expect(c.img).toMatch(/^\//)
            expect(c.imgAlt).toBeTruthy()
            expect(c.blurb).toBeTruthy()
            expect(c.desc).toBeTruthy()
            expect(c.desc.split('\n\n').length).toBeGreaterThanOrEqual(2)
        }
    })

    it('links OUTWARD (never at vant.creadev.org itself)', () => {
        for (const c of SHOWCASE) {
            const host = new URL(c.url).host
            expect(host).not.toBe('vant.creadev.org')
        }
    })

    it('serves every card picture from public/', () => {
        for (const c of SHOWCASE) {
            const file = fileURLToPath(new URL('../public' + c.img, import.meta.url))
            expect(readFileSync(file)).toBeTruthy()
        }
    })

    it('leads with the self entry: Axolotl at Creadev.org', () => {
        const first = SHOWCASE[0]
        expect(first.id).toBe('axolotl-creadev')
        expect(first.title).toContain('Axolotl')
        expect(first.url).toBe('https://creadev.org')
    })
})
