/**
* functions/api/ailments/check.js (vant-home)
* ===========================================
* The agent door for the /ailments checker (vant#260). GET ?q=<paste>,
* or POST { q } as application/json. Runs the SAME pure matcher module
* the page island runs — one truth, two doors, zero bindings:
*
* - no D1, no secrets, no fetch: this is a CPU-only edge function over a
*   static registry, so there is nothing for a hostile client to hammer
*   beyond the paste-size cap below (STATUS-style throttling is not
*   needed — no database, no network probes);
* - the paste is capped (MAX_PASTE_CHARS, 64k) so a giant body can never
*   burn edge CPU; the cap is private-to-shipped-value safe because the
*   limit is a public constant, not an env var;
* - every answer says which registry version produced it, so an agent
*   pasting the receipt weeks later can re-run against the same index.
*
* The answer is JSON: matched rows (severity-ranked) + same receipt text
* the page's copy button produces, from src/ailments/receipt.js.
* Error contract: 400 with a one-line error + fix field, mirroring the
* honest-error posture of the status doors (no prose soup, no echo of
* internals).
*/
import { checkAilments, maxPasteChars, registrySummary } from '../../src/ailments/matcher.js'
import { renderReceipt } from '../../src/ailments/receipt.js'

function json(status, payload) {
return new Response(JSON.stringify(payload) + '\n', {
status,
headers: {
'content-type': 'application/json; charset=utf-8',
'x-content-type-options': 'nosniff',
'referrer-policy': 'no-referrer',
'cache-control': 'no-store',
},
})
}

const MISSING =
'No paste to check. GET /api/ailments/check?q=<CLI output> or POST { q } with the paste from any vant command.'

function checkPaste(q) {
const summary = registrySummary()
const cap = maxPasteChars()
if (typeof q !== 'string' || q.trim().length === 0) {
return json(400, { ok: false, error: MISSING, fix: 'Set the q query parameter (or POST { q } as JSON) and retry.' })
}
let text = q
let truncated = false
if (text.length > cap) {
text = text.slice(0, cap)
truncated = true
}
const rows = checkAilments(text)
const receipt = renderReceipt(text.length, rows, summary)
return json(200, {
ok: true,
registryVersion: summary.registryVersion,
knownRows: summary.rows,
matched: rows.length,
truncated,
severityOrder: summary.severityOrder,
rows,
receipt,
})
}

export async function onRequestGet(context) {
try {
const url = new URL(context.request.url)
return checkPaste(url.searchParams.get('q') || '')
} catch (e) {
console.log('[ailments/check GET]', e && e.message)
return json(500, { ok: false, error: 'Ailment check unavailable; check the Workers logs.' })
}
}

export async function onRequestPost(context) {
try {
const type = (context.request.headers.get('content-type') || '').toLowerCase()
if (!type.includes('application/json')) {
return json(400, {
ok: false,
error: 'POST body must be JSON: { "q": "<CLI output>" }.',
fix: 'Send application/json with a q string field, or use GET ?q= for small pastes.',
})
}
let body = null
try { body = await context.request.json() } catch (e) { body = null }
const q = body && typeof body.q === 'string' ? body.q : ''
return checkPaste(q)
} catch (e) {
console.log('[ailments/check POST]', e && e.message)
return json(500, { ok: false, error: 'Ailment check unavailable; check the Workers logs.' })
}
}
