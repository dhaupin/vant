#!/usr/bin/env node
/**
 * Config Registry pins (pass 179, prd-canonicalization Wave B; extended pass 186)
 *
 * Pins:
 *   1. Registry is non-empty and complete-shaped (env/key/type/fallback/secret).
 *   2. listEnvConfig resolves every entry with a source + typed values.
 *   3. Secrets are masked by default; maskSecrets:false returns raw.
 *   4. unknownEnvVars detects set-but-unregistered VANT_* vars.
 *   5. Straggler getters (webhook/health/agentsMax) hold defaults and
 *      honor env overrides.
 *   6. Registering known names: the registry must include the vars the
 *      main flows read (server/mcp/webhook/health + log level).
 *   7. (pass 186) Rogue fixes: steveframe typo, duplicate msg key,
 *      stale getGithub/getStegoframe, cfR2Bucket zombie removal, and the
 *      Wave-B straggler registration (registry ≥ 40 entries).
 */
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + String(extra).slice(0, 120) : '')); }
};

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const config = require('../lib/config');

// ── 1. Registry shape ─────────────────────────────────────────────────────
const reg = config.envRegistry();
ok('registry non-empty', reg.length >= 20, reg.length);
ok('every entry has env/key/type/fallback/secret', reg.every(e => e.env && e.key && e.type && 'fallback' in e && typeof e.secret === 'boolean'));
ok('types are number|string|bool|path', reg.every(e => ['number', 'string', 'bool', 'path'].includes(e.type)));
ok('no duplicate env names', new Set(reg.map(e => e.env)).size === reg.length);

// ── 2. Resolution ─────────────────────────────────────────────────────────
const listed = config.listEnvConfig({ includeUnset: true });
ok('listEnvConfig resolves all entries', listed.length === reg.length);
ok('every entry has source/env|fallback', listed.every(e => ['env', 'fallback'].includes(e.source)));
const sp = listed.find(e => e.key === 'server.port');
ok('server.port default 3456 typed number', sp && sp.value === 3456 && sp.source === 'fallback', JSON.stringify(sp));

// ── 3. Secret masking (subprocess so env is truly set) ───────────────────
const sub = (envs, code) => execFileSync('node', ['-e', code], { encoding: 'utf8', cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...envs } });
let masked;
try { masked = JSON.parse(sub({ VANT_MCP_API_KEY: 'abcdef0123456789' }, "console.log(JSON.stringify(require('./lib/config').listEnvConfig().find(e=>e.key==='mcp.apiKey')))")); } catch (e) { masked = null; }
ok('secret-typed values masked in list output', masked && masked.value === 'abcd****', JSON.stringify(masked));
let raw;
try { raw = JSON.parse(sub({ VANT_MCP_API_KEY: 'abcdef0123456789' }, "console.log(JSON.stringify(require('./lib/config').listEnvConfig({maskSecrets:false}).find(e=>e.key==='mcp.apiKey')))")); } catch (e) { raw = null; }
ok('maskSecrets:false exposes raw (caller opted in', raw && raw.value === 'abcdef0123456789');

// ── 4. Unknown-env typo scan ──────────────────────────────────────────────
let unknown;
try { unknown = JSON.parse(sub({ VANT_TYPO_PORT: '9', VANT_OTHER_XYZ: 'x' }, "console.log(JSON.stringify(require('./lib/config').unknownEnvVars()))")); } catch (e) { unknown = null; }
ok('unknownEnvVars flags set-but-unregistered VANT_*',
    Array.isArray(unknown) && unknown.some(u => u.env === 'VANT_TYPO_PORT') && unknown.some(u => u.env === 'VANT_OTHER_XYZ'),
    JSON.stringify(unknown));
ok('unknownEnvVars masks values', unknown && unknown.every(u => u.masked === '' || /\*{4}/.test(u.masked) || u.masked.length === 0), JSON.stringify(unknown));

// ── 5. Straggler getters ─────────────────────────────────────────────────
ok('webhookPort default 3467', config.webhookPort() === 3467);
ok('healthPort default 3468', config.healthPort() === 3468);
ok('agentsMax default 10', config.agentsMax() === 10);
const override = sub({ VANT_AGENTS_MAX: '25', VANT_WEBHOOK_PORT: '3500', VANT_HEALTH_PORT: '3501' },
    "const c = require('./lib/config'); console.log(c.agentsMax(), c.webhookPort(), c.healthPort())");
ok('env overrides flow through stragglers', override.trim() === '25 3500 3501', override);

// ── 6. The main flows' vars are all in the registry ──────────────────────
for (const env of ['VANT_SERVER_PORT', 'VANT_SERVER_BIND', 'VANT_MCP_PORT', 'VANT_MCP_REQUIRE_KEY', 'VANT_WEBHOOK_PORT', 'VANT_WEBHOOK_SECRET', 'VANT_HEALTH_PORT', 'VANT_LOG_LEVEL']) {
    ok('registry covers ' + env, reg.some(e => e.env === env));
}

