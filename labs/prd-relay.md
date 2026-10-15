# Vant Web — The Relay & The Sovereign Instance Scope — Product Requirements Document

**Version:** 1.0 (THE DEFINITIVE DEFINITION — supersedes the v0.1/v0.2 planning drafts)
**Branch:** axolotl
**Date:** 2026-10-14
**Status:** Definitive. Every surface, wire shape, refusal code, gate, posture, flavor, rung and acceptance criterion is DEFINED below. Where a thing is specced but not yet built, §11 names its truth-state explicitly — defined, never fuzzy.
**Parent PRD:** [prd-web.md](prd-web.md) (§3.1 reach matrix; this spec EXTENDS Mode A, it does not replace it)

---

## 0. The direction log (owner rulings, recorded so nothing is lost)

1. *(v0.1)* "The dashboard is bigger than us — an OSS means to make relays": any self-hosted instance can reach any install; if one host disappears, another's relay still reaches the pod.
2. *(v0.2)* "Make that real, not like a proto/mvp. The relay mechanism powers the pod connections, and possibly other encrypted tx. It should be a core principle between vant and a front end... or no front end. It's another masterclass in using the vant headless... And it happens to keep the network alive."
3. *(structure)* Solo relay app + dashboard participation toggle; the kit ban lifts as hash-pinned vendoring (the second-frontend trigger).
4. *(pass-229)* "It's important it works, but is gated so not just anyone flows. Relay = encrypted pipes, connecting installs and/or each other. Dashboard = uses those pipes, auths the gates."
5. *(pass-230)* "Baseline works with parity between relay and full dashboard... make sure important relay services work."
6. *(pass-231)* "Users can run a relay on or off in their settings of dashboard... this separation is actually very important to the /web ecosystem."
7. *(ledger)* Passes and pins only — no day-ledger, no fantasy in engineering cycles.
8. *(v1.0)* "Make a fresh prd for relay. We wanna define all" — this document.

---

## 1. The insight + the elevation

brain.creadev.org is not an end point - it is an incident of hosting.
The dashboard had already become "a guest identity with a browser"
(prd-web.md 1); this spec makes the second consequence real: **a
deployed dashboard is "a relay with an explorer."** If brain.creadev.org
disappears, ANY other self-hosted instance can reach the same install,
because the thing that matters - the instance config, the tokens, the
session - is not the relay's; it is the OWNER's, held client-side.

The owner's three founding rulings: (1) **scope split** — the instance
scope moves OUT of relay-side config into the client, encrypted;
(2) **relay chain** — like mesh on the backend, a service layer on the
frontend, with failover named by hop; (3) **relay opacity** — bounded
honestly in §4 (transport-blind, never psychic).

### 1.1 The elevation: the relay is a CORE principle (retires the v0.1 frontend-only scope)

Three structural properties, all three now IN CODE:

1. **The relay is a CONNECTION LAYER, not an app.** The Mode R contract
   is served by the Pages edge functions AND by the pod's headless
   serving posture (`vant relay`, the sibling of `vant headless`).
   Consumers are generalized: browser dashboard, pod CLI, MCP agent,
   another pod. The browser is ONE renderer; "no front end" is a
   supported posture (a chain is a config, not a page).
2. **Encrypted tx is the DEFAULT, not the later phase.** Bodies cross
   hops as AES-256-GCM envelopes; the relay verifies the SHAPE
   structurally, forwards byte-verbatim, holds no channel keys, cannot
   read content. Other encrypted transactions (msg payloads, escrow
   movements relayed verbatim) ride the SAME blind hop.
3. **The relay keeps the network alive.** Every served/refused hop
   emits `relay:hop:served` / `relay:hop:refused` (origin + byte count +
   ms ONLY — never content): the liveness feed the mesh status and node
   registry read. A healthy chain IS a healthy mesh edge, seen from the
   client side.

---

## 2. The scope split (the sovereign instance scope)

### 2.1 Today's scopes, stated plainly

| Scope | Where it lives now | Who can read it |
|-------|--------------------|-----------------|
| App (code) | the repo, any CF Pages deploy | public |
| Edge config | Pages settings (`VANT_PROPERTY_*`, senders) | the deploy owner + CF |
| Identity/accounts | the relay's KV (`BOLETE_KV`): sessions, bound pod tokens, email hashes | the relay operator |
| Pod tokens | bound server-side (`bsess_` records) relaying through the session cookie | the relay operator |

