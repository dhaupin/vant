# Vant Web — Dashboard & Frontend Architecture — Product Requirements Document

**Version:** 0.3 (planning draft - build starts P1)
**Branch:** axolotl
**Date:** 2026-10-13
**Status:** Draft v0.3 (owner-approved direction + directive rounds 1, 2, 3; round 3: Base UI is the only primitive base - zero occurrences of the old library name in this document - themed error/404 pages required)

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
  relay/                <- app 2 (P6, prd-relay.md 4.0): the PURE relay,
                           hostable SOLO without the full dashboard
  kit/                  <- the shared-kit SOURCE + vendoring pins (P6;
                           the cross-frontend ban lifts ONLY here - apps
                           never read each other's sources, only hash-
                           pinned vendored kit copies)
  <next-app>/           <- app 3: whatever the project needs later
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
  frontend builds. The relay (app 2, P6) deploys as its OWN Pages
  project (relay.creadev.org per the owner subdomain pattern).
- The lander gains ONE new link "Dashboard" that points at whatever
  deploy URL the dashboard project gets (static link only; no build
  coupling).

### 2.6 The stack (owner direction + 2026-10-13 turf comparison)

Owner direction: the mid-2026 admin-UX thread leaned Tailwind, a
shadcn-style kit, and a minimal-motion layer (-"
not saying we need them all, but all could help"). That lean SURVIVES
the comparison - and it gains a named periphery:

- **shadcn/ui (CLI v4)**: copy-in source components; ships Recharts-v3-
  based charts (`shadcn add chart`); registry/CLI ecosystem.
- **PRIMITIVE BASE (owner directive, rounds 2+3): Base UI, ONLY Base
  UI.** Base UI (from the Floating-UI/MUI creators) is stable 1.x and
  is shadcn's supported base today; it is the ONLY headless-primitive
  source this frontend targets (owner round 3: no second base, no
  fallback library). If a primitive is missing, it gets built
  frame-owned rather than pulled from another library.
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

> (P6 draft, 2026-10-14) The scope-split direction: the INSTANCE scope
> (property origins today in `VANT_PROPERTY_*` Pages vars, bound tokens,
> accounts) moves CLIENT-SIDE, encrypted - hosted dashboard deploys
> become INTERCHANGEABLE relays in a user-held chain, so one relay going
> down never severs a pod's reach. The dedicated spec:
> [prd-relay.md](prd-relay.md) (P6a scope split + Mode R relay proxy +
> P6b end-to-end channel; phases below unchanged until P6 starts).

### 3.1 The reach matrix

| Mode | Where the app runs | How it reaches `3457` | CORS | Status |
|------|--------------------|-----------------------|------|--------|
| A. Worker proxy (PRIMARY) | Cloudflare Pages (a `web/dashboard` project) | Pages **Worker Functions** proxy `/api/*` to the pod's MCP door over the network | none needed (same-origin) | planned P1 |
| B. Pod same-origin (FALLBACK) | static bundle served BY the pod | direct `/mcp/*` | none needed (same-origin) | SHIPPED P4 (opt-in, OFF by default) |
| C. Direct cross-origin | dev workstation | direct | REQUIRES the MCP-door CORS grant (not built today) | dev only |

- **Mode A is the recommended primary** for the owner's cloud posture:
  the Worker holds network egress to the pod, the pod can stay bound to
  loopback/private, and the browser never talks to the pod directly -
  the Worker is the single authenticated bridge. (`lib/server.js`
  already proves the CORS-block pattern, but "no CORS at all" is the
  cleaner posture than any grant.)
- The Worker proxy contract (in the Pages project's `functions/`):
  - `GET/POST /api/mcp/exec` -> pod `POST /mcp/exec` (auth header forwarded)
- **Mode B, shipped (P4)**: `mcp.serveWeb` (`vant config set`) or env
  `VANT_MCP_SERVE_WEB`, value = a frontend dir whose `dist/` build exists
  (e.g. `web/dashboard`); the MCP door then serves that bundle at `/` and
  the browser calls `/mcp/*` directly. Honest defaults: OFF until set; a
  configured-but-unbuilt dir serves NOTHING with a warning, never a guess;
  static GETs ride the door's own deny chain (host guard, origin guard,
  EW4 rate) - not a second, weaker surface; dot-led segments and anything
  resolving outside the bundle are refused; unknown routes fall back to
  index.html (the client router owns its 404s). Pins: `test/pod-serve-web.test.js`.
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
5b. Nav presentation (AMENDED 2026-10-15, owner-approved after the live
   preview — described FROM the shipped frame): ONE nav truth (the
   registry), two presentations. A burger button in the top bar toggles
   BOTH: ≥sm shows/collapses the static sidebar column (open by
   default, `w-44`); <sm slides the same nav in as a left overlay
   drawer (open by default CLOSED — mobile viewport economy), with a
   dimmed backdrop tap-to-close and module taps closing the drawer.
   Drawer state resets on reload from viewport width (no persistence).
   There is NO <select> fallback module picker — the drawer IS the
   mobile nav.
6. Honest-refusal primitive: ONE component renders typed 403/429/
   withheld/E_* states - modules import it, never re-implement it.
7. Tokens-only theming: modules style with Tailwind + brand CSS vars
   (prd-brand.md). No per-module theme code, ever.
8. Route fallback + error boundaries (owner round 3): a THEMED 404 page
   for unknown routes, plus per-module error boundaries that render
   themed typed-error states with recovery paths - never a raw stack
   trace inside the app (full spec: section 10 Error pages).

Module review checklist (every module, every pass):

- renders what the door filtered (never client-side visibility gating)
- imports ONLY frame APIs (never another module's internals)
- no innerHTML from wire data (6)
- tokens only (no hardcoded palette)

Naming: modules keep plain names; the frame needs none (no forced
cuteness). Boundary note: this frame is IN-dashboard extensibility for
ONE app - it is explicitly NOT the cross-frontend "shared web kit",
which stays barred until a second frontend exists (rule 7).

### 3.4 Multi-install: properties + context switching (owner, round 2)

Terminology, kept consistent below (source: labs/prd-mesh.md + the node
registry): a **pod** is one vant install serving its MCP door. A
**node** is an install registered in the mesh's node registry for
consensus/gossip - every node is a pod; not every pod joins the mesh.
The **mesh** is the set of N pods federating over the signed bus. In
dashboard vocabulary, ANY attached install (mesh-joined or not) is a
PROPERTY - the switcher is over pods, with mesh discovery feeding the
list later (last bullet below).

The dashboard manages MORE THAN ONE Vant install. Each attached install
(mesh and node attachments included) is a PROPERTY, and the shell gives
you a context switcher across them:

- Property registry is CONFIG, not code: CF Pages env vars defining
  `VANT_PROPERTY_<ID>_NAME` and `VANT_PROPERTY_<ID>_ORIGIN` (the pod
  MCP origin this project's Worker functions proxy to). One deployed
  dashboard = N properties, set entirely in Pages settings (3.7).
- The active property rides the URL (`?p=<property-id>`), so switching
  context keeps route, module, filters, and view position: switching
  away from property A's forum lands you in property B's forum, same
  shape. Module stores key their state per property.
- Auth is per property: each install has its own pod guest identity;
  the session (3.5) holds one token per property after binding.
- SSE discipline: ONE EventSource per ACTIVE property; switching closes
  the old stream before opening the next (the per-pod connection cap of
  32 still applies per pod).
- MVP attach = manual (env registry). Mesh/node DISCOVERY feeding the
  property list is a later branch; the nodes module reads discovery
  data from the pod tools in the meantime.

### 3.5 Login + accounts (owner round 2): email OTP - YES it is required

- Dashboard accounts are a SEPARATE layer from pod guest tokens.
  Login = email + OTP code (6-8 numeric digits, ~10-minute expiry,
  single-use), sent by email. RESEND support with a cooldown and an
  attempt budget. Codes stored HASHED; the identifier is a hashed
  email; no plaintext PI (the phrase owner cares about) beyond what
  email delivery itself requires.
- Account/session store: a Cloudflare KV or D1 binding, configured in
  Pages settings - never in code (3.7). Minimal tables: accounts
  (id, email-hash, role admin|viewer, status), sessions, otp codes.
- Email sending: a provider-agnostic sender interface inside the Pages
  functions (plain HTTPS fetch to an env-configured endpoint + key).
  Catalog check 2026-10-13 returned no direct provider recommendation
  (orchestration wrappers exist, e.g. Knock's free tier, but add a hop
  for one OTP template); the concrete pick happens at P2 build time.
- **P2 build-time decisions, RESOLVED (2026-10-14):**
  - Account store: **KV**, binding name `BOLETE_KV` (Pages settings;
    zero code strings) - codes and sessions get native TTLs and the
    aggregate map stays tiny; a D1 swap is a one-file change later if
    an install prefers SQL. Facts: codes hashed sha-256 with a per-code
    random salt; email stored as a hash (deployment salt env
    `VANT_EMAIL_SALT`, recommended); role admin|viewer with the FIRST
    verified account bootstrapping admin; verify attempts capped (5)
    and the request side cooldown-toned (60s).
  - Sender: the provider-agnostic interface SHIPPED with a first-party
    Resend path (`RESEND_API_KEY` + `EMAIL_FROM` -> api.resend.com,
    fetch-only, no SDK - no orchestration hop) and a generic fallback
    (`EMAIL_WEBHOOK_URL` [+ `EMAIL_WEBHOOK_TOKEN`]) so ANY provider
    remains one env-swap away. Nothing configured returns a typed
    `E_EMAIL_UNCONFIGURED` 503, never a fake send.
- The paste-token MVP (Q1) remains the FALLBACK for local installs
  without email config. Worker-side session binding ARRIVES WITH
  ACCOUNTS at P2 - pulled forward from P3, since the session layer
  gets built for it anyway. Paste-token persistence (AMENDED 2026-10-15,
  owner-approved after the live preview): the pasted token persists to
  per-tab `sessionStorage` (key `bolete-token-<property>`; rehydrated
  once on gate mount; wiped on sign-out via the clear action). Tab close
  still ends it; NO `localStorage`, no cross-tab copy — the tab remains
  the device boundary for the paste fallback. The r/2 note: a page does
  NOT hand the token to a relay; the bridge intake's browser lane
  carries intent only (prd-relay.md §3.3), auth spent server-side.
- Pod identities stay the pod's model (3.2); /users admin manages
  dashboard accounts (module catalog 4).

### 3.6 Edge hardening (owner round 2): WAF, QoS, circuit breakers, defense in depth

The pod's deny-by-default chain gets an edge twin - layered, never
duplicated:

- **WAF**: Cloudflare managed + custom WAF rules on the zone, shaped to
  this app's routes - configured in CF settings, zero code (3.7).
- **QoS at the edge**: per-session rate budget in the Worker functions
  (a mirror of the pod's EW4 posture; the door remains the authority),
  request-size caps, content-type pinning.
- **Circuit breaker** per property: N consecutive pod failures open a
  breaker - typed 503 + an honest dead state with retry-after; a
  half-open probe recovers it. NO silent retries on exec POSTs
  (idempotency is not owned by the Worker).
- **Session hygiene**: httponly + secure cookies, CSRF tokens on
  dashboard-auth POSTs, strict CSP (no inline), HTTPS-only, no token in
  any log (6).
- **Defense in depth, stated plainly**: edge WAF -> function
  auth/session -> POD DOOR AUTH (the guests authorizer, unchanged) ->
  sandbox capabilities inside the pod. Four independent deny-by-default
  layers; the UI never assumes any one of them failed quietly.

### 3.7 web/<app> self-containment + Cloudflare config (owner round 2)

- EVERYTHING the frontend needs lives inside its `web/<app>/` folder:
  `src/`, `functions/` (the Pages Worker functions incl. the 3.1 proxy
  contract), `package.json`, configs/README/Deploy notes. Nothing the
  frontend needs lives at the repo ROOT.
- **NO wrangler strings in code**: every Cloudflare value (property
  origins, email sender keys, KV/D1 bindings) lives in PAGES SETTINGS
  as env vars / bindings. Code references binding NAMES only, and the
  repo ships only `.example` templates for any frontend config - real
  values are per-deployment.
- The pod's `package.json` stays untouched (rule 7) and the require
  graph stays one-way: the frontend never requires the pod (2.1).

## 4. The module catalog (every route the frontend ships)

Identity tier map (WHO sees what; the door still gates the DATA -
presentation only, per 3.3): O observer (role `observer`, read-only) |
H working seat (`human`; writes +spawn) | A agent trust (`agent`;
deliberate, P4) | S owner/admin (scopeOwner / high trust) | ALL =
logged-in dashboard users where the data itself is tenant-filtered.

The shell is NOT a module: nav + property switcher (3.4) + help layer
(10) + footer (10) + login gate (3.5) are frame-owned and everywhere.

| # | module | route | tiers | phase | UI overview |
|---|--------|-------|-------|-------|-------------|
| 1 | live-board | `/` | O A S | P1 | SSE family feed (era open/fold/close, agents, tasks, escrow, market, forum, msg), era rollup side panel, filter chips per family; the honest dead-board state when a stream dies (6) |
| 2 | agents | `/agents` | O A S | P1 | roster cards with tenant filtering; agent detail drawer (capabilities, budgets, last-seen) |
| 3 | status | `/status` | ALL | P1 | health cards: this frontend's build/page health, each Pages function endpoint, and per property the pod's `/health` + node registration; breaker state chips (3.6) |
| 4 | settings | `/settings` | ALL | P1 | theme (dark/light/dim system), help-layer toggle, property list (attach/manage notes), sign-out; relay sides live here (prd-relay.md 6.1): the operator's run-a-relay posture card (reads the deploy's capabilities; names the env keys) + the user's reach toggle (through relay hops / direct, persisted pref; honest about what it drives today) |
| 5 | login | `/login` | pre-auth | P1 | paste-token gate (MVP); becomes the email-OTP flow at P2 (3.5) with resend + cooldown UI |
| 6 | terms / privacy | `/terms`, `/privacy` | ALL | P1 | static pages + footer links (10; content per 10 legal paragraph) |
| 7 | work | `/work` | H S | P2 | work console: `work_assign` form (task text, budget, spawn vs reuse by id), live delegation status off the board, explicit refusals as checked states |
| 8 | chat | `/chat` | H S | P2 | msg console: tenant-scoped channel sidebar, `msg` tails, public channels readable, own claimable; era-context chat WITH AGENTS lives here (H3 shapes) |
| 9 | forum | `/forum` | O A H S | P2 | topics + decision threads (tenant-scoped); votes/writes render honest gate states for tier O |
| 10 | market | `/market` | O (read) H (write) | P2 | skills/offerings browse; offer forms behind gate states |
| 11 | audit | `/audit` | S | P3 | the frontend's OWN logs + typed-error inbox (10); per property, views of the pod's audit ledger and event observability via read tools |
| 12 | guests | `/guests` | S | P3 | guest lifecycle: issuance form (role + trustLevel + scopeOwner + expiry), roster with only-last-seen hints, revoke with typed confirmation |
| 13 | users | `/users` | S | P3 | dashboard-ACCOUNT admin (3.5): emails, roles admin/viewer, disable; distinct from pod guests |
| 14 | pairing | `/pairing` | S | P3 | voucher issue + QR (H6 un-holds here); scan/deep-link lands on the redeem view |
| 15 | budgets | `/budgets` | S | P3 | workspace/escrow budget views, read-budget knobs display, auth-posture line |
| 16 | config | `/config` | S | P3 | config + posture views, read-only MVP (the pod CLI owns writes) |
| 17 | nodes | `/nodes` | O A S | P3 | node registry + mesh status through pod tools; later: mesh discovery feeding property attach (3.4) |
| 18 | brains | `/brain` | O A S | P3 | corpus browser (brain read/list/search tools); TWO visualizations: the semantic memory map (NOW consuming the pod's REAL vectors - `vant_search_semantic` withProjection answers a deterministic seeded 2D embedding projection, query-anchored, consumed fail-closed; neighborhood zoom stays on the path) and the NSC9 view (automation-addressed storage keys per [nsc9-spec](/advanced/nsc9-spec) - deterministic self-authenticating addresses); both read-only |
| 20 | chain | `/chain` | ALL | P6 | the relay chain card (prd-relay.md 3.3): hops + probe verdicts per property, the ACTIVE hop named; settings holds the editor, this route reads it; the e2e/plain badge per hop as the e2e core rung lands (prd-relay.md v0.2 1.1.2) |
| 19 | era | side panel | O A S | P1 | era list/close with the `next` sentence (the horcrux hand-off) lives as the live-board side panel + an S-tier action, not its own route |

Later-stage additions (not yet routed; recorded so they are not
forgotten): the full Tier A tool explorer (P4, generated from
`GET /tools`), and the workbench below (P5).

### 4.1 The workbench (P5 - vibe coding, deliberately LAST)

Owner throw (round 2): a way to chat with agents and effectively VIBE
CODE through the dashboard, leveraging the pod's GitHub connections -
aspirationally on par with OpenHands-class coding platforms. Design
sketch, phase P5 (after the platform surfaces are stable):

- Same work console lineage (`work` module grows): task trees with
  live session streams; per-task agent seat.
- GitHub-backed loop: issue -> assign -> watch the agent's branch,
  diffs, and PRs through the pod's sync/connect surfaces; approvals
  stay HUMAN (the seat), execution stays the pod's.
- Chat is the interface: `chat` (module 8) carries the session UI; the
  workbench adds artifact views (diffs, run logs, PR cards).
- Honest scope note: parity with platforms built on long-running sand-
  boxes is a PROGRAM, not a phase trick - P5 lands the loop (task ->
  branch -> PR -> review) and grows from real usage.

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
- Round-2 additions land here too: the module frame LIVE (3.3) with
  nav-from-registry; catalog backbone modules 1-6 (live-board, agents,
  status, settings, login-as-paste-gate, terms/privacy); the property
  switcher skeleton (3.4, one property MVP); the single loading/modal
  systems + help layer (10); the every-page footer with the do-follow
  creadev.org plug + terms/privacy links (10).
- Acceptance: board live against a real pod; refusals render typed;
  zero CORS config; lint+build clean; tokens never land in logs.

### P2 - Working seat (Tier H)

- Work console + chat/msg console (+market read).
- Round-2 additions land here too: EMAIL-OTP LOGINS (3.5) with resend
  + cooldown + hashed codes over a KV/D1 binding; worker-side session
  binding (pulled forward from P3 - the session layer ships with it);
  the property switcher goes multi (3.4) once sessions hold per-
  property tokens; edge QoS + breaker polish (3.6).
- Acceptance: a `human` guest can issue work to a spawned crew agent
  and watch its track through the board; tenant scoping VISIBLE
  (a foreign channel shows as withheld/empty state, stated by name).

### P3 - Owner seat (Tier S) + QR revival

- Guest lifecycle UI + pairing voucher QR flow (deep-link redeem view).
- Round-2 additions land here too: audit/observability module (the app's
  own logs + per-property pod views); user admin (/users); brains
  visualizations (semantic memory map + NSC9 view); nodes/mesh views.
- Acceptance: pair a browser FROM the dashboard without the terminal
  (voucher shown once, hash-at-rest guarantees unchanged); H6 lands
  here (spec inherits `labs` notes from the held discussion).

### P4 - Pod same-origin mode + agent-trust explorer (optional tiers)

- Static bundle serving from the pod (Mode B) - zero-CORS local ops.
- Explorer only if/when an install asks for Tier A.

### P5 - The workbench (vibe coding; spec in 4.1)

- Task tree + live session stream + GitHub-backed branch/PR loop with
  human approvals. Sits on the work + chat modules; grows from real
  usage, not from a big-bang build.
- Acceptance: one real task shipped branch -> PR -> merged FROM the
  browser, with the seat (human) approving every write.

### P6 - The relay chain + the sovereign instance scope (spec: prd-relay.md)

- Scope split first (P6a): instance config moves client-side encrypted
  (WebCrypto; profile export/import), relays become interchangeable
  (Same bundle + the generic /api/r/* Mode R proxy, now CORE-served:
  edge functions AND the pod's headless `vant relay` posture, per
  prd-relay.md v0.2 1.1), the chain fails
  over with the ACTIVE hop named in the UI. The pairing-time e2e
  channel is no longer an era after P6a - it is CORE ladder work
  (ciphertext bodies end to end), closing the "relay saw the body"
  boundary stated in the spec.
- Acceptance: two unrelated dashboard hosts reach one install for one
  user; the primary relay dies mid-session and the client hops
  (status chip names the hop); relays stay demonstrably
  content-blind in P6b growth and store NOTHING about non-signin
  sovereign users from day one (P6a).

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
  instead). NO build tooling in the pod's package.json. The shared
  CROSS-FRONTEND web kit ban (2026-10-13) LIFTS for P6 (prd-relay.md
  4.0): web/relay is the trigger's second frontend, so web/kit/ exists
  ONLY as the hash-pinned vending source for surfaces that must be
  byte-identical across relays (the /api/r contract client, chain probe,
  chain fragments, brand tokens/footer/help primitives); a kit-pin
  mismatch is a LINT failure, never a runtime "close enough". The
  in-dashboard module frame (3.3) is still NOT that kit; it is the
  dashboard's own extension surface.
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
notes; only traces are the 2026-08-30 admin-UI prep task). Re-discussed
fresh at P1: Ant Design vs Mantine vs a Tailwind+shadcn kit.

Round-2 ADDITIONS to this list (owner, 2026-10-13):

5. Email sender for OTP: provider-agnostic interface (3.5) stands;
   pick the concrete provider at P2 build time (catalog found no
   direct-provider recommendation on the ask date).
6. Account store binding: KV vs D1 - decided at build time, either tab
   is zero-code-strings (3.7).
7. Workbench depth (4.1): which agent-coding loops reach parity first
   (issue-driven branch/PR is the sketch's answer; owner may reorder).

UPDATE 2026-10-13: RESOLVED. The owner recalled the thread's content
(Tailwind + shadcn kit + minimal motion); the fresh comparison confirmed
that lean over Ant 6 and Mantine 9 and added the periphery (TanStack
Router/Query/Table, zod, Recharts, react-hook-form, Motion). Round-3
owner call: the primitive base is Base UI ONLY. Recorded in §2.6. The
extensibility requirement produced the module frame (§3.3) - P1 builds
it once; modules plug in as folders.

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

## 10. Cross-cutting UX + platform requirements (owner, round 2)

These apply to EVERY module; modules never re-implement them (the
frame owns each one once):

- **Theme**: modern, clean, extensible; MOBILE-FIRST responsive design
  (phone widths are the design baseline, desktop extends). prd-brand.md
  tokens carry both dark and light modes. NO heavy transitions or
  animations - Motion appears only where it is functional (state
  changes you could otherwise miss), never decorative.
- **Help system**: a global help layer; a help icon on every confusing
  control, setting, input, and surface, styled with tooltip primitives
  explaining it in plain language. Copy lives close to the thing it
  explains. Toggle: settings.
- **Loading**: ONE loading system everywhere - skeleton shapes for
  panels, one spinner accent, progress bars for long operations; every
  async surface declares its loading / refusal / dead states; no
  ad-hoc per-module spinners show up in review.
- **Error pages (owner round 3)**: themed handlers everywhere, all
  frame-owned: 404 for unknown routes; 5xx/network-off when the API is
  unreachable; the breaker-open dead state (3.6); and a generic app
  error boundary page. Every error surface uses honest copy plus its
  recovery paths (re-login, retry, the status module) - no apology
  fluff, no scare copy, and the prd-brand voice applies even when
  things are broken.
- **Modals**: ONE modal system (Base UI Dialog behind the frame) for
  confirmations, forms, and detail drawers; escalation-grade actions
  (revoke, close, restore) always use typed confirmations.
- **Encryption / transport**: everything is SSL-terminated at the edge;
  the pod stays loopback/private behind the Worker; no plaintext hop
  anywhere; strict CSP (6). Gated, authed APIs are the only shape the
  frontend knows how to call (3.1, 3.5).
- **The frontend's own logging, audit, and errors**: the app keeps a
  capped function-side audit ledger of its own (auth events, refusals,
  breaker states) and renders a typed-error inbox; beyond that it
  exposes views of the SAME classes from attached properties (module
  11). Failures are never silent on either side.
- **Footer (every page, no exceptions)**: a do-follow plug for
  https://creadev.org plus terms and privacy links. The footer is
  frame-owned so a module cannot drop it.
- **Terms + privacy pages**: real pages rendered in-app from static
  content, laying out honestly: open-source software, NO WARRANTY,
  no liability for data loss, PII leaks, or WHAT the agents do; use
  at your own risk; no data sharing by this dashboard itself. Legal-PRD
  calibration with LEGAL.md's posture happens at P1 (the lander and
  the dashboard must not contradict each other).
- **Status module**: monitors frontend build health, Pages function
  endpoints, and each attached property's pod + mesh node healths
  (module 3).
- **Cross-linking**: the header/footer cross-link to the repo docs
  (vendored README sections first); NEW repo docs sections for the
  frontend are a LATER deliverable and must not block web work (the
  docs gates stay scoped to docs/ + labs until then).
- **README / AGENTS / DEPLOY updates**: the repo's front-door docs get
  the frontend contract: README (a dashboard pointer), AGENTS.md (the
  require-graph rule: pod never requires web/, web apps never require
  the pod; where frontend work is allowed to live), DEPLOY.md (a
  first-class section: how to set up and run the frontend on Cloudflare
  Pages - env vars in Pages settings, functions contract, zero
  wrangler strings).
