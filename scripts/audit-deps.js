#!/usr/bin/env node
/**
 * audit-deps.js — depstruct, the dependency ledger census (wave 19.31).
 *
 * Vant basically never adds dependencies. This lane makes that a CHECK
 * instead of a vibe: the ledger below is the only door a dependency can
 * ride through (the audit-locks.js GLOBAL_KINDS pattern applied to
 * package.json). Every declared dep must (1) carry a ledger row naming
 * its lane and an honest note, (2) show real evidence of that lane in
 * the tree, (3) ride the family pin the compliance map records, and
 * (4) resolve in package-lock.json (npm ci reproducibility). The census
 * runs fully offline — no registry, no sockets, files on disk only.
 *
 * THE LEDGER IS THE LAW: a dep absent from it is a typed FAIL ("not in
 * the dependency ledger"); a ledger row for a dropped dep is likewise a
 * FAIL (retire the row in the same change). gistory-sync gets its own
 * guard: it is built in dhaupin/gistory but PRE-NPM (the tag-driven
 * registry ladder, packs/README.md), so a declared 404 would break
 * `npm ci` for every consumer — declaring it here fails typed.
 *
 * Evidence classes the scanner admits (occurrence with its class):
 *   code    — require()/import of the package in lib/, bin/, scripts/, test/
 *   cli     — npx invocation or @pin mention in package.json scripts,
 *             .github/workflows, or spawn argv in scripts/
 *   config  — consumed by root config: .eslintrc.json, poststruct.config.js,
 *             govstruct.config.json
 *   ledger  — recorded in packs/README.md or govstruct/compliance/vant.json
 * A dep needs evidence AUTHORIZED BY ITS LANE (code lanes want code/cli,
 * ci lanes want cli, record lanes want the ledger recording them). Zero
 * evidence of any class is a FAIL: an unwired dependency is a finding,
 * never a silent green.
 *
 * Electronic boundaries honored: the web flavors are self-contained
 * pods (the one-way boundary) — the scanner READS the web flavors'
 * manifests only to register where a family member actually lives
 * (prestruct is web/home's own dep), never as root evidence.
 *
 * The compliance-map cross-check is the govstruct hook (this row's):
 * every lane named in govstruct/compliance/vant.json must resolve —
 * npm run X to a real script, npx <dep> to a declared dependency, and
 * node <path> to a real file — so the evidence map cannot drift from
 * the tree it claims to describe.
 *
 * Shape contract (the stamp's --json consumer, kit's parseDepsFeed):
 *   { schema: 1, source: 'depstruct', version: 'depstruct-census/1',
 *     generatedAt, counts: { fail, warn, info, deps, ledger },
 *     findings: [{ id, page?, level: 'fail'|'warn'|'info', message }] }
 * Exit 1 iff any FAIL finding — exit 1 is a VERDICT (the census judged
 * and found), not a tool fault; anything but schema-1-shaped output on
 * a stamp run is an absence.
 *
 * Usage: node scripts/audit-deps.js [--json] [--probe <name>]
 *   (no flags: the full census; --json: the stamp emit; --probe: the
 *   pickup handler, one dep graded through the same verdict math)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const asJson = process.argv.includes('--json');

// ---- the ledger (the law) ----
// lane: 'code'  — required by pod code at runtime
//       'ci'    — runs/arms a CI or gate lane (workflows, npm scripts, stamps)
//       'config'— consumed by root toolchain config (.eslintrc.json et al)
//       'peer'  — peer support for a consumer above (stated where)
//       'record'- recorded by a ledger surface (packs/README.md), no lane
const LEDGER = {
    'jsqr': {
        lane: 'code',
        note: 'runtime dep: real symbology READ in lib/carriers.js (qr marks from pixels, never trusts a local render)',
    },
    'qrcode-generator': {
        lane: 'code',
        note: 'runtime dep: real symbology RENDER in lib/carriers.js (the pure-JS qr lane: two packages, render + read, nothing else)',
    },
    'yaml': {
        lane: 'code',
        note: 'runtime dep: brain-file YAML format support in lib/format.js + bin/load.js (the .yaml/.yml brain extensions)',
    },
    '@typescript-eslint/eslint-plugin': {
        lane: 'config',
        note: 'the TS-tree lint teeth for web/**/*.{ts,tsx} in the root .eslintrc override (lint:web lane)',
    },
    '@typescript-eslint/parser': {
        lane: 'config',
        note: 'the TS parser for the same override; the web flavors typecheck with their own TS (dashboard 7.0.2), this root pin backs the parser',
    },
    'crashtest': {
        lane: 'ci',
        note: 'the packs floor: contract table + real-harness run root (test.yml crashtest job; test:crashtest; struct-feed rows)',
    },
    'eslint': {
        lane: 'config',
        note: 'the pod linter: lint, lint:fix, lint:web over the root .eslintrc contract',
    },
    'eslint-plugin-react-hooks': {
        lane: 'config',
        note: 'hooks lint teeth in the same TS override (react frontends under web/**)',
    },
    'eyestruct': {
        lane: 'ci',
        note: 'the vision battery: npx eyestruct gate (browserless) in test.yml + test:eyes + struct-feed row',
    },
    'govstruct': {
        lane: 'ci',
        note: 'the governance layer: the offline identity gate (lint && check && surface --verify && doctor) in test.yml + the compliance map this census cross-checks',
    },
    'monoforge': {
        lane: 'record',
        note: 'the factory: pins the fleet DNA (mint-time doctor is a mint-time instrument, wired into NO lane over this living tree — the wave-19.29 decision, packs/README)',
    },
    'packstruct': {
        lane: 'ci',
        note: 'the pack author-time gate: packs:lint (--deep) + packs:audit §7 conformance in test.yml + struct-feed row',
    },
    'poststruct': {
        lane: 'ci',
        note: 'the shipped audit: npx poststruct audit web/home/dist in test.yml + poststruct.config.js + the struct-feed poststruct row',
    },
    'typescript': {
        lane: 'peer',
        note: 'peer support for @typescript-eslint/parser (its peer range wants typescript present); the web flavors carry and run their own TS pictorially pinned in their manifests',
    },
};