Consequence today: the relay you use CAN reach your install and is a
trust point you cannot verify. That is the single point of failure AND
the trust hole this spec closes.

### 2.2 The new scope: client-held, encrypted, portable

- **The instance profile** (property origins, relay chains, per-instance
  trust posture) lives as an ENCRYPTED profile in the browser
  (IndexedDB), keyed by WebCrypto AES-GCM. Key material is
  non-extractable where the platform allows it (`extractable: false`
  CryptoKey), with TWO documented unlock paths: (a) a passphrase-derived
  KEK (PBKDF2, documented iterations), and (b) a passkey/WebAuthn
  PRF-derived KEK when available. No passphrase/private key EVER
  crosses the wire.
- **Pod guest tokens stay memory/crypto-held** — never in relay KV,
  logs, or cookie values on a relay. Export/import = one encrypted file
  (`bolete-profile.enc`; the horcrux pattern, web scale).
- **What the relay loses**: account/session KV for the sovereign path.
  Users (#13) + email-OTP are the RELAY OPERATOR'S own layer (§6).

### 2.3 The relay's optional pin (onboarding, not ownership)

A hosted relay MAY ship a first-run default profile as an ONBOARDING
convenience: the client imports it on first visit and from then on the
profile is the user's. Omitting the pin is fully supported (blank
doorsteps: same app code, zero instance knowledge). The dashboard-relay
flavor may pin a default; the SOLO flavor pins nothing ([§4](#4-who-can-be-a-relay-the-admission-contract)).

---

## 3. The relay chain

### 3.1 Mechanism

- A chain is an ordered list of relays in the instance profile:
  primary, fallbacks, and the LAST entry is always the pod itself when
  same-origin is possible (Mode B, already shipped) — the dead-last
  local fallback even with zero relays alive.
- The reach loop per property: probe the chain head (status module's
  probe seam, promoted to the chain), advance on failure with a sticky
  "degraded" state the UI states BY NAME — never a silent hop.
- Every relay serves the SAME app bundle and the SAME `/api/*` proxy
  contract; relays differ ONLY in who brought the instance config.

### 3.2 The contract, DEFINED (r/2, the webhook-native wire)

> §3.2's ORIGINAL TEXT described the retired r/1 REST wire (`/api/r/exec`
> + `x-relay-gate`). It is RETIRED below by the pass-236 ruling; the
> r/2 truth follows, then the pass-237 interface-handler doctrine.

Every renderer below (§4) serves these EXACT surfaces. The single
uplift source is `web/kit/relay/relay-contract.js` (+ `.d.ts` twin);
the vendoring script is `scripts/vendor-relay-kit.js` with `.sha256`
pin sidecars; parity is CHECKED, never imported
(`test/relay-parity.test.js` — the pod never requires `web/`).

**Roots:** `POST /relay` on the pod's webhook transport (3467-class) ·
`POST /api/r/relay` on the edge flavors · gate = the route HMAC secret
(`relay.gateKey` / `VANT_RELAY_GATE_KEY`) signed as `X-Signature-256`
over the RAW body bytes · crew-bus envelope shape · body cap 1 MiB.

**The wire (one shape, MANY event families):**

```json
{
  "event": "relay.hop | relay.ride | relay.sync | relay.lost | relay.call",
  "from": "<sender label>",
  "ts": <send ms - freshness windowed>,
  "nonce": "<url-safe unique>",
  "payload": { "...family-specific" },
  "v": { "major": 2 }
}
```

**Ack (the SAME post carries the answer back):**
`{ received: true, event, handlers, dispatched, reply }` — the relay
spends the gate at verification and the pod-realm bearer INSIDE the
envelope at the door; the webapp never munges credentials (the
interface-handler law, §3.3). Transport refusals keep HTTP statuses
(401 unsigned/missigned/stale · 409 replay · 404 route missing · 413
over-cap). Application refusals ride typed replies INSIDE the 200 ack
(`E_RELAY_*` / `E_RIDE_*` / `E_BRIDGE_*` — reasons survive any chain).

### 3.3 The interface handler (pass 237, owner doctrine)

**"Relay = runs independent, minimal always; it runs, it forwards, it
allows others to run; the dashboard keeps certain pipes through it; it
is the interface handler so front OR back don't roll their own
logic."** The formal role map:

| Role | Carrier | Law |
|------|---------|-----|
| server/proxy | `web/relay` solo flavor | minimal always, little UI: runs, forwards, lets others run; holds NOTHING (234 held-nothing pins stay) |
| the auth shaman | the relay face (pod/edge) | the gate secret + the delegated pod access are SPENT BY THE RELAY server-side; clients hand INTENT, never credentials, and never see them |
| ingest / states | `relay.sync` | entries land through the DOOR's existing verbs (`brain_write` / `brain_push` class) — no new planners |
| "im lost" | `relay.lost` | the beacon: door posture truth (`context_heartbeat` / `brain_current` class) answers WHERE the client stands |
| the api bridge catch-all | `relay.call` | any door tool call, auth + tunneling all handled by the relay |
| e2e pipes | `relay.hop` / `relay.ride` | the untouched r/2 core (§2) |

Implemented per flavor BY CAPABILITY: the POD face implements the full
family (it is the endpoint and holds its own channel key for rides);
the DASHBOARD edge implements the bridge through its existing pod
bridge (VANT_RELAY_POD_ORIGIN class env — the edge spends its own
delegated pod access server-side; the browser JS never does); the SOLO
edge implements hop only and says so on its caps page (interchangeable
proxy, minimal always).

The one-way credential law stands: adding bridge families does NOT put
pod credentials INTO relay-coded files that pass-234 pinned — the edge
bridge routes through the edge's existing bridge lib (the pod token
was already authorized there), the solo deploys gain nothing new to
hold.

