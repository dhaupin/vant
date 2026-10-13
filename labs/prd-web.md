# Vant Web — Dashboard & Frontend Architecture — Product Requirements Document

**Version:** 0.1 (planning draft — NO CODE THIS PASS)
**Branch:** axolotl
**Date:** 2026-10-13
**Status:** Draft (owner-approved direction: "I like it. Let's do it")

---

## 1. Overview

The headless work (passes 210-215) built the pod AND its API layer as
deliberate preparation: authenticated guest identities riding the sandbox
capability vocabulary, `/mcp/exec` (a 328-tool registry over JSON-style
requests), `/mcp/events` (an authenticated, throttled, sanitized SSE
board), per-tenant list filtering, channel scoping, and per-guest read
budgets. **The React dashboard is "a guest identity with a browser."**

This PRD defines WHERE frontends live, HOW they reach the pod, WHAT each
tier of the app does, and the phase plan. Owner directives recorded:

- `/dist` stays the **Cloudflare Pages lander** (it currently deploys as
  the single marketing page on `vant.creadev.org`; it "isn't doing much").
- Frontends live in a dedicated top-level directory (`/web` recommended;
  `/app`, `/src` rejected - see 2.2), and every frontend MUST sit in its
  own SUBDIRECTORY within that folder, so an install base can run several
  frontends side by side.

## 2. Directory model (the multi-frontend contract)

### 2.1 The rule

```
web/                    <- the frontends ONLY; the Node pod never requires it
  dashboard/            <- app 1: the admin/observer dashboard (this PRD)
    src/                <- app source (React + Vite + TS)
    package.json        <- app-local dependencies and scripts
    dist/               <- build OUTPUT (deploy artifact, gitignored)
  <next-app>/           <- app 2: whatever the project needs later
```

- **Every frontend is self-contained**: own `package.json`, own build
  toolchain, own deploy artifact. No app reads another app's source.
- The root `package.json` stays the POD's; web toolchain deps never
  leak into the pod's install (the pod ships `chalk/js-yaml/yaml` tiny
  by design - do not bloat it).
- Naming rule: directory names are kebab-case product names
  (`dashboard`, `landing-v2`, ...). One English word preferred.

