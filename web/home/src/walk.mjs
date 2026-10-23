/**
 * src/walk.mjs (vant-home)
 * ========================
 * The PURE-DATA single source of truth for the site's navigation contracts
 * (pass 350). No JSX, no imports: vite prerenders it, the browser bundles
 * it, and the vitest pins import it directly, so the walk/menu/footer
 * contracts can be locked without a React runtime.
 *
 *   WALK    = the owner-directed site tour; Nav.jsx renders it as the top
 *             menu and the drawer sections, AppLayout's PageWalk reads
 *             prev/next from it, and Footer.jsx's "Vant" column renders
 *             the same list. One list, four surfaces, zero drift.
 *   LEARN   = the footer "Learn" column: exactly WALK.length external
 *             docs links (the owner's same-count rule).
 *   hopChain = the prev/next engine: menu-derived, externals-aware
 *   routeKey = the trailing-slash normalizer (pass 348): the prerendered
 *             site serves /brain/ while SPA navigations ride /brain; every
 *             pathname-keyed lookup must fold both into one key.
 */

export const WALK = [
    { label: 'Home', href: '/' },
    { label: 'Install', href: '/install' },
    { label: 'Brain', href: '/brain' },
    { label: 'Security', href: '/security' },
    { label: 'Showcase', href: '/showcase' },
    { label: 'Status', href: '/status' },
    { label: 'Releases', href: 'https://github.com/dhaupin/vant/releases' },
    { label: 'GitHub', href: 'https://github.com/dhaupin/vant' },
    { label: 'Docs', href: 'https://docs.creadev.org/vant/' },
    { label: 'Contact', href: '/contact' },
]

// Ten entries, one per WALK stop (the owner's same-count rule): the footer
// columns render the same height on every route.
export const LEARN = [
    { label: 'Quick start', href: 'https://docs.creadev.org/vant/getting-started/quick-start' },
    { label: 'Agent onboarding', href: 'https://docs.creadev.org/vant/getting-started/agent-onboarding' },
    { label: 'Install guide', href: 'https://docs.creadev.org/vant/getting-started/install' },
    { label: 'The brain', href: 'https://docs.creadev.org/vant/memory/brain' },
    { label: 'Brain search', href: 'https://docs.creadev.org/vant/memory/search' },
    { label: 'MCP', href: 'https://docs.creadev.org/vant/runtime/mcp' },
    { label: 'REST API', href: 'https://docs.creadev.org/vant/reference/rest-api' },
    { label: 'CLI reference', href: 'https://docs.creadev.org/vant/reference/cli' },
    { label: 'Security', href: 'https://docs.creadev.org/vant/security/' },
    { label: 'Operations', href: 'https://docs.creadev.org/vant/operations/' },
]

export function routeKey(pathname) {
    if (typeof pathname !== 'string') return pathname
    return pathname.replace(/\/+$/, '') || '/'
}

// The prev/next engine (owner direction: "base the walk on the main menu"):
// PageWalk derives its hops PURELY from the menu order above, no page-local
// wiring. Standing on stop i, walking dir (-1 prev, +1 next): external stops
// are rendered as their own buttons (they leave the site - the visitor may
// want them), then the tour's REAL hop is the first internal stop beyond
// them, skipping the externals. The rendered sequence is the choose-your-
// own-adventure chain: [external button(s)] "or" [Prev/Next: internal stop].
// Returns { externals, internal } for the vitest pins.
export function hopChain(i, dir) {
    const externals = []
    let j = dir === 1 ? (i + 1) % WALK.length : i - 1
    let n = 0
    while (n < WALK.length && j >= 0 && !WALK[j].href.startsWith('/')) {
        externals.push(WALK[j])
        n++
        j += dir
        if (dir === 1) j = j % WALK.length
    }
    const internal = (j >= 0 && WALK[j] && WALK[j].href.startsWith('/')) ? WALK[j] : null
    return { externals, internal }
}
