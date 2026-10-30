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
    // The sibling family (owner update: all six sites live - touched lights, honest notes).
    { name: 'Packstruct', url: 'https://packstruct.creadev.org', note: 'the shared packs spec home: one manifest, entry, and lifecycle contract' },
    { name: 'Crashtest', url: 'https://crashtest.creadev.org', note: 'adversarial QA for agent-built apps' },
    { name: 'Eyestruct', url: 'https://eyestruct.creadev.org', note: "eyes for production agents: look/look-diff with a git-backed visual memory" },
    { name: 'Poststruct', url: 'https://poststruct.creadev.org', note: 'audit what shipped: baked-HTML head/link/hygiene contract' },
    { name: 'Govstruct', url: 'https://govstruct.creadev.org', note: 'the family controller layer: members manifest, per-shape renders, doctor verb' },
    { name: 'Monoforge', url: 'https://monoforge.creadev.org', note: 'the fleet factory: stamp from template blocks, doctor for truth' },
]

export default function Status() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Status</h2></div>
                <p className="sub">Vant is software you fetch and run yourself; there is no central Vant server to be down. The board below sweeps each public surface from the edge and keeps 35 days of history - the stat cards are the static posture; the live monitor mounts right under them.</p>

                <div className="status-grid">
                    {SURFACES.map(s => (
                        <div className="card" key={s.name}>
                            <h3><a href={s.url} rel="noopener">{s.name}</a></h3>
                            <p>{s.note}</p>
                        </div>
                    ))}
                </div>

                <pre-island data-pre-island="status-board" data-pre-load="eager">
                    <p className="island-loading">Loading the status monitor…</p>
                </pre-island>

                <p className="contact-note" style={{ marginTop: 26 }}>
                    Honest limits: the monitor probes the public URLs from the edge and stores what it sees in this site's
                    own D1 database - nothing about you or your browser is recorded, and nothing phones home.
                </p>
            </div>
        </section>
    )
}
