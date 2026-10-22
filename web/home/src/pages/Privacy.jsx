/**
 * src/pages/Privacy.jsx (vant-home)
 * =================================
 * The privacy posture, summarized from docs/security/privacy.md + LEGAL.md.
 * The short thesis: your brain is your repo; this site itself is static
 * files and collects nothing.
 */

import React from 'react'

export default function Privacy() {
    return (
        <section className="legal">
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Privacy</h2></div>
                <p className="sub">The canonical policy lives in the repository: <a href="https://github.com/dhaupin/vant/blob/main/docs/security/privacy.md">docs/security/privacy.md</a> and <a href="https://github.com/dhaupin/vant/blob/main/LEGAL.md">LEGAL.md</a>. This page is the human-readable summary.</p>

                <h2>Your brain is your repo</h2>
                <p>Vant never puts your memory in someone else's database. Memory is markdown files under models/ in a repository — private if you make the repo private. Only you and the agents you authorize can access it. There is no external service holding a copy.</p>

                <h2>What Vant sends over the network</h2>
                <ul>
                    <li>Your Git host (GitHub, GitLab, Bitbucket, or self-hosted) when you sync</li>
                    <li>A GitHub token, only if you provide one — revocable at any time</li>
                    <li>Hosted embeddings, only if you configure an embed provider with your own API key. The default hash provider needs nothing and sends nothing</li>
                </ul>

                <h2>What this website collects</h2>
                <p>Nothing. This site is plain static files: no accounts, no cookies, no tracking, no analytics, no server-side processing. The status page runs browser-side checks only — your browser queries public endpoints directly; nothing is stored or relayed through us. The contact form composes a GitHub issue locally in your browser; you review it and submit it on GitHub, so GitHub's own privacy terms apply to what you share there.</p>

                <h2>Data control</h2>
                <ul>
                    <li>Stop using Vant and the memory survives as files, readable with cat</li>
                    <li>Private repo = private brain, full stop</li>
                    <li>Revoke the GitHub token to cut Vant's network access</li>
                </ul>

                <a className="backtop" href="https://github.com/dhaupin/vant/blob/main/docs/security/privacy.md">Full privacy policy →</a>
            </div>
        </section>
    )
}
