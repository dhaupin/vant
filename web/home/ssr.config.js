/**
 * ssr.config.js (vant-home)
 * =========================
 * The prestruct contract for vant.creadev.org. Unlike the template default,
 * this file is COMMITTED: the Cloudflare Pages build runs from the checkout,
 * so the route table has to exist in the repo (it is not environment-specific
 * here - every URL below is fixed).
 *
 * The seven routes replace the single hand-written index.html lander
 * (web/home/index.bak.html, kept as the design reference):
 *   /          the lander
 *   /install   install paths (clone canon, Docker Hub image, npm posture)
 *   /security  disclosure path + the fail-closed chain
 *   /terms     terms of use
 *   /privacy   privacy policy
 *   /status    public surfacing status (island-backed)
 *   /contact   contact (form composes a GitHub issue; nothing is POSTed)
 */

export default {
    platform: 'cloudflare',

    siteUrl: 'https://vant.creadev.org',
    siteName: 'Vant',
    author: 'dhaupin',
    tagline: 'Persistent memory for AI agents',
    ogImage: 'https://vant.creadev.org/vant-og.png',
    keywords: 'AI agents, agent memory, MCP, markdown memory, open source',

    appLayoutPath: '/src/AppLayout.jsx',

    // Same canon robots file as before (checked in at public/robots.txt and
    // copied through pre untouched), now declared here so the sitemap line
    // and the AEO posture come from one place.
    robots: 'User-agent: *\nAllow: /\n',

    routes: [
        {
            path: '/',
            priority: '1.0',
            changefreq: 'weekly',
            meta: {
                title: 'Vant — Persistent memory for AI agents',
                description:
                    'Vant gives any AI agent a brain: markdown memory files in your own repository. Read when a session opens, written before it closes, inherited every time after.',
            },
        },
        {
            path: '/install',
            priority: '0.9',
            changefreq: 'monthly',
            meta: {
                title: 'Install — Vant',
                description:
                    'Install Vant: clone and npm ci (the canon path), or docker pull dhaupin/vant for production. Node 18+, git, nothing else.',
            },
        },
        {
            path: '/security',
            priority: '0.7',
            changefreq: 'monthly',
            meta: {
                title: 'Security — Vant',
                description:
                    'Report a vulnerability through a private GitHub advisory. The fail-closed chain: sandbox capabilities, input validation, rate budgets, escrow.',
            },
        },
        {
            path: '/terms',
            priority: '0.5',
            changefreq: 'yearly',
            meta: {
                title: 'Terms of Use — Vant',
                description:
                    'Terms of use for the Vant project and this site: open source software provided without warranty; you are responsible for everything your AI does.',
            },
        },
        {
            path: '/privacy',
            priority: '0.5',
            changefreq: 'yearly',
            meta: {
                title: 'Privacy — Vant',
                description:
                    'Vant privacy: your brain is your repo. This site collects nothing — plain static files, no accounts, no tracking, no cookies.',
            },
        },
        {
            path: '/status',
            priority: '0.6',
            changefreq: 'daily',
            meta: {
                title: 'Status — Vant',
                description:
                    'Vant surfaces status: the home site, docs hub, brain dashboard, and the GitHub project, checked from your browser with honest limits.',
            },
        },
        {
            path: '/contact',
            priority: '0.6',
            changefreq: 'yearly',
            meta: {
                title: 'Contact — Vant',
                description:
                    'Reach the Vant project: compose a GitHub issue from the browser, or use the docs and dashboard doors.',
            },
        },
    ],

    // 404.html is generated with the full pipeline + noindex.
    notFound: {
        heading: 'Page not found',
        body: 'That page does not exist on vant.creadev.org.',
        primaryCta: { label: 'Go home', href: '/' },
    },
}
