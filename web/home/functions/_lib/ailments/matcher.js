/**
* src/ailments/matcher.js (vant-home)
* ===================================
* The pure part of the install-ailment checker (vant#260). No React, no
* react-router, no window/document, no network: the same module is imported
* by the /ailments page (client island), the vitest gates, and the edge
* door (functions/api/ailments/check.js) — one truth, several doors.
*
* HARD LAWS (the two the gates own, stated here so the module explains
* itself):
*
* SELF-MATCH LAW — every entry's own sample strings must match its own
* regex. Editing one without the other fails the gate suite before build,
* so the page can never document a pattern it does not actually match.
*
* HONEST-CEILING LAW — this is a known-issue index, not a doctor: a paste
* with zero rows matched is served the clean-exit plate (nothing known IN
* THIS REGISTRY), never invented further help. Lying cleanly beats
* guessing loudly.
*/
import registryJson from './ailments.json'

const MAX_PASTE_CHARS = 64000

// Lazy cache of compiled RegExp; failure-linting keeps data honest in CI.
let _compiled = null
function compiledRegexes() {
if (_compiled) return _compiled
_compiled = new Map()
for (const entry of registryJson.entries) {
try {
_compiled.set(entry.id, new RegExp(entry.re, entry.flags || ''))
} catch (e) {
// Never throw here: the gates recompile and rethrow with names, so
// the browser (and the edge) degrade to "no rows match" instead of
// crashing on a bad registry row shipped mid-deploy.
_compiled.set(entry.id, null)
}
}
return _compiled
}

export function getRegistry() {
return registryJson
}

export function maxPasteChars() {
return MAX_PASTE_CHARS
}

export const SEVERITY_ORDER = registryJson.severityOrder

/** One pasted CLI-output blob → matched ailment rows, ranked by severity. */
export function checkAilments(text) {
if (typeof text !== 'string' || text.length === 0) return []
const input = text.slice(0, MAX_PASTE_CHARS)
const regs = compiledRegexes()
const rows = []
for (const entry of registryJson.entries) {
const re = regs.get(entry.id)
if (!re) continue
if (!re.test(input)) continue
rows.push({
id: entry.id,
title: entry.title,
severity: entry.severity,
meaning: entry.meaning,
refs: entry.refs || [],
docs: entry.docs || null,
fixedIn: entry.fixed_in || null,
note: entry.note || null,
})
}
rows.sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity))
return rows
}

export function severityMeta(severity) {
const meta = registryJson.severities[severity] || null
return meta ? { label: meta.label, hint: meta.hint } : null
}

export function registrySummary() {
return {
registryVersion: registryJson.registryVersion,
rows: registryJson.entries.length,
severityOrder: SEVERITY_ORDER,
}
}
