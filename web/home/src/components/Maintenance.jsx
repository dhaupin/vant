/**
 * src/components/Maintenance.jsx (vant-home)
 * ==========================================
 * THE SHARED MAINTENANCE STAGE: the one component every deploy-gated
 * dynamic surface renders while its gate (gates.mjs) is off. The wording
 * is owner-directed ("Vant is under maintenance, please check back
 * soon") and DELIBERATELY says nothing about which subsystem or binding
 * is missing: visitors get one calm line, operators read DEPLOY.md.
 *
 * Reuse contract: <Maintenance section="NN" title="Page title" /> inside
 * the route element ternary, e.g.
 *   element={STATUS_LIVE ? <Status /> : <Maintenance section="01" title="Status" />}
 * The section number + title keep the page visually consistent with its
 * live sibling; nothing else is promised.
 */

import React from 'react'

export default function Maintenance({ section = '01', title = 'Maintenance' }) {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">{section}</span><h2>{title}</h2></div>
                <p className="sub">Vant is under maintenance, please check back soon.</p>
            </div>
        </section>
    )
}
