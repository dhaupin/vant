#!/usr/bin/env node
/**
 * web/home stats generator (pass 350, the #2 truth fix).
 *
 * WHY: the home stats strip claims "3 memory systems / N CLI commands /
 * N MCP commands / N lib modules / N doc pages / N test suites / vX.Y.Z".
 * Every was hand-pinned, so every gradually rotted as pod passes added
 * bins, tools, modules, docs, and suites. Now the strip is GENERATED at
 * build time from the same truths the repo's own gates use:
 *
 *   memorySystems  -> fixed 3 (brain, memory store, brain search)
 *   cli            -> scripts/check-cli-coverage.js output ("N documented")
 *   mcp            -> scripts/check-mcp-coverage.js output ("N documented")
 *   libModules     -> every .js file under lib/ in the repo checkout
 *   docPages       -> every .md file under docs/ (the census check-home reports)
 *   testSuites     -> every .test.js under test/ (the test/tmp QC copies excluded)
 *   version        -> package.json version (never a hardcoded copy)
 *
 * If a coverage gate refuses to run or its number cannot be parsed, the
 * build FAILS loudly (an honest page needs honest numbers). The emitted
 * JSON is committed (same posture as src/generated/changelog.json) and
 * Home.jsx reads it, so the page cannot claim a number the repo does not
 * have. npm run build:home runs this BEFORE the changelog parse.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const HOME = path.resolve(__dirname, '..')
const ROOT = path.resolve(HOME, '..', '..')          // the repo root
const OUT = path.join(HOME, 'src', 'generated', 'stats.json')
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

function walk(dir, banned, out = []) {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        const s = statSync(p)
        if (s.isDirectory()) {
            if (!banned.some((d) => p.includes('/' + d + '/'))) walk(p, banned, out)
        } else {
            out.push(p)
        }
    }
    return out
}

// The two gate-backed numbers: run the checkers, parse "N documented".
// A no-PASS output or an unparseable count aborts the build (exit 1).
function coverageCount(script) {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', script)], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (!out.includes('PASS')) {
        console.error(`gen-stats: ${script} did not PASS; refusing to bake a number it did not verify.`)
        process.exit(1)
    }
    const m = out.match(/(\d+) documented/)
    if (!m) {
        console.error(`gen-stats: no "N documented" found in ${script} output.`)
        process.exit(1)
    }
    return parseInt(m[1], 10)
}

let cli, mcp
try {
    cli = coverageCount('check-cli-coverage.js')
    mcp = coverageCount('check-mcp-coverage.js')
} catch (e) {
    console.error('gen-stats: the coverage gates could not run (' + e.message + ').')
    process.exit(1)
}

const libModules = walk(path.join(ROOT, 'lib'), ['node_modules']).filter((f) => f.endsWith('.js')).length
const docPages = walk(path.join(ROOT, 'docs'), ['node_modules']).filter((f) => f.endsWith('.md')).length
const testSuites = walk(path.join(ROOT, 'test'), ['tmp']).filter((f) => f.endsWith('.test.js')).length

const stats = {
    _generatedBy: 'web/home/scripts/gen-stats.mjs',
    _source: 'the repo at build time: coverage gates for cli/mcp, file census for lib/docs/tests, package.json for version',
    memorySystems: 3,
    cli,
    mcp,
    libModules,
    docPages,
    testSuites,
    version: pkg.version,
}

writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n')
console.log(`STATS: generated (cli ${cli}, mcp ${mcp}, lib ${libModules}, docs ${docPages}, tests ${testSuites}, v${stats.version})`)
