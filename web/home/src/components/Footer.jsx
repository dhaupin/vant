/**
 * src/components/Footer.jsx (vant-home)
 * =====================================
 * Shared footer for every route, two-column (pass 345):
 *   col 1 "Vant"   = THE SAME menu as the main site menu (Nav.jsx's WALK:
 *                    one list drives both surfaces, so they cannot drift)
 *   col 2 "Learn"  = nine external links to specific docs areas (the same
 *                    count as the menu) for everything beyond the five
 *                    minutes on /install.
 * Above the columns sits the page-agnostic closer statement, and below
 * them the meta row carries the final footer sentence (open source agent
 * memory under MIT, made by Creadev.org with a dofollow target=_blank
 * link) plus the footer-only routes (Changelog, Terms, Privacy). Both
 * desktop and phone widths render the columns two-up; the closer spans.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { WALK_LIVE, LEARN } from '../walk.mjs'

const META = [
    { label: 'Changelog', href: '/changelog' },
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
]

function footLink(l) {
    return l.href.startsWith('/')
        ? <Link key={l.label} to={l.href}>{l.label}</Link>
        : <a key={l.label} href={l.href} rel="noopener">{l.label}</a>
}

export default function Footer() {
    return (
        <footer>
            <div className="container">
                <div className="f-closer">
                    <p>
                        <strong>Vant.</strong> Persistent memory for AI agents:
                        plain markdown brain files in your own repository, read
                        when a session opens, written before it closes,
                        inherited every time after. Trusting the universe,
                        but with receipts.
                    </p>
                </div>
                <div className="footer-grid">
                    <nav className="f-col" aria-label="Footer - Vant">
                        <h3 className="f-head">Vant</h3>
                        <div className="f-links">{WALK_LIVE.map((l) => footLink(l))}</div>
                    </nav>
                    <nav className="f-col" aria-label="Footer - Learn">
                        <h3 className="f-head">Learn</h3>
                        <div className="f-links">{LEARN.map((l) => footLink(l))}</div>
                    </nav>
                </div>
                <div className="f-meta">
                    <span>
                        © 2026{' '}
                        Vant, open source agent memory under MIT | Made by{' '}
                        <a href="https://creadev.org" target="_blank" rel="dofollow noopener">Creadev.org</a>
                    </span>
                    <span className="f-meta-links">{META.map((l) => footLink(l))}</span>
                </div>
            </div>
        </footer>
    )
}
