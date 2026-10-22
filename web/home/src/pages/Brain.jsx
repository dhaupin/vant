/**
 * src/pages/Brain.jsx (vant-home)
 * ===============================
 * The Brain stop of the walk (pass 343): the marketing page for the
 * dashboard side of Vant. The menu's "Brain" lands here (internal stop, so
 * the page-walk prev/next works); the page's content carries the real door
 * (brain.creadev.org), plus the docs hub for operators. Claims are lifted
 * from the FAQ/truth, not the imagination: sessions live, agent rosters,
 * carrier packets, budgets, ledgers, decisions.
 */

import React from 'react'

export default function Brain() {
    return (
        <section>
            <div className="container">
                <div className="sec-head fx-reveal"><span className="sec-idx">01</span><h2>Brain</h2></div>
                <p className="sub fx-reveal">
                    Vant is the memory; the Brain is the dashboard side of it: a browser window
                    into a running install, watching sessions, agents, and the memory moving
                    between them as they happen.
                </p>

                <div className="grid-3">
                    <div className="card fx-reveal">
                        <h3>Sessions as they happen</h3>
                        <p>A live board fed by the typed event bus: sessions open, tools fire, and events land while they run, not after. One running install, watched from a browser tab.</p>
                    </div>
                    <div className="card fx-reveal fx-d1">
                        <h3>Agents and work</h3>
                        <p>The agent roster as it stands, work assigned to an agent, pairing flows, and forum verdicts with their decision trail: the crew's state without reading a log.</p>
                    </div>
                    <div className="card fx-reveal fx-d2">
                        <h3>Memory in transit</h3>
                        <p>Carrier packets between installs, the escrow ledger, budgets as they drain, and brains with their memory formats: the runtime's moving parts in one view.</p>
                    </div>
                </div>

                <div className="fits">
                    <div className="card fx-reveal">
                        <h3>Open the door</h3>
                        <p>The public instance watches the project's own install. Point your own at your pod: the dashboard connects to any running Vant, tokens stay yours, guests have policies.</p>
                        <p style={{ marginBottom: 0 }}>
                            <a className="btn" href="https://brain.creadev.org" rel="noopener">Open the Brain →</a>
                            {' '}
                            <a className="btn outline" href="https://docs.creadev.org/vant/" rel="noopener" style={{ marginLeft: 10 }}>Docs hub</a>
                        </p>
                    </div>
                    <div className="card fx-reveal fx-d1">
                        <h3>Run your own</h3>
                        <p>The Brain is part of the repo (web/dashboard, codename Bolete): open source under the same MIT, self-hostable from a clone, and every route ships its own Pages deploy.</p>
                        <a href="https://github.com/dhaupin/vant" className="learn-more">The repo →</a>
                    </div>
                </div>
            </div>
        </section>
    )
}
