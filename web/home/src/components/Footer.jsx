/**
 * src/components/Footer.jsx (vant-home)
 * =====================================
 * Shared footer for every route. Three-column grid (styles.css .footer-grid):
 * the project's closer statement (one page-agnostic Vant summary — open
 * source under MIT, made by Creadev.org), the site's OWN routes, and the
 * crosslink family - collapsing to one column on mobile. Terms/Privacy
 * are footer-only by owner direction (pass 338 post-merge round).
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function Footer() {
    return (
        <footer>
            <div className="container footer-grid">
                <div className="f-about">
                    <p>
                        <strong>Vant.</strong> Persistent memory for AI agents:
                        plain markdown brain files in your own repository, read
                        when a session opens, written before it closes,
                        inherited every time after. Free and open source under
                        MIT — made by{' '}
                        <a href="https://creadev.org" target="_blank" rel="noopener">Creadev.org</a>.
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