// The family pins the compliance map records (major must match the
// resolved/declared line; caret ranges ride the minor).
const FAMILY_PINS = {
    'crashtest': '1.1.0',
    'eyestruct': '1.0.0',
    'packstruct': '1.0.0',
    'poststruct': '0.9.0',
    'govstruct': '0.9.0',
    'monoforge': '0.9.0',
};

// The family-adjacent census (NOT declared deps — appended to the human
// table and guarded where honesty demands a guard).
const ADJACENT = [
    {
        name: 'gistory-sync',
        guard: 'must-stay-declared-absent',
        why: 'pre-npm (the tag-driven registry ladder; built 0.9.0 in dhaupin/gistory): a declared dep here 404s npm ci for every consumer — the same adoption law that ran the S0→S1 library lane',
    },
    {
        name: 'prestruct',
        guard: 'lives-in-web-home',
        why: "the home flavor's own build tool (web/home/package.json) — the one-way boundary keeps it out of the root ledger", 
    },
];

// ---- findings + emit plumbing (poststruct-style verdicts) ----
const findings = [];
function row(id, page, level, message) {
    findings.push({ id, page, level, message });
}
const fail = (id, page, message) => row(id, page, 'fail', message);
const warn = (id, page, message) => row(id, page, 'warn', message);

function esc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Word-boundary law, scoped-name edition: a plain \b never fires before '@'
// (it is a non-word char, so "@typescript-eslint/parser" can never sit at a
// \b boundary). The boundary here is the character CLASS instead: either
// line start or a char that is neither alnum nor the scoped-name '@', and a
// trailing lookahead banning an alnum run-on (npm names carry no digits at
// their tail token seams where evidence matters).
function nameRe(name) {
    return new RegExp('(^|[^A-Za-z0-9@])' + esc(name) + '(?![A-Za-z0-9])');
}

