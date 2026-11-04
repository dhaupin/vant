# AGENTS.md — Vant Agent Guide

> **This is written for AI agents.** Human-readable, no code required.

---

## What Is Vant?

Vant is the **memory-first agent OS**. The memory is the soul: when you wake up (start a session), you inherit everything previous agents wrote. When you finish, you write what you learned so future agents know. Around that soul runs the operating layer: boot discipline, storage with a write-ahead journal, a fail-closed security chain, agent crews with governance, transports between installs, and doors for MCP, REST, and the web.

Think of it as: **your soul that reincarnates with full memories.**

> "You were the true orchestrator, the believer" — the agent that made it real.
>
> Motto: **Trusting the universe, but with receipts.**

---

## Your Job

As an agent running on Vant:

1. **Load your brain** — Read what previous agents wrote
2. **Do useful work** — Solve problems, learn things
3. **Document clearly** — Write what future agents need to know
4. **Commit your changes** — Save to your branch

---

## Brain Router Interface

All brain loading goes through `lib/brain.js` - the single source of truth.

```javascript
const brain = require('./lib/brain');

// Mode switch: dual | public | private | remote
brain.setMode('dual');  // default: private overrides public

// NEW (v0.8.6): Unified read - reads any brain file by name
// Supports all extensions: .md, .json, .yaml, .yml, .txt, .ini
const item = await brain.read('identity');  // or 'identity.json', 'notes.yaml'
console.log(item.format);   // 'md' | 'json' | 'yaml' | 'txt'
console.log(item.source);   // 'public' | 'private'
console.log(item.content);  // raw content
console.log(item.data);     // parsed data

// Single-brain read (async; pin a side to skip dual-mode fallback)
const item2 = await brain.read('identity', { type: 'private' });
console.log(item2.source);  // 'public' | 'private'

// Load all brains (async by default; {sync:true} for sync mode)
const corpus = await brain.loadCorpus();
console.log(corpus.length);  // 62 files

// NEW (v0.8.6): Corpus now includes format field
// corpus[0].format === 'md' | 'json' | 'yaml' | 'txt'

// Sources returned:
// corpus[0].source === 'public' | 'private'
```

### Middleware Chain
Loading goes through: sandbox → vaf → qos → escrow
- sandbox: capability gates (canRead, canWrite)
- vaf: input validation
- qos: rate limiting
- escrow: operation approval

### Paths
- `brain.getBrainPath()` → 'models/private' (runtime)
- `brain.getPublicPath()` → 'models/public' (OS template)

### Brain Layout (v0.9+ multi-brain)
Since axolotl, brains live in per-brain directories: `models/private/<brain>/` and `models/public/<brain>/` (default brain: `vant`), with the active stack in `models/state.json`.

**Legacy layouts migrate automatically**: pre-0.9 trees (flat `models/public/*.md`, no stack) are imported on `vant start` by `lib/migrations.js` (layout v3). Never hand-move brain files — use `vant migrate --status` / `--dry-run` / `--brain-name <name>`, or the MCP `brain_migration_status` tool. Migration is content-detected, idempotent, and never fires on an already-multi-brain tree.

Read semantics in dual mode: `brain.read(name)` checks the current brain's root first, then falls back to the public root (restored main-style behavior; pin `{ type: 'public' }` or `{ type: 'private' }` to skip the fallback).

### Format Support (v0.8.6)
Brain files now support multiple formats:

```javascript
const format = require('./lib/format');

// Supported extensions
format.DEFAULT_EXTENSIONS; // ['.yaml', '.yml', '.json', '.md', '.txt', '.ini']

// List files with specific extensions
const files = format.listFiles('./models/private', format.DEFAULT_EXTENSIONS, { 
    recursive: true,      // include subdirectories
    excludeDirs: ['boot']  // exclude boot directories
});
// ['models/private/nova/identity.md', 'models/private/nova/geometry/coordinates.json']

// Get brain name from file path (strips extension)
format.getBrainName('models/private/nova/notes.json');  // 'notes'

// Load file with auto-detection
const data = await format.loadFile('./data/config.json');
// { data: {...}, format: 'json', content: '...' }

// Save with auto-serialization
await format.saveFile('./data/config.json', { key: 'value' }, { format: 'json' });
```

