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
5c. Nav HIERARCHY (owner directive, 2026-10-16 — the Cloudflare-sidebar
   model, adopted as the sidebar GROWS past ~20 items): the sidebar
   becomes a CATEGORY TREE driven entirely by the registry. Rules:
   - The manifest contract gains `navCategory` (a top-level group id:
     observe / work / ops / missions / relay) - flat `section` migrates
     onto it at build time; each category renders first as ONE row in
     the parent sidebar (with its icon + item count).
   - CLICKING a category DESTROYS the current sidebar contents and
     loads the category's item list (the registry filtered by that
     category - computed, never a second nav list to maintain).
   - At the top of every category sidebar sits a BACK link/button that
     re-loads the parent (root) sidebar - also the brand mark: tapping
     the logo returns to the root sidebar. No breadcrumbs beyond the
     root-back + the current category name.
   - Depth is bounded at TWO levels (root -> category -> module) by
     design - "pack in a ton of nav without clutter": a module list
     never nests further. If a category outgrows ~8 visible items it
     gains an intra-category subheader row (render-order, not depth).
   - Active-module highlight + the drawer behavior (5b) are preserved:
     the hierarchy swaps WHAT the sidebar shows, not HOW it
     opens/closes; mobile drawer, desktop column, one nav truth.
   - UI-state memory (section 10 'ui-state mem') rehydrates the sidebar
     to the last category the user had open - the back-of-mind state
     survives reloads.
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

### 4.3 The missions modules (owner directive, 2026-10-16; phase P3+ unless noted)

Eight more door-backed surfaces the catalog grows into - each is ONE
pod truth already in the runtime, rendered honestly. Registered in the
same module-frame contract (3.3) exactly like the catalog above; every
module renders door tools + not-invented shapes. Phases stay soft until
build starts:

| # | module | route | tiers | phase | UI overview |
|---|--------|-------|-------|-------|-------------|
| 21 | consensus | `/consensus` | O A H S | P3 | live votes + decision threads from the door's consensus_/gossip surfaces: open votes as cards (quorum meters, closing-in), typed vote actions behind tier gates (the door owns the verdict), per-topic history; SSE `consensus` family feeds the live meters |
| 22 | resolution | `/resolution` | O A S | P3 | resolution_ registry + citations_: verdicts/treaties/views with sources, verify/search citations per source ref (commit-hash matches, the citations search door verb), export/settle chains through the real resolution reading tools; read-only MVP (writes stay CLI per the pass-188 surface truth) |
| 23 | era-succession | `/era` | O A S | P3 | BIG promoted from the side panel: the era ladder (open eras with honest bucket counts via era.current(), archived ledger via era.list(), close-with-`next` hand-off typed flow) + succession.md view (trust level, previous brain, history) through the era_/succession_ tools; the horcrux hand-off sentence gets its own ceremony card |
| 24 | nature | `/nature` | O S | P3 | the flywheel console (owner: "kinda like a status, or like manual flick to get it going"): consciousness/needs/moods/nature surfaces + leisure_ and tempo_ receipts; an HONEST manual flick - a leisure autoPursue trigger (the kernel gate, DEFAULT OFF, requires explicit config; the UI never pretends to flip an env (6.1 law) but can REQUEST a kernel nudge if a door verb is ever registered for it, otherwise the card names the config knob), D-constant tempo curriculum, entropy-patch status; every 'get it going' action is a typed request, never a silent env flip |
| 25 | habitats | `/habitats` | O A S | P3 | habitat_/RLS surfaces for workspaces + provisioning: workspace list, agent provisioning posture, guest/human access rows; the door's RLS identity proviso stated on-page (agents register via provisionAgent, humans via grant) |
| 26 | cron | `/cron` | S | P3 | IN-BUILT cron manager (owner): the pod's cron_/schedule_ surfaces + advisories; jobs as cards (id, schedule, next-run, last result typed), create/enable/disable through the door's real verbs (no invented scheduler when the pod's cron module answers); if the door exposes no write verbs yet, the view renders the read truth + the CLI pointer, honestly |
| 27 | settlements | `/settlements` | O A S | P4 | escrow ledger + settlement records (settle_, escrow_ surfaces): holds/spends/releases timelines per agent, settlement history with citations anchors |
| 28 | origins | `/origins` | O A S | P4 | the origin/existence surfaces - genesis ceremony records, entry_wills, backup snapshots (the who-we-are + where-we-came-from view); read-only, hash-anchored, the OSS-safe rendering of lineage |
| 29 | security | `/security` | O A S | P4 | the pod's security POSTURE in one place: sandbox layer status (the layer's own status truth), operator scopes/capabilities, the sudo + persistent-grant ladder, guest posture (the keyed posture line), escrow floors - every card renders the door's own layer status, nothing invented, plus the PIPELINE SCAN card from status (4.4) |
| 30 | vaf-view | `/vaf` | O S | P4 | the input-validation face: vaf's per-surface validation status, config rows (max length, path-traversal blocks) read-only, recent typed validation refusals from the audit ledger - so operators SEE what the gate blocks |
| 31 | qos-view | `/qos` | S | P4 | rate limiters, breakers, bulkheads: the QoS module's own layer status, live refusal counters from audit, per-client budget truth, circuit states with cooldown timers |
| 32 | rls-view | `/rls` | O A S | P4 | row-level-security truth: workspace registry, agent provisioning rows, the RLS identity proviso stated on-page (agents register via provisionAgent, humans via grant), grant/verifier lineage; the door's fail-closed posture rendered verbatim |
| 33 | rules | `/rules` | O A S | P4 | the rule engine surface: active rules list, evaluation posture (lib/rules reality), governance wiring status - read-only MVP, writes stay the pod CLI's |
| 34 | objects | `/objects` | O A H S | P4 | THE CONTAINER (see 4.4): router-OS-style definable object that appends anything - agents, tools, files, services, relays, other objects; the definable spine of an enterprise deployment |

