# PRD: Org → Dept → Team → Agents Flow (Multibrain Orgchart)

**Status:** draft, needs decisions (D-1..D-5)
**Created:** 2026-09-21, Buffy, from an executable end-to-end QC (`org → dept → team → role → assign → spawn`)
**Scope:** `lib/teams.js` (1,354 ln), `lib/agents.js` (1,152 ln), sandbox capability grant UX, boot scopes

---

## 1. Problem

The orgchart stack exists (teams.js exports createOrg/listOrgs/createDept/createTeam/createRole/assign/getRoleChain/hasPermission + multibrain helpers), but nobody has ever run the full flow end-to-end. The QC did — it **passes** mechanically, but only after manually granting operator scopes, and it exposed contract breaks that make the flow unusable as-is for real hierarchy data.

## 2. QC evidence (repro: /tmp/qc_org2.js pattern)

With boot-emulated scopes `['read','write','spawn','execute']` + `capabilities.canWrite/canSpawn = true`:

```
OK  createOrg → org_m…    OK  getOrg → QCOrg      OK  updateOrg → ok
OK  createDept → dept_m…  OK  createTeam → team_m… OK createRole → (Promise)
OK  agents.spawn → {brain: null}               OK  assign → nested [object Object] log
FAIL listDepts(orgId) → 0 dept(s)  ← dept exists, keyed by NAME not ID
OK  deleteOrg → 'deleted' ← while dept 'Eng' still alive → ORPHAN
```

Without scopes (fresh boot default): **every write op returns `E_SANDBOX`** — the flow is denied by default and there is no documented operator path to grant it.

## 3. Findings

### A. Flow/security gaps
- **F-1 — No operator grant path.** `boot()` defaults `scopes: ['read']` (lib/boot.js:124). Every `teams` write → `E_SANDBOX`. Nothing in docs/CLI/config shows how an operator boots with write+spawn. Capability grant UX is the #1 blocker for using the feature at all.
- **F-2 — Enforcement philosophy split.** teams/agents: deny-by-default even when the sandbox was never configured. storage.js: allow-with-warning when unconfigured. `Sandbox._explicitlyConfigured` exists (lib/sandbox.js:349) precisely to distinguish these, but teams ignores it. One philosophy must win.
- **F-3 — Error signaling is a grab-bag.** Same module returns `{error, code}` objects (E_SANDBOX), throws (VantError), returns plain strings (`'No team found'` in createRole), and one function is async among sync siblings. Callers that don't check `.error` (or don't await) silently treat failures as success — proven live in the QC.

### B. Data-model bugs
- **F-4 — FK name-vs-ID split.** `createDept` stores `org: 'QCOrg'` (NAME, from `options.org`), `createTeam` stores `dept: 'Eng'` (NAME), roles store `team: <name>`. But `listDepts(filter)` does `d.org === orgId` (ID), and `getOrg/getTeam` are ID-keyed. The hierarchy is *written* in names and *queried* by IDs → every filtered listing returns empty. The QC proved it.
- **F-5 — Zero referential integrity.** `deleteOrg` succeeded with a live child dept; no cascade, no block, no warning. Orphaned entities accumulate silently.
- **F-6 — Spawn doesn't bind a brain.** `agents.spawn()` returned `brain: null` even with a current brain active. Multibrain helpers (`getAgentBrain`, `listAgentsByBrain`) exist downstream, but the producer never sets the field the consumers read. Assignments can fill it (`options.brain`), but spawn-order usage leaves it null.
- **F-7 — `assign()` accepts garbage silently.** First param documented as agentId string; the QC passed an object and got `"Assigned agent [object Object] to org null, dept null, team undefined"` logged + a nonsense assignment record. Needs a type check.

### C. Test gaps
- **F-8 — typeof-only coverage.** teams.test.js asserts `typeof fn === 'function'` and one truthiness check per create; no round-trips, no negative paths, no quota/RLS tests. This is exactly how F-4 survived.

## 4. Decisions needed (owner: dhaupin)

- **D-1 — FK convention:** names or IDs? Recommendation: **IDs internally** (stable under rename), name→ID resolution + validation at every create boundary (createDept validates `options.org` against live orgs and stores the ID). Backfill: none needed (feature unused in the wild).
- **D-2 — Default posture:** should teams writes be allowed on an *unconfigured* sandbox (match storage's allow-with-warning) or stay deny-by-default with a documented operator grant? Recommendation: keep deny-by-default + document/add the grant path (D-3) — orgchart ops are privileged.
- **D-3 — Operator grant UX:** add `vant org boot --scopes read,write,spawn` (wraps boot with operator scopes) or a config block `orgchart.operatorScopes`. Pick one.
- **D-4 — Error contract:** standardize on **throw VantError with code** for programming/API misuse, return `{error, code}` only for *policy denials* (sandbox/RLS/quota/rate). Document in prd conventions. Align createRole (async vs sync) with siblings.
- **D-5 — Delete semantics:** cascade (org→depts→teams→roles→assignments), block-if-children, or `--force` flag. Recommendation: block-by-default + explicit cascade option; every delete emits an audit event.

## 5. Task breakdown (queued in TASKS.md as O-1..O-6)

| # | Task | Size |
|---|------|------|
| O-1 | FK fix: ID-based hierarchy + name→ID resolution + validation at create boundaries (D-1) | medium |
| O-2 | Referential integrity: delete guards/cascade per D-5 + orphan cleanup helper | medium |
| O-3 | Error contract cleanup per D-4 (unify {error,code} vs throw; make createRole sync or all async — pick one) | small |
| O-4 | assign/spawn hardening: agentId type check (F-7); spawn binds current/option brain (F-6) | small |
| O-5 | Operator grant path per D-3 + docs update | small |
| O-6 | Real test suite for the flow: round-trips, negative paths, quota/RLS, delete semantics (kills F-8) | medium |

## 6. Verification plan

- End-to-end script (the QC, kept as `test/orgflow.test.js` after O-6) must pass both postures: unconfigured sandbox (denied, F-2/D-2 behavior) and operator grant (full flow green).
- Filtered listings (`listDepts(orgId)`, `listTeams({org})`) must return created children.
- Delete org with live child → blocked (or cascaded per D-5); zero orphans after cleanup.
- `vant horcrux inspect`-style CLI smoke: spawn → assign → `getAgentBrain` returns the spawned brain.
