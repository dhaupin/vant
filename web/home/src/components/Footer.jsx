/**
 * src/components/Footer.jsx (vant-home)
 * =====================================
 * Shared footer for every route. Copy matches the checked-in lander backup
 * (four-site crosslink family), with the site's own routes in the nav.
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function Footer() {
    return (
        <footer>
            <div className="container">
                <p>
                    Vant. Agent memory that lives in your repo. Open source under<br />
                    MIT. One of four crosslinked sites: this home page, the{' '}
                    <a href="https://docs.creadev.org/vant/">docs hub</a>, the{' '}
                    <a href="https://brain.creadev.org" rel="noopener">Brain dashboard</a>, and the{' '}
                    <a href="https://freestruct.creadev.org" rel="noopener">Freestruct docs</a>{' '}
                    (built from the docs system this site prototyped).
                </p>
                <nav aria-label="Footer">
                    <Link to="/install">Install</Link>
                    <a href="https://docs.creadev.org/vant/">Docs</a>
                    <a href="https://docs.creadev.org/vant/getting-started/quick-start">Getting Started</a>
                    <a href="https://docs.creadev.org/vant/getting-started/agent-onboarding">Agent Onboarding</a>
                    <a href="https://brain.creadev.org" rel="noopener">Brain (dashboard)</a>
                    <a href="https://github.com/dhaupin/vant">GitHub</a>
                    <Link to="/security">Security</Link>
                    <Link to="/contact">Contact</Link>
                    <a href="https://creadev.org" target="_blank" rel="dofollow noopener">creadev.org</a>
                </nav>
            </div>
        </footer>
    )
}