### 2.2 Why `/web` (and not `/app` or `/src`)

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| `/web` | **recommended** | says exactly what it is (browser code); unusual in Node CLIs so nothing else already claims it; `/app` and `/src` commonly mean the POD's own source in other ecosystems |
| `/app` | rejected | collides with app-route conventions (and the pod's `agents`/app domain); ambiguous against `dist/index.html` being an "app" |
| `/src` | rejected | a frontend is source + build + config, not just source; `/src` at root would read as the whole repo's source dir |
| `/clients`-style? | noted | same idea; `/web` reads better in this repo's voice |

### 2.3 Deploy decision (owner, recorded)

Every frontend ships as its OWN Cloudflare Pages project with its OWN
`<name>.creadev.org` subdomain (owner directive). The lander keeps
vant.creadev.org. The dashboard project deploys from `web/dashboard/dist`.
The Worker-proxy reach matrix (3.1 Mode A) belongs to each project
individually.

### 2.4 The name (open, recommendation recorded)

- "Mycelium" is SPOKEN FOR: Mycelium BTC wallet (mycelium.com, since
  2013) + ThreeFold's Mycelium IPv6 overlay mesh (semantically the same
  concept this repo's mesh wants later). The brain's own voice already
  uses  mycelium for the network layer (perspective.md).
- Owner directive: reserve "mycelium" for the MESH layer it actually
  describes. Current recommendation for the dashboard: "Bolete" (the
  mycelium's fruiting body - the visible part of the invisible network;
  bolete.creadev.org), pragmatic fallback "Vantage" (vant + vantage
  point).
- Owner call (2026-10-13): "Bolete" is confirmed as the WORKING CODENAME
  for now (provisional; the final brand decision still lands before P1
  is specced up). Subdomain in planning artifacts: bolete.creadev.org.

### 2.5 Relationship to `/dist`

- `/dist/index.html` remains the LANDER artifact checked into the repo
  for the Cloudflare Pages project. The dashboard is a DIFFERENT app
  with its own artifact; `/dist` does not become a dumping ground for
  frontend builds.
- The lander gains ONE new link "Dashboard" that points at whatever
  deploy URL the dashboard project gets (static link only; no build
  coupling).

### 2.6 The stack (owner direction + 2026-10-13 turf comparison)

Owner direction: the mid-2026 admin-UX thread was "Tailwind, Shadcn,
Radix, Framer - not saying we need them all, but all could help". That
lean SURVIVES the comparison - and it gains a named periphery:

- **shadcn/ui (CLI v4)**: copy-in source components; ships Recharts-v3-
  based charts (`shadcn add chart`); registry/CLI ecosystem; supports
  Radix OR Base UI as the primitive base. (In mid-2026 shadcn made
  Base UI the default for NEW projects while keeping Radix fully
  supported - no migration required.) Our lean stays Radix; a Base UI
  swap is allowed later if a primitive gap appears - not a fork.
- **Ant Design 6** (v6.6.x, ConfigProvider tokens, dark algorithm,
  zeroRuntime): brings its own design language - fighting it for the
  brand PRD's identity costs more than it returns for a board + tables
  + forms app. NOT chosen.
- **Mantine 9** (v9.7, built-in light/dark/auto): the best
  batteries-included alternative, but its own theming world - brand
  tokens would be ported, not shared, parallel to Tailwind. NOT chosen.
- **Motion** (ex-Framer Motion): now "Motion for React" v14 (import
  from `motion/react`). Same library, new name; use for transitions,
  not decoration.

The periphery the earlier crew never named (what an admin dashboard
actually runs on):

| Concern | Pick | Why |
|---------|------|-----|
| routes + lazy modules | TanStack Router v1 | typed routes; the module frame's spine (3.3) |
| tables | TanStack Table v9 (stable) | rosters / guest lists / era lists in every tier |
| server reads | TanStack Query v5 | tool/exec reads; SSE covers live streams |
| envelope types | zod | typed shapes at the Worker-proxy boundary (pod stays truth, 3.2) |
| charts | Recharts (via shadcn) | era/escroll/budget trend views |
| forms | react-hook-form | Tier S issuance/revoke forms |
| icons | lucide | shadcn-native |

Dark/light: brand tokens live as CSS variables (prd-brand.md); both
color modes ride a `dark` class - no component-library color scheme
provider needed. This is WHY the shadcn path beats Ant/Mantine for a
brand-defined kit: the tokens ARE the brand PRD, verbatim.

## 3. Runtime architecture (how the browser reaches the pod)

### 3.1 The reach matrix

| Mode | Where the app runs | How it reaches `3457` | CORS | Status |
|------|--------------------|-----------------------|------|--------|
| A. Worker proxy (PRIMARY) | Cloudflare Pages (a `web/dashboard` project) | Pages **Worker Functions** proxy `/api/*` to the pod's MCP door over the network | none needed (same-origin) | planned P1 |
| B. Pod same-origin (FALLBACK) | static bundle served BY the pod | direct `/mcp/*` | none needed (same-origin) | phase P4 |
| C. Direct cross-origin | dev workstation | direct | REQUIRES the MCP-door CORS grant (not built today) | dev only |

- **Mode A is the recommended primary** for the owner's cloud posture:
  the Worker holds network egress to the pod, the pod can stay bound to
  loopback/private, and the browser never talks to the pod directly -
  the Worker is the single authenticated bridge. (`lib/server.js`
  already proves the CORS-block pattern, but "no CORS at all" is the
  cleaner posture than any grant.)
- The Worker proxy contract (in the Pages project's `functions/`):
  - `GET/POST /api/mcp/exec` -> pod `POST /mcp/exec` (auth header forwarded)
  - `GET  /api/mcp/events` -> pod `GET /mcp/events` (SSE streamed through)
  - `GET  /api/mcp/tools` -> pod `GET /tools`
  - `GET  /api/health` -> pod `/health`
  - No token logic, no tenant logic, no rate-limit logic IN THE WORKER:
    the pod is the source of ALL of those (the pass-215 budget, EW limits,
    tenant filters stay pod-owned). The Worker forwards and streams.
- Identity: MVP = operator pastes a `vguest_` token into the UI; the
  browser sends it as `Authorization: Bearer ...` THROUGH the Worker
  (transparent forwarding; the Worker never logs it). Token-at-rest in
  the browser: keep it OUT of `localStorage` if Worker-side session
  binding lands later (P3 open question).

### 3.2 What the dashboard does NOT re-implement

Server truth (never client-side logic):

| Concern | enforced where |
|---------|----------------|
| roles / capabilities / exec gating | door `guests.authorize` |
| tenant visibility (rosters, channels, rows) | door filters (H5/H8 passes 213-214) |
| read crawl budgets | door E_GUEST_THROTTLED (pass 215) |
| rate limits / body caps | EW4 + EW1 (passes 190) |
| message/row shapes | tool schemas (the `msg_send` string-spread class stays dead) |

The UI renders typed refusals honestly (`E_*` codes) instead of hiding
them - the pride of this repo is honest surfaces incl. its dashboards.

### 3.3 The module frame (in-dashboard extensibility)

Owner requirement (2026-10-13): the frontend must be EXTENSIBLE - new
modules (new views, menu items, pod surfaces) plug in without recoding
or re-theming the frame each time. Design:

A module is a self-contained directory:

```
web/dashboard/src/modules/<module-name>/
  manifest.ts     <- typed identity (contract below)
  index.tsx       <- the mounted view (frame lazy-loads it)
```

Manifest contract (typed, validated at frame boot):

| field | meaning |
|-------|---------|
| `id` | kebab-case unique id |
| `title`, `icon` | nav presentation |
| `route` | path segment the frame mounts the view at |
| `nav` | which menu section + order |
| `tiers` | which identities SEE the menu item (O/H/A/S). Tiers gate PRESENTATION only - the door still gates the data (3.2, 6): a module shown to a refused identity renders the typed refusal, not an assumption of access. |
| `families` | SSE event families the module consumes (the frame fans them out) |

Frame responsibilities - built ONCE at P1, modules NEVER rebuild them:

1. Nav + routes render FROM the module registry: a new module is a new
   folder, zero frame edits.
2. Lazy route mounting per module (TanStack Router code splitting).
3. ONE SSE connection for the whole app - the pod caps connections at
   32, so N modules must NEVER mean N EventSources; the frame subscribes
   once and fans each `families` entry out through a store.
4. ONE typed exec/events client (`/api/mcp/exec`, `/api/mcp/events`
   through the Worker proxy). Modules NEVER add Worker routes; new
   capability = an existing pod tool, or a pod-side verb filed by spec
   (rule 7). The frame is not a second API surface.
5. Shared hooks: `useExec`, `useEvents(family)`, `useTenant`, `useTheme`.
6. Honest-refusal primitive: ONE component renders typed 403/429/
   withheld/E_* states - modules import it, never re-implement it.
7. Tokens-only theming: modules style with Tailwind + brand CSS vars
   (prd-brand.md). No per-module theme code, ever.

Module review checklist (every module, every pass):

- renders what the door filtered (never client-side visibility gating)
- imports ONLY frame APIs (never another module's internals)
- no innerHTML from wire data (6)
- tokens only (no hardcoded palette)

Naming: modules keep plain names; the frame needs none (no forced
cuteness). Boundary note: this frame is IN-dashboard extensibility for
ONE app - it is explicitly NOT the cross-frontend "shared web kit",
which stays barred until a second frontend exists (rule 7).

## 4. The dashboard by identity tier

### Tier O - Observer (read-only; role `observer`)

- Live board: `/api/mcp/events` over EventSource (era open/fold/close,
  agents, tasks, escrow holds/spends, market, forum, msg families)
- Rosters: `agent_list` (tenant-filtered), era list + rollup side panel
  (`msg.eraContext` shapes exist for exactly this view)
- System: `/api/health`, machine `system status` style reads
- No writes of any kind surface here (door refuses them regardless)

### Tier H - Working seat (role `human`; `+write +spawn`)

- All of Tier O
- **Work console**: `work_assign` form (task text, budget, agent spawn vs
  reuse by id, explicit refusals surfaced as checked states); live
  delegation status off the SSE board
- Msg console: tenant-scoped channels (`msg_list` tails, `msg_send`),
  public channels readable (the legacy read rule), own channels claimable
- Market browsing/offering surfaces (read + gated writes)

### Tier A - Agent trust (role `agent`; `+exec`) - deliberate, default-off

- The full 328-tool explorer, generated from `GET /tools` schemas
- P4 phase; the owner said most installs want this rare

### Tier S - Owner/admin seat (the "admin framing")

The seat only staff reach (their guest is scoped with `scopeOwner`, high
trust, or the operator CLI holds admin keys for generation):

- Guest issuance form: role + trustLevel + scopeOwner + expiry; live
  roster with only-last-seen hints; revoke with typed confirmation
- Pairing & onboarding: issue voucher, render QR (H6 UN-HOLDS here -
  scan lands on the dashboard's redeem view; terminal QR still exists)
- Budgets & posture: workspace/escrow budget views, read-budget knobs
  display, auth-posture line display
- Era: close with the `next` sentence (the hand-off the horcrux bakes)
- Config read views (no standing config writes MVP - the pod CLI edits)

## 5. Build phases (each phase = a shippable app increment)

### P0 - Contract + scaffold rules (a SPEC pass, code-size S)

- Deliver the directory contract (2.1) + the Worker proxy contract (3.1)
  as docs (this PRD + `web/dashboard/` scaffold README).
- Acceptance: no app code; only dir skeleton, README, and this PRD
  merged; the lint stack stays green.

### P1 - Observer MVP (Tier O, Mode A)

- `web/dashboard` React+Vite+TS app; Worker functions proxy wired to a
  loopback-allowed pod; blood-shaped data planes only (tools/exec/events/
  health); the live board renders the SSE families with typed-refusal
  surfaces.
- Acceptance: board live against a real pod; refusals render typed;
  zero CORS config; lint+build clean; tokens never land in logs.

### P2 - Working seat (Tier H)

- Work console + msg console (+market read).
- Acceptance: a `human` guest can issue work to a spawned crew agent
  and watch its track through the board; tenant scoping VISIBLE
  (a foreign channel shows as withheld/empty state, stated by name).

### P3 - Owner seat (Tier S) + QR revival

- Guest lifecycle UI + pairing voucher QR flow (deep-link redeem view).
- Acceptance: pair a browser FROM the dashboard without the terminal
  (voucher shown once, hash-at-rest guarantees unchanged); H6 lands
  here (spec inherits `labs` notes from the held discussion).

### P4 - Pod same-origin mode + agent-trust explorer (optional tiers)

- Static bundle serving from the pod (Mode B) - zero-CORS local ops.
- Explorer only if/when an install asks for Tier A.

## 6. Security review (frontend-specific)

- **Tenant truth is server-side.** The UI MUST never gate visibility on
  client-copied filters; it renders what the door filtered. A patched
  client exposing another tenant sees... nothing (the door already
  withholds). This is why the UI stays honest under attack.
- **Token hygiene** (RESOLVED 2026-10-13): MVP = operator pastes the
  vguest_ token per load, never stored URL-side; Worker forwards without
  logging. Worker-side session binding (paste once, Worker holds it for
  the browser session) is the planned P3 upgrade.
- **Payloads arrive sanitized** (H2 list-key allowlist) - the board is
  safe by construction; no innerHTML from wire data EVER.
- **SSE lifecycle**: heartbeat beats + pod connection cap 32; the UI knows
  a revoke kills the stream and renders the honest dead-board state.
- **Freshen, always**: every pass touching a door surface re-checks the
  docs claims here (the pass-215 owner lesson applies to the app).

## 7. Non-goals

- NO backend code in P0. NO new MCP verbs invented for the dashboard
  (that would mean the board needs MORE than the pod gives - file a spec
  instead). NO build tooling in the pod's package.json. NO shared CROSS-
  FRONTEND web kit until a SECOND frontend exists (premature abstraction
  guard) - the in-dashboard module frame (3.3) is explicitly NOT that
  kit; it is the dashboard's own extension surface.
- The lander stays the lander (its only change: the Dashboard link).

## 8. Open questions (owner, when P1 starts) - ANSWERED 2026-10-13

1. Worker-side session binding: RESOLVED - MVP pastes the vguest_ token
   per load; worker-side binding is the P3 upgrade.
2. The dashboard deploy URL: RESOLVED - own Pages project, own
   subdomain (recorded in §2.3).
3. Worker egress policy: RESOLVED owner posture - IP-based allowlisting,
   AND it must refresh after a period. Honest nuance for the P1 plan:
   Cloudflare Worker egress IPs are shared ranges (published, evolving),
   not a single stable IP - so the allowlist targets CF's published
   ranges with a scheduled refresh; a stable-egress alternative (e.g. a
   tunnel from the pod side) is the fallback if range drift bites.
4. Dark mode + brand kit: RESOLVED - labs/prd-brand.md IS the design
   foundation (owner may require updates to it); the dashboard ships
   BOTH dark and light modes (no forced default).

New open item re-parked for P1: the admin-UX tooling pack decision (the
"Ant Design vs other dashboard packs" discussion from mid-2026 did NOT
survive in the repo - checked labs/archive and the designer agent's
notes; only traces are the 2026-08-30 admin-UI prep task and that agent's
stack learn-list of Tailwind/Shadcn/Radix). Re-discussed fresh at P1:
Ant Design vs Mantine vs shadcn/Radix-based kit.

UPDATE 2026-10-13: RESOLVED. The owner recalled the thread's content
(Tailwind + Shadcn + Radix + Framer); the fresh comparison confirmed
that lean over Ant 6 and Mantine 9 and added the periphery (TanStack
Router/Query/Table, zod, Recharts, react-hook-form, Motion). Recorded
in §2.6. The extensibility requirement produced the module frame (§3.3)
- P1 builds it once; modules plug in as folders.

## 9. Success criteria for P1 (the phase the owner green-lights next)

- A real pod is observable LIVE from a browser window through the
  Worker proxy, with NO pod code touched to enable it beyond deploy
  posture (loopback bind stays legitimate).
- Typed refusals (403 guest_denied, 429 throttled, tenant-withheld) are
  user-visible states, not swallowed errors.
- The pod's own suite and lint stack stay green with `web/` present
  (the tree validates that the frontends stay OUT of the pod's require
  graph).
- The module frame (3.3) is live for P1's FIRST module (the live board):
  nav-from-registry, lazy routes, one-SSE fanout, and the refusal
  primitive are all frame-owned before the second module ever lands.
