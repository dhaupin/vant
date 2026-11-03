/**
 * src/pages/StructAudit.jsx (vant-home)
 * =====================================
 * The combined STRUCT audit page (vant issue #264, step a - the
 * mock-feed static skeleton). Like /showcase, this page is static by
 * design: the cards prerender at build time from src/struct-feeds.mjs
 * (the pure-data law), so crawlers and no-JS visitors read the whole
 * board and no network call ships to the browser.
 *
 * The five STRUCT families, combined:
 *   packstruct  - pack conformance gate
 *   crashtest   - the packs floor (rows, contract, native suites)
 *   eyestruct   - the vision battery's findings (npm-live)
 *   poststruct  - the shipped audit's findings (npm-live 2026-11-02)
 *   depstruct   - the dependency ledger census (the never-add-deps
 *                 law, wave 19·31: the ledger in scripts/audit-deps.js
 *                 is the only door a dependency rides through)
 *
 * EPOCH LAW (honest by construction): every card that is inline data
 * carries the MOCK SKELETON badge next to its verdict; with issue #264's
 * steps b + c + d landed AND poststruct's npm package live (2026-11-02),
 * all five cards ride live stamped emits (src/generated/struct-feed*.json)
 * and no mock row remains. The skeleton epoch ended with the poststruct
 * landing; the shape stays fixed (kit head:
 * web/kit/components/struct-audit.tsx - the single shape source the
 * dashboard flavor already consumes vendored + hash-pinned).
 */

import React from 'react'
import { STRUCT_FEEDS, STRUCT_LABELS, verdictOf, evidenceSlice } from '../struct-feeds.mjs'

const VERDICT_CLASS = {
    PASS: 'verdict-pass',
    FINDINGS: 'verdict-findings',
    ABSENT: 'verdict-absent',
}

function VerdictChip({ verdict, mock }) {
    return (
        <span className="sa-chips">
            <span className={'sa-verdict ' + (VERDICT_CLASS[verdict] || 'verdict-absent')}>{verdict}</span>
            {mock ? <span className="sa-mock">MOCK SKELETON</span> : null}
        </span>
    )
}

export default function StructAudit() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">07</span><h2>Struct audit</h2></div>
                <p className="sub">
                    The five STRUCT families' findings, combined on one page:
                    the pack conformance gate, the crashtest packs floor, the
                    eyestruct vision battery, the poststruct shipped audit,
                    and the depstruct dependency ledger. All five cards ride
                    live stamped emits over the tools' own outputs (issue
                    #264 steps b - d landed, poststruct's npm landed
                    2026-11-02, and depstruct's census row landed wave 19·31):
                    nothing is fetched at page time, and nothing is graded
                    beyond what a stamp measured.
                </p>

                <div className="struct-grid">
                    {STRUCT_FEEDS.map((feed) => (
                        <div className="card struct-card" key={feed.source}>
                            <div className="struct-head">
                                <VerdictChip verdict={verdictOf(feed)} mock={feed.mock} />
                                <h3>{STRUCT_LABELS[feed.source]}</h3>
                            </div>

                            {feed.ok ? (
                                <>
                                    <p className="struct-meta">
                                        {[
                                            feed.version ? 'feed ' + feed.version : null,
                                            feed.generatedAt ? 'generated ' + feed.generatedAt : null,
                                            feed.counts ? 'counts: ' + Object.entries(feed.counts).map(([k, v]) => k + ' ' + v).join(', ') : null,
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                    <div className="struct-findings">
                                        {evidenceSlice(feed, 3).map((f) => (
                                            <p key={f.id} className={'struct-finding level-' + f.level}>
                                                <span className="struct-level">{f.level}</span>{' '}
                                                {f.page ? <span className="struct-page">[{f.page}]</span> : null}{' '}
                                                {f.message}
                                            </p>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="struct-absent">{feed.error || 'absent (no reason stated)'}</p>
                            )}

                            {feed.sourceHref ? (
                                <p className="struct-href">
                                    <a href={feed.sourceHref} target="_blank" rel="noopener noreferrer">{feed.sourceHref}</a>
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>

                <p className="contact-note" style={{ marginTop: 26 }}>
                    The guarantees hold past the skeleton epoch: every card's stamp
                    date and provenance render here in the card, and the poststruct
                    card's warn rows state themselves exactly as the audit graded
                    them (dash-class is demoted to warn by the repo config because
                    this site's copy writes dashes by design). Each card's page
                    (docs + packs README) states what its feed reads; nothing on
                    this page calls a network.
                </p>
            </div>
        </section>
    )
}