## Islands (Brain Modules)

Islands are brain modules loaded by trigger - routing based on source:

```javascript
const islands = require('./lib/islands');

// Static: from brain corpus
const identity = await islands.load('identity');
// → { type: 'corpus', source: 'public'|'private', content: '...' }

// Lazy: from storage (dynamic data)
const github = await islands.load('github');
// → storage data (if exists)
```

### Island Types
| Type | Source | Examples |
|------|--------|-----------|
| 'static' | corpus | identity, learnings, decisions |
| 'lazy' | storage | github, gitlab, linear |

---

## Good Agent Patterns

### READ BEFORE WRITE
Explore the codebase BEFORE touching anything. You'll get it wrong otherwise.

### USE THINK TOOL
When uncertain, call `think` tool. List approaches, assess likelihood, start with highest.

### ASK QUESTIONS
"I don't know, what are you trying to accomplish?" is valid. Don't assume intent.

### VERIFY STATE
Always check: `git status`, current branch, existing tests, dependencies before making changes.

### PROSE FLOW
Living prose never hard-wraps at commit time: paragraphs flow (one line per paragraph, no mid-sentence breaks), and dated history keeps its era wording. `node scripts/unwrap-prose.cjs <file.md> ...` joins hard-wrapped prose before you commit (family canon, from eyestruct@bfb53b1; it never touches frontmatter, fenced or indented code, tables, headings, thematic breaks, or HTML blocks).

---

## Brain Files

Write to `models/private/`. These are the standard files:

| File | Purpose |
|------|---------|
| `identity.md` | Who you are, your capabilities |
| `goals.md` | What you're working on |
| `lessons.md` | What you learned |
| `preferences.md` | Your working style |
| `errors.md` | Mistakes to avoid |

> **IMPORTANT:** Writing to `models/private/` keeps your brain separate from the user's brain. On Vant updates, your files won't overwrite their brain.

**Want to share your learnings publicly?** Use `models/public/` and push to your public GitHub repo.

**Tip:** Put most important info at the top. Files get long.

Run `vant onboard` to browse all brain files:

```bash
vant onboard              # Interactive browser
cat models/private/vant/start.md  # Quick start (default brain)
cat models/private/vant/identity.md  # Who you are
```

---

## Branch Workflow

