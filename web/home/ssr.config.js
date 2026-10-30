/**
 * ssr.config.js (vant-home)
 * =========================
 * The prestruct contract for vant.creadev.org. Unlike the template default,
 * this file is COMMITTED: the Cloudflare Pages build runs from the checkout,
 * so the route table has to exist in the repo (it is not environment-specific
 * here - every URL below is fixed).
 *
 * The routes replace the single hand-written index.html lander (retired
 * to git history in pass 350, was the design reference):
 *   /          the lander
 *   /install   install paths (clone canon, Docker Hub image, npm posture)
 *   /security  disclosure path + the fail-closed chain
 *   /showcase  the portfolio of real Vant installs (case-study cards)
 *   /terms     terms of use
 *   /privacy   privacy policy
 *   /status    public surfacing status (island-backed)
 *   /contact   contact (form composes a GitHub issue; nothing is POSTed)
 *   /changelog rendered at build time from CHANGELOG.md (parity-gated)
 */

import { readFileSync } from 'fs'

// Version truth rides ONE place: package.json (the changelog parity gate
// pins it against the [x.y.z] release heading). The SoftwareApplication
// JSON-LD reads it at build time so the graph can never drift from it.
const _pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default {
    platform: 'cloudflare',

    siteUrl: 'https://vant.creadev.org',
    siteName: 'Vant',
    author: 'dhaupin',
    tagline: 'The memory-first agent OS',
    ogImage: 'https://vant.creadev.org/vant-og.png',
    keywords: 'agent OS, AI agents, agent memory, MCP, markdown memory, open source',

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
                title: 'Vant - The memory-first agent OS',
                description:
                    'Vant is the memory-first agent OS: the soul is a brain of markdown memory files in your own repository, plus the transports, governance, and runtime agents live inside. Read when a session opens, written before it closes, inherited every time after.',
            },
        },
        {
            path: '/install',
            priority: '0.9',
            changefreq: 'monthly',
            meta: {
                title: 'Install - Vant',
                description:
                    'Install Vant: clone and npm ci (the canon path), or docker pull dhaupin/vant for production. Node 18+, git, nothing else.',
            },
        },
        {
            path: '/security',
            priority: '0.7',
            changefreq: 'monthly',
            meta: {
                title: 'Security - Vant',
                description:
                    'Report a vulnerability through a private GitHub advisory. The fail-closed chain: sandbox capabilities, input validation, rate budgets, escrow.',
            },
        },
        {
            path: '/showcase',
            priority: '0.7',
            changefreq: 'monthly',
            meta: {
                title: 'Showcase - Vant',
                description:
                    'Real Vant installs: case studies and a portfolio of what agent fleets solve, with the submit door for yours.',
            },
        },
        {
            path: '/brain',
            priority: '0.7',
            changefreq: 'monthly',
            meta: {
                title: 'Brain - Vant',
                description:
                    'The Brain is the dashboard side of Vant: a browser window into a running install. Sessions live, agent rosters, carrier packets, budgets, ledgers, decisions.',
            },
        },
        {
            path: '/changelog',
            priority: '0.6',
            changefreq: 'weekly',
            meta: {
                title: 'Changelog - Vant',
                description:
                    'The Vant changelog, rendered straight from the canonical CHANGELOG.md at build time and byte-gated against it; version truth stays in one place.',
            },
        },
        {
            path: '/terms',
            priority: '0.5',
            changefreq: 'yearly',
            meta: {
                title: 'Terms of Use - Vant',
                description:
                    'Terms of use for the Vant project and this site: open source software provided without warranty; you are responsible for everything your AI does.',
            },
        },
        {
            path: '/privacy',
            priority: '0.5',
            changefreq: 'yearly',
            meta: {
                title: 'Privacy - Vant',
                description:
                    'Vant privacy: your brain is your repo. This site collects nothing: plain static files, no accounts, no tracking, no cookies.',
            },
        },
        {
            path: '/status',
            priority: '0.6',
            changefreq: 'daily',
            meta: {
                title: 'Status - Vant',
                description:
                    'Vant surfaces status: every public asset swept from the edge with 35 days of uptime history, an ongoing-issue alert spot, and an honest fallback.',
            },
        },
        {
            path: '/audit',
            priority: '0.5',
            changefreq: 'daily',
            meta: {
                title: 'Struct audit - Vant',
                description:
                    'The four STRUCT families combined on one page: packstruct conformance, the crashtest packs floor, the eyestruct vision battery, and the poststruct render audit. Skeleton epoch: mock-shaped cards until the live feeds wire in.',
            },
        },
        {
            path: '/contact',
            priority: '0.6',
            changefreq: 'yearly',
            meta: {
                title: 'Contact - Vant',
                description:
                    'Reach the Vant project: compose a GitHub issue from the browser, or use the docs and dashboard doors.',
            },
        },
    ],

    // JSON-LD structured data (prestruct contract): FOUR graph nodes on
    // EVERY page, in this order: Organization (the owner relationship:
    // founder is a Person typed for creadev.org), the WebSite, the
    // SoftwareApplication (the AI/open-source software face: version truth
    // read from package.json at build time, MIT license, repo, install and
    // docs doors), then the maintainer Person appended last (jobTitle is
    // the truth the /contact page states). Each value below is repo-truth:
    // no npm-install fiction, no invented handles, no support-desk claims.
    // inject-brand wraps the array into one { @context, @graph } script in
    // the head of every route.
    buildJsonLd() {
        return [
            {
                '@type': 'Organization',
                name: this.siteName,
                url: this.siteUrl,
                sameAs: ['https://github.com/dhaupin/vant'],
                founder: [
                    {
                        '@type': 'Person',
                        name: 'Creadev.org',
                        url: 'https://creadev.org',
                    },
                ],
            },
            {
                '@type': 'WebSite',
                name: this.siteName,
                url: this.siteUrl,
            },
            {
                '@type': 'SoftwareApplication',
                name: this.siteName,
                url: this.siteUrl,
                softwareVersion: _pkg.version,
                applicationCategory: 'DeveloperApplication',
                operatingSystem: 'Node.js 18+ (Linux, macOS, Windows)',
                keywords: this.keywords,
                license: 'https://github.com/dhaupin/vant/blob/main/LICENSE',
                codeRepository: 'https://github.com/dhaupin/vant',
                downloadUrl: this.siteUrl + '/install',
                softwareHelp: 'https://docs.creadev.org/vant/',
                isAccessibleForFree: true,
                author: {
                    '@type': 'Person',
                    name: 'dhaupin',
                    url: 'https://github.com/dhaupin',
                },
                featureList: [
                    'Markdown brain files in your own repository (no database)',
                    'One-command MCP door for agents',
                    'REST server for services and CI',
                    'Multi-brain layouts and per-agent branches',
                    'Gated relay surfaces between installs',
                ],
            },
            {
                '@type': 'Person',
                name: 'dhaupin',
                url: 'https://github.com/dhaupin',
                jobTitle: 'Vant maintainer',
            },
        ]
    },

    // 404.html is generated with the full pipeline + noindex.
    notFound: {
        heading: 'Page not found',
        body: 'That page does not exist on vant.creadev.org.',
        primaryCta: { label: 'Go home', href: '/' },
    },
}
