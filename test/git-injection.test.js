#!/usr/bin/env node
/**
 * Git CLI Injection Safety Tests
 *
 * Pins the argv-array (no-shell) git execution contract across every place
 * Vant shells out to git from lib/:
 *   - lib/branch.js git() helper
 *   - lib/remote.js GitProvider._gitExec / _gitRef (used by all connectors)
 *   - lib/connectors/{github,gitlab,bitbucket,selfhosted}.js
 *
 * Background: bin/branch-manager.js was fixed (R-6/O-9) for the same class —
 * `execSync(`git commit -m "${message}"`)` let brain-file content execute
 * arbitrary shell commands. The lib/ copies of that pattern were missed and
 * caught in the QC wave sweep. These tests keep it closed.
 *
 * Run: node test/git-injection.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function define(name, fn) {
    try {
        const result = fn();
        const ok = result === true || (result && result.success);
        if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

// Strip comments so documentation examples of the OLD vulnerable pattern
// (backticked templates inside comments) don't trip the static scans.
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

console.log('\n🔒 GIT CLI INJECTION SAFETY TESTS\n');

// ---------- static: no interpolated git command strings in lib ----------

define('static: no shell-interpolated `git ...` execSync templates remain in lib/', () => {
    const offenders = [];
    const scan = (dir) => {
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) { scan(p); continue; }
            if (!f.endsWith('.js')) continue;
            const src = stripComments(fs.readFileSync(p, 'utf8'));
            // execSync(`...${...}`) or exec(`...${...}`) where the template
            // contains 'git ' — the injection primitive.
            const re = /exec(?:Sync)?\(\s*`[^`]*git\s[^`]*\$\{/g;
            while (re.exec(src) !== null) offenders.push(path.relative(ROOT, p));
        }
    };
    scan(path.join(ROOT, 'lib'));
    return { success: offenders.length === 0, error: 'interpolated git exec in: ' + offenders.join(', ') };
});

define('static: lib/branch.js git() uses execFileSync, not execSync', () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib', 'branch.js'), 'utf8'));
    const fnStart = src.indexOf('function git(');
    const fnEnd = src.indexOf('\n}', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    return { success: fn.includes('execFileSync') && !fn.includes('execSync(') && fn.includes("args"),
             error: 'git() helper still builds a shell string' };
});

define('static: GitProvider has _gitExec + _gitRef guards', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'remote.js'), 'utf8');
    return { success: src.includes('_gitExec(') && src.includes('_gitRef(') && src.includes('execFileSync'),
             error: 'base-class guards missing' };
});

// ---------- dynamic: real repo drill through the provider base class ----------

define('dynamic: _gitExec executes argv-array git (real repo), _gitRef blocks hostile refs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-gitinj-'));
    try {
        const { execFileSync } = require('child_process');
        execFileSync('git', ['init', '-q'], { cwd: tmp });
        execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
        execFileSync('git', ['config', 'user.name', 't'], { cwd: tmp });
        fs.writeFileSync(path.join(tmp, 'f.txt'), 'x');
        execFileSync('git', ['add', '-A'], { cwd: tmp });
        execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });

        const remote = require(path.join(ROOT, 'lib', 'remote.js'));
        const provider = new remote.GitProvider({ type: 'test' });

        // _gitExec: real argv-array git op in a real repo
        const out = provider._gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmp });
        if (!/^\S+$/.test(out.trim())) return { success: false, error: 'unexpected output: ' + out.slice(0, 40) };

        // _gitRef: hostile values must be REJECTED, not executed
        const hostile = ['--upload-pack=touch /tmp/pwned', 'a;touch /tmp/pwned', 'a && touch /tmp/pwned',
                         '`touch /tmp/pwned`', '$(touch /tmp/pwned)', 'a..b', '-x'];
        for (const h of hostile) {
            let threw = false;
            try { provider._gitRef(h); } catch (e) { threw = true; }
            if (!threw) return { success: false, error: '_gitRef accepted hostile value: ' + h };
        }

        // Legit refs must PASS the guard (agent-1, feature/x, v1.0.2, origin/main)
        for (const ok of ['agent-1', 'feature/x', 'v1.0.2', 'origin/main']) {
            provider._gitRef(ok);
        }
        return true;
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

define('dynamic: provider commit() lands a hostile message verbatim (no shell execution)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-gitinj2-'));
    try {
        const { execFileSync } = require('child_process');
        execFileSync('git', ['init', '-q'], { cwd: tmp });
        execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
        execFileSync('git', ['config', 'user.name', 't'], { cwd: tmp });
        fs.writeFileSync(path.join(tmp, 'f.txt'), 'x');

        const remote = require(path.join(ROOT, 'lib', 'remote.js'));
        const provider = new remote.GitProvider({ type: 'test' });

        // What a brain-file first line used to be able to do under the old
        // template-string implementation. Under argv-array it is stored as
        // TEXT and never interpreted by a shell.
        const evil = 'x" ; touch pwned-$(whoami) #';
        provider._gitExec(['add', '-A'], { cwd: tmp });
        provider._gitExec(['commit', '-m', evil], { cwd: tmp });

        const log = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: tmp, encoding: 'utf8' });
        const noShellRan = !fs.existsSync(path.join(tmp, 'pwned-' + process.env.USER)) &&
                           !fs.existsSync(path.join(tmp, 'pwned-root'));
        return { success: log.includes(evil) && noShellRan,
                 error: `log=${log.slice(0, 60)} shellRan=${!noShellRan}` };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

define('dynamic: connector checkout/push reject hostile branch names via _gitRef', () => {
    const providers = ['github', 'gitlab', 'bitbucket', 'selfhosted'].map(t => {
        const mod = require(path.join(ROOT, 'lib', 'connectors', t + '.js'));
        return mod;
    });
    let checked = 0;
    for (const mod of providers) {
        // Each module exports its provider class (named export on module or .Provider)
        const Cls = mod.GitHubProvider || mod.GitLabProvider || mod.BitbucketProvider ||
                    mod.SelfHostedProvider || Object.values(mod).find(v => typeof v === 'function' && v.prototype && v.prototype._gitRef);
        if (!Cls || typeof Cls !== 'function') continue;
        const inst = new Cls({ type: 'x' });
        if (typeof inst._gitRef !== 'function') continue;
        let threw = false;
        try { inst._gitRef('--upload-pack=evil'); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'provider accepted hostile branch name' };
        checked++;
    }
    return { success: checked >= 4, error: `only ${checked} providers checked` };
});

define('dynamic: lib/branch.js commit() stores hostile message as text end-to-end', () => {
    // End-to-end through branch.js's public API in a scratch repo. branch.js
    // resolves git against process.cwd(), so run the probe as a child with
    // cwd=scratch (also isolates our repo from `git add -A`).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-gitinj3-'));
    try {
        const { execFileSync } = require('child_process');
        execFileSync('git', ['init', '-q'], { cwd: tmp });
        execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
        execFileSync('git', ['config', 'user.name', 't'], { cwd: tmp });
        fs.writeFileSync(path.join(tmp, 'f.txt'), 'x');
        execFileSync('git', ['add', '-A'], { cwd: tmp });
        execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
        fs.writeFileSync(path.join(tmp, 'g.txt'), 'y');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(tmp)});
            // branch.js checks provider.isConfigured(); no config → CLI path.
            const branch = require(${JSON.stringify(path.join(ROOT, 'lib', 'branch.js'))});
            const r = await branch.commit('tester', 'msg"; touch pwned-marker #');
            console.log('COMMIT-RET:' + (r ? 'ok' : 'null'));
            })().then(() => process.exit(0)).catch(e => { console.error('PROBE-ERR:' + e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });

        const log = execFileSync('git', ['log', '--format=%B', '-n', '5'], { cwd: tmp, encoding: 'utf8' });
        const shellRan = fs.existsSync(path.join(tmp, 'pwned-marker'));
        return { success: probe.status === 0 && log.includes('pwned-marker') && !shellRan,
                 error: `probe=${probe.status} out=${(probe.stdout || '').slice(0, 60)} shellRan=${shellRan} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 200)} log=${log.slice(0, 80)}` };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

// ---------- RUN ----------

console.log(`\n--- RESULTS ---\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
process.exit(results.failed > 0 ? 1 : 0);
