/**
* src/ailments/receipt.js (vant-home)
* ===================================
* The receipt formatter for the /ailments checker (vant#260): matched rows
* render as plain, copyable text — agent-legible by construction, because
* the receipts culture IS the product. Shared by the page island (copy
* button) and the edge door (the receipt field), so the two doors can
* never drift apart in what they say a row looks like.
*
* Format law: plain lines, one row per line, severity first, every row
* self-contained (title + meaning + refs + fixedIn), so a chunk pasted
* back into chat or into a lesson needs no other context.
*/
import { severityMeta } from './matcher.js'

function refsText(refs) {
if (!refs || refs.length === 0) return ''
return ' [' + refs.map((n) => '#' + n).join(' ') + ']'
}

export function renderReceipt(charsPasted, rows, summary) {
const head = 'Ailment check — ' + String(charsPasted) + ' chars pasted; ' +
rows.length + ' row(s) matched of ' + summary.rows +
' known rows (registry v' + summary.registryVersion + ', vant.creadev.org/ailments)'
const lines = [head]
if (rows.length === 0) {
lines.push('No known rows matched. Two honest readings:')
lines.push('1. nothing here is wrong in this registry\'s index,')
lines.push('2. or the ailment is not written yet — this checker is a known-issue index, NOT a doctor.')
lines.push('If the output still looks wrong, file it with the paste: https://github.com/dhaupin/vant/issues/new')
return lines.join('\n')
}
for (const row of rows) {
const meta = severityMeta(row.severity)
const sev = meta ? meta.label : row.severity
lines.push('- [' + sev + '] ' + row.title + refsText(row.refs))
lines.push('  ' + row.meaning)
if (row.fixedIn) lines.push('  fixed in v' + row.fixedIn + ' — update your clone / reinstall vant.')
if (row.docs) lines.push('  doc: ' + row.docs)
}
return lines.join('\n')
}
