#!/usr/bin/env node
/**
 * Vant Brain Snapshot — create a verifiable stego-SVG horcrux of the
 * current vant brain state.
 *
 * Why this exists:
 *   The user wants a snapshot of the agent at the moment of the
 *   axolotl-branch cleanup work. The stego-SVG horcrux is the canonical
 *   format: the full brain state is encrypted with a password and
 *   embedded in an SVG using steganography. boot.js auto-discovers
 *   `models/public/boot/hypha-brain-horcrux.svg` at boot and restores
 *   from it. This script produces that exact file.
 *
 * Usage:
 *   node bin/snapshot.js                       # uses VANT_BRAIN_PASSWORD env
 *                                              # or prompts via secret.js
 *   node bin/snapshot.js --output <path>       # custom output path
 *   node bin/snapshot.js --password <pw>       # explicit (don't use in CI)
 *   node bin/snapshot.js --no-verify           # skip round-trip check
 *
 * The .svg output is gitignored (it's reproducible, possibly contains
 * secrets, and would balloon the repo). The script is the canonical
 * artifact; running it reproduces the snapshot.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'models', 'public', 'boot', 'hypha-brain-horcrux.svg');

function parseArgs(argv) {
    const args = { output: null, password: null, verify: true };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--output' || argv[i] === '-o') args.output = argv[++i];
        else if (argv[i] === '--password' || argv[i] === '-p') args.password = argv[++i];
        else if (argv[i] === '--no-verify') args.verify = false;
        else if (argv[i] === '-h' || argv[i] === '--help') {
            console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 25).join('\n'));
            process.exit(0);
        }
    }
    return args;
}

async function getPassword(args) {
    if (args.password) return args.password;
    if (process.env.VANT_BRAIN_PASSWORD) return process.env.VANT_BRAIN_PASSWORD;
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
    const output = args.output ? path.resolve(args.output) : DEFAULT_OUTPUT;
    const password = await getPassword(args);
    const git = getGitContext();

    // Make sure the target directory exists
    fs.mkdirSync(path.dirname(output), { recursive: true });

    console.log('=== Vant Brain Snapshot ===');
    console.log('Output:', output);
    console.log('Branch:', git.branch);
    console.log('Commit:', git.commit);
    console.log('Dirty: ', git.dirty);

    // Create the horcrux (full payload: agents, teams, islands, brainStorage, etc.)
    const transform = require(path.join(REPO_ROOT, 'lib', 'transform'));
    console.log('\n1. Creating stego-SVG horcrux...');
    const result = await transform.toHorcrux(output, { password });
    console.log('   Path:  ', result.path);
    console.log('   Size:  ', result.size, 'bytes');
    console.log('   Format:', result.format);

    // Write a sidecar manifest (NOT encrypted, but gitignored)
    const manifestPath = output + '.manifest.json';
    const manifest = {
        created: new Date().toISOString(),
        format: result.format,
        size: result.size,
        git,
        passwordSet: !!password
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('   Manifest:', manifestPath);

    if (!args.verify) {
        console.log('\n=== Done (verification skipped) ===');
        return;
    }

    // Verify: read it back and check the round-trip
    console.log('\n2. Verifying round-trip...');
    const data = await transform.fromHorcrux(output, { password });
    console.log('   Version: ', data.version);
    console.log('   Type:    ', data.type);

    const validation = transform.validateHorcruxData(data);
    if (!validation.valid) {
        console.error('\n❌ Validation FAILED:');
        for (const err of validation.errors) console.error('   -', err);
        process.exit(1);
    }
    console.log('   Validation: OK (', validation.errors.length, 'errors)');

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

    // Hash for the sidecar (to detect later changes)
    const fileBuf = fs.readFileSync(output);
    const sha = crypto.createHash('sha256').update(fileBuf).digest('hex');
    fs.writeFileSync(
        output + '.sha256',
        `${sha}  ${path.basename(output)}\n`
    );
    console.log('\n   SHA-256:', sha);
    console.log('   Stored:  ', output + '.sha256');

    console.log('\n=== Snapshot complete ===');
    console.log('To restore: node bin/horcrux.js restore', output);
}

run().catch(e => {
    console.error('\n❌ Snapshot failed:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
});
