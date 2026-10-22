/**
 * src/pages/Terms.jsx (vant-home)
 * ===============================
 * Terms of use for the Vant project and this site. Source of truth: LEGAL.md
 * at the repo root and docs/reference/legal.md (the canon is linked there;
 * the page is the human-readable summary, not a rewrite.
 */

import React from 'react'

export default function Terms() {
    return (
        <section className="legal">
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Terms of Use</h2></div>
                <p className="sub">Last meaningful update: v0.8.6. The canonical text lives in <a href="https://github.com/dhaupin/vant/blob/main/LEGAL.md">LEGAL.md</a> in the repository; this page summarizes it and links the full documents.</p>

                <h2>The short version</h2>
                <p>Vant is open source software provided without warranty. By using it, you accept all risks and responsibilities. Vant also publishes three policies: <strong>terms</strong> (this document and its full source), <strong>privacy</strong> (see <a href="/privacy">/privacy</a>), and <strong>ethics</strong> (conduct toward agents and operators). The three-way contradiction the old v2.0 policies carried was retired: the MIT license in the repository governs the code.</p>

                <h2>You are responsible for</h2>
                <ul>
                    <li>Everything your AI does</li>
                    <li>Your GitHub token security</li>
                    <li>Backing up your brain</li>
                    <li>Following GitHub ToS</li>
                </ul>

                <h2>Vant is not liable for</h2>
                <ul>
                    <li>Your actions</li>
                    <li>Your AI's actions</li>
                    <li>Data loss</li>
                    <li>Token exposure</li>
                </ul>

                <h2>GitHub terms of use</h2>
                <p>Automate politely: polling is fine (vant watch checks the remote with plain git fetches, so it draws no REST API quota); GitHub API limits apply only to automation that calls the API itself. Do not use a repository as an unlimited raw database; tokens can be revoked at any time.</p>

                <h2>Updates</h2>
                <p>These terms may change. Continued use means acceptance; check the dates on each document. Questions: <a href="/contact">open a GitHub issue</a>, read the <a href="https://docs.creadev.org/vant/">docs</a>, or review the source.</p>

                <a className="backtop" href="https://github.com/dhaupin/vant/blob/main/LEGAL.md">Full terms (LEGAL.md) →</a>
            </div>
        </section>
    )
}
