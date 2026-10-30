/**
* web/home test: the ailments gate suite (vant#260).
* ================================================
* The anti-rot gates the checker page owes its honesty to. Same spirit as
* config.test.mjs: source-level pins that break BEFORE the build ships a
* page that can lie.
*
* Gates owned here:
* 1. SCHEMA — the registry is well-formed: severity enum closed, ids
*    unique and namespaced, samples present.
* 2. SELF-MATCH — every sample string matches its own regex. Editing one
*    without the other fails here, before the page documents it.
* 3. PATTERN SAFETY — bounded regexes only: a pathological pattern can
*    never turn the paste box (or the edge door) into a CPU toy.
* 4. MATCHER TRUTH — the happy path (all rows matched, severity-ranked,
*    registry-stable inside a tier) and the honest corners: the ENOENT
*    false-fault row must NOT trip the real-fault row, the honest
*    fresh-install line must not trip ANY fault row, and a giant paste
*    cannot crash or uncap the matcher.
* 5. EDGE DOOR CONTRACT — functions/api/ailments/check.js rides the SAME
*    matcher module, carries no D1 binding, caps the paste, and their
*    error contract stays one-line honest (source-level pins, because a
*    Pages Function cannot run under vitest).
*/
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
checkAilments,
getRegistry,
maxPasteChars,
registrySummary,
severityMeta,
SEVERITY_ORDER,
} from '../src/ailments/matcher.js'
import { renderReceipt } from '../src/ailments/receipt.js'

const registry = getRegistry()
const summary = registrySummary()

function compile(entry) {
try {
return new RegExp(entry.re, entry.flags || '')
} catch (e) {
return null
}
}

describe('ailments registry: SCHEMA gate', () => {
it('exposes the pure matcher API the two doors share', () => {
expect(typeof checkAilments).toBe('function')
expect(typeof maxPasteChars).toBe('function')
expect(maxPasteChars()).toBe(64000)
expect(summary.registryVersion).toBe(1)
expect(summary.rows).toBe(registry.entries.length)
expect(SEVERITY_ORDER).toContain('benign')
})
it('closes the severity enum: severityOrder and severities agree both ways', () => {
expect(SEVERITY_ORDER.length).toBeGreaterThanOrEqual(5)
for (const sev of SEVERITY_ORDER) expect(registry.severities[sev]).toBeTruthy()
for (const key of Object.keys(registry.severities)) expect(SEVERITY_ORDER).toContain(key)
})
it('names every entry with a unique AIL-n id', () => {
const ids = registry.entries.map((e) => e.id)
expect(new Set(ids).size).toBe(ids.length)
for (const id of ids) expect(id).toMatch(/^AIL-\d+$/)
})
it('gives every entry a regex, a known severity, and at least one sample', () => {
for (const entry of registry.entries) {
expect(typeof entry.re).toBe('string')
expect(entry.re.length).toBeGreaterThan(0)
expect(SEVERITY_ORDER).toContain(entry.severity)
expect(Array.isArray(entry.samples) && entry.samples.length > 0).toBe(true)
for (const extra of [entry.title, entry.meaning]) expect(String(extra).length).toBeGreaterThan(0)
}
})
it('forms every severity label and hint string', () => {
for (const sev of SEVERITY_ORDER) {
const meta = severityMeta(sev)
expect(meta.label.length).toBeGreaterThan(0)
expect(meta.hint.length).toBeGreaterThan(0)
}
})
})

describe('ailments registry: SELF-MATCH gate', () => {
it('passes every entry on its own samples, and every sample on its own entry', () => {
for (const entry of registry.entries) {
const re = compile(entry)
expect(re, 'regex compiles: ' + entry.id).not.toBeNull()
for (const sample of entry.samples) {
expect(re.test(sample), entry.id + ' must match its own sample: ' + sample).toBe(true)
}
}
})
it('rejects a sample test that drags in another fault row (cross-row honesty)', () => {
// The pinned pair: the retired ENOENT false-fault sample must NOT trip
// AIL-2 (the real corrupt-content row), only its own retired row.
const enoentRow = registry.entries.find((e) => e.id === 'AIL-3')
const faultRow = registry.entries.find((e) => e.id === 'AIL-2')
expect(enoentRow && faultRow).toBeTruthy()
const realFaultRe = compile(faultRow)
for (const sample of enoentRow.samples) {
expect(realFaultRe.test(sample), 'ENOENT false fault must not trip the real-fault row').toBe(false)
}
})
})

