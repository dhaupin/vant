/**
 * src/pages/Status.jsx (vant-home)
 * ================================
 * Public surfaces status. The page itself is static (honest by default);
 * the live board is an island (status-board) that runs browser-side checks
 * after hydration; crawlers and no-JS visitors see the static surface list,
 * humans get the live check.
 */

import React from 'react'

const SURFACES = [
    { name: 'Home (this site)', url: 'https://vant.creadev.org', note: 'static Pages artifact' },
    { name: 'Docs hub', url: 'https://docs.creadev.org/vant/', note: 'Jekyll + pagefind' },
    { name: 'Brain dashboard', url: 'https://brain.creadev.org', note: 'requires a running install' },
    { name: 'GitHub repository', url: 'https://github.com/dhaupin/vant', note: 'canonical source + releases' },
]

export default function Status() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Status</h2></div>
                <p className="sub">Vant is software you fetch and run yourself; there is no central Vant server to be down. What exists publicly are these surfaces, checked live from your browser when the board mounts.</p>

                <div className="status-grid">
                    {SURFACES.map(s => (
                        <div className="card" key={s.name}>
                            <h3><a href={s.url} rel="noopener">{s.name}</a></h3>
                            <p>{s.note}</p>
                        </div>
                    ))}
                </div>

                <pre-island data-pre-island="status-board" data-pre-load="eager">
                    <p className="island-loading">Running browser-side checks…</p>
                </pre-island>

                <p className="contact-note" style={{ marginTop: 26 }}>
                    Honest limits: these checks answer from your browser, so a corporate proxy or an offline network can
                    make a healthy surface look unreachable, the reverse is never true (a reported-unreachable surface fails
                    loudly, it does not fail hidden). No result is stored anywhere; nothing here phones home.
                </p>
            </div>
        </section>
    )
}