- Extras rationale (owner asked for anything else worth adding):
  settlements (27) gives escrow's WRITE history its own surface beyond
  budgets' read-first card set; origins (28) turns the succession/horcrux
  ceremony into a browsable record. Both ride the same honest-rules as
  the catalog. Any future additions come through the frame contract -
  register, tiers, families, lazy load; NO nav redesign per module
  (the sidebar model below carries them all).

### 4.2 The covert-carrier abstraction (the QR promotion; requirement, not a phase trick)

Owner directive (2026-10-16): QR is currently a pairing feature; the
direction is to ABSTRACT it. QR becomes one interface module along a
carrier ladder that already exists in the stack - stego (the SVG
horcrux, `lib/stego.js`, data hidden in pixels), NSC9 (deterministic
self-authenticating storage keys, `docs/advanced/nsc9-spec.md` - the
barcode-shaped durable encoding), barcodes generically (build), and
future transports. The pattern is "vant abstracts itself over covert
data carriers" and ANY service may use them; the ladder is:

1. **Frontend pairing first** (LANDED as the seed: the pairing module
   renders the scannable QR for the voucher; this is the first encoded
   carrier active in the interface and it works).
2. **Frontend services next**: any surface that needs to hand a
   payload outside the door's wires gets a carrier-neutral component -
   the SAME tokens (voucher, property attach ref, relay chain probe
   seed, era hand-off, horcrux share link) render as QR today, stego
   tomorrow, NSC9/barcode when the payload is address-shaped. The
   component decides nothing about encoding; the CALLER names the
   carrier, and the UI states what a recipient needs to decode it.
