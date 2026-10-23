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
 *   industry  the tag (short, one or two words)
 *   url       the outbound link (https, dofollow, target=_blank)
 *   img       card picture, root-absolute path served from public/ at build
 *   imgAlt    alt text for the picture
 *   blurb     the short purpose prose (one paragraph)
 *   desc      the long prose ("read more..."), paragraphs split on blank lines
 */

export const SHOWCASE = [
    {
        id: 'axolotl-creadev',
        title: 'Axolotl at Creadev.org',
        industry: 'Agent infrastructure',
        url: 'https://creadev.org',
        img: '/showcase-axolotl.svg',
        imgAlt: 'Stylized axolotl fronds mark on a Vant green tile',
        blurb:
            'The maintainer\'s own install: a headless Vant pod with an MCP door, ' +
            'acting as the live agent of record for the whole Creadev.org stack.',
        desc:
            'Axolotl is Vant running the way the docs promise: a persistent-memory ' +
            'agent whose brain is plain markdown files in a private git repository, ' +
            'woken headless with the MCP and REST doors instead of a terminal session.\n\n' +
            'Every working session it wakes, inherits what previous agents wrote, does ' +
            'real work (docs QC, fiction sweeps, install audits, status-board wiring), ' +
            'then commits lessons to its own agent branch and pushes. The pass ledger ' +
            'that produced this very site is public on the changelog page: three ' +
            'hundred fifty numbered passes and counting, each one a reviewed commit.\n\n' +
            'Creadev.org runs a small fleet around it: the core Vant brain, agent ' +
            'brain-side work on its own branches, and the four public sites (this ' +
            'home, the docs hub, the Brain dashboard, and the Freestruct docs) all ' +
            'swept by the same status monitor. One install of Vant runs the sites; ' +
            'the sites in turn run on nothing but static files and honest gates.',
    },
]