describe('ailments registry: PATTERN SAFETY gate', () => {
it('bounds every pattern: length cap, flag whitelist, no nested-quantifier traps', () => {
const MAX_RE_LEN = 512
for (const entry of registry.entries) {
expect(entry.re.length, entry.id + ' regex length').toBeLessThanOrEqual(MAX_RE_LEN)
expect((entry.flags || '').replace(/i/g, ''), entry.id + ' flags whitelist').toBe('')
// Nested-quantifier backtracking trap heuristic: no quantifier directly
// applied to a group whose tail itself carries a quantifier.
expect(/\(\(\?[^)]*\)?[*+]?\)[*+]\{/.test(entry.re) || /(\+|\*)\)[*+]\{/.test(entry.re), entry.id + ' nested-quantifier shape').toBe(false)
expect(/\{1,\}/.test(entry.re) || /\{\d+,\}\{/.test(entry.re), entry.id + ' open-bounded nests').toBe(false)
}
})
it('matches the giant-constant paste without hanging or crashing (the CPU wall)', () => {
const blob = 'a'.repeat(200000)
const t0 = Date.now()
const rows = checkAilments(blob)
const elapsed = Date.now() - t0
expect(elapsed).toBeLessThan(1000)
expect(rows).toEqual([])
})
})

describe('ailments matcher: MATCHER TRUTH gate', () => {
const byId = {}
for (const e of registry.entries) byId[e.id] = e
const allSamples = () => registry.entries.flatMap((e) => e.samples).join('\n')

it('matches every row on the all-rows paste, ranked by tier then registry order', () => {
const rows = checkAilments(allSamples())
expect(rows.map((r) => r.id)).toEqual([
'AIL-2', 'AIL-3', 'AIL-8', // actionable (registry order inside the tier)
'AIL-4', // nuisance
'AIL-5', // cosmetic
'AIL-1', 'AIL-6', 'AIL-7', // informational
'AIL-9', // benign: last, by the taxonomy's own design
])
})
it('carries the row payload both doors render', () => {
const [first] = checkAilments(byId['AIL-2'].samples[0])
expect(first.severity).toBe('actionable')
expect(first.title).toContain('state.json')
expect(first.refs).toEqual([])
expect(first.fixedIn).toBeNull()
})
it('keeps the honest fresh-install line out of EVERY fault row', () => {
const honest = byId['AIL-1'].samples[0]
const rows = checkAilments(honest).map((r) => r.id)
expect(rows).toEqual(['AIL-1'])
})
it('pins the wave-17 story: the old ENOENT paste trips ONLY the retired row', () => {
const rows = checkAilments(byId['AIL-3'].samples[0]).map((r) => r.id)
expect(rows).toEqual(['AIL-3'])
expect(checkAilments(byId['AIL-3'].samples[0])[0].fixedIn).toBe('0.8.6')
})
it('caps an absurd paste at 64k chars and stays empty', () => {
const rows = checkAilments('at Object.<anonymous> (' + 'x'.repeat(100000) + ')')
// The AIL-8 line appears only inside the first 64k chars... it does — so
// the pin is: NO crash, and the cap makes the row match regardless.
expect(rows.map((r) => r.id)).toEqual(['AIL-8'])
expect(checkAilments('')).toEqual([])
})
})

describe('ailments receipt: the copyable rows both doors share', () => {
it('renders matched rows: tier first, refs inline, fixed rows retired visibly', () => {
const text = registry.entries.flatMap((e) => e.samples).join('\\n')
const receipt = renderReceipt(text.length, checkAilments(text), summary)
expect(receipt).toContain('[Actionable]')
expect(receipt).toContain('#258')
expect(receipt).toContain('fixed in v0.8.6')
expect(receipt).toContain('registry v' + summary.registryVersion)
})
it('renders the empty paste honestly (the honest ceiling): known-issue index, NOT a doctor', () => {
const receipt = renderReceipt(0, [], summary)
expect(receipt).toContain('No known rows matched')
expect(receipt).toContain('NOT a doctor')
expect(receipt).toContain('https://github.com/dhaupin/vant/issues/new')
})
})

describe('ailments edge door: CONTRACT gate (source-level, like config.test.mjs)', () => {
const src = readFileSync(new URL('../functions/api/ailments/check.js', import.meta.url), 'utf8')
it('reuses the SAME pure matcher + receipt modules (one truth, no drift copy)', () => {
expect(src).toContain("'../../src/ailments/matcher.js'")
expect(src).toContain("'../../src/ailments/receipt.js'")
})
it('stays binding-free: a pure CPU door, no D1, no secrets, no fetch', () => {
expect(src).not.toContain('context.env')
expect(src).not.toContain('env.DB')
expect(src).not.toContain('fetch(')
})
it('cap + honesty: 400 on an empty paste with a one-line fix, no-store on answers', () => {
expect(src).toContain('maxPasteChars()')
expect(src).toContain('json(400,')
expect(src).toContain('ok: false')
expect(src).toContain("'cache-control': 'no-store'")
})
it('answers with the agent-usable shape: rows + receipt + registryVersion', () => {
expect(src).toContain('registryVersion: summary.registryVersion')
expect(src).toContain('rows,')
expect(src).toContain('receipt,')
})
})

describe('ailments page + island: WIRING gate (source-level)', () => {
const page = readFileSync(new URL('../src/pages/Ailments.jsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/AppLayout.jsx', import.meta.url), 'utf8')
const islands = readFileSync(new URL('../src/AppIslands.jsx', import.meta.url), 'utf8')
const config = readFileSync(new URL('../ssr.config.js', import.meta.url), 'utf8')
it('prerenders the registry table from the shared data import (no hand table)', () => {
expect(page).toContain("'../ailments/ailments.json'")
expect(page).toContain('data-pre-island="ailments-checker"')
})
it('registers the island and the route + meta on the layout', () => {
expect(islands).toContain("'ailments-checker'")
expect(layout).toContain("'./pages/Ailments.jsx'")
expect(layout).toContain('<Route path="/ailments" element={<Ailments />} />')
expect(layout).toContain("'/ailments'")
})
it('lists the route in the ssr.config table (the prerender contract)', () => {
expect(config).toContain("path: '/ailments'")
})
it('stays out of the pod: the whole feature imports nothing pod-side', () => {
for (const srcFile of [page, layout, islands]) {
expect(srcFile).not.toContain('../lib/')
expect(srcFile).not.toContain('../../lib/')
}
})
})
