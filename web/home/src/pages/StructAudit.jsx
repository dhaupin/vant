/**
 * src/pages/StructAudit.jsx (vant-home)
 * =====================================
 * The combined STRUCT audit page (vant issue #264, step a — the
 * mock-feed static skeleton). Like /showcase, this page is static by
 * design: the cards prerender at build time from src/struct-feeds.mjs
 * (the pure-data law), so crawlers and no-JS visitors read the whole
 * board and no network call ships to the browser.
 *
 * The four STRUCT families, combined:
 *   packstruct  — pack conformance gate
 *   crashtest   — the packs floor (rows, contract, native suites)
 *   eyestruct   — the vision battery's findings (npm-live)
 *   poststruct  — the render audit's findings (PRD-staged, pre-npm)
 *
 * EPOCH LAW (honest by construction): every card that is inline data
 * carries the MOCK SKELETON badge next to its verdict; the ABSENT card
 * (poststruct, pre-npm) states its absence and grades nothing. When
 * the real feeds land (issue steps b-d) the cards flip with the data
 * and the badges leave; the shape stays fixed (kit head:
 * web/kit/components/struct-audit.tsx — the single shape source the
 * dashboard flavor already consumes vendored + hash-pinned).
 */

import React from 'react'
import { STRUCT_FEEDS_MOCK, STRUCT_LABELS, verdictOf, evidenceSlice } from '../struct-feeds.mjs'

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
                    The four STRUCT families' findings, combined on one page:
                    the pack conformance gate, the crashtest packs floor, the
                    eyestruct vision battery, and the poststruct render audit.
                    Skeleton epoch: these cards are inline mock data shaped
                    exactly as the real feeds will land (issues #264 steps
                    b–d) — nothing is fetched, nothing is graded, and the
                    mock badge rides every card until then.
                </p>

                <div className="struct-grid">
                    {STRUCT_FEEDS_MOCK.map((feed) => (
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
                    Two honest guarantees while this page is in its skeleton epoch: every
                    mock-sourced card wears its badge, and the pre-npm family (poststruct)
                    renders an absent statement instead of a verdict. When a real feed
                    replaces a card, the card's own page (docs + packs README) states what
                    the feed reads; nothing on this page calls a network.
                </p>
            </div>
        </section>
    )
}
