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
 *   routeKey = the trailing-slash normalizer (pass 348): the prerendered
 *             site serves /brain/ while SPA navigations ride /brain; every
 *             pathname-keyed lookup must fold both into one key.
 */

export const WALK = [
    { label: 'Home', href: '/' },
    { label: 'Install', href: '/install' },
    { label: 'Brain', href: '/brain' },
    { label: 'Security', href: '/security' },
    { label: 'Releases', href: 'https://github.com/dhaupin/vant/releases' },
    { label: 'GitHub', href: 'https://github.com/dhaupin/vant' },
    { label: 'Docs', href: 'https://docs.creadev.org/vant/' },
    { label: 'Status', href: '/status' },
    { label: 'Contact', href: '/contact' },
]

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
]

export function routeKey(pathname) {
    if (typeof pathname !== 'string') return pathname
    return pathname.replace(/\/+$/, '') || '/'
}
