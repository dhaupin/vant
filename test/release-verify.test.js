#!/usr/bin/env node
/**
 * Release verify ladder battery (vant#275, wave 17 continuation)
 *
 * The trust ladder (scripts/verify-release.cjs) used to run only in the
 * publish lane — a leg that refuses on the day it matters had no
 * every-push regression net. This suite runs the ladder's honest
 * failure states EVERY PUSH, offline-first:
 *
 *   1. Capability states (exit 2, named): missing mode flags, --gh
 *      without --tag, --gh without GITHUB_REPOSITORY, --pack without
 *      a tarball path.
 *   2. The pack ladder on the TREE'S OWN npm pack output (exit 0,
 *      VERIFIED) — the contents leg, no registry needed.
 *   3. The pack ladder's named refusals: a doctored tarball carrying a
 *      forbidden path (models/) and a version-lying tarball.
 *   4. The registry ladder's honest failures, each patched ladder child
 *      carrying its OWN in-process fixture registry (a spawned child's
 *      loopback fetches against another process's listener are dropped in
 *      this sandbox; in-process ones are not): packument without provenance
 *      attestations (exit 1, named), honest packument + honest served
 *      bytes (VERIFIED, exit 0), tampered served tarball vs mint-truth
 *      metadata (exit 1, integrity named).
 *
 * The registry ladder in the TREE copy hardcodes the npmjs URL, so case
 * 4 runs a byte-patched copy built IN THIS SUITE by the asserted
 * patch contract (four ops): the registry URL -> an in-child loopback URL
 * reading BATTERY_PORT inside the tree's own template literal, the two
 * require('https') -> require('http'), the distinguishing bootstrap block
 * prepended, and the tree's trailing bare main() -> a bind-gated start.
 * If the tree file drifts from that contract, the suite refuses with a
 * NAMED error instead of testing a half-patched script - the method the
 * gantry walk proved (tmp/scratch/verify-release.scratch.cjs); the tree
 * file stays pristine.
 *
 * The fixture registry answers GETs only; every other verb is a hard 405,
 * so the battery lane cannot mint anything.
 *
 * Exit contract mirrors the repo suites: 0 = every named state held,
 * 1 = at least one lied.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LADDER = path.join(ROOT, 'scripts', 'verify-release.cjs');
const checkout = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = checkout.name;
const VERSION = checkout.version;

const results = { passed: 0, failed: 0 };
function pass(name) {
    results.passed++;
    console.log(`  ✓ ${name}`);
}
function flunk(name, msg) {
    results.failed++;
    console.log(`  ✗ ${name}: ${msg}`);
}

// --- shared seeds --------------------------------------------------------

const seeds = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-seeds-'));

function packTree() {
    const r = spawnSync('npm', ['pack', '--json', '--pack-destination', seeds], {
        cwd: ROOT, encoding: 'utf8', timeout: 120000
    });
    const out = JSON.parse(r.stdout);
    const row = Array.isArray(out) ? out[0] : out;
    const tgz = path.join(seeds, row.filename);
    if (!fs.existsSync(tgz)) throw new Error(`npm pack produced no tarball: ${r.stderr.trim().slice(-200)}`);
    return tgz;
}

// The battery's ladder invocation args - vant ships web/ (owner decision,
// vant#275) and keeps its dev rigs (models/, tmp/, labs/, test/, packs/)
// off the runtime tar.
const LADDER_ARGS = ['--allowed', 'web/', '--forbidden', 'models/,tmp/,labs/,test/,packs/'];

function run(copyPath, args, env) {
    return spawnSync(process.execPath, [copyPath, ...args], {
        cwd: ROOT, encoding: 'utf8', timeout: 120000,
        env: env ? { ...process.env, ...env } : process.env
    });
}

// A files-only tar (npm-pack shape): retraring an extracted tree drags in
// DIRECTORY entries the original never carried, and the ladder's
// expected-set check - correctly - refuses extras before identity runs.
function filesOnlyTar(dir, out) {
    const list = path.join(dir, 'files.txt');
    fs.writeFileSync(list, '');
    const build = spawnSync('bash', ['-c', `find package -type f -print0 | sort -z | tr '\\0' '\\n' > files.txt && tar -czf '${out}' -T files.txt`], { cwd: dir, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`files-only tar failed: ${build.stderr.trim().slice(-200)}`);
    return out;
}

// --- the registry patch (the walk's method, asserted) --------------------

// The tree ladder's registry pull: fetches https://registry.npmjs.org from
// a spawned child. Spawned children in this host sandbox can reach the
// outside world but a loopback listener held by another process drops
// their SYNs (the bench: a bare http.get child timed out against a
// listening sibling; in-process loopback answers 200). So the registry
// cases give each patched ladder child its OWN in-process fixture
// registry, via a prepended bootstrap - the fetch then never crosses a
// process boundary.
//
// The patch contract, asserted against the tree file before building (if
// the counts drift, the suite refuses by name instead of testing a
// half-patched script):
//   1. one registry URL prefix -> an in-child loopback URL that reads its
//      port from BATTERY_PORT (the placeholder interpolates inside the
//      tree's own template literal),
//   2. two require('https').get -> require('http').get,
//   3. the chain tail .catch(...) -> + .then(batteryMidnight): the tree
//      main() returns SYNCHRONOUSLY (its async chain is detached), so a
//      process.exit after the call would cut the chain before the first
//      fetch resolves; the hook instead exits when the chain actually
//      completes, dropping the fixture server. Without a seed,
//      batteryMidnight is undefined and .then(undefined) is a plain no-op
//      (natural drain preserved),
//   4. the trailing bare main() -> a bind-gated start (the bootstrap
//      publishes its chosen port only inside the listen callback, so the
//      tree main() must wait for it; without a seed it starts as usual).

const BOOTSTRAP = [
  ";(function batteryRegistryFixture() {",
  "  const seedPath = process.env.BATTERY_SEED",
  "  if (!seedPath) return // plain copy: no bootstrap at all",
  "  const http = require('http')",
  "  const fs = require('fs')",
  "  const crypto = require('crypto')",
  "  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))",
  "  const NAME = pkg.name, VERSION = pkg.version",
  "  const mode = process.env.BATTERY_MODE || 'honest'",
  "  if (!['honest', 'noattest', 'tampered'].includes(mode)) {",
  "    process.stderr.write('[battery-boot] FAIL: unknown fixture mode ' + mode + '\\n'); process.exit(2)",
  "  }",
  "  const honest = fs.readFileSync(seedPath)",
  "  const integrity = 'sha512-' + crypto.createHash('sha512').update(honest).digest('base64')",
  "  let served = honest",
  "  if (mode === 'tampered') { served = Buffer.from(honest); served[Math.floor(served.length * 0.4)] ^= 0xff }",
  "  const attest = mode !== 'noattest'",
  "  const srv = http.createServer((req, res) => {",
  "    if (req.url === '/' + NAME) {",
  "      const packument = {",
  "        name: NAME, 'dist-tags': { latest: VERSION },",
  "        versions: { [VERSION]: { name: NAME, version: VERSION, dist: {",
  "          tarball: 'http://127.0.0.1:' + process.env.BATTERY_PORT + '/' + NAME + '/-/' + NAME + '-' + VERSION + '.tgz',",
  "          integrity: integrity,",
  "          ...(attest ? { attestations: { provider: 'npm', statement: { type: 'https://slsa.dev/provenance/v1' } } } : {})",
  "        } } }",
  "      }",
  "      res.writeHead(200, { 'content-type': 'application/json' })",
  "      return res.end(JSON.stringify(packument))",
  "    }",
  "    if (req.url === '/' + NAME + '/-/' + NAME + '-' + VERSION + '.tgz') {",
  "      res.writeHead(200, { 'content-type': 'application/octet-stream' })",
  "      return res.end(served)",
  "    }",
  "    res.writeHead(405, { 'content-type': 'text/plain' })",
  "    res.end('read-only')",
  "  })",
  "  srv.listen(0, '127.0.0.1', () => { process.env.BATTERY_PORT = String(srv.address().port) })",
  "  // Exits the battery child when main()'s chain COMPLETES - the sync-ish main()",
  "  // call would otherwise keep the fixture server's loop alive forever.",
  "  globalThis.batteryMidnight = () => process.exit(0)",
  "})()",
].join('\n');

// --- the battery ---------------------------------------------------------

(async () => {
    console.log(`\n🧪 release-verify battery — ${NAME}@${VERSION}\n`);

    let honestTgz = null;
    try {
        honestTgz = packTree();
    } catch (e) {
        console.log(`  ✗ seed: npm pack of the tree failed: ${e.message}`);
        console.log(`\nPassed: 0\nFailed: 1`);
        process.exit(1);
    }

    // 1. capability states: named exit-2 refusals, no network, no fixtures.
    const caps = [
        { name: 'capability: no mode flags -> usage, exit 2', args: [], check: (r) => r.status === 2 && /usage: verify-release/.test(r.stdout), hint: 'usage text' },
        { name: 'capability: --gh without --tag -> exit 2, named', args: ['--gh'], env: { GH_TOKEN: '', GITHUB_REPOSITORY: '' }, check: (r) => r.status === 2 && /needs --tag vX\.Y\.Z/.test(r.stderr), hint: 'tag refusal' },
        { name: 'capability: --gh without GITHUB_REPOSITORY -> exit 2, named', args: ['--gh', '--tag', `v${VERSION}`], env: { GH_TOKEN: '', GITHUB_REPOSITORY: '' }, check: (r) => r.status === 2 && /--gh needs GITHUB_REPOSITORY/.test(r.stderr), hint: 'repo refusal' },
        { name: 'capability: --pack without a tarball path -> exit 2, named', args: ['--pack'], check: (r) => r.status === 2 && /--pack needs a tarball path/.test(r.stderr), hint: 'tarball refusal' },
    ];
    for (const c of caps) {
        const r = run(LADDER, c.args, c.env);
        if (c.check(r)) pass(c.name);
        else flunk(c.name, `exit ${r.status}, wrong refusal surface`);
    }

    // 2. the honest pack ladder on the tree's own tar, tree copy, no patch.
    {
        const name = `pack ladder: VERIFIED on the tree's honest tar (exit 0)`;
        const r = run(LADDER, ['--pack', honestTgz, ...LADDER_ARGS]);
        if (r.status === 0
            && /VERIFIED: everything it checked is checked\./.test(r.stdout)
            && /PASS forbidden scan \(\d+ entries, 0 forbidden\)/.test(r.stdout)
            && /PASS served set == npm pack of this tree \(\d+ files\)/.test(r.stdout)
            && /PASS identity: /.test(r.stdout)) pass(name);
        else flunk(name, `exit ${r.status}: ${(r.stderr || r.stdout).trim().slice(-300)}`);
    }

    // 3. the pack ladder's named refusals - the doctor and the liar.
    {
        const name = 'pack ladder: doctored tar carrying models/ -> exit 1, file named';
        try {
            const d = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-doctor-'));
            if (spawnSync('tar', ['-xzf', honestTgz, '-C', d]).status !== 0) throw new Error('seed extraction failed');
            fs.mkdirSync(path.join(d, 'package', 'models'), { recursive: true });
            fs.writeFileSync(path.join(d, 'package', 'models', 'secret.md'), 'must never ship');
            const bad = path.join(d, 'doctored.tgz');
            if (spawnSync('tar', ['-czf', bad, 'package'], { cwd: d }).status !== 0) throw new Error('doctored tar build failed');
            const r = run(LADDER, ['--pack', bad, ...LADDER_ARGS]);
            if (r.status !== 1) throw new Error(`exit ${r.status}, wanted 1 (the doctor must be refused)`);
            if (!/FORBIDDEN contents in the tarball/.test(r.stderr)) throw new Error(`wrong refusal: ${r.stderr.trim()}`);
            if (!/models\/secret\.md/.test(r.stderr)) throw new Error('the forbidden file was not NAMED');
            fs.rmSync(d, { recursive: true, force: true });
            pass(name);
        } catch (e) { flunk(name, e.message); }
    }
    {
        const name = 'pack ladder: version-lying tar -> exit 1, named';
        try {
            const d = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-liar-'));
            if (spawnSync('tar', ['-xzf', honestTgz, '-C', d]).status !== 0) throw new Error('seed extraction failed');
            const pj = path.join(d, 'package', 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
            pkg.version = '9.9.9';
            fs.writeFileSync(pj, JSON.stringify(pkg, null, 2));
            const bad = path.join(d, 'liar.tgz');
            filesOnlyTar(d, bad);
            const r = run(LADDER, ['--pack', bad, ...LADDER_ARGS]);
            if (r.status !== 1) throw new Error(`exit ${r.status}, wanted 1 (the liar must be refused)`);
            if (!/tarball version 9\.9\.9 != expected/.test(r.stderr)) throw new Error(`wrong refusal: ${r.stderr.trim()}`);
            fs.rmSync(d, { recursive: true, force: true });
            pass(name);
        } catch (e) { flunk(name, e.message); }
    }

    // 4. registry-ladder honest failures, each ladder child carrying its
    //    OWN fixture registry over in-child loopback (bootstrap prepended;
    //    tree file never changes; installs forced offline so the suite is
    //    deterministic - a cold cache yields the ladder's named SKIP, not
    //    a hang).
    const registryCases = [
        { mode: 'noattest', want: 1, re: /carries no provenance attestations - the OIDC trust chain did not stamp this cut/, name: 'registry: unattested cut -> exit 1, named' },
        { mode: 'honest', want: 0, re: /VERIFIED: everything it checked is checked\./, name: 'registry: honest packument + honest bytes -> VERIFIED (exit 0)' },
        { mode: 'tampered', want: 1, re: /served tarball integrity .+ != registry metadata/, name: 'registry: tampered served tar -> exit 1, integrity named' },
    ];
    let patch = null;
    try {
        const src = fs.readFileSync(LADDER, 'utf8');
        const REG = 'https://registry.npmjs.org/';
        const HTTPS = "require('https').get";
        const regHits = src.split(REG).length - 1;
        const httpsHits = src.split(HTTPS).length - 1;
        const CHAIN_TAIL = '  })().catch((e) => cap(e.message))';
        const chainHits = src.split(CHAIN_TAIL).length - 1;
        if (regHits !== 1 || httpsHits !== 2 || chainHits !== 1 || !/\nmain\(\)\n?$/.test(src)) {
            throw new Error(`the tree ladder drifted from the patch contract (registry URL hits: ${regHits}, want 1; require('https').get hits: ${httpsHits}, want 2; chain-tail hits: ${chainHits}, want 1; trailing main() call: ${/\nmain\(\)\n?$/.test(src)}) - refusing to test a half-patched copy`);
        }
        // Pure interpolation: the tree's regUrl is a template literal, so
        // the patch must slot a ${...} placeholder inside it - not a concatenation
        // expression, which would print literally and yield an Invalid URL.
        const LOOPBACK_URL = 'http://127.0.0.1:' + '$' + '{process.env.BATTERY_PORT || 4873}/';
        // The hook string: typeof, not a bare identifier reference - in a
        // plain (no-seed) copy batteryMidnight is undeclared, and a bare
        // identifier would throw ReferenceError at work time; typeof never does.
        const MIDNIGHT_HOOK = ".then(typeof batteryMidnight === 'function' ? batteryMidnight : undefined)";
        const gatedMain = [
            '',
            ';(function batteryStartWhenBound() {',
            '  if (process.env.BATTERY_PORT || !process.env.BATTERY_SEED) { main() }',
            '  else { setTimeout(batteryStartWhenBound, 25) }',
            '})()',
            '',
        ].join('\n');
        patch = BOOTSTRAP + '\n' + src
            .replace(REG, LOOPBACK_URL)
            .split(HTTPS).join("require('http').get")
            .replace(CHAIN_TAIL, CHAIN_TAIL + MIDNIGHT_HOOK)
            .replace(/\nmain\(\)\n?$/g, '\n' + gatedMain) + '\n';
    } catch (e) {
        for (const c of registryCases) flunk(c.name, `patch contract unavailable: ${e.message}`);
    }
    if (patch) {
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-reg-'));
        const patched = path.join(work, 'verify-release.registry-battery.cjs');
        fs.writeFileSync(patched, patch);
        for (const c of registryCases) {
            try {
                const r = run(patched, ['--npm', ...LADDER_ARGS], {
                    BATTERY_SEED: honestTgz,
                    BATTERY_MODE: c.mode,
                    npm_config_offline: 'true',
                    GH_TOKEN: '', GITHUB_REPOSITORY: '',
                });
                // FAIL lines die() to stderr, VERIFIED says() to stdout: the
                // named-surface check reads BOTH, the exit contract stays exact.
                const told = `${r.stdout}\n${r.stderr}`;
                if (r.status !== c.want) throw new Error(`exit ${r.status}, wanted ${c.want}: ${told.trim().slice(-300)}`);
                if (!c.re.test(told)) throw new Error(`named line missing: ${told.trim().slice(-400)}`);
                pass(c.name);
            } catch (e) {
                flunk(c.name, e.message);
            }
        }
        fs.rmSync(work, { recursive: true, force: true });
    }

    // --- summary -----------------------------------------------------------

    fs.rmSync(seeds, { recursive: true, force: true });
    console.log(`\nPassed: ${results.passed}\nFailed: ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
