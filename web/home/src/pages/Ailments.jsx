/**
* src/pages/Ailments.jsx (vant-home)
* ==================================
* The install-ailment checker route (vant#260): paste CLI output, get the
* known-issue rows back. Two doors on one truth:
*
* - the static part (this file, prerendered): the full registry table
*   renders at BUILD time from src/ailments/ailments.json, so no-JS
*   visitors and crawling agents read the complete known-rows index in
*   plain HTML;
* - the interactive part (islands/AilmentsChecker.jsx, client-only): the
*   paste box + copyable receipt. Nothing is POSTed anywhere — the same
*   privacy story the /contact composer states, one page over.
*
* The edge door for agents (GET /api/ailments/check?q=...) runs the SAME
* matcher module on the edge; its contract is pinned in test/ailments.test.mjs.
*/
import React from 'react'
import registry from '../ailments/ailments.json'

const ISSUE_URL = 'https://github.com/dhaupin/vant/issues/'

function refsCell(refs) {
if (!refs || refs.length === 0) return '—'
return refs.map((n, i) => (
<span key={n} style={{ marginLeft: i === 0 ? 0 : '0.5rem' }}>
<a href={ISSUE_URL + n}>#{n}</a>
</span>
))
}

const TABLE_CELL = { padding: '10px 12px 10px 0', verticalAlign: 'top', borderTop: '1px solid var(--border)', fontSize: '0.93rem' }

export default function Ailments() {
const layers = registry.severityOrder.map((sev) => registry.severities[sev])
return (
<section>
<div className="container">
<div className="sec-head"><span className="sec-idx">01</span><h2>Ailment checker</h2></div>
<p className="sub">Paste the output of any vant CLI command and get back the known-issue rows it matches: what it is, how bad it is, where it is tracked. The paste never leaves your browser: the check runs client-side against a static registry, no daemon, no network.</p>

<div className="cta-card" style={{ maxWidth: 'none' }}>
<h2>Run the check</h2>
<p>CLI → copy → paste → read the receipt rows. Severity ranked: <strong>actionable</strong> first, <strong>benign</strong> last. Copy the receipt and it is agent-legible as plain text — paste it back into chat, a lesson, or an issue.</p>
<pre-island data-pre-island="ailments-checker" data-pre-load="eager">
<p className="island-loading">Loading the checker…</p>
<p className="contact-note" style={{ marginTop: 8 }}>
The interactive paste box needs JavaScript. The full known-rows table is below this card, readable without it —
and agents can skip the browser entirely: <code>GET /api/ailments/check?q=&lt;your paste&gt;</code> on this site runs
the same matcher on the edge and answers JSON.
</p>
</pre-island>
</div>

<section style={{ paddingTop: 34 }}>
<div className="sec-head"><span className="sec-idx">02</span><h2>The known rows</h2></div>
<p className="sub">
The registry is data, not code ({registry.entries.length} rows, version {registry.registryVersion}): every row carries
its regex, its severity, its evidence samples, and its issue refs. The gate suite (web/home/test/ailments.test.mjs)
pins every sample against its own regex before build, so the table below cannot document a pattern it does not match.
</p>
<div className="severity-legend" style={{ margin: '18px 0 10px', maxWidth: 'none' }}>
<p className="contact-note" style={{ margin: '0 0 10px' }}>How to read a tier:</p>
<ul className="legal" style={{ paddingLeft: '1.3rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0 }}>
{layers.map((s) => (
<li key={s.label}><strong>{s.label}</strong> — {s.hint}</li>
))}
</ul>
</div>
<div style={{ overflowX: 'auto' }}>
<table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
<thead>
<tr>
<th style={{ ...TABLE_CELL, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '6%' }}>ID</th>
<th style={{ ...TABLE_CELL, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '26%' }}>Row</th>
<th style={{ ...TABLE_CELL, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '9%' }}>Tier</th>
<th style={{ ...TABLE_CELL, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>What it means</th>
<th style={{ ...TABLE_CELL, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '10%' }}>Refs</th>
</tr>
</thead>
<tbody>
{registry.entries.map((entry) => (
<tr key={entry.id}>
<td style={{ ...TABLE_CELL, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{entry.id}</td>
<td style={{ ...TABLE_CELL, color: 'var(--ink)' }}>
<strong>{entry.title}</strong>
{entry.fixed_in ? (
<div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginTop: 2 }}>fixed in v{entry.fixed_in} — kept as history, not hidden</div>
) : null}
{entry.docs ? (
<div style={{ fontSize: '0.85rem', marginTop: 2 }}><a href={entry.docs}>doc →</a></div>
) : null}
</td>
<td style={{ ...TABLE_CELL, color: 'var(--text-muted)' }}>{registry.severities[entry.severity] ? registry.severities[entry.severity].label : entry.severity}</td>
<td style={{ ...TABLE_CELL, color: 'var(--text-muted)' }}>
{entry.meaning}
{entry.note ? (
<div className="contact-note" style={{ margin: '6px 0 0', maxWidth: 'none', fontSize: '0.85rem' }}>{entry.note}</div>
) : null}
</td>
<td style={{ ...TABLE_CELL, color: 'var(--text-muted)' }}>{refsCell(entry.refs)}</td>
</tr>
))}
</tbody>
</table>
</div>
</section>

<section style={{ paddingTop: 34 }}>
<div className="sec-head"><span className="sec-idx">03</span><h2>The honest ceiling</h2></div>
<div className="grid-3">
<div className="card">
<h3>What this is</h3>
<p>A known-issue index for vant CLI output: pattern → meaning → tier → refs. The same matcher the CI gates pin, the page island runs, and the edge door serves.</p>
</div>
<div className="card">
<h3>What this is NOT</h3>
<p>Not a doctor. A clean paste means &ldquo;nothing here is in the index&rdquo;, not &ldquo;your install is healthy&rdquo;. Output still looks wrong? File it with the paste attached.</p>
<a href={ISSUE_URL + 'new'} className="learn-more">New issue →</a>
</div>
<div className="card">
<h3>Extending the registry</h3>
<p>Rows live in <code>src/ailments/ailments.json</code> as pure data. Fix a row&rsquo;s ailment and the row retires to <code>fixed in vX.YZ</code> — visible history beats silent deletion. Rows extend without touching the matcher.</p>
</div>
</div>
</section>
</div>
</section>
)
}