Every renderer below (§4) serves these EXACT surfaces. The single
uplift source is `web/kit/relay/relay-contract.js` (+ `.d.ts` twin);
the vendoring script is `scripts/vendor-relay-kit.js` with `.sha256`
pin sidecars; parity is CHECKED, never imported
(`test/relay-parity.test.js` — the pod never requires `web/`).

**Roots:** `GET /api/r/capabilities` · `POST /api/r/exec` · gate header
`x-relay-gate` · body cap 512 KiB per side · hop timeout 15000 ms.

**Capabilities (public, no gate, no secrets)** — the posture proof a
client reads BEFORE trusting a hop:

```json
{
  "relay": "r/1",
  "flavor": "headless-pod-relay | dashboard-relay | solo-relay",
  "gated": true,
  "gateReady": true,
  "e2e": "envelope-required",
  "surface": ["POST /api/r/exec"],
  "events": "none (R1: SSE stream-through lands with web/relay)",
  "posture": "<renderer's honest posture lines>"
}
```

When the posture is OFF, `/api/r/*` answers the renderer's raw
404 (`{"error":"Not Found"}`) — an OFF relay has no Mode R surface at
all (pod: routes not mounted; edge: same shape).

**Exec (gated) — success:**

```json
// request
POST /api/r/exec
x-relay-gate: <relay.gateKey | VANT_RELAY_GATE_KEY>
{ "origin": "https://the-pod.example.com", "path": "/api/mcp/exec", "ct": "<hex envelope>" }

// response 200
{ "ok": true, "relayed": true, "status": <upstream 2xx>, "body": <upstream answer, carried verbatim>, "ms": <measured> }
```

**Exec (gated) — every refusal, same code + same status on ANY renderer
(the parity law):**

| Situation | code | status |
|-----------|------|--------|
| posture off (only via direct API; route-missing is 404) | `E_RELAY_OFFLINE` | 503 |
| gated but no gate key set — serves NOTHING | `E_RELAY_GATE_REQUIRED` | 503 |
| hop without the gate header | `E_RELAY_GATE_REQUIRED` | 401 |
| wrong gate credential | `E_RELAY_FORBIDDEN` | 403 |
| body not a JSON object frame | `E_RELAY_NEEDS_ENVELOPE` | 400 |
| hop body not an envelope (plaintext) | `E_RELAY_NEEDS_ENVELOPE` | 415 |
| private/loopback/metadata/unresolvable origin | `E_RELAY_BAD_ORIGIN` | 403 (`ref`: `origin_private`/`origin_scheme`/`origin_malformed`/`origin_host`/`origin_unresolved`) |
| unrooted/unsane path | `E_RELAY_BAD_PATH` | 400 |
| target unreachable/outside posture | `E_RELAY_UPSTREAM` | 502 (`ref`: `upstream_timeout`/`upstream_failed`/`upstream_status`/`upstream_body_cap`/`upstream_bad`) |