// ── 7. Pass-186 rogue pins ────────────────────────────────────────────────
ok('getStegoframe returns the template url (steveframe typo fixed)', (() => { const sf = config.getStegoframe(); return !!sf && sf.url === 'https://app.all-hands.dev' && !!sf.version; })());
ok('getGithub routes through load() without crashing', (() => { const g = config.getGithub(); return typeof g === 'object' && 'token' in g && 'repo' in g; })());
ok('msg config holds BOTH defaults and depth cap (dup-key fix)', (() => { const all = config.getAll(); return !!all.msg && 'encrypted' in all.msg && 'autoEncrypt' in all.msg && 'maxPublishDepth' in all.msg; })());
ok('cfR2Bucket zombie removed from surface', typeof config.cfR2Bucket !== 'function');
ok('registry covers the VANT_MSG_* family', ['VANT_MSG_ENCRYPTED', 'VANT_MSG_AUTO_ENCRYPT', 'VANT_MSG_MAX_PUBLISH_DEPTH'].every(v => reg.some(e => e.env === v)));
ok('registry covers the prune/clean family', ['VANT_PRUNE_STALE_DAYS', 'VANT_PRUNE_AUTO_CLEAN', 'VANT_CLEAN_LOGS', 'VANT_CLEAN_MAX_LOG_AGE_DAYS'].every(v => reg.some(e => e.env === v)));
ok('registry covers VANT_STORAGE_PATH + escrow + agent.id + qos', ['VANT_STORAGE_PATH', 'VANT_ESCROW_DEFAULT_BUDGET', 'VANT_AGENT_ID', 'VANT_QOS_MAX_PER_MINUTE'].every(v => reg.some(e => e.env === v)));
ok('registry grew past 40 entries (Wave-B stragglers registered)', config.envRegistry().length >= 40);

// ── 8. Pass-225 pins: config.example.ini truthfulness + coverage ───────
// ROADMAP said the example ini drifts from config.js; these pins make
// that drift CI-detectable instead of a manual audit.
const EXAMPLE_INI = fs.readFileSync(path.resolve(__dirname, '..', 'config.example.ini'), 'utf8');
const registryNames = new Set(reg.map(e => e.env));
// The ini dialect (MODEL_PATH/STEGOFRAME_*/GITHUB_* etc.) is READ by the
// config.ini loader, not the env registry — legacy names stay allowed.
const INI_DIALECT_ALLOWLIST = new Set([
    'VANT_VERSION', 'MODEL_PATH', 'STEGOFRAME_URL', 'STEGOFRAME_ROOM',
    'STEGOFRAME_PASSPHRASE', 'STEGOFRAME_MODE', 'GITHUB_REPO', 'GITHUB_BRANCH',
    'GITHUB_TOKEN', 'POLLING_INTERVAL', 'MAX_REQUESTS_PER_HOUR',
    'MAX_STRING_LENGTH', 'MAX_DEPTH', 'MAX_ARRAY_LENGTH',
    'MAX_REQUESTS_PER_MINUTE', 'MAX_BURST', 'MAX_PATH_LENGTH',
    'BLOCK_PATH_TRAVERSAL', 'AUDIT_LOG', 'AUDIT_FILE',
]);
const iniEnvNames = new Set(([...EXAMPLE_INI.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})(?==)/gm)] || []).map(m => m[1]));
const fabricated = [...iniEnvNames].filter(n => !registryNames.has(n) && !INI_DIALECT_ALLOWLIST.has(n));
ok('every env-name assignment in config.example.ini is a real runtime var (no fiction)',
    fabricated.length === 0, 'fabricated: ' + fabricated.join(','));
// Coverage (non-secret entries only): secrets and provider connector tokens
// stay env-pointer-only BY DISPOSITION (an example file must never
// normalize copying secrets into a config ini).
const BEYOND_INI_DISPOSITION = new Set([
    'VANT_GITHUB_TOKEN', 'VANT_AUTH_KEY', 'VANT_API_KEY', 'VANT_MCP_API_KEY',
    'VANT_TOKEN_SECRET', 'VANT_WEBHOOK_SECRET',
    'GITLAB_TOKEN', 'GITEA_TOKEN', 'BITBUCKET_TOKEN', 'GIT_TOKEN',
]);
const uncovered = reg
    .filter(e => !e.secret && !BEYOND_INI_DISPOSITION.has(e.env))
    .map(e => e.env)
    .filter(env => !EXAMPLE_INI.includes(env));
ok('every non-secret registry var is documented in config.example.ini',
    uncovered.length === 0, 'uncovered: ' + uncovered.join(','));
// The ROADMAP-named four + the #189-R1 canon var are registered.
ok('registry covers the ROADMAP-named vars + VANT_AUTH_KEY canon',
    ['VANT_BRAIN_PASSWORD_TIMEOUT', 'VANT_SERVER_INSECURE', 'VANT_SERVER_AUTH_REQUIRED', 'VANT_STORAGE_PATH', 'VANT_AUTH_KEY']
        .every(v => registryNames.has(v)));
const authKey = reg.find(e => e.env === 'VANT_AUTH_KEY');
ok('VANT_AUTH_KEY registered canon (api.key, secret)',
    authKey && authKey.key === 'api.key' && authKey.secret === true, JSON.stringify(authKey));

console.log(`\n=== config-registry pins: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);