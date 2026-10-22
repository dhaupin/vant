/**
 * scripts/parse-changelog.mjs (vant-home)
 * =======================================
 * THE PARITY MACHINE for the /changelog route. Reads the repo's canonical
 * CHANGELOG.md (single source of truth) and emits src/generated/changelog.json,
 * which src/pages/Changelog.jsx imports and renders. NOTHING on the site page
 * is hand-written: if it is not in CHANGELOG.md, it cannot appear on /changelog.
 *
 * Contract with scripts/check-changelog-parity.js (repo root): the emitted
 * JSON is COMMITTED, and the gate re-parses and byte-compares it — a stale
 * generated file fails the gate. `npm run build:home` regenerates before the
 * prestruct build, so the artifact can never drift from the canon.
 *
 * Heading grammar the parser accepts (the house changelog style):
 *   ## [Unreleased] - pass N (title)          <- stacked unreleased blocks
 *   ## [0.8.6] - 2026-08-29 - Axolotl ..      <- version releases (multiple
 *                                                0.8.6 blocks ship by design)
 * Under each heading, "### Section" names (Added / Changed / Fixed / Removed /
 * Security / ...) collect "- " bullets until the next heading boundary.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(here, '..', '..', '..')
const CHANGELOG = path.join(REPO_ROOT, 'CHANGELOG.md')
const OUT = path.join(here, '..', 'src', 'generated', 'changelog.json')

const raw = fs.readFileSync(CHANGELOG, 'utf8')
const lines = raw.split('\n')

const entries = []
let current = null
let section = null

const ENTRY_RE = /^## \[([^\]]+)\]\s*(.*)$/

function pushCurrent() {
    if (current) entries.push(current)
    current = null
    section = null
}

for (const line of lines) {
    const m = line.match(ENTRY_RE)
    if (m) {
        pushCurrent()
        const isVersion = /^\d/.test(m[1])
        const rest = m[2] || ''
        const dateMatch = rest.match(/-\s*(\d{4}-\d{2}-\d{2})\b/)
        const date = dateMatch ? dateMatch[1] : null
        // title: whatever follows, minus the date chunk
        let title = rest.replace(/-\s*\d{4}-\d{2}-\d{2}\b/, '')
        title = title.replace(/^[\s-]+/, '').replace(/\s+$/, '')
        current = {
            kind: isVersion ? 'release' : 'unreleased',
            version: isVersion ? m[1] : null,
            date,
            title: title || null,
            sections: [],
        }
        continue
    }
    if (!current) continue
    const secMatch = line.match(/^### (.+)$/)
    if (secMatch) {
        section = { name: secMatch[1].replace(/\s+$/, ''), items: [] }
        current.sections.push(section)
        continue
    }
    if (section && /^- /.test(line)) {
        section.items.push(line.slice(2).replace(/\s+$/, ''))
    }
}
pushCurrent()

const data = {
    _source: 'CHANGELOG.md (root) — parsed, never hand-copied; regenerate with npm run build:home',
    _generatedBy: 'web/home/scripts/parse-changelog.mjs',
    _headingCount: entries.length,
    entries,
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n')

console.log('[parse-changelog] entries: ' + entries.length + ' -> ' + path.relative(REPO_ROOT, OUT))