Refusal payload shape: `{ ok: false, code, error, ref? , use? }`.

**The gate rule (all renderers):** sha256 BOTH values, compare digests
constant-time (node `timingSafeEqual` / WebCrypto digest + manual
constant-time buffer walk), length never taken from the wire. The gate
credential is SPENT at the gate only — it never rides upstream.

**The envelope law:** `salt(32 hex) : iv(24|32 hex) : authTag(32 hex) :
cipher(hex >= 2)` — lib/encrypt.js's AES-256-GCM fields. SHAPE is
verified structurally; nothing is decrypted at the relay; plaintext hop
bodies refuse, never downgrade. Unique per-send salt+IV defeats trivial
replay; full request-context nonce binding is the pairing-time rung
(§5), named honestly.

**The origin guard:** explicit client-declared origins, https-only in
the public posture; the pod resolves named hosts (fail-closed DNS) and
refuses private/CGNAT/link-local/metadata ranges — the metadata hole
refuses in EVERY posture including the pod's documented lab escape
(`relay.allowPrivateOrigins`, which opens lab/private-range targets,
never metadata). The edge has no DNS oracle: names are verified by
reachability at fetch time (stated ON the caps page, not hidden).

**Config seams (defined, platform-specific):** pod = brain-config keys
`relay.enabled` / `relay.gateKey` / `relay.allowPrivateOrigins` (set via
`vant config set`, docs/reference/config.md); edge = Pages env vars
`VANT_RELAY_ENABLED` / `VANT_RELAY_GATE_KEY` (read at request time,
never code strings).

### 3.3 Failure semantics (the whole point)