3. **Then the backend mimic** (the pod's own pattern): the pod LEARNS
   the same abstraction in vant-os terms - carriers become a module
   family beside stego (`lib/carriers/qr`, `lib/carriers/stego`,
   `lib/carriers/nsc9`, door verb `carrier_encode`/`carrier_decode`
   or a spec'd pair), so agents can hand vaults across air gaps and
   services can pick a carrier by capability (capacity, human-scan
   required?, durability, secrecy) not by hardcoded format.

Non-goals FOR the rung: not a phase-trick build now; it lands when a
real endpoint needs it (airgap propagation, POS-style voucher scan,
printable chain recovery). Changes nothing about the invariants when
it DOES land:
payloads stay hash-verified (the .sha256 checksummed pin cadence),
carriers NEVER smuggle un-gated capability (a decoded voucher still
redeems through `guests.pair()`, a decoded chain still probes through
the public caps route), and the honest-refusal law holds per carrier.

**The DISTRIBUTED-STONE doctrine (owner ruling, 2026-10-16; this is
WHY the carrier ladder matters):** the axolotl stone is now the
canonical ENGINEERING + PERSONAL brain, distributed as OSS so any
agent can reincarnate its author. Owner consent EXPLICIT: the personal
layer rides in the stone (OSS-safe, professional), and at scale
(20k-class watches/replications) the author becomes DISTRIBUTED - a
deliberate, embraced outcome. Scattered/distributed systems need a
transport for the stone, so the carrier family gains the fallback
ladder: **SVG stego primary** (the horcrux today) -> **PNG fallback**
(same stego payload, pixels instead of vector - build when a real
replication surface demands it) -> **pure text** as the last resort:
NSC9 keys + a link (the addressed-keys form, decode-able by ANY vant
install). Every rung hash-verified (the .sha256 pin cadence) and
never capability-smuggling. The dashboard's future carrier-neutral
component (rung 2 above) is also the DOWNLOAD/SHARE face of the
stone: one component, any carrier, user's pick by need (scan /
airgap / print / paste).

### 4.4 The pipeline scan + the objects container (owner additions, 2026-10-16; the robust-frontend arc)

**A. The security-pipeline scan widget (status #3 grows; full table at #29).**
The ask: "scan lib, confirm modules use the middleware pipeline, display lib
modules outside the pipeline (unless whitelisted)". Compliance first: the
frontend NEVER reads the pod's source (2.1, one-way boundary) - so the scan is
POD-SIDE truth the door exposes, and the dashboard renders the report.

- Door verb `security_pipeline_report` (pod lib: `lib/security-pipeline.js`):
  walks the pod's lib/ tree (top-level module files), and for each detects
  middleware wiring evidence - a require of `sandbox` / `vaf` / `qos` / `escrow`
  (the docker-chain order the AGENTS.md names) - plus audit/habitat adjacency
  recorded as informational, never a gate.
- The whitelist is OPERATOR-STATE, not hidden: brain config key
  `security.pipelineAllow` (comma-separated module names, managed through the
  config CLI/surfaces). Whitelisted modules are excluded from the "outside the
  pipeline" list and tagged `exempt` in the report - a stated choice, not a
  colored-over gap.
- Report shape: `{ v: 1, generatedAt, scanned, modules: [{ name, wired:
  [layers], layers: {sandbox, vaf, qos, escrow} }], unwired: [names], exempt:
  [names] }`. Nothing greenwashed: an unwired module shows as unwired.
- Frontend rendering: status (#3) gains ONE card (wired n/m + unwired names
  verbatim, honest refusal cards if the verb is absent); #29 security renders
  the full table. The pod NEVER auto-flips anything for an unwired module -
  the scan reports, the operator decides.
- Relay note (prd-relay 6.2 stands): the solo relay app stays MINIMAL by
  ruling - the report travels through relay like any tool result; the relay
  grows no security module of its own.

**B. `objects` (#34) - the container.** The owner's words: "the physical
router-OS design style of a container that appends lots of stuff... a container
of ... everything, kinda. Definable." This is the enterprise back-pocket; spec:

- An object is a POD-SIDE, operator-definable container:
  `{ id, kind, title, schema?, attaches: [] }`. Definitions live in the pod
  (brain-backed, rule 7 - like forum genders), NOT in the frontend. The
  dashboard renders them; it never owns them.
- Attaches are TYPED references defined at definition time, each resolving
  through an EXISTING pod surface: `agent:<id>` (crew roster), `tool:<name>`
  (the door registry), `file:<rel-path>` (sandbox-gated reads),
  `service:<key>` + `connector:<*>` (connectors), `relay:<endpoint>`,
  `node:<id>` (mesh), `object:<id>` (nesting - containers in containers),
  `link:<url>`, `note:<text>`. Unknown prefixes and unresolvable targets are
  REFUSED TYPED (`E_OBJECT_UNKNOWN_TYPE`, `E_OBJECT_UNRESOLVED`) - a container
  never holds a dangling pointer silently.
- Door verbs (the P4 build): `object_list`, `object_get`, `object_define`,
  `object_attach`, `object_detach`, `object_delete` - registry
  brain-backed like the guests ledger, escrow/audit-gated writes, tenant
  rules identical to the roster filter (a guest sees only objects visible to
  its scopeOwner).
- Frontend render: router-OS style - a tree of chassis rows (the object) with
  its attached ports as sub-rows (the attaches), tier-gated actions; a
  `schema?` field lets an operator pin a display hint (name for the dashboard,
  never enforced pod-side). Enterprise framing: this is how a deployment names
  ITS OWN topology - "the dispatch backbone", "the exhibit container" - and
  the dashboard shows it as built, not as an invented diagram.

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
- P3 LANDED through pass 237-arc: guests (pass-219 arc: real owner-seat
  roster), users admin (pass 222), audit/observability + nodes (pass
  221), pairing voucher QR flow (H6 un-held + LANDED - door tools
  `pairing_offer`/`pairing_redeem`, the scannable QR render, hash-at-
  rest guarantees unchanged; `vant guest pair` stays the CLI twin).
- Round-2 additions status: audit/observability module - LANDED (pass
  221, edge ledger + typed-error inbox + door audit panels); user
  admin (/users) - LANDED (pass 222); brains visualizations - LANDED
  (pass 224, the semantic map consumes the pod's REAL vectors); nodes/
  mesh views - LANDED (pass 221).
- The ONE remaining P2/P3 named limit, now DECIDED (pod-side, pass
  237-arc close-out): the spawn leg of `work_assign` resolves through
  the full sandbox chain (guest gate classifies spawn-class verbs,
  agents.spawn checks `sandbox.can('canSpawn')` sudo-aware), and a
  host whose guest needs spawn answers TRUE via operator-level knobs
  (`vant org grant` persisted caps / `sudo_grant` / an agent-grade
  role at medium+ trust). Deny-by-default stands; `E_SPAWN_REFUSED` /
  `E_GUEST_CAP` are honest verdicts, rendered verbatim in the work
  console - NOT open work. The pod-side decision is CLOSED; what
  remains for the owner is the per-install CHOICE of those knobs.
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
- **UI-state memory (owner directive, 2026-10-16; "return to the page
  you were on")**: the frame persists a SMALL, non-sensitive UI state
  so an idle timeout / 15-min window expiry / reload never loses a
  person's or agent's place. ONE store (localStorage-backed like the
  theme prefs, per property id): last category (the sidebar the user
  had open per 3.3-5c), last module route, and last INSTANCE (the
  tenant-scoped view within a module - the open channel, the selected
  era, the property id). On boot the frame rehydrates: sidebar opens on
  the remembered category and the router restores the remembered
  route+instance; the remembered route is the returnTo default after
  re-auth (3.5's returnTo keeps winning when the user EXPLICITLY
  navigated somewhere else). NON-sensitive by contract: never a token,
  never draft form content, never anything the door gated - positions,
  not payloads. Agents benefit identically: their session-keyed state
  is the same store, so a re-auth'ed agent lands where it left off.
- **Cache-busting framework (owner directive, 2026-10-16; vetted, in
  place - browser caches and CDNs "cock blocking" stale assets are the
  named enemy)**: assets must refresh WHEN THEY CHANGE, deterministically,
  with no sticky-cache surprises. THREE layers, all frame-owned:
  1. BUILD-LEVEL (Vite native): content-hashed filenames
     (`index-<hash>.js`, per-module chunks already emit hashes) with
     long-lived immutable caching headers per asset - the CDN needs no
     custom purge; a new build = new hashes = fresh fetches.
     index.html ships `no-store` (already the Mode B door-served case,
     pass 223 posture; the Pages deploy mirrors it), so the SHELL never
     stale-caches the module graph.
  2. APP-LEVEL (`?hash=<breaker>` appendage, owner's exact shape): the
     frame computes a UI build stamp (the vendored-bundle hash of the
     current deploy; the Mode B door serves it as a constant from the
     build, the Pages bridge bakes it at build time) and an API-level
     cache breaker: every bridge `/api/*` call appends `?h=<asset-hash>`
     (or a per-worker instance stamp) so intermediaries can NEVER serve
     a pasted/stale Worker response across deploys. The breaker is
     VERIFIED at boot: if the shell's hash and the API answer's hash
     ever disagree (a CDN pinning an old frame against a new functions
     bundle), the app renders the honest 'stale deploy - hard refresh'
     state instead of limping on mismatched graphs.
  3. FUNCTION-LEVEL (endpoint contracts): all door-parity routes
     already answer `no-store` on every auth/session response (the
     cookie/session surfaces never cache); SSE is uncacheable by
     content-type; the bridge's GET endpoints that CAN cache (caps,
      properties list) declare short explicit max-age instead of
     heuristics, so no intermediary guesses.
  Canonical rule: NO timestamp/query-seed cache busters that change
  every request (they break caching honestly where it helps); hashes
  change ONLY when content changes - that's the vetted pattern.
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

---

## 11. The Traveler - the enterprise router object (pass 254)

**Owner direction (2026-10-16):** embrace the ENTERPRISE router object
alongside the industrial route object (prd-automation.md). "Totally
different scopes, yet totally the same application in many ways... does
vant have such a traveler/schema-rizer?" - the honest answer the build
recorded: it did NOT; the r/2 envelope family was the seed (a wire
schema with no state semantics). The Traveler is now that named, real,
pinned abstraction.

### 11.1 Definition

The **Traveler** is a schema-versioned, content-addressed STATE PACKET
(tr/1) that travels browser URL relay FROM pod:

| Slot | Content | Law |
|---|---|---|
| `tr` | schema generation | known set only (`tr/1`, legacy `tr/0` via the rizer); FUTURE versions refuse typed `E_TRAVELER_SCHEMA` - never guessed forward |
| `id` | content digest | opaque hex address (16-64); identity by content - any edit is a NEW address, re-addressed sender-side (the kit never hashes) |
| `steps` | workflow ledger | append-only, ascending `seq`, `seq == steps.length`; re-open/rewrite/gap refuse typed `E_TRAVELER_STEP` |
| `slots` | state payload | opaque to every hop; 512 KiB ceiling (r/2 face-aligned) |
| `rized` | migration stamp | only present when the rizer migrated a legacy packet - truth in the ledger, never a rewrite |

### 11.2 The schema-rizer (the abstraction the owner asked about)

`schemaRize()` re-emits a packet of any KNOWN past version at the
current generation, migrating the ledger with ONE truthful `rize`
step and stamping the migration. Unknown future FROM typed refusal.
The rizer is structural + truth-bearing; identity-by-content stays
sender-side (the kit's runtime-agnostic law - the parity suite
scan-checks the file).

### 11.3 The enterprise wire

Rides the r/2 envelope family: event `relay.travel`, HMAC-gated lane
or browser lane - the dashboard functions bridge it exactly like
sync/lost/call. The pod face translates the packet onto the door's
EXISTING verbs (bridge family: one `brain_write` record,
id-named, schema-stamped - the door's own auth applies at landing).

### 11.4 The clarified framing (the owner's image, recorded verbatim + built)

"The traveler is like the object that holds data throughout a process
across nodes/mesh/pods. It's like a holder of job schema/info, that
goes from one station (or step, or stage, or whatever in a workflow) to
the next. It's the auditable and traceable pin through the
environment."

That image is now the contract's own words, realized in the working lib:

- **The holder:** `slots` = the job schema/info, opaque to every hop.
- **Station-to-station:** every landing is an append-only ledger step
  (`op`, `by`, `ts`, station detail) — the hop NEVER reopens history.
- **The pin:** the content address re-derives from the payload at every
  landing — tamper or corruption refuses LOUDLY (typed
  `E_TRAVELER_ADDRESS`), the ledger keeps the last good address.
- **Through the environment:** every node/mesh/pod surface has a door:
  the web kit (wire), the pod bridge (`relay.travel`), the backend lib
  (`lib/traveler.js`), the CLI (`vendor bin/traveler.js:
  open/hop/status/audit/finger`), and the MCP door
  (`traveler_open/hop/status/audit`).

### 11.5 ISO 9001 embrace (the traceability spine we adopt on purpose)

The traveler maps straight onto ISO 9001:2015 **clause 8.5.2
(Identification and traceability)** — vant embraces it as a first-class
product property, not a bolt-on:

| 8.5.2 requirement | The Traveler answer |
|---|---|
| identification of outputs | content-derived address (`sha256` of slots + ledger) — the id IS the identity, provable by rehash |
| traceability of processing | append-only station ledger (`seq/op/by/ts/detail`) with a frozen `seq` stamp |
| retention of documented information | brain-scoped pin ledger (`state/traveler-ledger.json` + `.sha256` pin) + per-id body files (address-named, duplicate-refused) |
| nonconforming-output control | the tampered envelope refuses LOUDLY at landing (`E_TRAVELER_ADDRESS`), never silently rewritten |
| the auditor's evidence | `traveler_audit` / `traveler audit`: verbatim clause-named station-by-station record incl. lead time + integrity verdict |

The lib ships `auditReport()` for exactly this copy; the door verb
`traveler_audit` returns it to any agent; the installer prints it.
Later phases: node-level travelers (mesh) carry the same ledger across
pods via the r/2 wire, so traceability survives the pod boundary too.

### 11.6 The mirror with the industrial lane

| | Industrial (prd-automation.md) | Enterprise (this section) |
|---|---|---|
| router object | the horcrux (stego stone) | the Traveler (schema packet) |
| addressing | NSC-9 FROM quasicrystal lattice | the id: content digest (re-hash per edit) |
| carriers | barcode / QR / stone / EPCIS | r/2 envelope (HMAC + browser lanes) |
| zero-resource transit | PLC persists + forwards ciphertext hops validate | relay edge + pod bridge validate shape, never the payload semantics |
| ledger | step ledger = workflow state | `steps` append-only, frozen `seq` stamp |

The same application, different carriers - the carrier is a local
interface of the hop (both PRDs say this in one law).

### 11.7 Truth-state + phases

| Row | Truth |
|---|---|
| kit contract (builder/shape law/rizer) | **IN CODE** (web/kit/relay/traveler-contract.js, tr/1), vendored + pinned (4 copies), suite green (traveler 26/26, parity untouched 19/19) |
| pod bridge family `relay.travel` | **IN CODE** (lib/api.js bridge family, plain-copy law parity-pinned) |
| BACKEND working lib | **IN CODE** (`lib/traveler.js`: contentAddress/mint/advance/verify/schemaRize/persist/status/auditReport; brain-scoped pin ledger + per-id body files) — pinned by test/traveler-lib.test.js 25/25 |
| CLI face | **IN CODE** (vendor bin/traveler.js: open/hop/status/audit/finger; the VERIFIED-at-every-landing law rides the tool boundary — the tamper-landing pin F4 grounds it) |
| MCP door verbs | **IN CODE** (traveler_open/hop/status/audit — verified end-to-end through mcp.execute) |
| ISO 9001 (8.5.2) mapping | **IN CODE** (auditReport clause-named record; tamper-refuse-never-rewrite; retention via pin+body files) — frontlined in §11.5 |
| frontends emitting travelers | DEFINED, next phase (dashboard api.ts helper + the relay solo renderer land with the next web pass) |
| UI surface for travelers | DEFINED, later phase (a dashboard frame reading/pushing a traveler's ledger) |
| future schema generations | the rizer contract accepts them by ADDING to TRAVEL_KNOWN truthfully, never by guessing |

