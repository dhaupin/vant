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
 *   STATUS_LIVE = the deploy gate for the status surface (false until the
 *                 monitor is wired: the D1 binding AND STATUS_ADMIN_KEY exist
 *                 on the Pages project - the owner flips VITE_STATUS_LIVE=1
 *                 in the PAGES BUILD settings at the same time). While it is
 *                 off, WALK_LIVE drops the Status stop, so the menu, the
 *                 drawer, the footer, and the walk hops never advertise a
 *                 page that cannot answer. No fallback fiction anywhere.
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

// The deploy gate (owner direction): the status surface stays OUT of the
// site until the monitor is wired for real. WALK remains the PINNED full
// tour truth (the tests hold it); WALK_LIVE is what the menu, the footer,
// the drawer, and the hop engine actually render.
export const STATUS_LIVE = String(
    (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_STATUS_LIVE
        : undefined
) === '1'

export const WALK_LIVE = STATUS_LIVE ? WALK : WALK.filter((s) => s.href !== '/status')

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
export function hopChain(stops, i, dir) {
    const externals = []
    let j = dir === 1 ? (i + 1) % stops.length : i - 1
    let n = 0
    while (n < stops.length && j >= 0 && !stops[j].href.startsWith('/')) {
        externals.push(stops[j])
        n++
        j += dir
        if (dir === 1) j = j % stops.length
    }
    const internal = (j >= 0 && j < stops.length && stops[j].href.startsWith('/')) ? stops[j] : null
    return { externals, internal }
}
