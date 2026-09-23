#!/usr/bin/env node
/**
 * Vant Brain Snapshot — create a verifiable stego-SVG horcrux of the
 * current vant brain state.
 *
 * Why this exists:
 *   The user wants a snapshot of the agent at the moment of the
 *   axolotl-branch cleanup work. The stego-SVG horcrux is the canonical
 *   format: the full brain state is encrypted with a password and
 *   embedded in an SVG using steganography.
 *
 * Convention (per models/public/vant/boot/README.md):
 *   Files in models/public/vant/boot/ named `<agent>-p_<password>.svg`
 *   are public brain horcruxes. The `p_` token signals "password-in-name",
 *   and the literal text after `p_` IS the decryption password. So the
 *   filename is self-describing: agent identity + decryption key in one.
 *   Example: nova-p_nova2026.svg is the nova brain encrypted with "nova2026".
 *
 *   The default snapshot path follows this convention. Pass --agent and/or
 *   --password to override.
 *
 * Usage:
 *   node bin/snapshot.js                       # default: axolotl-p_axolotl2026.svg
 *                                              # password from env or secret.js
 *   node bin/snapshot.js --agent nova          # nova-p_<pw>.svg
 *   node bin/snapshot.js --output <path>       # custom output path
 *   node bin/snapshot.js --password <pw>       # explicit (don't echo)
 *   node bin/snapshot.js --no-verify           # skip round-trip check
 *
 * Side-effects (next to the .svg):
 *   - <file>.manifest.json — timestamp, git context, format, size
 *   - <file>.sha256 — integrity hash
 *
 * The .svg is gitignored (the existing nova-p_nova2026.svg is tracked
 * because it's part of the public brain template; new private snapshots
 * of live state should not be tracked because they may contain private
 * brain content).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// (pass 22) Every path this CLI touches resolves from the REPO ROOT, not the
// caller's cwd. The dispatcher intentionally spawns routed commands in the
// CALLER's cwd, so a relative --output (or anything derived from cwd) used to
// land in the wrong tree or trip vaf's path checks — the exact cwd-fragility
// class the fresh-dir routing guard exists for. All relative inputs are now
// normalized against REPO_ROOT before use.
const REPO_ROOT = path.resolve(__dirname, '..');
const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(REPO_ROOT, p));

// (1b) Capability gate — snapshot writes land in models/ + sidecar files
//
// Pass 18 bin sweep fix: this used to hard-refuse whenever canWrite() was
// false, which is every plain `vant snapshot` invocation (default sandbox
// ships canWrite:false). The command was advertised in help + docs but
// literally never worked standalone. Per lib/sandbox.js's own semantics, a
// FRESH default sandbox (not explicitly configured) is allow-with-warning —
// only an explicitly locked-down sandbox enforces denial. So: self-grant
// write on a fresh sandbox (same trust level as `vant org grant`, a direct
// user CLI invocation), and still refuse when a host has deliberately
// locked the sandbox down.
function _checkWrite() {
    try {
        const sandbox = require('../lib/sandbox');
        if (sandbox.canWrite()) return;
        const ds = sandbox.defaultSandbox;
        if (ds && ds._explicitlyConfigured) {
            throw new Error('Write capability required for snapshot output (sandbox explicitly locked down; ask the host to grant canWrite)');
        }
        // Fresh sandbox: self-grant for this user-invoked write, with notice
        ds.setCapabilities({ canRead: true, canWrite: true });
        console.log('[snapshot] granted write capability for this process (fresh sandbox)');
    } catch (e) {
        if (/capability/i.test(e.message)) throw e;
    }
}

const DEFAULT_AGENT = 'axolotl';
const DEFAULT_PASSWORD = 'axolotl2026';

// (pass 22) Shared backup-safety: if the target ALREADY EXISTS (i.e. it is
// some brain's live boot horcrux), write the fresh encode to a sibling tmp
// file, round-trip validate it, and only then rename over the target. This is
// the same contract as `vant horcrux refresh` — a failed or corrupt encode can
// never destroy the only backup. Brand-new targets write directly (nothing to
// protect). Returns { usedTmp, tmpPath } for the summary line.
function safeWritePlan(outputRel) {
    const absTarget = fromRoot(outputRel);
    // absTarget always set — the sha sidecar hashes whatever file is the
    // backup at the end, tmp or direct.
    if (!fs.existsSync(absTarget)) return { usedTmp: false, tmpPath: null, absTarget };
    const relTmp = outputRel.replace(/\.svg$/, '') + '.snapshot-tmp.svg';
    return { usedTmp: true, tmpPath: relTmp, absTmp: fromRoot(relTmp), absTarget };
}

function parseArgs(argv) {
    const args = {
        output: null,
        password: null,
        agent: DEFAULT_AGENT,
        verify: true
    };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--output' || argv[i] === '-o') args.output = argv[++i];
        else if (argv[i] === '--password' || argv[i] === '-p') args.password = argv[++i];
        else if (argv[i] === '--agent' || argv[i] === '-a') args.agent = argv[++i];
        else if (argv[i] === '--no-verify') args.verify = false;
        else if (argv[i] === '--brain') args.brain = argv[++i];
        else if (argv[i] === '-h' || argv[i] === '--help') {
            console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 30).join('\n'));
            process.exit(0);
        }
    }
    return args;
}

function deriveOutput(args) {
    // Keep paths REPO-RELATIVE (O-9 fix): vaf.checkPathTraversal blocks
    // absolute paths under /home/... as sensitive system paths, which made
    // every snapshot output "Path traversal blocked" (see TASKS.md R-5).
    // Validate the RELATIVE path; toHorcrux/atomicWrite resolve from cwd.
    const safeName = (s, label) => {
        const str = String(s || '');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(str)) {
            throw new Error(`${label} contains invalid characters: ${str.slice(0, 40)}`);
        }
        return str;
    };
    if (args.output) {
        const rel = path.relative(REPO_ROOT, path.resolve(args.output));
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new Error('--output must stay inside the repo (got: ' + args.output + ')');
        }
        const vaf = require(path.join(REPO_ROOT, 'lib', 'vaf'));
        const check = vaf.checkPathTraversal(rel);
        if (check.blocked) throw new Error('Output path blocked: ' + check.reason);
        return rel;
    }
    // (pass 22) Convention: <agent>-p_<password>.svg in the CURRENT BRAIN's
    // boot dir (models/public/<brain>/boot/), resolved from state.json via
    // lib/brain — NOT the hardcoded models/public/vant/boot/ the old default
    // used, which only matched the 'vant' brain by coincidence.
    const brain = safeName(args.brain || _currentBrainName(), 'brain name');
    const agent = safeName(args.agent, 'agent name');
    const password = safeName(args.password || DEFAULT_PASSWORD, 'password');
    return path.join('models', 'public', brain, 'boot', `${agent}-p_${password}.svg`);
}

async function getPassword(args) {
    if (args.password) return args.password;
    if (process.env.VANT_BRAIN_PASSWORD) return process.env.VANT_BRAIN_PASSWORD;
    // Default to the convention password for the agent
    if (args.agent === DEFAULT_AGENT) return DEFAULT_PASSWORD;
    try {
        const secret = require(path.join(REPO_ROOT, 'lib', 'secret'));
        return await secret.get('brain');
    } catch (e) {
        throw new Error(
            'Password required. Provide --password, set VANT_BRAIN_PASSWORD, ' +
            'or configure lib/secret.js. Aborting to avoid writing an ' +
            'un-decryptable snapshot.'
        );
    }
}

// (pass 22) Current brain name for the default output path. Mirrors the
// resolution order horcrux.js create uses: brain.getCurrentBrain() first,
// then state.json's stack head, then 'vant'.
function _currentBrainName() {
    try {
        const brainMod = require(path.join(REPO_ROOT, 'lib', 'brain'));
        const name = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : null;
        if (typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return name;
    } catch (e) { /* fall through */ }
    try {
        const state = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'models', 'state.json'), 'utf8'));
        if (typeof state.currentBrain === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(state.currentBrain)) return state.currentBrain;
        if (Array.isArray(state.stack) && state.stack.length > 0) return state.stack[0];
    } catch (e) { /* fall through */ }
    return 'vant';
}

