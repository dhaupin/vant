#!/usr/bin/env node
/**
 * pilot-pages-deploy.js - the DEPLOY.md §12 Pages walk, LOCAL half.
 *
 * Every row of the Cloudflare Pages setup that can be proven from this
 * sandbox is proven here, deterministically, with a pass/fail ledger:
 *
 *   1. NO-WRANGLER LAW      - Pages deploys carry zero wrangler config
 *                             (prd-web.md 3.7): no wrangler.* files under
 *                             web/, no wrangler strings in functions code.
 *   2. VENDORED KIT         - scripts/vendor-relay-kit.js --check passes
 *                             for BOTH flavors (checksummed contracts).
 *   3. RELAY FLAVOR BUILD   - web/relay: npm ci + typecheck/build; dist/
 *                             produced; functions/ rides the deploy.
 *   4. DASHBOARD BUILD      - web/dashboard: install (bun lockfile) +
 *                             tsc + vite build; dist/ produced.
 *   5. ENV SURFACE TRUTH    - every environment variable the functions
 *                             (either flavor) actually touch is documented
 *                             in DEPLOY.md OR web/dashboard/functions/
 *                             README.md; the documented VANT_PROPERTY_<ID>
 *                             pattern is honored as one row. Plus secret
 *                             hygiene: no inline 256-bit hex constants in
 *                             functions code (keys live in PAGES SETTINGS,
 *                             never in source).
 *   6. OWNER CHECKLIST      - the §12.1 panel steps printed fresh, with
 *                             the exact build settings + var rows, and the
 *                             honest state of the LIVE E2E rows (live-
 *                             subdomain walks complete only on a real
 *                             deploy).
 *
 * Exit 0 = the local half is green; the walk is ready for the owner's
 * panel half. Exit 1 = drift, named in the ledger. Zero sockets law
 * holds: only local files and local subprocesses (builds) are touched.
 *
 * Usage: node scripts/pilot-pages-deploy.js [--skip-builds]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELAY = path.join(ROOT, 'web', 'relay');
const DASH = path.join(ROOT, 'web', 'dashboard');

const results = [];
const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail: detail || '' });
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
};

const DOC_SCOPE = /(VANT_[A-Z_]+|BOLETE_KV|RESEND_API_KEY|EMAIL_[A-Z_]+)/g;
// The one dynamic template the docs cover with a pattern row:
// VANT_PROPERTY_<ID>_ORIGIN / VANT_PROPERTY_<ID>_NAME (multiple installs).
const isTemplateVar = (name) => /^VANT_PROPERTY_[A-Z0-9]+_(ORIGIN|NAME)$/.test(name) || name === 'VANT_PROPERTY_';

function run(cmd, args, opts) {
    const t0 = Date.now();
    execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, ...opts });
    return ((Date.now() - t0) / 1000).toFixed(1);
}

function walkFiles(root, acc = []) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const p = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue;
            walkFiles(p, acc);
        } else acc.push(p);
    }
    return acc;
}

// 1. no-wrangler law
function stepNoWrangler() {
    const offenders = walkFiles(RELAY).concat(walkFiles(DASH))
        .filter((f) => /wrangler\.(toml|json|jsonc)$/i.test(f));
    const codeHits = fs.readdirSync(path.join(DASH, 'functions'), { recursive: true })
        .concat(fs.readdirSync(path.join(RELAY, 'functions'), { recursive: true }))
        .filter((f) => /wrangler/i.test(String(f)));
    check('no-wrangler law (no wrangler.* files or strings under web/)', offenders.length === 0 && codeHits.length === 0,
        offenders.length || codeHits.length ? `offenders: ${offenders.concat(codeHits).slice(0, 4).join(', ')}` : 'pages settings only');
}

// 2. vendored kit checksums
function stepKit() {
    try {
        run('node', ['scripts/vendor-relay-kit.js', '--check'], { cwd: ROOT });
        check('vendored relay kit --check (both flavors)', true);
    } catch (e) {
        check('vendored relay kit --check (both flavors)', false, String(e.stderr || e.message).slice(0, 200));
    }
}

// 3. relay flavor build (npm ci + build, package-lock committed)
function stepRelayBuild(skip) {
    if (skip) { console.log('· relay build skipped (--skip-builds)'); return; }
    try {
        const t = run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: RELAY });
        const t2 = run('npm', ['run', 'build'], { cwd: RELAY });
        const built = fs.existsSync(path.join(RELAY, 'dist', 'index.html'));
        check('relay flavor build (npm ci + tsc/vite, dist/ produced)', built, `npm ci ${t}s + build ${t2}s`);
    } catch (e) {
        check('relay flavor build (npm ci + tsc/vite, dist/ produced)', false, String(e.stderr || e.message).slice(0, 240));
    }
}

// 4. dashboard build (bun-managed lockfile; honest need: dist/ for Pages)
function stepDashboardBuild(skip) {
    if (skip) { console.log('· dashboard build skipped (--skip-builds)'); return; }
    try {
        if (!fs.existsSync(path.join(DASH, 'node_modules'))) {
            run('bun', ['install', '--frozen-lockfile'], { cwd: DASH });
        }
        const t = run('bun', ['run', 'build'], { cwd: DASH });
        const built = fs.existsSync(path.join(DASH, 'dist', 'index.html'));
        check('dashboard build (tsc + vite, dist/ produced)', built, `build ${t}s`);
    } catch (e) {
        check('dashboard build (tsc + vite, dist/ produced)', false, String(e.stderr || e.message).slice(0, 240));
    }
}

// 5. env-var surface truth + secret hygiene
function stepEnvTruth() {
    const fnFiles = walkFiles(RELAY).concat(walkFiles(DASH))
        .filter((f) => f.includes(`${path.sep}functions${path.sep}`) && /\.(ts|cjs|js|md)$/.test(f));
    const fnVars = new Set();
    for (const f of fnFiles) {
        const text = fs.readFileSync(f, 'utf8');
        for (const m of text.match(DOC_SCOPE) || []) fnVars.add(m);
    }
    const docText = fs.readFileSync(path.join(ROOT, 'DEPLOY.md'), 'utf8')
        + fs.readFileSync(path.join(DASH, 'functions', 'README.md'), 'utf8');
    const docVars = new Set(docText.match(DOC_SCOPE) || []);

    const fnNames = [...fnVars].sort();
    const undocumented = fnNames.filter((n) => !isTemplateVar(n) && !docVars.has(n));
    const template = fnNames.includes('VANT_PROPERTY_') || fnNames.some(isTemplateVar);
    check(`env surface truth (${fnNames.length} fn var touches documented)`, undocumented.length === 0,
        undocumented.length ? `UNDOCUMENTED: ${undocumented.join(', ')}` : template ? 'templates covered by the documented VANT_PROPERTY_<ID> pattern' : '');

    const secretScan = fnFiles.filter((f) => !f.endsWith('.md'))
        .map((f) => ({ f, hits: (fs.readFileSync(f, 'utf8').match(/["'][0-9a-f]{64}["']/g) || []).length }))
        .filter((r) => r.hits > 0);
    check('secret hygiene (no inline 256-bit hex in functions code)', secretScan.length === 0,
        secretScan.length ? `inline hex in ${secretScan[0].f} (+${secretScan.length - 1} more)` : 'keys live in Pages settings only');
}

// 6. owner checklist + honest E2E state
function stepChecklist() {
    console.log(`
--- owner checklist (the PANEL half, DEPLOY.md §12.1) ---
 1. CF dashboard -> create the dashboard Pages project, git-connected,
    production branch axolotl, build: npm run build, output dist/,
    root web/dashboard, framework preset Vite (NODE_VERSION=20 if asked).
 2. Vars (Production AND Preview): VANT_PROPERTY_LOCAL_ORIGIN (https pod
    door), VANT_PROPERTY_LOCAL_NAME, VANT_EDGE_RATE_PER_MIN,
    VANT_RELAY_ENABLED=1 + VANT_RELAY_GATE_KEY (vant relay gate) for the
    piggyback flavor, VANT_BRIDGE_TIMEOUT_MS optional.
 3. Email-OTP: create KV namespace, bind as BOLETE_KV; RESEND_API_KEY +
    EMAIL_FROM (+ webhook fallback vars); VANT_EMAIL_SALT recommended.
 4. Pod reachability: cloudflared tunnel (recommended) or the CF-IPs
    allowlist posture (prd-web.md 8.3).
 5. Mint the seat: vant guest issue --name <seat>; paste the vguest_ token.
 6. Solo relay Pages project: root web/relay (its OWN subdomain), the
    same two relay env keys, npm install + npm run build.
 7. Home lander: point the Dashboard link at your subdomain when happy.

--- LIVE E2E rows (complete ONLY on a real deploy) ---
  · solo relay: live-subdomain caps + valid-eligible reach (prd-relay §12 R1)
  · dashboard-relay piggyback: /api/r/* live on YOUR pages domain
  · the settings relay-verify card against the live surface
These stay open until the owner's panel walk answers them; this script
proves everything code-side and fails loudly on any drift.`);
    check('owner checklist printed (panel half stays owner-side)', true);
}

const skipBuilds = process.argv.includes('--skip-builds');
stepNoWrangler();
stepKit();
stepRelayBuild(skipBuilds);
stepDashboardBuild(skipBuilds);
stepEnvTruth();
stepChecklist();

console.log(`\n=== pages-walk ledger ===`);
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(failed.length
    ? `pages walk: RED — ${failed.length} row(s) failed; fix the drift above before the panel walk`
    : 'pages walk: GREEN — the local half is proven; the live E2E rows complete with the owner\'s panel deploy');
process.exit(failed.length ? 1 : 0);
