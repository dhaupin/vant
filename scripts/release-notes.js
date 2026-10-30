'use strict'
// release-notes.js - the vant variant of the family's release-notes.cjs
// (eyestruct scripts/release-notes.cjs, dhaupin/eyestruct). Same job, same
// refusal law: the GH release body must come from the changelog itself, an
// empty extraction refuses the release, and the heading line's own date
// never rides into the body.
//
// The vant delta is the changelog shape, not the law: eyestruct stamps one
// "## [version] - date" section per release; vant's CHANGELOG.md accumulates
// per-pass sections - "## [Unreleased] - pass NNN (title)" - above the last
// version-stamped heading, because the npm version holds at 0.8.6 while the
// passes land (the 0.8.6 decision, vant#275). The notes for a tag therefore
// are every current [Unreleased] pass section from the top of the file down
// to the first heading that is NOT "## [Unreleased]".
//
// Usage: node scripts/release-notes.js [ignored]
// Prints the extracted notes; exit 1 + a named refusal when there is
// nothing to extract (a release object with an empty body is drift, not
// content).

'use strict'
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8')

const sections = []
const lines = changelog.split('\n')
let i = 0
while (i < lines.length && !/^#{1,2} /.test(lines[i])) i++ // skip the masthead
for (; i < lines.length; i++) {
  const line = lines[i]
  if (!/^## /.test(line)) continue
  if (!/^## \[Unreleased\]/.test(line)) break // first non-Unreleased heading ends the current cut's notes
  const headingLineEnd = line.length
  let end = lines.length
  for (let j = i + 1; j < lines.length; j++) {
    if (/^## /.test(lines[j]) && !/^## ###/.test(lines[j]) && /^#{2} /.test(lines[j])) { end = j; break }
  }
  const section = lines.slice(i, end).join('\n').trim()
  if (section.length > '## [Unreleased] - pass. '.length) sections.push(section)
  i = end - 1
}

if (!sections.length) {
  process.stderr.write('release-notes: no "## [Unreleased] - pass NNN" section sits above the current version heading - nothing to extract, refusing\n')
  process.exit(1)
}
process.stdout.write(sections.join('\n\n') + '\n')
