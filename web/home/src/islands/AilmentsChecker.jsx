/**
* src/islands/AilmentsChecker.jsx (vant-home)
* ===========================================
* Client-only island for /ailments (vant#260). Never prerendered: the page
* ships a JS-required fallback inside the <pre-island> hole, and this
* component replaces it in the browser. No fetch anywhere — the check runs
* against the same static registry the page rendered, so the paste never
* leaves the browser (same posture the /contact composer states).
*/
import React, { useMemo, useState } from 'react'
import { checkAilments, maxPasteChars, registrySummary, severityMeta, SEVERITY_ORDER } from '../ailments/matcher.js'
import { renderReceipt } from '../ailments/receipt.js'

const summary = registrySummary()
const cap = maxPasteChars()

const TIER_COLOR = {
benign: 'var(--ok)',
informational: 'var(--link, var(--accent))',
cosmetic: 'var(--text-muted)',
nuisance: 'var(--signal)',
actionable: 'var(--fail)',
}

export default function AilmentsChecker() {
const [paste, setPaste] = useState('')
const [checked, setChecked] = useState(null)
const [copied, setCopied] = useState(false)
const rows = useMemo(() => (checked ? checkAilments(checked || '') : []), [checked])
const receipt = useMemo(() => renderReceipt(
checked ? checked.length : 0,
rows,
summary
), [checked, rows])

function onRun(e) {
e.preventDefault()
const text = paste.slice(0, cap)
setChecked(text)
setCopied(false)
}

function onClear(e) {
e.preventDefault()
setPaste('')
setChecked(null)
setCopied(false)
}

function onCopy(e) {
e.preventDefault()
const done = () => setCopied(true)
if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(receipt).then(done, done)
return
}
if (typeof document !== 'undefined') {
const ta = document.createElement('textarea')
ta.value = receipt
document.body.appendChild(ta)
ta.select()
try { document.execCommand('copy') } catch (err) { /* best effort */ }
document.body.removeChild(ta)
done()
}
}

const truncated = paste.length > cap

return (
<form className="form-grid" onSubmit={onRun} style={{ marginTop: 12 }} noValidate>
<div>
<label htmlFor="ail-paste">Paste vant CLI output</label>
<textarea
id="ail-paste"
value={paste}
onChange={(e) => { setPaste(e.target.value); setCopied(false) }}
placeholder="e.g. the whole output of a fresh 'vant start', or the lines you were staring at…"
maxLength={cap + 100000}
required
/>
{truncated && (
<p className="status-meta" style={{ color: 'var(--signal)' }}>
The paste is capped at {cap} characters for the check; only the first {cap} will run.
</p>
)}
</div>
<div>
<button className="btn" type="submit">Match against the known rows</button>
{' '}
<button className="btn outline" type="button" onClick={onClear}>Clear</button>
{' '}
<button className="btn outline" type="button" onClick={onCopy} disabled={checked === null}>
{copied ? 'Copied ✓' : 'Copy receipt'}
</button>
</div>
{checked === null ? null : (
<div>
<p className="contact-note" style={{ margin: '10px 0 0', maxWidth: 'none', whiteSpace: 'pre-line' }}>{receipt}</p>
<p className="status-meta">
{rows.length === 0
? 'No known rows matched — the honest ceiling applies: this is a known-issue index, not a doctor.'
: rows.length + ' row(s) matched, ranked by tier: ' + SEVERITY_ORDER.join(' → ') + '.'}
{rows.length > 0 && rows[0] ? (
<>
{' '}Most severe first: <span style={{ color: TIER_COLOR[rows[0].severity] || 'inherit' }}>{(severityMeta(rows[0].severity) || { label: rows[0].severity }).label}</span>.
</>
) : null}
</p>
</div>
)}
</form>
)
}
