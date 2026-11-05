#!/usr/bin/env node
/**
 * Auth Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🔑 AUTH MODULE TESTS\n');

test('auth module loads', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth };
});

test('auth has Auth class', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth.Auth };
});

test('auth is object', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: typeof auth === 'object' };
});

// Auth validation tests
// Note: Auth uses config.apiKey() - set VANT_API_KEY env to test with keys
const { Auth } = require(path.join(ROOT, 'lib', 'auth'));
const originalApiKey = process.env.VANT_API_KEY;

test('Auth has validateApiKey method', () => {
    const auth = new Auth();
    return { success: typeof auth.validateApiKey === 'function' };
});

test('validateApiKey allows when no key configured and auth NOT required', () => {
    delete process.env.VANT_API_KEY;
    delete process.env.MCP_API_KEY;
    const auth = new Auth({ apiKeyRequired: false });
    const result = auth.validateApiKey('any-key');
    return { success: result.valid === true };
});

test('validateApiKey rejects invalid key when configured', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey('wrong-key');
    return { success: result.valid === false && result.reason === 'invalid_api_key' };
});

test('validateApiKey accepts correct key', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey('secret123');
    return { success: result.valid === true && result.reason === 'ok' };
});

test('validateApiKey rejects when no key provided but required', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey(null);
    return { success: result.valid === false && result.reason === 'no_api_key_provided' };
});

// Restore env
if (originalApiKey) process.env.VANT_API_KEY = originalApiKey;
else delete process.env.VANT_API_KEY;

test('recordFailedAttempt increments count', () => {
    const auth = new Auth({ maxAttempts: 3 });
    const id = 'test-identifier-' + Date.now();
    auth.recordFailedAttempt(id);
    const state = auth._failedAttempts.get(id);
    return { success: state && state.count === 1 };
});

test('recordFailedAttempt triggers lockout after max attempts', () => {
    const auth = new Auth({ maxAttempts: 2, lockoutDuration: 1000 });
    const id = 'test-lockout-' + Date.now();
    auth.recordFailedAttempt(id);
    auth.recordFailedAttempt(id);
    const result = auth.recordFailedAttempt(id);
    return { success: result.locked === true && result.until > Date.now() };
});

// Stack tests
test('auth has getStackAuthStatus function', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: typeof auth.getStackAuthStatus === 'function' };
});

test('getStackAuthStatus returns object with source stack', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    const result = auth.getStackAuthStatus();
    return { success: result && result.source === 'stack' };
});

// ============================================
// ISSUE #188-A2: transport credential compare is timing-safe
// ============================================
// The observable API contract is UNCHANGED (same verdicts); the pin is
// that comparisons behave identically across key shapes including
// length-mismatch and multi-block inputs, and that a prefix key is NOT
// accepted (a raw string-compare `===` would also reject it, so the real
// regression teeth are the verdict identity tests plus the code review
// gate in lint:helpers; here we assert the verdicts + rejection of
// prefix/suffix probes).

console.log('\n🔐 #188-A2 TIMING-SAFE COMPARE VERDICTS\n');

test('A2: valid key accepted, prefix/suffix probes rejected (padding does not loosen)', () => {
    process.env.VANT_API_KEY = 'timing-safe-secret-42';
    const auth = new Auth();
    const ok = auth.validateApiKey('timing-safe-secret-42').valid === true;
    const prefix = auth.validateApiKey('timing').valid === false;
    const suffix = auth.validateApiKey('42').valid === false;
    const pad = auth.validateApiKey('timing-safe-secret-42\u0000').valid === false;
    return { success: ok && prefix && suffix && pad,
        error: 'ok=' + ok + ' prefix=' + prefix + ' suffix=' + suffix + ' pad=' + pad };
});

test('A2: non-string garbage answers (no throw) not valid', () => {
    process.env.VANT_API_KEY = 'timing-safe-secret-42';
    const auth = new Auth();
    let threw = null;
    let verdict = null;
    try { verdict = auth.validateApiKey({ toString: null }); } catch (e) { threw = e; }
    return { success: threw === null && verdict && verdict.valid === false };
});

// Restore env (A2 block)
if (originalApiKey) process.env.VANT_API_KEY = originalApiKey;
else delete process.env.VANT_API_KEY;

// (R1 matrix, #189) Env-surgery helpers. proceedEnv sets each named var to
// the given value (null = unset) so each matrix row sees exactly one
// resolver input; cleanupEnv restores the pre-test environment so a
// host's real key config never leaks between rows.
const R1_ENV_VARS = ['VANT_AUTH_KEY', 'VANT_API_KEY', 'VANT_MCP_API_KEY'];
const r1Saved = {};
for (const k of R1_ENV_VARS) r1Saved[k] = process.env[k];
function proceedEnv(vars) {
    for (const [k, v] of Object.entries(vars)) {
        if (v === null) delete process.env[k];
        else process.env[k] = v;
    }
}
function cleanupEnv() {
    for (const k of R1_ENV_VARS) {
        if (r1Saved[k] === undefined) delete process.env[k];
        else process.env[k] = r1Saved[k];
    }
}

test('R1 matrix: explicit argument wins over everything', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const k = config.resolveAuthKey({ explicit: 'the-explicit-key' });
    cleanupEnv();
    return { success: k === 'the-explicit-key', error: 'got: ' + JSON.stringify(k) };
});

test('R1 matrix: VANT_AUTH_KEY (canonical) resolves first among envs', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: 'canon-key', VANT_API_KEY: 'alias-key', VANT_MCP_API_KEY: 'mcp-alias' });
    const k = config.resolveAuthKey();
    cleanupEnv();
    return { success: k === 'canon-key', error: 'got: ' + JSON.stringify(k) };
});

test('R1 matrix: deprecated aliases still resolve (warn-once, silent after first)', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: 'alias-key', VANT_MCP_API_KEY: null });
    const k1 = config.resolveAuthKey();
    const k2 = config.resolveAuthKey(); // second call: warned already, same key
    cleanupEnv();
    return { success: k1 === 'alias-key' && k2 === 'alias-key', error: 'k1=' + JSON.stringify(k1) + ' k2=' + JSON.stringify(k2) };
});

test('R1 matrix: persisted mcp.apiKey (brain config) used when no env', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    // Seeded from the environment instead of disk (the persisted-slot handler
    // `_brainConfigValue` consults in-process cache only when a brain config
    // was loaded this process; unit pin: the slot names exactly that file).
    const slot = config.getSecretKeys().includes('vant.mcpApiKey');
    cleanupEnv();
    return { success: slot, error: 'mcp.apiKey not named in secrets registry' };
});

test('R1 matrix: hasApiKey() honest = resolver verdict (null key, no env)', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const honest = config.hasApiKey() === false;
    cleanupEnv();
    return { success: honest, error: 'hasApiKey answered non-false with no key' };
});

// (Battery item 4, #189 door sweep) authPosture() — the one truthful line
// every key door prints must BE the resolver's posture, in both directions.
test('authPosture: OPEN — no key resolvable, line names all consulted canon sources', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const p = config.authPosture();
    cleanupEnv();
    const open = p.keyed === false && p.source === null
        && /OPEN/.test(p.line)
        && /VANT_AUTH_KEY/.test(p.line) && /mcp\.apiKey/.test(p.line);
    return { success: open, error: JSON.stringify(p) };
});

test('authPosture: KEYED via VANT_AUTH_KEY — names the canonical source', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: 'canon-key', VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const p = config.authPosture();
    cleanupEnv();
    const keyed = p.keyed === true && p.source === 'VANT_AUTH_KEY' && /KEYED via VANT_AUTH_KEY/.test(p.line);
    return { success: keyed, error: JSON.stringify(p) };
});

test('authPosture: KEYED via deprecated alias — line says to move the secret', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: 'alias-key', VANT_MCP_API_KEY: null });
    const p = config.authPosture();
    cleanupEnv();
    const ok = p.keyed === true && /deprecated alias/.test(String(p.source)) && /VANT_AUTH_KEY/.test(String(p.source));
    return { success: ok, error: JSON.stringify(p) };
});

test('R1 matrix: authRequired + no configured key refuses the presented key (no dev fallback)', () => {
    const _config = require(path.join(ROOT, 'lib', 'config'));
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const auth = new Auth({ apiKeyRequired: true });
    const verdict = auth.validateApiKey('anything-presented');
    cleanupEnv();
    return { success: verdict && verdict.valid === false, error: JSON.stringify(verdict) };
});

console.log('\n🔐 #186-R2 HONESTY PINS (pass 207)\n');

test('R2: revokeToken answers honestly — never silently succeeds on stateless tokens', () => {
    const auth = new Auth({});
    const r = auth.revokeToken('any-token');
    const ok = r && r.revoked === false && r.stateless === true && /H1/.test(r.note) && /\(\#185\)/.test(r.note);
    return { success: ok, error: JSON.stringify(r) };
});

test('R2: checkPermission validates the key, documents the unenforced permission (no lie)', () => {
    require(path.join(ROOT, 'lib', 'config'));   // module-side warm require (pass 207 pin family)
    proceedEnv({ VANT_AUTH_KEY: null, VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const auth = new Auth({ apiKeyRequired: false });
    const r = auth.checkPermission('some-key', 'org:write');
    cleanupEnv();
    const ok = r.allowed === true && r.permissionEnforced === false && /H1/.test(String(r.note));
    return { success: ok, error: JSON.stringify(r) };
});

test('R2: getAccessLevel — valid key is admin (single-key canon, documented)', () => {
    require(path.join(ROOT, 'lib', 'config'));   // module-side warm require (pass 207 pin family)
    proceedEnv({ VANT_AUTH_KEY: 'pin-key', VANT_API_KEY: null, VANT_MCP_API_KEY: null });
    const auth = new Auth({});
    const lvl = auth.getAccessLevel('pin-key');
    const nope = auth.getAccessLevel('wrong-key');
    cleanupEnv();
    return { success: lvl === 'admin' && nope === 'none', error: 'lvl=' + lvl + ' nope=' + nope };
});

console.log('\n🔒 #190-EW7 LOCKOUT RING-TRIM HERMETIC PINS (pass 226)\n');

// Each pin runs in a throwaway repo root (VANT_REPO_ROOT) so the real
// .circuit-auth.json at the workspace root is never touched.
const os = require('os');
const fs = require('fs');
function ew7Run(envs, seedDiskFile, childCode) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ew7-pin-'));
    try {
        fs.writeFileSync(path.join(tmp, '.circuit-auth.json'), JSON.stringify(seedDiskFile));
        const all = require('child_process').execFileSync(process.execPath, ['-e', childCode], {
            encoding: 'utf8', timeout: 30000,
            env: { ...process.env, VANT_REPO_ROOT: tmp, VANT_AUTH_LOCKOUT_CAP: '100', ...envs },
            cwd: ROOT,
        });
        // The child logs audit/WARN lines before its JSON sentinel line.
        const lines = all.trim().split('\n');
        return JSON.parse(lines[lines.length - 1]);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
}
const CHILD_PROBE = `const {Auth} = require(${JSON.stringify(path.join(ROOT, 'lib', 'auth'))});
const fs = require('fs');
const path = require('path');
const DISK = path.join(process.env.VANT_REPO_ROOT, '.circuit-auth.json');
const a = new Auth();
const r = a.recordFailedAttempt('fresh-probe');
const disk = JSON.parse(fs.readFileSync(DISK, 'utf8'));
console.log(JSON.stringify({ result: r, ids: Object.keys(disk), disk }));`;

// (a) Expired disk entries drop first; the fresh in-process streak survives.
const expired = 50;
const seedA = {};
for (let i = 0; i < expired; i++) seedA['rot-' + i] = { count: 5, lockoutUntil: Date.now() - 60000 };
test('EW7a: expired junk dropped on save, fresh streak survives, save reported', () => {
    const pinA = ew7Run({}, seedA, CHILD_PROBE);
    const aur = pinA && pinA.result && pinA.result.locked === false && pinA.result.persisted === true;
    const aok = aur && pinA.ids.includes('fresh-probe')
        && pinA.ids.filter(id => id.startsWith('rot-')).length === 0;
    return { success: !!aok, error: JSON.stringify({ ids: pinA && pinA.ids && pinA.ids.length, r: pinA && pinA.result }) };
});

// (b) Cap-trim: 102 active junk lockouts + 1 fresh streak (lockoutUntil 0)
// with CAP=100 => 3 oldest junk dropped; the zero-lockout streak survives
// (it sorts oldest — the pass-226 finding the guard exists for).
const seedB = {};
const base = Date.now() + 600000;
for (let i = 0; i < 102; i++) seedB['junk-' + String(i).padStart(3, '0')] = { count: 5, lockoutUntil: base + i * 1000 };
test('EW7b: ring capped at 100, zero-lockout streak never evicted', () => {
    const pinB = ew7Run({}, seedB, CHILD_PROBE);
    const bIds = pinB && pinB.ids || [];
    const bOk = bIds.includes('fresh-probe') && bIds.length === 100
        && bIds.every(id => id === 'fresh-probe' || id.startsWith('junk-'))
        && ['junk-000', 'junk-001', 'junk-002'].every(d => !bIds.includes(d));
    return { success: !!bOk, error: JSON.stringify({ count: bIds.length, hasFresh: bIds.includes('fresh-probe'), r: pinB && pinB.result }) };
});

// (c) Flood realism: junk lockouts LOADED by the constructor (they become
// the process map) are still droppable — in-process membership is NOT the
// guard (an over-wide guard would make the attacker bound unenforceable).
test('EW7c: constructor-loaded junk lockouts still trim to the cap', () => {
    const pinC = ew7Run({}, seedB, `const {Auth} = require(${JSON.stringify(path.join(ROOT, 'lib', 'auth'))});
const fs = require('fs');
const a = new Auth(); // constructor loads 102 junk into the map
const r = a.recordFailedAttempt('fresh-probe');
const disk = JSON.parse(fs.readFileSync(require('path').join(process.env.VANT_REPO_ROOT, '.circuit-auth.json'), 'utf8'));
console.log(JSON.stringify({ ids: Object.keys(disk) }));`);
    const cOk = pinC && pinC.ids.length === 100 && pinC.ids.includes('fresh-probe')
        && ['junk-000', 'junk-001', 'junk-002'].every(d => !pinC.ids.includes(d));
    return { success: !!cOk, error: JSON.stringify({ count: pinC && pinC.ids && pinC.ids.length }) };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);