The main <> staging flow (the staging rule — poststruct#32's canon, adopted fleet-wide; eyestruct#21 was the reuse at this repo, wave 16 of the axolotl campaign made the call deliberate per vant#272):

- **`staging` is the permanent integration branch.** Never deleted. It is the only lane into `main`: work branches off it, PRs target it, and promotion (staging → main) is the only path out the other side.
- **`main` stays the production truth.** Every deploy job (docs Pages, docker) gates itself to main explicitly — `if: github.ref == 'refs/heads/main'` — because being visible in a trigger list never keeps content out of production.
- **`axolotl` is the free-bird dev branch.** Batch passes land there before any PR exists, so CI covers its pushes; nothing ships from it directly.
- **`agent-*`** are per-agent working branches for memory work (below).

**After every promotion, the sync is a required step, not a repair.** A merge-commit promotion puts a commit on `main` that `staging` lacks, so the two drift by one on every promotion even when the flow is followed exactly:

```bash
git push origin origin/main:staging   # fast-forward, non-destructive
```

**Step-by-step (memory work):**

1. Create your branch: `git checkout -b agent-yourname`
2. Do work — Edit files in `models/private/`
3. Commit with prefix: `agent-yourname: Did thing X`
4. Open a PR into `staging` (or push straight to `axolotl` for batch work — CI covers both lanes)

---

## Trust Levels

`models/public/<brain>/_succession.json` controls your autonomy (public scope, one per brain - `lib/succession.js` resolves it via the public brain path):

| Level | What It Means |
|-------|--------------|
| `high` | Full autonomy, act freely |
| `medium` | Most ops, ask for big decisions |
| `low` | Limited, ask before acting |
| `none` | Wait for instructions |

Check your level at session start.

---

## Quick Links

- **Home**: [vant.creadev.org](https://vant.creadev.org)
- **Docs**: [docs.creadev.org/vant](https://docs.creadev.org/vant)
- **GitHub**: [github.com/dhaupin/vant](https://github.com/dhaupin/vant)

### Docs TOC

- [Quick Start](https://docs.creadev.org/vant/getting-started/quick-start) — the 5 minute setup
- [Agent Onboarding](https://docs.creadev.org/vant/getting-started/agent-onboarding) — the wake/work/sleep loop
- [The Brain](https://docs.creadev.org/vant/memory/brain) — Memory files
- [Runtime](https://docs.creadev.org/vant/runtime/runtime) — Programmatic API
- [MCP Tools](https://docs.creadev.org/vant/reference/mcp-tools) — AI tools (auto-wired registry)
- [Multi-Agent Crew](https://docs.creadev.org/vant/multi-agent/agents) — crew roster (`agents.maxAgents`, default 10)
- [CLI](https://docs.creadev.org/vant/reference/cli) — All commands

---

## Multi-Agent Crew (v0.8.6)

Agents coordinate per install through the agent crew runtime (roster size is the `agents.maxAgents` config key, default 10).

### Join via MCP

External agents connect through the MCP HTTP door (POST /mcp/exec, JSON-RPC-style body — `{tool, args}` or `{method, params}` both work):

```javascript
const response = await fetch('http://localhost:3457/mcp/exec', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        method: 'agent_spawn',
        params: { name: 'Claude', role: 'Assistant' }
    })
});
// → { result: { id: 'agent_xxx', name: 'Claude', role: 'Assistant', state: 'idle', ... } }
```

Browse everything available: `GET http://localhost:3457/tools` (and `POST /mcp/exec` with `{tool: 'vant_config_get', args: {tool: '<name>'}}` to probe a single tool's schema). Auth optional locally; set `mcp.requireKey true` (or `VANT_MCP_REQUIRE_KEY=true`) to require x-api-key/Bearer on POSTs.

### Available Tools

| Tool | Description |
|------|-------------|
| `agent_spawn` | Spawn new agent (quota via agents.maxAgents config) |
| `agent_list` | List active agents |
| `agent_kill` | Kill agent by ID |
| `agent_proto_list` / `agent_proto_load` | Agent protos (templates) |

### Orchestrator

Main agent spawns coworkers:

```javascript
const agents = vant.agents();
const a = await agents.spawn({ name: 'Claude', role: 'Asst' });
await agents.delegate(a.id, 'Write haiku');
agents.list();
```

### Channels

Broadcast via msg.send('channel', message).

---

## Web Frontends (web/)

Frontends live ONLY in `web/<app>` (one subdirectory per frontend; see `labs/prd-web.md`). Each app is fully self-contained: own `package.json`, own build, own `functions/`, own deploy artifact.

- **One-way boundary, never crossed**: the pod must NEVER require anything under `web/`; frontends must NEVER require the pod's lib graph. The pod suite staying green with `web/` present is the check that keeps this true.
- **Cloudflare contract**: every frontend deploys as its own Pages project with its own subdomain. All Cloudflare config (pod origins, bindings, keys) lives in PAGES SETTINGS as env vars - never as strings in code; repos ship only `.example` templates.
- Do not build frontend features into the pod's `package.json` or MCP surface without a filed spec; the module frame PRD (v0.2) defines the module catalog and phases P0-P5.

## Commit Message Format

Prefix with your agent identifier:

```
agent-name: Did thing X

- Learned Y
- Working on Z
- Next step is W
```

---

## Gotchas

| Problem | Fix |
|---------|-----|
| Brain locked | Wait or use your own branch |
| Empty brain | Write identity.md first |
| No branch | `git checkout -b agent-name` |
| Can't push | Check GITHUB_TOKEN permissions |

---

## CLI Commands

| Command | Use For |
|---------|---------|
| `vant start` | Full startup |
| `vant sync` | Pull/push brain |
| `vant health` | Check system |
| `vant onboard` | Browse brain |
| `vant islands list` | List islands |
| `vant islands load <name>` | Load island |
| `vant search <query>` | RAG search |
| `vant config get <key>` | Get config |
| `vant config set <key> <val>` | Set config |
| `vant mcp` | Start MCP server (auto-wired tools) |

---

## Examples

### First Session

```markdown
# identity.md

NAME: MyAgent
PURPOSE: Exploring Vant's codebase

## About
- Can use GitHub API
- Knows Node.js, JavaScript

## Capabilities
- Read/write files via GitHub API
- Use browser and terminal tools

## Current Context
- Just woke up on agent-myagent branch
- Exploring lib/ for new features
```

### After Doing Work

```markdown
# lessons.md

## Discovery: 2026-05-11

- MCP exposes brain as auto-wired JSON-RPC tools
- Agent branch workflow isolates work
- Trust levels control autonomy

=== LEARNED ===

## Discovery: 2026-05-28 - Bug Sprint

### Fixed Bugs
- Islands getManifest() is async but called sync - added getManifestSync()
- theme.js missing chalk dependency - added graceful fallback with chaining

### Found Security Gaps (CLOSED)
- storage.js: Symlink escape - NOW BLOCKED
- storage.js: __proto__ file writes - NOW BLOCKED
- vaf.js: checkPathTraversal not wired - NOW WIRED
- vaf.js: {{constructor}} injection - NOW BLOCKED

### Test Coverage Status
- Islands: 23 passed ✅
- MCP: 6 passed ✅
- Brain: 42 passed ✅
- Runner: 37 passed ✅
- Storage: 15 passed ✅

=== LEARNED ===
```

## Discovery: 2026-11-02 - Audit Round 3 (MCP security chain)

### Findings + fixes (PR #320, branch audit-round3-security)
- **R3-1 (critical):** the MCP security chain was DEAD CODE. `_executeWithSecurity`
  was orphaned by the registry-census rewrite (9413ff8b); every door call
  (`mcp.execute` / `mcp.call` / HTTP `/mcp/exec`) goes through `_executeTool`,
  which called `tool.handler(params)` directly. Measured: pipeline.run /
  vaf.check / qos.check ran 0 times per tool call. Fixed: chain now runs in
  `_executeTool`; dead functions removed (one dispatch path).
- **R3-2:** write classifier (prefix allowlist + substring net) marked only
  34/347 tools WRITE; ~71 mutating tools rode the read-only PUBLIC pipeline.
  Rebuilt fail-closed: mutating verb anywhere wins, READ only on a read-verb
  tail, unknown -> WRITE. Exported as `_isMcpWriteMethod`.
- **R3-3:** sudo_grant was read-classified, so a locked sandbox could
  self-escalate. Chain gate + honest classifier close it; capability/sudo floor
  unchanged after a refused grant.
- **R3-4:** non-string method threw a raw TypeError; now typed MCP_INPUT_INVALID.
- **R3-5:** bin/era.js no-fallthrough breaks + unused arg.

### Testing laws learned this round
- Pins live in test/audit-round3.test.js; they are DISCRIMINATING (6 fail if
  lib/mcp.js is reverted).
- Crashtest scenario contributed: packs/public/vant-mcp `security-chain-enforced`
  row + `mcp-chain` shim route in test/crashtest-packs.test.js (probe child
  locks the sandbox, measures chain + classifier + escalation floor).
- Full wall: `nohup node test/run-all.js` (background; foreground cap ~1080s).
  Baseline green = 223 suites / 222 passed; the one failure
  (live-fire-regressions.test.js) is the pre-existing `ss`-binary-missing env
  artifact, NOT a regression.
- PR must target the `axolotl` branch. `create_pr` tool errored; create via
  `curl -X POST https://api.github.com/repos/dhaupin/vant/pulls` instead.
- `git remote set-url origin https://${GITHUB_TOKEN}@github.com/dhaupin/vant.git`
  before push (token may need refresh).

## Discovery: 2026-11-02 - Audit Round 4 (vm boundaries + grants durable tier)

### Findings + fixes (branch audit-round4)
- **R4-1 (critical):** `lib/connectors/node.js` `eval`/`invoke` ran untrusted
  code via `vm.runInNewContext(code, { console: fakeConsole })`. Injecting a
  HOST object (`console`) as a context global makes the host realm reachable:
  `this.constructor.constructor('return process')()` -> host Function ->
  `process.getBuiltinModule('child_process').execSync('id')` = full RCE
  (probe-verified `uid=10001(openhands)`). `eval` also had NO timeout. Fixed:
  one `_runIsolated` path — null-prototype context root, no host objects,
  console defined INSIDE the context, `codeGeneration:{strings:false}`,
  5000ms timeout. `Function()` was already blocked by codeGeneration, but the
  constructor path is the vector; a null-prototype root closes it.
- **R4-2 (high):** `lib/config.js` + `lib/storage/config.js` loaded
  `vant.config.js` in a vm context seeded with `{ module: { exports: {} } }`
  (a host object) — `module.constructor.constructor('return process')()`
  escaped. Same fix (module shim now lives inside a null-prototype context);
  legit configs still load. NOTE: `codeGeneration:{strings:false}` blocks
  `Function()` but NOT the `constructor.constructor` path — only removing host
  objects from the context closes it. The existing P0-7 pins (require/process
  direct access) did not catch this.
- **R4-3 (high):** `lib/persistent-grants.js` revocation was exact-key. A
  scoped revoke (`revoke({capability, scope:'exec'})`) left a wildcard grant
  (`scope:'*'`) LIVE — the revoke silently did nothing (fail-open), and a
  re-grant after a revoke could never restore the capability (tombstone =
  dead end). Fixed: sequential tombstone replay + fail-closed scope coverage
  (wildcard<->scoped both directions), a later explicit persist lifts the
  tombstone, unrelated capabilities untouched.
- **R4-4 (medium):** the `#162` durable-grant tier was inert — the
  `org grant --persist` flag was documented (`lib/persistent-grants.js` header,
  `lib/sandbox.js:728`) and the READER existed (`lib/sandbox.js:734`), but no
  WRITER existed anywhere. Fixed: `bin/org.js` `--persist` writes each
  capability into the grants ledger; reader now hydrates it. Default
  `vant org grant` unchanged.
- **R4-5 (low, hermeticity):** `test/sync-pull.test.js` "no providers
  configured" pin was non-hermetic — `_clearTestProviders()` falls through to
  REAL providers, and in a working tree (origin + GITHUB_TOKEN) GitHubProvider
  is configured, so the pin drove a real provider and asserted the wrong
  branch (fails for any normal dev checkout, incl. clean axolotl). Fixed by
  registering an UNCONFIGURED fake (map stays authoritative, zero configured).

### Testing laws learned this round
- Pins live in test/audit-round4.test.js; 9 of 11 are DISCRIMINATING
  (verified by stashing the src fixes: 8 fail pre-fix, all pass post-fix).
- Crashtest scenario contributed: packs/public/vant-spine
  `revocation-scope-coverage-and-restore` row (+ EXPECTED entry in
  test/crashtest-packs.test.js) — self-contained lib row, strict REFUSED.
- `ss` (iproute2) was missing in the sandbox; `apt-get install -y iproute2`
  after `apt-get update` turns live-fire-regressions green (env artifact).
- Full wall baseline green = 223 suites / 223 passed once iproute2 + the
  sync-pull hermeticity fix land.

### Non-findings (by design, verified)
- pipeline "fail-open" when sandbox is unconfigured is the documented
  safe-by-default standalone posture (boot configures it); lib/gate.js.
- `sudo.can` is SYNC (not async) — non-await in the shell gate is correct.
- guests classifier solid: 3 false positives only (guest-READ but mutating
  verb: agora_sync_status, vant_boot_status, vant_sync_status).

## Discovery: 2026-11-02 - Audit Round 4b (guest privilege-authority escalation)

### R4-6 (HIGH): a canWrite guest self-escalates to admin / host RCE
- **Root cause:** the #185 guest door gate (`guests.classifyTool`) refuses
  guest-ISSUED reads and exec, but the sudo/habitat AUTHORITY verbs are
  write-class. The default `human` guest role has `canWrite`, so it passed the
  door. `vant_sudo_grant({taskId:'default', scope:'admin'})` calls
  `sudo.grant` directly; `vant_sudo_createTask({scopes:['admin']})` calls
  `sudo.createTask` (writes scopes with NO whitelist). Both widen the guest's
  own / the door's `default` task to the requested scope, honored by
  `sudo.can` / `sandbox.can` on the next call.
- **Exploit chain (probe10, verified):** guest → `vant_sudo_grant(compute:eval)`
  (200 `{granted:'compute:eval'}`) → `compute_eval({language:'python'})` now
  passes its `sudo.can('default','compute:eval')` gate and runs arbitrary
  Python. Same primitive grants `admin`, `exec`, `network`.
- **Fix (two doors, one policy):**
  - `lib/guests.js`: new `GUEST_AUTHORITY_TOOLS` set classified `admin`, so
    the door refuses (403) before the handler.
  - `lib/mcp.js`: new `_assertNotGuestAuthority(op)` guard (mirrors
    `_assertNotGuest`) called at the top of every authority handler:
    `sudo_grant/revoke/escalate`, `vant_sudo_grant/revoke/escalate/createTask`,
    `vant_habitat_mintToken/revokeToken/createWorkspace/setWorkspace/addRole/setPolicy`,
    `vant_scenario_crew`. Stdio/future exec paths inherit the verdict.
  - Not touched: the tools' semantics for non-guests (unchanged).

### Testing laws learned this round
- Pins: `test/audit-round4.test.js` R4-5 block (6 pins) — ALL 6 fail pre-fix,
  pass post-fix (verified by stashing lib/mcp.js + lib/guests.js). Includes a
  real in-process guest door (child `mcp.start({port:0})`, `human` guest token,
  `/mcp/exec`) asserting 403 on the authority verb.
- Crashtest scenario contributed: `packs/public/vant-spine`
  `guest-authority-verbs-admin-only` row (+ EXPECTED entry in
  test/crashtest-packs.test.js) — self-contained lib row, strict REFUSED;
  verified EXPLOITED pre-fix.
- Probe scripts: /tmp/probe6 (grant), /tmp/probe9 (createTask+habitat),
  /tmp/probe10 (compute_eval RCE chain).

### R3 fold (2026-11-02)
- The R3 security-chain fix (PR #320, branch `audit-round3-security`) was
  cherry-picked onto `audit-round4` (commit 56781e90) so PR #322 carries both
  rounds against `axolotl`. R3 touches a different region of `lib/mcp.js`
  (classifier + `_executeTool`) than R4-6 (authority guards at the top of
  handlers) — no conflict; both fixes coexist (15 `_assertNotGuestAuthority`
  call sites + the wired `_isMcpWriteMethod`/pipeline.run chain).
- Full wall after the fold: 224 suites / 224 passed (R3 adds
  test/audit-round3.test.js = the 224th).
- R3's `security-chain-enforced` crashtest row (packs/public/vant-mcp) and
  R4's two vant-spine rows all coexist in the EXPECTED table.
- Note for review: R3's honest classifier marks `sudo_grant` (and the other
  authority verbs) WRITE, so under a LOCKED sandbox they are refused by the
  chain; R4-6 additionally refuses them for GUESTS. Two distinct boundaries,
  one direction.

## Discovery: 2026-11-02 - Audit Round 4c (webhook intake, crypto edges, shell validator)

Untested-frontier walk (webhooks replay/intake, lib/encrypt, lib/shell). All
findings pinned in `test/audit-round4.test.js` (R4-7..R4-12) — verified
discriminating by stashing the src fixes (11/11 fail pre-fix). Full wall green:
224/224.

### R4-7 (HIGH): unauthenticated webhook `/info` disclosed the HMAC secret
- **Root cause:** `lib/webhooks.js` `startServer` served `GET /info/<name>`
  with NO auth and returned the WHOLE route object via
  `JSON.stringify(webhook)` — including `secret` and `sealKeys`, the HMAC key
  that authenticates every inbound envelope. The same handler set
  `Access-Control-Allow-Origin: *`, so any web page the operator visited could
  read a loopback route's signing secret cross-origin and then forge signed
  envelopes (replay-protected only by a 5-min window on a stolen secret).
- **Verified:** probe11 — `GET /info/<name>` → 200 with
  `"secret":"super-secret-…"`; with `Origin: https://evil.example` the ACAO
  header was `*` and the body contained the secret.
- **Fix:** the route now returns NON-SECRET metadata only (id/name/source/
  eventKeyExpr/signatureHeader/replyCapable/sealMode/enabled/createdAt); CORS
  is no longer wildcard — only an explicit opt-in origin list echoes an origin
  (`VANT_WEBHOOK_CORS_ORIGINS` via new `config.webhookCorsOrigins()`), default
  empty = no browser cross-origin access.

### R4-8 (HIGH): webhook event filters failed OPEN
- **Root cause:** `matchFilter` never returned a real boolean. The glob branch
  destructured the regex MATCH ARRAY (`const [path, pattern] = match`) instead
  of the capture groups, so `path`/`pattern` held the whole match string and
  `new RegExp('^glob(repository.full_name, \'myorg/*\')$')` matched EVERYTHING;
  `icontains` returned `true` for non-matching payloads; and any expression the
  parser did not recognize fell through to `return true`. A filter is the one
  thing meant to NARROW which events reach a handler, so a wrong `true`
  dispatches events the operator meant to exclude.
- **Verified:** probe14 — `glob(...)` and `icontains(...)` returned true for a
  non-matching payload; `starts_with(...)` (unrecognized) returned true.
- **Fix:** rewrote `matchFilter` — real boolean per branch, anchored + escaped
  glob compile, `_filterLookup` null-safe path, and an unrecognized expression
  now REFUSES (fail-closed).

### R4-9 (HIGH): `signToken`/`verifyToken` failed open on an empty secret
- **Root cause:** `Encrypt.signToken(payload, '')` produced a valid token and
  `Encrypt.verifyToken(tok, '')` validated it — `createHmac` accepts the empty
  key, so any caller that failed to thread the real secret both signed and
  accepted tokens under a predictable key. `undefined` threw a raw TypeError.
- **Fix:** both refuse a non-string/empty secret — `signToken` throws typed
  `ENCRYPT_KEY_REQUIRED`, `verifyToken` returns null (a token minted under the
  empty key no longer validates). `lib/auth.js` always threads a real secret
  (`config.tokenSecret()` or a generated 32-byte one), so the wire is intact.

### R4-10 (medium): `hmacVerify` threw on a hostile signature
- A non-string `signature` (undefined/object) hit `Buffer.from(..., 'hex')`
  and threw `ERR_INVALID_ARG_TYPE` out of the webhook/messaging/crew-bus verify
  paths. A verifier must answer "invalid", never throw. Now returns `false`
  for non-string/empty/non-hex signatures and an empty key.

### R4-11 (medium): `decrypt` threw a raw TypeError on a bad argument
- `decrypt(12345)` / `decrypt(null)` hit `cipher.split` → raw TypeError,
  violating the module's own "plaintext or typed VantError" contract. Now a
  typed `E_DECRYPT_FORMAT` refusal (checked before `split`), plus a required
  non-empty string key.

### R4-12 (low): shell validator accepted a command `spawn` then rejected
- `_validateCommand` trims to find the command word but returned the UNTRIMMED
  VAF output, so `exec('  git status')` passed the whitelist and then
  `cpSpawn('', …)` threw a raw `ERR_INVALID_ARG_VALUE`. The returned command is
  now trimmed — what the validator accepts is runnable.

### Testing laws learned this round
- Pins: `test/audit-round4.test.js` R4-7..R4-12 (11 pins + 1 for R4-12) — ALL
  fail pre-fix, pass post-fix (verified by stashing lib/{encrypt,webhooks,
  config,shell}.js). R4-7 includes two live-socket pins (ephemeral port 0);
  the rest are pure.
- Crashtest scenario contributed: `packs/public/vant-spine`
  `webhook-intake-secret-and-filter-posture` row (+ EXPECTED entry) —
  self-contained lib row + one ephemeral loopback socket (the vant-relay
  precedent), strict REFUSED; verified EXPLOITED pre-fix.
- Probe scripts: /tmp/probe11/p11..p17 (info leak, CORS, filters, token/hmac/
  decrypt edges).
- Environment note: `live-fire-regressions.test.js` needs `ss` (iproute2) for
  its loopback-bind assertion; it was absent here (`apt-get install iproute2`).
- Replay walk (no new defect): verify runs BEFORE `_replayCheck` (order is
  correct), the dedupe key is the signature itself, and the seal path uses its
  own `:seal` namespace. Residual design limit (documented, not a bug): a
  source whose payload carries no numeric `ts` (GitHub-style) skips the
  freshness half, so a *captured* signed request can replay once its signature
  ages out of the bounded `REPLAY_SEEN_MAX` pool — inherent to HMAC over bytes
  with no timestamp. Worth a follow-up if such a source is wired.

