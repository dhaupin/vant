/**
 * src/pages/Security.jsx (vant-home)
 * ==================================
 * The disclosure + hardening route. Grounded in the repo: the security
 * chain (sandbox capabilities -> VAF validation -> QoS rate budgets ->
 * escrow approval, fail-closed with typed refusal codes) is real lib code;
 * the docs/security/ section documents it. No paid program or SLA exists,
 * so the page says exactly what the disclosure path is: private GitHub
 * security advisory first, public issue only where harm is impossible.
 */

import React from 'react'

export default function Security() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Security</h2></div>
                <p className="sub">The design law everywhere in Vant is <strong>fail-closed</strong>: a missing key, a hostile input, or a dead dependency refuses loudly — it never half-writes state.</p>

                <div className="dual-cta" style={{ maxWidth: 'none' }}>
                    <div className="cta-card">
                        <h2>Report a vulnerability</h2>
                        <p>Privately, via a <a href="https://github.com/dhaupin/vant/security/advisories/new" rel="noopener">GitHub private security advisory</a> — that reaches the maintainer without broadcasting a working exploit.</p>
                        <p style={{ margin: '10px 0 0' }}>Only use the public issue tracker for things that are not actually sensitive (config mistakes, docs gaps, hardening ideas).</p>
                        <p className="contact-note" style={{ margin: '12px 0 0' }}>Honest posture: this is a self-host open source project — there is no bug bounty or SLA. Reports get read and fixed in the open, with credit where wanted.</p>
                    </div>
                    <div className="cta-card">
                        <h2>The security chain, in order</h2>
                        <p>Every memory operation passes four gates before touching state, and refusals come back as typed codes — never silent.</p>
                        <ol className="legal" style={{ paddingLeft: '1.3rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 10 }}>
                            <li>Sandbox capabilities — canRead/canWrite gates</li>
                            <li>Input validation — the VAF wall (path traversal, prototype injection)</li>
                            <li>QoS budgets — rate limiting and concurrency</li>
                            <li>Escrow approval — sensitive operations need the hold released</li>
                        </ol>
                        <a href="https://docs.creadev.org/vant/security/" className="learn-more" style={{ marginTop: 10 }}>Security docs →</a>
                    </div>
                </div>

                <section style={{ paddingTop: 34 }}>
                    <div className="sec-head"><span className="sec-idx">02</span><h2>Hardening reading</h2></div>
                    <div className="grid-3">
                        <div className="card">
                            <h3>Storage layer</h3>
                            <p>Write-ahead journaling, atomic writes, cross-process locks, and symlink-escape refusal on the file layer.</p>
                            <a href="https://docs.creadev.org/vant/security/sandbox" className="learn-more">Sandbox →</a>
                        </div>
                        <div className="card">
                            <h3>Secrets &amp; tokens</h3>
                            <p>Encrypted secret store, sudo override with audit, and the multi-guest auth posture for shared installs.</p>
                            <a href="https://docs.creadev.org/vant/security/best-practices" className="learn-more">Best practices →</a>
                        </div>
                        <div className="card">
                            <h3>Network surfaces</h3>
                            <p>The relay and REST doors are gated by origin policy; air-gap propagation rules cover the offline story.</p>
                            <a href="https://docs.creadev.org/vant/security/airgap-propagation" className="learn-more">Airgap rules →</a>
                        </div>
                    </div>
                </section>

                <p className="contact-note">
                    Related pages: <a href="/privacy">privacy</a> (what leaves your machine), <a href="/terms">terms</a> (you are responsible for what your AI does).
                </p>
            </div>
        </section>
    )
}