One relay down = a degraded hop line in the UI, then the NEXT relay.
The pod is NEVER less reachable than "any relay + direct"; the client
cannot lose its pod connection by someone else's 502. The status module
(catalog #3) gains a chain card: every hop, its probe verdict, the
ACTIVE hop named. (Not yet built: the live chain client — §11.)

---

## 4. Who can be a relay (the admission contract)

### 4.0 The structure: the flavors

```
web/
  dashboard/   <- app 1 (the full explainer) - piggybacks as a relay via env
  relay/       <- app 2 (R1): a PURE relay - anyone hosts it SOLO
  kit/         <- the contract source both vendor from
```

| flavor | renderer | serves | default profile pin |
|--------|----------|--------|---------------------|
| `headless-pod-relay` | `lib/relay.js` on the REST server | the full contract, all-socket-pinned | n/a (pod) |
| `dashboard-relay` | `web/dashboard/functions/api/r/*` | the full contract via the vendored kit | MAY pin (onboarding) |
| `solo-relay` | `web/relay` (R1) | the full contract via the vendored kit | NEVER (nothing to pin) |

Solo reasoning, recorded: smaller honest surface (zero auth/account/
admin surfaces BY CONSTRUCTION — the posture page proves it by
advertising what it DOESN'T have); host diversity in the chain
(availability not coupled to any dashboard's); the relay's operator
keeps only their own install's business — no relay credential exists at
the relay.

Participation is a POSTURE, not a registry: a relay self-describes via
capabilities (caps version, FLAVOR, e2e posture, surface). Connection
is CLIENT-GRANTED: a user adds a relay by decision (profile-fragment
import or a plain URL + their own read of its capabilities page). No
global registry, no mandatory listing — prd-mesh.md is the DISCOVERY
layer if/when owners opt in; until then chains are hand-curated.

Deployment rule (unchanged): one row per app — dashboard = the explorer
+ a relay OPTION; relay = chain hops ONLY, no admin surfaces by
construction.

---

## 5. Trust and secrecy: what a relay can and cannot see (the honest boundary)

| Seeing | interim relay | the core (e2e) posture |
|--------|---------------|------------------------|
| which pod you talk to | yes (origin is on the request) | yes (still needed for the hop) |
| request/response SHAPES + timing | yes | yes (metadata-censored never) |
| body CONTENT | yes (plaintext proxy hop — the interim the ladder sails through) | **no** : client encrypts to the pod's e2e channel key, pod answers encrypted to the client |
| Authorization header (pod token) | yes | the pod-realm credential tunnel: token used at the pod, relay sees a per-relay bearer |

Sequencing law (v0.2 1.1.2): the CORE contract is the e2e column — the
interim content-seeing relay is a migration posture with a named
sunset. Chain entries carry an `e2e`/`plain` badge from the client's
OWN verified capability read; a verified `plain` hop is warned loudly,
every time. The steady state is e2e-by-default for ALL clients
(browser, CLI, MCP agent, pod), not the browser-only special case.

**The pairing-time rungs (defined, in build order):**
1. **Key binding at pairing** — the voucher/QR path of P3 becomes the
   key-binding moment: the e2e channel key is negotiated there, held in
   the sovereign profile (never in relay memory beyond the live session).
2. **Context-nonce binding** — ciphertext binds to the request context
   (origin+path+nonce), verified client-side per hop; refuses replay
   and downgrade by construction.
3. **Receiving-side decode** — the pod's door opens incoming envelopes
   with its channel key (lib/relay `openEnvelope` is already the client
   half of this; the door acceptor is the rung).

   **Rung-3 framing law (pod door, built pass 235):** every door refusal
   answers HTTP 200 with an application-level `{ ok:false, code }` from
   the `E_RIDE_*` family (`E_RIDE_OFFLINE`, `E_RIDE_DECODE`,
   `E_RIDE_REPLAY`, `E_RIDE_DISPATCH`) — refusals are NOT HTTP errors at
   the ride, so their reasons ride back through ANY hop chain with the
   exec hop's verbatim-2xx law untouched. Success answers 200 with
   `{ ok:true, rode:true, ct }` — the door's answer rides back as an
   envelope; anyone between holds ciphertext. Nonce replay binding is
   rung 2-lite: unique per send, TTL-windowed, fifo-capped.

---

## 6. What each module becomes under the split

| Module | change |
|--------|--------|
| settings (#4) | TWO SIDED, never blurred (6.1): the OPERATOR's run-a-relay posture (an env fact - the card reads it, never fakes it) + the USER's reach choice (the usage toggle, persisted non-sensitive pref). Plus the sovereign profile editor: instance origins, chain editor (add/remove/reorder relays, per-hop e2e/plain badge after the verified capability read), profile export/import (encrypted file) |
| status (#3) | chain card per property: hop, probe verdict, ACTIVE hop named |
| mgmt server surfaces (work/chat/forum/market/brains/...) | UNCHANGED - they speak /api/* as shipped; only the hop changes under them |
| users (#13) + email-OTP | RIGHT WHERE THEY WERE SURFACING BEFORE: per-RELAY operator layer (that relay's own deploy); a sovereign-scope user needs none of it |
| pairing (#14) | the voucher moment grows into the e2e key-binding moment (same UI, one more step in the modal) |

### 6.1 The two-sided settings contract (owner direction, recorded: "users can run a relay on or off in their settings of dashboard - the separation is very important to the web ecosystem")

| Side | Whose it is | What it is | Where it lives |
|------|-------------|------------|----------------|
| SERVING ("run a relay") | the OPERATOR of that deploy | whether this deploy piggybacks as a relay - a posture fact the card READS and states | Pages env: `VANT_RELAY_ENABLED` + `VANT_RELAY_GATE_KEY` (pod equal: `relay.enabled` + `relay.gateKey`) |
| USING ("reach my pod by relay") | the USER of the dashboard | whether THIS browser reaches its pod through relay hops instead of direct Mode A/B | the sovereign side: a persisted non-sensitive pref (`bolete-relay-usage`; rides the sovereign profile transport) - the deploy cannot see it, and the browser cannot flip the env |

Laws:
- The usage toggle is REAL and persists immediately (shipped); the
  honesty law holds: while the chain editor and the pairing-time e2e
  keys are not yet wired to the exec path, ON adds INTENT ONLY and the
  UI says so in plain text — nothing fake-routes. What makes it LIVE:
  R2's chain card/editor (the chain the toggle governs) plus the §5
  key-binding rung.
- The posture card names the operator env keys and never offers a
  browser-side switch. A re-read button exists — the card never
  stale-caches its own conclusion.
- OFF is first-class on BOTH sides (a deploy that is not a relay
  serves no /api/r — 404 like the pod; a user who turns usage off is
  simply direct).

---

## 7. Migration

- brain.creadev.org (and any Mode A install) ships BOTH scopes for a
  while: env-var profile onboarding (DEPLOY.md 12.1) imports into the
  client-held profile ON FIRST LOAD; after that the server-side
  override is a fallback only. No flip on day one; the import happens
  BEFORE any data surface renders (the AuthGate seam owns first paint).
- DEPLOY.md carries the relay face: §12.4 names the three postures;
  the operations playbook is docs/operations/relay-playbook.md (serve /
  piggyback / use / verify / troubleshoot).

---

## 8. Non-goals (this spec)

- NO relay-side account store OF THE SOVEREIGN KIND (the scope split).
- NO global relay registry/directory (mesh discovery later, opt-in).
- THE ONE PROTECTED INVARIANT: no changes to the pod's DOOR AUTH
  POSTURE to make relays work (the door keeps serving "any https
  origin's worker" per the host posture table; the pod REMAINS
  loopback/private). The headless serving posture (`vant relay`) is
  core work; the relay layer must never require the pod to expose
  anything it does not already serve.
- NO compute/consensus governance jumps-forward (§9).

---

## 9. The door this opens (recorded, no schedule)

Node compute across the relay mesh (job posting into a chain, escrow
budgets relayed verbatim), cross-dashboard consensus, mesh discovery
feeds the chain. The backend's market/forum/escrow/consensus verbs are
ALREADY where these would hang; nothing lands until big-decision
posture (the owner) says the relay chain has earned it by USE. For the
avoidance of doubt: the elevation moved the relay TRANSPORT into the
core; the compute/consensus verbs ride on top of it and stay exactly
where this paragraph gates them.

---

## 10. Success criteria (P6a / MVP, unchanged)

- The same dashboard bundle, deployed at two unrelated hosts, both
  reach one user's ONE install - and the user's profile rides a file
  export/import between them.
- A primary relay dark-moded mid-session: the client hops within the
  page's breaker cooldowns and the status chip names the active hop.
- Relays that never learn anything: the interim relays demonstrably
  store nothing about BYPASSED users (their own KV shows no
  sovereign-scope rows - tests assert the shape, not the goodwill).
- The pod's auth posture has NOT CHANGED (requireKey/guests deny-by-
  default; a pod's audit shows relay-originated calls labelled by
  their RLS subject exactly like browser-originated ones).

---

## 11. The definition ledger (defined / built / pinned — nothing else is allowed to be named)

| Element | Truth-state | Where |
|---------|-------------|-------|
| The contract (**r/2**, pass 236): the webhook-native wire (HMAC-signed crew envelope, POST /relay, ack-with-reply, typed reply codes), envelope law, caps shape, config seams | **BUILT + PINNED** | `web/kit/relay/relay-contract.js` (+`.d.ts`), vendored copies in both flavors, pins in `test/relay-parity.test.js` (16). **r/1's REST hop face (/api/r/exec + x-relay-gate) is RETIRED.** |
| Pod face (r/2): NO lib/relay module (the owner ruling - banned by the no-legacy guard); intake = the webhook transport (HMAC gate + replay + 1 MiB cap); outbound = lib/network.fetch's own SSRF/DNS walls; envelope = lib/encrypt.js; ride dispatch = the pod's OWN MCP door; boot wiring in startFull/startHeadless; bin/relay.js = the CLI over the face; MCP `relay_status` | **BUILT + PINNED** | `lib/api.js` relay, `lib/webhooks.js` reply/dispatch-hook extension, `bin/relay.js`; `test/relay.test.js` (26, real-socket loops) + `test/no-legacy-bloat.test.js` |
| Dashboard-relay flavor (piggyback, env posture, HMAC edge intake POST /api/r/relay) | **BUILT** (live behavior pinned by parity; edge runtime E2E lands with the LIVE deploy walk) | `web/dashboard/functions/api/r/relay.ts` + `capabilities.ts` |
| UI: operator posture card (re-read) + user reach toggle (honest intent) | **BUILT** | `web/dashboard/src/modules/settings/index.tsx`, `src/state.ts` |
| Kit vendoring + pin gate | **BUILT** | `scripts/vendor-relay-kit.js` (+`--check`) |
| `web/relay` standalone (solo flavor: bundle + page + edge functions, vendored kit, live caps read cross-origin) | **BUILT — pass 233, rewired r/2 (pass 236)** (live-subdomain E2E lands with the LIVE deploy walk) | `web/relay/` |
| `GET /api/r/events` SSE stream-through (solo flavor) | **BUILT — pass 233** (edge shape pinned vs sources 11a-11d; live-stream E2E with the deploy walk) | `web/relay/functions/api/r/events.ts` |
| Dashboard RUNS WITH a relay (the corrected-arc setting: endpoint pref + live caps verify card) | **BUILT — pass 233** (honest today-truth stated: verification live, execution-through-routes with the e2e rung) | `web/dashboard/src/modules/settings/index.tsx`, `src/state.ts` |
| The chain (ordered hops, probe loop, failover naming, chain card #20) | **DEFINED — build rung R2** (the usage toggle governs its chain; live routing waits for this + rung 3) | this spec §3.3/§6.1 |
| Pairing-time e2e rungs (key binding, context-nonce, door decode) | **DOOR ACCEPTOR BUILT + PINNED (pass 235)** — rung 3 + rung 2-lite (nonce replay binding) live in the pod's `handleRide`, walked over real sockets through the mounted relay core with the E_RIDE_* 200-framing law; key binding at pairing stays client-side (R2) | this spec §5; `lib/relay.js` `handleRide`; `test/relay.test.js` block 16 |
| Sovereign profile transport (encrypted profile, export/import) | **DEFINED** | this spec §2.2 |

## 12. Acceptance criteria per rung

- **R0 — DONE (pass 229/230).** Contract rocks: deep-copied constants
  pass parity in both directions; a real mount fires inside
  `listen()`; capabilities over real HTTP carry no secrets; the whole
  gated hop completes over REAL sockets; a wrong gate is 403 no-flow;
  plaintext bodies refuse 415; metadata origins refuse in every
  posture. Pins: 31 + 19.
- **R1 — `web/relay` standalone.** Bundle + functions + page verified
  ALONE at its own subdomain: capabilities answers
  `flavor: solo-relay` with NO default-profile pin; the vendored kit
  passes `vendor-relay-kit.js --check`; `GET /api/r/events`
  stream-through lands and is pinned; the posture page states what it
  does NOT have.
  **Status (pass 233): BUILT.** The app + functions + posture page exist
  and typecheck/build clean; the vendored kit passes `--check` across
  BOTH flavors; the R1 source pins run in the parity suite (35 pins).
  The live-subdomain walk (real deploy, real reach through its caps +
  exec) remains the deploy-walk acceptance, stated honestly.
- **R2 — the dashboard is BUILT ON the pipes.** The chain editor +
  chain card exist; the usage toggle GOVERNS live routing (intent →
  live): with usage ON and a chain of verified hops, the exec path
  routes through chain hops and the status chip names the ACTIVE hop;
  with usage OFF (or zero alive hops) traffic is direct — never a
  silent hop, never a broken reach.
- **e2e rung — the wired default.** Pairing binds the channel key into
  the sovereign profile; the door accepts+decodes envelopes; the
  context-nonce check refuses replays; the ladder's interim posture is
  then genuinely sunset for new chains (verified capability badge turns
  the sunset mechanical). The POD halves of this are pinned (pass 235):
  the ride face opens, refuses replay, dispatches with the bearer kept
  INSIDE the envelope (the pod-realm credential tunnel), and answers
  as an envelope — E_RIDE_* refusals always 200-framed. The client
  half (key binding at pairing) lands with R2.

## 13. Verify it from anywhere

```bash
node test/relay.test.js                       # 38 pins, real-socket hops + the ride face
node test/relay-parity.test.js                # 40 parity/pin pins
node scripts/vendor-relay-kit.js --check      # the checksummed contract
node test/mcp.test.js && node test/relay.test.js   # adjacent contract suites
```

Operational face: [docs/operations/relay.md](../docs/operations/relay.md)
+ the playbook [docs/operations/relay-playbook.md](../docs/operations/relay-playbook.md);
deployment face: DEPLOY.md §12.4; config face:
docs/reference/config.md (pod keys) + DEPLOY.md 12.1 (edge keys).
