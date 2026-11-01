/* test/ailments-vendor-lockstep.test.mjs (vant-home)
 * ===================================================
 * The vendored _lib/ailments copies exist because the Pages Functions
 * bundle only chases imports INSIDE web/home/functions/ - the CF build
 * died on "Could not resolve ../../src/ailments/matcher.js" (wave 18's
 * route reached out of the functions root with a one-depth-off path).
 * Receipts are the point: the page and the /api/ailments/check route
 * render from the SAME matcher + registry, so the copies must stay
 * byte-identical to src/ailments - this suite makes any silent drift a
 * red test, keeping the duplicates in honest lockstep (house rule).
 *
 * Rule: src/ailments/* is the single source of truth. Touch one side,
 * touch both. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

const PAIRS = [
    ['src/ailments/matcher.js', 'functions/_lib/ailments/matcher.js'],
    ['src/ailments/receipt.js', 'functions/_lib/ailments/receipt.js'],
    ['src/ailments/ailments.json', 'functions/_lib/ailments/ailments.json'],
]

describe('ailments vendor lockstep (functions/_lib/ailments mirrors src/ailments byte-for-byte)', () => {
    it('all three vendored files carry a lockstep note in api/ailments/check.js', () => {
        const route = readFileSync(path.join(root, 'functions/api/ailments/check.js'), 'utf8')
        expect(route).toContain("from '../../_lib/ailments/matcher.js'")
        expect(route).toContain("from '../../_lib/ailments/receipt.js'")
    })

    for (const [srcPath, vendoredPath] of PAIRS) {
        it(`${vendoredPath} is byte-identical to ${srcPath}`, () => {
            const src = readFileSync(path.join(root, srcPath))
            const vendored = readFileSync(path.join(root, vendoredPath))
            expect(src.equals(vendored)).toBe(true)
        })
    }
})