// (pass 22) Overwrite plan for the in-flight snapshot. Module-scope so the
// top-level catch can clean the tmp file up on any failure path.
let plan = { usedTmp: false, tmpPath: null };

function getGitContext() {
    try {
        const { execSync } = require('child_process');
        const commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
        const dirty = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
        return { commit, branch, dirty: dirty.length > 0 };
    } catch (e) {
        return { commit: 'unknown', branch: 'unknown', dirty: false, error: e.message };
    }
}

async function run() {
    const args = parseArgs(process.argv);
    // (1b) capability gate AFTER arg parse so --help/usage stays available
    // and smoke runs see output; refusal still precedes ANY file write.
    _checkWrite();
    const output = deriveOutput(args);
    // (pass 22) Anchor the rest of the run at the repo root. deriveOutput
    // already normalized a user's relative --output against THEIR cwd; from
    // here on, every repo-relative path (encode target, sidecars) must
    // resolve from REPO_ROOT regardless of where the command was invoked —
    // toHorcrux's atomicWriteFile and our writeFileSync calls all use
    // cwd-relative resolution under the hood.
    if (process.cwd() !== REPO_ROOT) process.chdir(REPO_ROOT);
    const password = await getPassword(args);
    const git = getGitContext();
    // (pass 22) Backup-safety plan: overwrite an existing horcrux via the
    // tmp→validate→rename flow; new targets write directly. Assigned to the
    // module-scope `plan` so the top-level catch cleans up on any failure.
    plan = safeWritePlan(output);
    const writeTarget = plan.usedTmp ? plan.tmpPath : output;

    // Make sure the target directory exists (resolved from REPO_ROOT, not cwd)
    fs.mkdirSync(path.dirname(fromRoot(output)), { recursive: true });

    console.log('=== Vant Brain Snapshot ===');
    console.log('Agent:  ', args.agent);
    console.log('Output: ', output);
    if (plan.usedTmp) console.log('Mode:   ', 'existing backup — tmp-write, validate, then replace');
    console.log('Branch: ', git.branch);
    console.log('Commit: ', git.commit);
    console.log('Dirty:  ', git.dirty);

    // Create the horcrux (full payload: agents, teams, islands, brainStorage, etc.)
    const transform = require(path.join(REPO_ROOT, 'lib', 'transform'));
    console.log('\n1. Creating stego-SVG horcrux...');
    const result = await transform.toHorcrux(writeTarget, { password });
    console.log('   Path:  ', result.path);
    console.log('   Size:  ', result.size, 'bytes');
    console.log('   Format:', result.format);

    // Write a sidecar manifest (NOT encrypted, but gitignored). (pass 22)
    // Written AFTER verification so it never describes a backup that failed
    // validation and was discarded; it is written before the replace so a
    // crash between rename and final output still documents what landed.
    const writeManifest = () => {
        // Sidecars resolve from REPO_ROOT — the repo-relative `output` string
        // must never be handed to writeFileSync bare (cwd-relative write, the
        // bug class this pass removes).
        const manifestPath = fromRoot(output + '.manifest.json');
        const manifest = {
            created: new Date().toISOString(),
            format: result.format,
            size: result.size,
            git,
            passwordSet: !!password
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('   Manifest:', manifestPath);
    };

    if (!args.verify) {
        // (pass 22) --no-verify on an EXISTING backup is refused: without the
        // round-trip check we cannot prove the fresh encode decrypts, so
        // overwriting the only backup blind is exactly the destruction mode
        // this pass removes. New targets may skip verification freely.
        if (plan.usedTmp) {
            console.error('\n❌ --no-verify is not allowed when overwriting an existing horcrux');
            console.error('   (a blind replace could destroy the only backup). Run with');
            console.error('   verification, or write to a new path instead.');
            try { fs.rmSync(plan.absTmp, { force: true }); } catch (e) {}
            process.exit(1);
        }
        writeManifest();
        console.log('\n=== Done (verification skipped) ===');
        return;
    }

    // Verify: read it back and check the round-trip — against the file that
    // will become the backup (tmp when replacing, target when new).
    console.log('\n2. Verifying round-trip...');
    const verifyPath = plan.usedTmp ? plan.tmpPath : output;
    const data = await transform.fromHorcrux(verifyPath, { password });
    console.log('   Version: ', data.version);
    console.log('   Type:    ', data.type);

    const validation = transform.validateHorcruxData(data);
    if (!validation.valid) {
        console.error('\n❌ Validation FAILED:');
        for (const err of validation.errors) console.error('   -', err);
        try { fs.rmSync(plan.absTmp, { force: true }); } catch (e) {}
        process.exit(1);
    }
    console.log('   Validation: OK (', validation.errors.length, 'errors)');

    // (pass 22) Only NOW is it safe to replace the old backup: the fresh
    // encode gathered, encoded, round-trip decrypted, and structurally
    // validated. Manifest follows the replace so it always describes what
    // actually landed. Mirrors horcrux refresh's contract exactly.
    if (plan.usedTmp) {
        fs.renameSync(plan.absTmp, plan.absTarget);
        console.log('   Replaced existing backup:', plan.absTarget);
    }
    writeManifest();

    // Smoke-restore into a sandbox path so we don't clobber the live brain.
    // Use lib/transform.restore with merge:true so it doesn't destroy state.
    // We don't actually write anywhere — we just call the function with a
    // dryRun flag if available. Otherwise, do a structural diff.
    const stats = {
        agentCount: data.agents?.agents?.agents?.length || 0,
        brainCount: data.brainStorage?.brains ? Object.keys(data.brainStorage.brains).length : 0,
        fileCount: data.brainStorage?.count || 0,
        corpusLoaded: data.corpus?.loaded,
        teamsOrgs: data.teams?.orgs?.length || 0,
        teamsDepts: data.teams?.depts?.length || 0,
        teamsTeams: data.teams?.teams?.length || 0,
        islands: data.islands?.available?.length || 0
    };
    console.log('\n3. Snapshot contents:');
    for (const [k, v] of Object.entries(stats)) console.log(`   ${k}: ${v}`);

    // Hash for the sidecar (to detect later changes) — hash the file that is
    // now the backup.
    const fileBuf = fs.readFileSync(plan.absTarget);
    const sha = crypto.createHash('sha256').update(fileBuf).digest('hex');
    const shaPath = fromRoot(output + '.sha256');
    fs.writeFileSync(
        shaPath,
        `${sha}  ${path.basename(output)}\n`
    );
    console.log('\n   SHA-256:', sha);
    console.log('   Stored:  ', output + '.sha256');

    console.log('\n=== Snapshot complete ===');
    console.log('To restore: node bin/horcrux.js restore', output);
}

run().catch(e => {
    // Refusal reasons (capability gates) print to stdout so smoke/usage
    // output is visible; unexpected errors keep the ❌ stderr treatment.
    if (/capability/i.test(e.message)) {
        console.log('❌ Snapshot refused:', e.message);
        process.exit(1);
    }
    console.error('\n❌ Snapshot failed:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
    // (pass 22) Never leave the tmp orphan, never touch the original on failure.
    if (plan && plan.absTmp) { try { fs.rmSync(plan.absTmp, { force: true }); } catch (e2) {} }
    process.exit(1);
});