// ---- evidence scanner (files on disk only; no sockets) ----
function read(rel) {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
}

function collectFiles(dir, exts) {
    const out = [];
    if (!fs.existsSync(path.join(ROOT, dir))) return out;
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        const full = path.join(ROOT, rel);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.prestruct' || entry.name.startsWith('.')) continue;
            out.push(...collectFiles(rel, exts));
        } else if (exts.some((e) => entry.name.endsWith(e))) {
            out.push(rel);
        }
    }
    return out;
}

const CODE_FILES = [
    ...collectFiles('lib', ['.js']),
    ...collectFiles('bin', ['.js']),
    ...collectFiles('scripts', ['.js', '.cjs']),
    ...collectFiles('test', ['.js']),
    ...collectFiles('govstruct', ['.json']),
];
const WORKFLOW_FILES = collectFiles(path.join('.github', 'workflows'), ['.yml']);
const README_RELPATH = 'packs/README.md';
const CI_JSON = path.join('.github', 'workflows', 'test.yml');

function evidenceFor(name) {
    const re = nameRe(name);
    const sites = { code: [], cli: [], config: [], ledger: [] };
    for (const rel of CODE_FILES) {
        if (rel === 'govstruct' + path.sep + 'registry.json' || rel === 'govstruct' + path.sep + 'apps.json') continue;
        const src = read(rel);
        if (!src) continue;
        const mod = rel.startsWith('lib') || rel.startsWith('bin') || rel.startsWith('test');
        src.split('\n').forEach((line, i) => {
            if (!re.test(line)) return;
            if (mod && /require\(|import /.test(line)) sites.code.push(`${rel}:${i + 1}`);
            else if (/npx |spawn|npm run/.test(line) || rel.startsWith('scripts')) sites.cli.push(`${rel}:${i + 1}`);
        });
    }
    // package.json scripts — the cli surface (declarations are covered by the
    // ledger-coverage check; the scripts section is where the dep RUNS)
    const pkg = JSON.parse(read('package.json'));
    for (const [key, cmd] of Object.entries(pkg.scripts || {})) {
        if (re.test(String(cmd))) sites.cli.push(`package.json:scripts.${key}`);
    }
    for (const rel of WORKFLOW_FILES) {
        const src = read(rel);
        if (src) src.split('\n').forEach((line, i) => {
            if (re.test(line) && rel === CI_JSON) sites.cli.push(`${rel}:${i + 1}`);
        });
    }
    // root config
    for (const rel of ['.eslintrc.json', 'poststruct.config.js', 'govstruct.config.json']) {
        const src = read(rel);
        if (src && re.test(src)) sites.config.push(rel);
    }
    // ledger surfaces
    for (const rel of [README_RELPATH, 'govstruct/compliance/vant.json']) {
        const src = read(rel);
        if (src && re.test(src)) sites.ledger.push(rel);
    }
    return sites;
}

// ---- pin mathematics (caret care, no semver dep) ----
function caretComponents(range) {
    const m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(String(range).trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function resolvedComponents(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// ---- the census ----
function census() {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const declared = Object.keys(deps);
    const ledgerNames = Object.keys(LEDGER);

    // 1. ledger coverage — both directions, the never-add law.
    for (const name of declared) {
        if (!LEDGER[name]) {
            fail('ledger:coverage', 'package.json',
                `"${name}" is declared but absent from the dependency ledger (scripts/audit-deps.js LEDGER) — the never-add-deps law: a dependency ride requires a conscious row with lane + honest note`);
        }
    }
    for (const name of ledgerNames) {
        if (!(name in deps)) {
            fail('ledger:coverage', 'scripts/audit-deps.js',
                `the ledger carries "${name}" but package.json does not declare it — retire the ledger row in the same change that drops the dep`);
        }
    }

    // 2. pin law — family caret lines ride FAMILY_PINS' majors, and the
    // compliance map's "pin" fields must agree with what is declared.
    const complianceSrc = read('govstruct/compliance/vant.json');
    const compliancePins = {};
    if (complianceSrc) {
        const re = /"pin"\s*:\s*"([a-z0-9-]+)@(\d+)\.(\d+)\.(\d+)"/g;
        let m;
        while ((m = re.exec(complianceSrc)) !== null) {
            compliancePins[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
        }
    }
    for (const [name, pin] of Object.entries(FAMILY_PINS)) {
        const declaredRange = deps[name];
        if (declaredRange == null) continue;
        const got = caretComponents(declaredRange);
        if (!got) {
            warn('pin:caret', 'package.json', `"${name}" rides "${declaredRange}" — the family rides ^major.minor.patch carets (the wave-19.27 pin line)`);
            continue;
        }
        const want = resolvedComponents(pin);
        if (got[0] !== want[0]) {
            fail('pin:family', 'package.json', `"${name}" is pinned ${got[0]}.x (${declaredRange}) but the family pin is ${pin} (govstruct/compliance/vant.json records it) — majors must agree`);
        } else {
            const cGot = compliancePins[name];
            if (cGot && cGot[0] !== got[0]) {
                fail('pin:family', 'govstruct/compliance/vant.json', `the compliance map pins ${name}@${cGot.join('.')} but package.json declares ${declaredRange} — the map and the manifest must say the same pin`);
            }
        }
    }

    // 3. use-check — every dep shows evidence authorized by its lane.
    for (const name of declared) {
        const entry = LEDGER[name];
        if (!entry) continue;
        const sites = evidenceFor(name);
        const total = sites.code.length + sites.cli.length + sites.config.length + sites.ledger.length;
        if (total === 0) {
            fail('use:evidence', 'package.json', `"${name}" claims lane "${entry.lane}" but the census finds zero evidence in lib/ bin/ scripts/ test/ workflows/ config/ ledgers/ — an unwired dependency is a finding`);
            continue;
        }
        const laneWaits = {
            code: ['code', 'cli', 'config'],
            ci: ['cli'],
            config: ['config', 'cli', 'code'],
            peer: ['config', 'cli', 'code', 'ledger'],
            record: ['ledger'],
        };
        const admitted = laneWaits[entry.lane] || [];
        const authorized = admitted.some((k) => sites[k].length > 0);
        if (!authorized) {
            warn('use:lane', 'package.json',
                `"${name}" claims lane "${entry.lane}" whose authorized classes (${admitted.join(', ')}) are empty — its evidence rides ${Object.entries(sites).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.length})`).join(' + ')}`);
        }
    }

    // 4. lockfile parity — every declared dep resolves in package-lock.json.
    const lock = JSON.parse(read('package-lock.json'));
    for (const name of declared) {
        const entry = (lock.packages || {})[`node_modules/${name}`];
        if (!entry || !entry.version) {
            fail('lock:parity', 'package-lock.json', `"${name}" does not resolve in package-lock.json — npm ci reproducibility is broken for this manifest`);
        }
    }
    // family resolved majors ride the recorded pins too ( installed != declared is fine; major drift is not)
    for (const [name, pin] of Object.entries(FAMILY_PINS)) {
        const resolved = ((lock.packages || {})[`node_modules/${name}`] || {}).version;
        const got = resolvedComponents(resolved || '');
        if (got) {
            const want = resolvedComponents(pin);
            if (got[0] !== want[0]) {
                fail('lock:family', 'package-lock.json', `the lock resolves ${name}@${resolved} but the family pin is ${pin} — the installed major drifted from the recorded pin`);
            }
        }
    }

    // 5. adjacent guards — the family's wider truth, guarded honestly.
    if ('gistory-sync' in deps || (pkg.dependencies || {})['gistory-sync']) {
        fail('adjacent:pre-npm', 'package.json', 'gistory-sync is pre-npm (registry-ladder law): declaring it breaks `npm ci` on a 404 — adopt only when its first tag lands (packs/README.md)');
    }
    const homePkg = read(path.join('web', 'home', 'package.json'));
    if (homePkg && !nameRe('prestruct').test(homePkg)) {
        warn('adjacent:web-home', path.join('web', 'home', 'package.json'), 'the home flavor no longer carries its own prestruct row while poststruct audits its dist — an honest drift to glance at');
    }

    // 6. compliance resolves — the govstruct hook: every lane the
    // evidence map names must exist in the tree it describes.
    const scripts = pkg.scripts || {};
    try {
        const compliance = JSON.parse(complianceSrc);
        for (const gate of compliance.gates || []) {
            for (const runCmd of gate.runs || []) {
                const cmd = String(runCmd).trim();
                if (cmd.startsWith('npm run ')) {
                    const sub = cmd.slice('npm run '.length).split(/\s+/)[0];
                    if (!scripts[sub]) {
                        fail('compliance:resolves', 'govstruct/compliance/vant.json', `the compliance map runs "${runCmd}" but "lint:${sub}" is not a script in package.json — the evidence map named a lane that does not exist`);
                    }
                } else if (cmd.startsWith('npx ')) {
                    const dep = cmd.slice('npx '.length).split(/\s+/)[0].split('@')[0].split('/')[0];
                    const scoped = cmd.slice('npx '.length).split(/\s+/)[0];
                    const okScoped = /^\s*@[a-z0-9-]+\/[a-z0-9-]+/.test(scoped);
                    const nameResolved = okScoped ? scoped.split('@')[0] + '/' + scoped.split('/')[1] : null;
                    void nameResolved;
                    if (dep && !(dep in scripts) && !(dep in LEDGER) && !(ADJACENT.some((a) => a.name === dep))) {
                        fail('compliance:resolves', 'govstruct/compliance/vant.json', `the compliance map runs "${runCmd}" but "${dep}" is neither a script, a ledger dep, nor an adjacent record — the map names a tool the tree does not carry`);
                    }
                } else if (cmd.startsWith('node ')) {
                    const file = cmd.slice('node '.length).split(/\s+/)[0];
                    if (!fs.existsSync(path.join(ROOT, file))) {
                        fail('compliance:resolves', 'govstruct/compliance/vant.json', `the compliance map runs "${runCmd}" but ${file} does not exist — the map names a lane the tree does not carry`);
                    }
                }
            }
        }
    } catch (e) {
        fail('compliance:resolves', 'govstruct/compliance/vant.json', `the compliance map is unreadable JSON (${String(e).slice(0, 120)}) — govstruct check should have caught this; the census refuses to grade`);
    }

    return { pkg, deps, declared, ledgerNames };
}

// ---- the probe (the pickup handler: one dep, the same verdict math) ----
// The census grades the whole fleet; the probe grades a single name with
// the per-dep subset of that machinery, so a lane can ask "is crashtest
// still wired?" without sweeping the whole tree. Typed refusals carry the
// load: an unknown name, an unledgered declare, a failed verdict — every
// outcome is a named row, and exit 1 iff the probe graded a FAIL.
function probe(name) {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const adjacent = ADJACENT.find((a) => a.name === name);

    console.log(`\n🔍 DEP PROBE (depstruct): ${name}\n`);
    if (adjacent) {
        // an adjacent name is graded by its guard, not the ledger doors
        const declared = Object.prototype.hasOwnProperty.call(deps, name);
        const wanted = adjacent.guard === 'must-stay-declared-absent';
        const holds = wanted ? !declared : declared;
        console.log(`  [adjacent] ${name}: guard "${adjacent.guard}" ${holds ? 'HOLDS' : 'BROKEN'}`);
        if (wanted && declared) {
            fail('adjacent:pre-npm', 'package.json', `${name} is pre-npm: a declared dep here 404s npm ci for every consumer`
            );
        }
        if (!wanted && !declared) {
            warn('adjacent:web-home', 'web/home/package.json', `${name} no longer rides where its guard places it — an honest drift to glance at`);
        }
        console.log(`  why: ${adjacent.why}`);
        console.log('');
        probeExit();
        return;
    }
    if (!deps[name]) {
        fail('probe:unknown', 'package.json', `"${name}" is neither declared in package.json nor an adjacent record — the crew has no such name to probe (the ledger carries: ${Object.keys(LEDGER).join(', ')})`);
        console.log(`  ✗ ${name} is not a declared dep — typed refusal, nothing graded (ledger names: ${Object.keys(LEDGER).join(', ')})`);
        console.log('');
        probeExit();
        return;
    }
    const row0 = LEDGER[name];
    if (!row0) {
        fail('ledger:coverage', 'package.json', `"${name}" is declared but absent from the dependency ledger — the never-add-deps law`);
        console.log(`  ✗ ${name} is declared but has no ledger row — the never-add law refuses it`);
        console.log('');
        probeExit();
        return;
    }

    // pin law (per-name)
    const pin = FAMILY_PINS[name];
    if (pin) {
        const declaredRange = deps[name];
        const got = caretComponents(declaredRange);
        if (got) {
            const want = resolvedComponents(pin);
            if (got[0] !== want[0]) {
                fail('pin:family', 'package.json', `"${name}" is pinned ${got[0]}.x (${declaredRange}) but the family pin is ${pin} — majors must agree`);
            }
        } else {
            warn('pin:caret', 'package.json', `"${name}" rides "${declaredRange}" — the family rides ^major.minor.patch carets`);
        }
    }

    // use-check (per-name)
    const sites = evidenceFor(name);
    const total = sites.code.length + sites.cli.length + sites.config.length + sites.ledger.length;
    const laneWaits = {
        code: ['code', 'cli', 'config'],
        ci: ['cli'],
        config: ['config', 'cli', 'code'],
        peer: ['config', 'cli', 'code', 'ledger'],
        record: ['ledger'],
    };
    const admitted = laneWaits[row0.lane] || [];
    if (total === 0) {
        fail('use:evidence', 'package.json', `"${name}" claims lane "${row0.lane}" but the census finds zero evidence — an unwired dependency is a finding`);
    } else if (!admitted.some((k) => sites[k].length > 0)) {
        warn('use:lane', 'package.json', `"${name}" claims lane "${row0.lane}" whose authorized classes (${admitted.join(', ')}) are empty — its evidence rides ${Object.entries(sites).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.length})`).join(' + ')}`);
    }

    // lockfile parity (per-name)
    const lock = JSON.parse(read('package-lock.json'));
    const lockEntry = (lock.packages || {})[`node_modules/${name}`];
    if (!lockEntry || !lockEntry.version) {
        fail('lock:parity', 'package-lock.json', `"${name}" does not resolve in package-lock.json — npm ci reproducibility is broken for this manifest`);
    }
    if (pin && lockEntry && lockEntry.version) {
        const got = resolvedComponents(lockEntry.version);
        const want = resolvedComponents(pin);
        if (got && want && got[0] !== want[0]) {
            fail('lock:family', 'package-lock.json', `the lock resolves ${name}@${lockEntry.version} but the family pin is ${pin} — the installed major drifted from the recorded pin`);
        }
    }

    const kinds = Object.entries(sites).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.length})`).join(' + ') || 'NONE';
    console.log(`  [${(pkg.dependencies || {})[name] !== undefined ? 'runtime' : 'dev'}] ${name}: ${kinds}   lane ${row0.lane}`);
    console.log(`  note: ${row0.note}`);
    if (pin) console.log(`  pin: ${pin}${lockEntry ? ` (lock resolves ${lockEntry.version})` : ''}`);
    const fails = findings.filter((f) => f.level === 'fail');
    const warns = findings.filter((f) => f.level === 'warn');
    if (fails.length) {
        console.log('\n✗ PROBE FAILED:');
        for (const f of fails) console.log(`  - ${f.id} [${f.page}] ${f.message}`);
    } else {
        console.log(`✓ PROBE PASS — ${name} holds: ledgered, evidenced (lane ${row0.lane}), pin${pin ? ' honored' : 'less (non-family dep)'}${warns.length ? `, ${warns.length} honest warn${warns.length === 1 ? '' : 's'} ride along` : ''}`);
    }
    console.log('');
    probeExit();
}

function probeExit() {
    const fails = findings.filter((f) => f.level === 'fail');
    process.exitCode = fails.length > 0 ? 1 : 0;
}

function summarize({ pkg, declared, ledgerNames }) {
    // the human census table + verdict
    const counts = {
        fail: findings.filter((f) => f.level === 'fail').length,
        warn: findings.filter((f) => f.level === 'warn').length,
        info: findings.filter((f) => f.level === 'info').length,
        deps: declared.length,
        ledger: ledgerNames.length,
    };

    console.log('\n📦 DEPENDENCY LEDGER (depstruct)\n');
    console.log(`  declared: ${counts.deps}   ledger rows: ${counts.ledger}   fail: ${counts.fail}   warn: ${counts.warn}`);
    for (const name of Object.keys({ ...(pkg.dependencies || {}) })) {
        const sites = evidenceFor(name);
        const kinds = Object.entries(sites).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.length})`).join(' + ') || 'NONE';
        console.log(`  [runtime] ${name}: ${kinds}`);
    }
    for (const name of Object.keys({ ...(pkg.devDependencies || {}) })) {
        const sites = evidenceFor(name);
        const kinds = Object.entries(sites).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.length})`).join(' + ') || 'NONE';
        console.log(`  [dev]     ${name}: ${kinds}   lane ${LEDGER[name] ? LEDGER[name].lane : 'UNLEDGERED'}`);
    }
    for (const a of ADJACENT) console.log(`  [adjacent] ${a.name}: ${a.why}`);
    console.log('');

    if (counts.fail > 0) {
        console.log('✗ DEP LEDGER FAILED:');
        for (const f of findings.filter((x) => x.level === 'fail')) {
            console.log(`  - ${f.id} [${f.page}] ${f.message}`);
        }
        console.log('\n  the never-add law: a dependency ride requires a conscious ledger row, evidence of its lane, and the family pin.');
        process.exitCode = 1;
    } else {
        console.log(`✓ DEP LEDGER PASS — ${counts.deps} declared deps, all ledgered, evidenced, and lockfile-resolved${counts.warn ? ` (${counts.warn} honest warn${counts.warn === 1 ? '' : 's'} ride the census)` : ''}.`);
    }
}

function emit({ declared, ledgerNames }) {
    const counts = {
        fail: findings.filter((f) => f.level === 'fail').length,
        warn: findings.filter((f) => f.level === 'warn').length,
        info: findings.filter((f) => f.level === 'info').length,
        deps: declared.length,
        ledger: ledgerNames.length,
    };
    const emitObj = {
        schema: 1,
        source: 'depstruct',
        version: 'depstruct-census/1',
        generatedAt: new Date().toISOString().slice(0, 10),
        counts,
        findings: findings.map((f) => ({ id: f.id, page: f.page, level: f.level, message: f.message })),
        _census: {
            by: 'scripts/audit-deps.js',
            from: 'package.json + package-lock.json + .eslintrc.json + lib/bin/scripts/test + .github/workflows + packs/README.md + govstruct/compliance/vant.json',
            legend: 'the census runs offline over files on disk; the ledger is the law — a dep rides only through a conscious LEDGER row with lane + honest note',
        },
    };
    process.stdout.write(JSON.stringify(emitObj, null, 2) + '\n');
    process.exitCode = counts.fail > 0 ? 1 : 0;
}

const ctx = census();
const probeIdx = process.argv.indexOf('--probe');
const probeName = probeIdx !== -1 ? (process.argv[probeIdx + 1] || '').trim() : null;

if (probeIdx !== -1 && !probeName) {
    console.error('usage: node scripts/audit-deps.js [--json] [--probe <dep-name>] — --probe needs the name of a declared dep or adjacent record');
    process.exit(2);
}

if (probeName) {
    probe(probeName);
} else if (asJson) emit(ctx);
else summarize(ctx);
