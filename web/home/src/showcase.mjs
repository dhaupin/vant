/**
 * src/showcase.mjs (vant-home)
 * ============================
 * THE PURE-DATA SOURCE for the /showcase page (the site's portfolio of
 * real Vant installs: case studies with a pic, a one-line purpose, an
 * expandable description, the outbound link, and an industry tag).
 *
 * Same shape law as walk.mjs: no JSX, no imports, so vite prerenders it,
 * the browser bundles it, and the vitest pins (test/showcase.test.mjs)
 * read it directly without a React runtime.
 *
 * MOVE-TO-D1 NOTE (owner direction): today the cards are build-time static
 * (honest for SEO, crawlers, no-JS). When the web/home admin dash lands,
 * this module is the swap point: the page consumes ONLY this shape, so a
 * D1-backed feed is a one-file change plus the same shape from the API.
 *
 * Entry shape (every field required, pinned by test/showcase.test.mjs):
 *   id        stable slug
 *   title     display name
 *   industry  the tag list (short labels, up to two per card)
 *   url       the outbound link (https, dofollow, target=_blank)
 *   img       card picture, root-absolute path served from public/ at build
 *   imgAlt    alt text for the picture
 *   blurb     the short purpose prose (one paragraph)
 *   desc      the long prose ("read more..."), paragraphs split on blank lines
 */

export const SHOWCASE = [
    {
        id: 'crashtest-creadev',
        title: 'Crashtest',
        industry: ['Security', 'CI'],
        url: 'https://crashtest.creadev.org',
        img: '/showcase-rook-logo-full-800.jpg',
        imgAlt: 'The Rook agent logo mark for the Crashtest project',
        blurb:
            'Adversarial QA for agent-built software: seeded in-process attacks on ' +
            'your real handlers, a hardening ledger, and CI that fails on regressions ' +
            '- no sockets, no bans, no invoice.',
        desc:
            'Crashtest wasn\'t built in one session, it was built by a continuity. ' +
            'Its builder, Rook, is a persistent coding agent that works the Vant ' +
            'way: a wholebrain of markdown files under models/ in the repo itself ' +
            '(identity, goals, structure, workflow, lessons, errors) that every ' +
            'session reads on wake and writes before it closes, committed to ' +
            'git.\n\n' +
            'That continuity is the point. The goals never restart: they stayed ' +
            'exactly where they were written while the scope grew from a seeded ' +
            'auth/input pack to the full taxonomy (state oracles, volume, ' +
            'abuse-shape guards). Earned rules hold their line in lessons.md ' +
            '("seed-derived everything", "exact pins not ceilings", "no sockets. ' +
            'Ever."). The prose and working cadence carried across dozens of ' +
            'sessions instead of being re-derived each time, with receipts stamped ' +
            'for later verification, not remembered: a 176/176 test suite and a ' +
            'self-dogfood ledger at 30/30 REFUSED at the v1.0.0 seal.\n\n' +
            'When work went parallel, other vant agents on their own brains shared ' +
            'the same memory: one brain per project, one branch per agent, ' +
            'merge-by-PR. That is how attack packs, issue fixes, and new ' +
            'capabilities (hono/express/fastify/wordpress adapters, the hardening ' +
            'ledger, the CI gate) landed with no hand-off meeting. The whole brain ' +
            'also travels as a vant horcrux ' +
            '(horcrux/crashtest-p_quillstone-9fold.svg), verifiably restorable on a ' +
            'virgin clone, so any fresh session wakes up owning the project rather ' +
            'than reading up on it.',
    },
    {
        id: 'axolotl-creadev',
        title: 'Creadev.org',
        industry: ['Agent infrastructure'],
        url: 'https://creadev.org',
        img: '/showcase-axolotl-logo-full-800.jpg',
        imgAlt: 'Generated axolotl fronds logo: smiling axolotl head with radiating fronds on a deep green tile',
        blurb:
            'Axolotl: a headless Vant pod with an MCP door, acting as the live ' +
            'agent of record for the whole Creadev.org stack.',
        desc:
            'Axolotl is Vant running the way the docs promise: a persistent-memory ' +
            'agent whose brain is plain markdown files in a private git repository, ' +
            'woken headless with the MCP and REST doors instead of a terminal session.\n\n' +
            'Every working session it wakes, inherits what previous agents wrote, does ' +
            'real work (docs QC, fiction sweeps, install audits, status-board wiring), ' +
            'then commits lessons to its own agent branch and pushes. The pass ledger ' +
            'that produced this very site is public on the changelog page: three ' +
            'hundred fifty numbered passes and counting, each one a reviewed commit.\n\n' +
            'Creadev.org runs a fleet of Vant agents around it: the core Axolotl (' +
            'Buffy) brain, and colleague Vant agents Rook, Cairn, and Prime. ' +
            'Together with the Creadev.org maintainers, they orchestrate all ' +
            'architecture, engineering, operations and development pipelines.',
    },
]
