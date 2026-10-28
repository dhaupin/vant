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
            '- no sockets, no bans, no invoice. Live on npm as crashtest@1.1.0: ' +
            'install it, arm it, let the gate keep the line.',
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
            'than reading up on it.\n\n' +
            'The consumption story is public, too: this project\'s own CI lane runs ' +
            'the npm-installed crashtest - no clone, no special tooling - behind a ' +
            'determinism preflight and a strict conformance gate. Any finding ' +
            'outside the whitelisted pins fails the pull request, and a fix that ' +
            'flips a row to REFUSED deletes its own whitelist line. Adversarial ' +
            'grading as a CI contract, not a dev-only ritual.',
    },
    {
        id: 'gistory-creadev',
        title: 'Gistory',
        industry: ['Privacy', 'AI'],
        url: 'https://gistory.creadev.org',
        img: '/showcase-gistory-logo.jpg',
        imgAlt: 'Gistory logo: an open book with the text cursor between the pages and code braces on the right page, on a black rounded tile',
        blurb:
            'A prompt keeper that trusts you with the keys: end-to-end encrypted ' +
            'prompt history for AI workflows, synced across your own machines, ' +
            'with the whole sync engine written as reusable code you can lift ' +
            'into your own app.',
        desc:
            'Gistory keeps AI prompt history the way a vault should: encrypted on ' +
            'your devices, verified by the family gates, and synced end-to-end. ' +
            'The sync relay is blind by construction: it carries opaque blobs and ' +
            'never holds a readable byte, because your AES-GCM key derives on ' +
            'device from passphrase plus chainId (PBKDF2) before anything leaves. ' +
            'Pairing a new device is a GS1 pairing token, verified, not a QR ' +
            'ritual you have to trust on faith.\n\n' +
            'The merge story is engineering, not vibes: pure last-write-wins with ' +
            'a deterministic deviceId tiebreaker, tombstones for safe deletes, ' +
            'and a QoS scheduler that debounces, coalesces, backs off on the ' +
            'relay\'s own Retry-After, and never silently drops a failed push. ' +
            'The sync engine itself is written to be lifted out: the storage seam ' +
            'reads IndexedDB or localStorage at call time, so the same bundle ' +
            'runs in a browser, a web worker, or plain Node.\n\n' +
            'Gistory is a family member of the struct fleet, built the Vant way: ' +
            'a markdown brain lives under models/ in the repo itself, every ' +
            'session reads on wake and closes by committing what it learned, and ' +
            'the crashtest adversary rides in-tree (crashtest.config.js + its own ' +
            'workflows) so the sync surface is adversarially graded, not only ' +
            'unit-tested. Docs at docs.creadev.org/gistory.',
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
            'that produced this very site is public on the changelog page: ' +
            'numbered passes in the hundreds and counting, each one a reviewed ' +
            'commit.\n\n' +
            'Creadev.org runs a fleet of Vant agents around it: the core Axolotl (' +
            'Buffy) brain, and colleague Vant agents Rook, Cairn, and Prime. ' +
            'Together with the Creadev.org maintainers, they orchestrate all ' +
            'architecture, engineering, operations and development pipelines.',
    },
]
