/**
 * src/pages/Contact.jsx (vant-home)
 * =================================
 * Contact channels + the form island. The form does NOT POST anywhere: it
 * composes a GitHub issue URL client-side (issues.new with title/body
 * prefilled), opens it in a new tab, and you press the real submit on
 * GitHub. Nothing leaves this site's trust boundary — stated plainly on
 * the page.
 */

import React from 'react'

export default function Contact() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Contact</h2></div>
                <p className="sub">There is no support desk behind this site — the doors below go straight at the project and its maintainers.</p>

                <div className="contact-channels">
                    <div className="card">
                        <h3>GitHub Issues</h3>
                        <p><a href="https://github.com/dhaupin/vant/issues">github.com/dhaupin/vant/issues</a></p>
                        <p>Bugs, feature ideas, and general questions. Public by default: issues are searchable history; answers help the next agent that hits the same wall.</p>
                        <a href="https://github.com/dhaupin/vant/issues/new" className="learn-more">New issue →</a>
                    </div>
                    <div className="card">
                        <h3>Docs &amp; troubleshooting</h3>
                        <p>Most "contact" questions are actually answered pages: setup, troubleshooting, CLI reference, and the FAQ live in the docs hub.</p>
                        <a href="https://docs.creadev.org/vant/advanced/troubleshooting" className="learn-more">Troubleshooting →</a>
                    </div>
                    <div className="card">
                        <h3>Releases &amp; changelog</h3>
                        <p>Release notes and tagged versions ship through the repository. Version truth is pinned against the README and the CHANGELOG.</p>
                        <a href="https://github.com/dhaupin/vant/releases" className="learn-more">Releases →</a>
                    </div>
                </div>

                <h3 style={{ margin: '40px 0 6px', color: 'var(--ink)', fontSize: '1.15rem' }}>Compose an issue without an account in the repo UI first</h3>
                <p className="contact-note">
                    Fill this in, review it, then press submit on GitHub. The form runs entirely in your browser — it builds
                    the issue link locally; nothing is POSTed from this site, and this page stores nothing.
                </p>
                <pre-island data-pre-island="contact-form" data-pre-load="eager">
                    <p class="island-loading">Loading the issue composer…</p>
                    <p class="contact-note">Browser needs JavaScript for the composer. Or open{' '}
                        <a href="https://github.com/dhaupin/vant/issues/new">github.com/dhaupin/vant/issues/new</a> directly.
                    </p>
                </pre-island>
            </div>
        </section>
    )
}
