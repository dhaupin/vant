/**
 * src/components/Footer.jsx (vant-home)
 * =====================================
 * Shared footer for every route. Copy matches the checked-in lander backup
 * (four-site crosslink family). Three-column grid (styles.css .footer-grid):
 * the project blurb, the site's OWN routes, and the crosslink family -
 * collapsing to one column on mobile. Terms/Privacy are footer-only by
 * owner direction (pass 338 post-merge round).
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function Footer() {
    return (
        <footer>
            <div className="container footer-grid">
                <div className="f-about">
                    <p>
                        <strong>Vant.</strong> Agent memory that lives in your repo.
                        Open source under MIT. One of four crosslinked sites: this
                        home page, the <a href="https://docs.creadev.org/vant/">docs
                        hub</a>, the{' '}
                        <a href="https://brain.creadev.org" rel="noopener">Brain
                        dashboard</a>, and the{' '}
                        <a href="https://freestruct.creadev.org" rel="noopener">Freestruct
                        docs</a> (built from the docs system this site prototyped).
                    </p>
                </div>
                <nav className="f-col" aria-label="Footer - this site">
                    <h3 className="f-head">This site</h3>
                    <div className="f-links">
                        <Link to="/install">Install</Link>
                        <Link to="/changelog">Changelog</Link>
                        <Link to="/security">Security</Link>
                        <Link to="/status">Status</Link>
                        <Link to="/contact">Contact</Link>
                        <Link to="/terms">Terms</Link>
                        <Link to="/privacy">Privacy</Link>
                    </div>
                </nav>
                <nav className="f-col" aria-label="Footer - the family">
                    <h3 className="f-head">The family</h3>
                    <div className="f-links">
                        <a href="https://docs.creadev.org/vant/">Docs hub</a>
                        <a href="https://docs.creadev.org/vant/getting-started/quick-start">Getting Started</a>
                        <a href="https://docs.creadev.org/vant/getting-started/agent-onboarding">Agent Onboarding</a>
                        <a href="https://brain.creadev.org" rel="noopener">Brain (dashboard)</a>
                        <a href="https://freestruct.creadev.org" rel="noopener">Freestruct docs</a>
                        <a href="https://github.com/dhaupin/vant">GitHub</a>
                        <a href="https://github.com/dhaupin/vant/releases">Releases</a>
                        <a href="https://creadev.org" target="_blank" rel="dofollow noopener">creadev.org</a>
                    </div>
                </nav>
            </div>
        </footer>
    )
}
