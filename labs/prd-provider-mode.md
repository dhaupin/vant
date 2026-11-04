# Vant Web — Provider Mode: brain.creadev.org as the Community Face — Product Requirements Document

**Version:** 0.4 (planning draft — defined, NOT built; §10 names every truth-state) **Branch:** axolotl  **Date:** 2026-11-02  **Status:** Draft, fourth owner pass recorded in §0 (ruling 15). The envelope is SET — owner configured the full provider surface in the Pages panel the same session (gate, slots=100, per-user=1, grace=48, connector keys, `BOLETE_KV` bound); DEPLOY.md §12.5 documents it. Open questions: **zero**. This spec DEFINES the provider-mode rung; nothing in it is built on any branch yet. **Parent PRDs:** [prd-web.md](prd-web.md) (§3.5 session binding, §3.7 origin env) and [prd-relay.md](prd-relay.md) (the relay chain, the sovereign scope, the ride machinery this mode rides).

---

## 0. The direction log (owner rulings, recorded this session)

1. *"brain.creadev.org is operating as a 'service' to the community, as a relay, but also so folks can explore their own vant install."* — the mission statement. The dashboard's default posture (one env-configured pod behind it) is the WRONG default for the multi-owner service face.
2. *"We have 2 choices... Allow users to set their own pod url, or encode pod url into vguest. I think it's easier to encode url into vguest? Maybe not lol."* — the two named options, weighed in §2. The owner's "? Maybe not lol" instinct is honored: the encoded-URL option is REFUSED, with receipts.
3. *"Either way there should be like an env or something that can be set to explicitly allow this, like provider mode or something."* — the gate law: provider behavior is an OPERATOR'S env fact, never a on-by-default shape change.
4. *(session conclusion, owner-approved)* The third path wins: **the pod dials out; the browser rides** — provider mode = a pairing-code REGISTRATION gate that opens per-guest property slots, reusing the already-built pairing + ride machinery. No user-typed pod URL ever reaches the edge.
5. *Naming, owner-ruled:* the gate lives in the relay family — `VANT_RELAY_PROVIDER_MODE` (ruling on the earlier `VANT_PROVIDER_MODE` draft), and the slot cap follows: `VANT_RELAY_PROVIDER_SLOTS`.
6. *Slot scoping, owner-ruled:* it is BOTH, enforced at both levels — an install-wide ceiling (`VANT_RELAY_PROVIDER_SLOTS`, total live member slots) AND a per-account ceiling (`VANT_RELAY_PROVIDER_SLOTS_PER_USER`, default **1**). Answered in §3.6 with the squatter/forget-squatter rails.
7. *Slots ride the import, owner-ruled:* *"they would — the profile transport already carries chain + keys + tokens... a slot id's presence should ride along anyway — yes I guess."* Moved from open question to RULED (§3.7 pins the mechanism and the dedup law; PM4 tests it).
8. *Accounts are REQUIRED, owner-ruled:* *"It should be locked to accounts right to avoid abuse, and enforce the VANT_RELAY_PROVIDER_SLOTS."* Slot acquisition is impossible signed-out. This flips the v0.1 non-goal that said "NO account requirement" (§7 records the flip honestly).
9. *Auth shape, owner-ruled:* *"We don't wanna store passwords, we can use the 'code was sent to email' style."* — email one-time-code sign-in, NOTHING password-shaped in any KV row. §3.8 defines it.
10. *Mail handlers, owner-ruled:* bolete gains a mail-handler layer with a CONNECTOR style — the handler is an interface, each mail vendor is a connector — first connector **Purelymail** (the owner's own mail domain), second **Resend** as the backup. *"Resend is like a backup option, we will use purelymail (if they allow it)."* — the "if they allow it" question is ANSWERED in §3.9 with receipts (they allow transactional mail; the catch is transport, not policy).
11. *Transport sequencing, owner-ruled with condition:* Purelymail FIRST — *"can we use the cf pages workers functions for smtp? Pretty sure we can. If so we should do purely mail first"* — and the condition HOLDS (§3.9's receipts verified this session): `connect()` from `cloudflare:sockets` is an official Workers runtime API (docs updated Oct 2026), SMTP named among its supported protocols; Pages Functions run the same workerd runtime, so the Pages function reaching `smtp.purelymail.com:465` implicit TLS is in-contract. Sequencing (a) wins: purelymail ships FIRST, resend stands behind it as the connector-chain backup. Honest receipt kept for build day: the STARTTLS-on-587 path has an open flakiness issue in workerd — the connector builds on port 465 `secureTransport: "on"`, NOT 587.
12. *Per-user cap, owner-confirmed:* `_PER_USER` default **1** stands (owner set it in the Pages panel the same hour). The open question is closed — default ships as 1.
13. *Install-wide slots, owner-declared:* the community face runs `VANT_RELAY_PROVIDER_SLOTS=100` (owner set it in the Pages panel; 32 remains the shipped default for an operator that didn't tune it). Capacity math at 100 (§3.6): comfortably inside the free tier.
14. *Sender identity, owner-ruled:* From = `hello@creadev.org`, admin alerts to the same mailbox ("hehe"). In DEPLOY.md §12.5 names: `EMAIL_FROM` (REUSED from the P2 email face, not renamed) + `EMAIL_ADMIN_TO`; the purelymail app password mints at purelymail → Users → App Passwords, SMTP scope, and lands as two Pages secrets (`PURELYMAIL_SMTP_USER`, `PURELYMAIL_SMTP_APP_PASSWORD`) — yes, plain Pages vars/secrets, never code.
15. *Reap grace, owner-ticked:* `VANT_RELAY_PROVIDER_GRACE_HOURS = 48` — owner set it in the Pages panel the same session ("sounds like a plan!"), closing the LAST open ruling: the 12h keepalive write threshold × 4 tolerated missed windows is the law; 72h retired. Owner also set `EMAIL_ADMIN_TO` AS TYPE SECRET — fine and noted (the connector reads it identically; Text vs Secret is panel hygiene, and the address lands in recipients' inboxes either way). The envelope is COMPLETE: resend + purelymail keys set, `BOLETE_KV` bound — provider mode has zero remaining configuration before its first build wave.

## 1. The problem this closes (real, live-diagnosed 2026-11-01)

Today a visitor pasting a `vguest_` token at brain.creadev.org cannot reach anything:

| Live fact (probed) | Consequence |
|--------------------|-------------|
| `podOriginFor()` reads only `VANT_PROPERTY_<P>_ORIGIN` (web/dashboard/functions/lib/bridge.ts:17) | a pasted token is forwarded to the OPERATOR'S pod, whose guests ledger never saw it — the token is valid somewhere else and dies here |
| brain.creadev.org answers `503 VANT_PROPERTY_LOCAL_ORIGIN is not configured` on `/api/mcp/exec` + `/api/mcp/tools` | today no pasted token can work there at all — even a token minted on the intended pod |
| `GET /api/auth/session` answers `503 E_STORE_UNCONFIGURED (BOLETE_KV)` | no accounts, no email OTP, no server-side token binding — the primary AuthGate lane is inert |
| Guest ledgers are per-install and never sync (`lib/guests.js`, by design) | "bring a token minted on YOUR pod" can only mean: the dashboard must reach the pod the token belongs to |

Underneath all four sits one structural reason: **property ids name ENV-CONFIGURED origins** (the single-tenant posture). Provider mode inverts it for the community face: **a paired guest IS its own property**, and reach comes through the pod's outbound relay posture — the machinery prd-relay.md already built for exactly this topology.

## 2. The refused option, recorded with receipts (URL-in-token)

Encoding the pod's URL inside the `vguest_` token was considered and REFUSED:

1. **Two concerns, two lifecycles, one string.** A token is a credential (rotate/revoke/expire — the denylist-backed #185 seam). A locator changes on every tunnel restart and port shuffle. One string fails silently: a stale URL inside a still-valid token is indistinguishable from a lying dashboard, and both sides rot in different directions.
2. **NAT reality beats the convenience.** The community user's pod runs on a laptop or a home box. `http://192.168.1.34:3467` is unreachable by a Cloudflare Pages edge no matter where the URL is written. The public-HTTPS-pod minority is served TODAY by the direct lane; the majority needs outbound dialing — which is what the relay face already is.
3. **Shape churn across every parser.** `vguest_<id>_<secret>` is pinned in `lib/auth.js` (`/^vguest_([a-f0-9]{6,32})_/`), `lib/guests.js`, the dashboard edge intake (512-cap + `startsWith("vguest_")`), the OS packs (`vant-brain` pins the exact regex in a test), `DEPLOY.md` and the docs. A third segment versions the wire across pod, edge, relay and packs at once — for a feature the pairing flow gives for free.
4. **Self-declared origin is an abuse surface.** A token that carries an origin turns every guest into a source of edge-forwarded requests to arbitrary hosts. The lane it unlocks is refused anyway (below).

Recorded so six waves from now nobody re-proposes it.

## 3. The chosen mechanic: provider property slots from a pairing voucher

### 3.1 The gate (operator side, one env fact, relay-family name)

- `VANT_RELAY_PROVIDER_MODE = 1` — the ONLY env key for posture. Absent → today's dashboard, byte-identical: env-only properties, no registration UI. Set (on the dashboard-relay flavor ONLY) → the registration surfaces exist and the edge accepts provider property ids.
- It is named in the public capabilities shape (`GET /api/r/capabilities`) as `"provider": "offering"` — clients adapt from caps, never from a guess. OFF posture omits the key entirely (the honesty law prd-relay.md §4 lives by: an OFF posture has NO surface).
- The gate is NOT a bank vault: provider mode opens REGISTRATION, never arbitrary forwarding. The edge's bridge stays env-origin-only (`VANT_PROPERTY_*`); the ONE-WAY credential law stands.
- **Co-requisite, owner-ruled (ruling 8):** provider ON makes `BOLETE_KV` REQUIRED (accounts gate every slot). The gate without the KV is a misconfigured posture: caps still say `provider: offering`, but the registration panel answers a TYPED refusal (`E_STORE_UNCONFIGURED`, the honest 503 already built) — never a silent dead button.

### 3.2 The member flow (user side, four steps, no public URL typed anywhere)

1. **Sign in** (an account is required — ruling 8). First visit: type an email, receive a one-time code, type the code, done (§3.8). The session is the existing prd-web.md §3.5 server-side binding — no cookies carry anything sensitive, no passwords exist.
2. **Request a voucher.** The dashboard's provider panel (visible only under the gate, only signed-in) mints a single-use pairing code — `vhpair-` family, hash-persisted, 24h expiry (the existing `offerPairing`/`pair` law: "a voucher, not a standing credential").
3. **Redeem on YOUR pod.** `vant guest pair --code vhpair-...` (the shipped CLI verb) — redemption is single-use, timing-safe, marks the pod's pairing spent, and (relay posture armed) the SAME reply carries the e2e channel key for the profile — shown once, beside the token, never again through any door or caps surface (the P3/H6 reply contract already built in lib/mcp.js).
4. **The pod dials out (Mode A), and a provider property slot opens.** The pod's webhook transport opens its outbound lane to the relay; the edge HOLDS NOTHING sensitive — the e2e channel key rides inside the user's sovereign profile export path as designed (prd-relay.md §2.2). The slot's property id is minted by the redeem, not chosen by the user: `p = g<guest id hex>` — kebab-charset-safe by construction (`g` + `[a-f0-9]{6,32}`, honors the existing ROUTE_RE and readPropertyFromUrl charset). Collision-free without a signup database; a pod re-pairing after revocation mints a fresh id honestly.

### 3.3 The lanes under provider mode, named in lastRoute

| Lane | Who forwards | Truth |
|------|--------------|-------|
| `sealed-ride-e2e` | the pod itself (outbound session) | PRIMARY: works for NAT'd pods; the edge relays ciphertext; the inner bearer inside the envelope is the door authority (prd-relay.md §5 law, already pinned) |
| `direct` (public-HTTPS pods) | the browser | the ONE edge-free lane; signing exists because the pod's own door aliveness answers |
| `own-edge-bridge` | the edge, env origin | UNCHANGED: the operator's own default property (`local`), the operator's tokens, the env martini mode — provider changes nothing here |

A brand NEW edge-forwarded lane ("edge dials a user-named origin") is **defined as refused** — the §2 ruling applied at the forwarding layer. If the community shows a real need for edge-forwarded reach to publicly-HTTPS member pods, it comes back as its own gated spec with an origin allowlist and a bind-time token-possession handshake. Nothing in this PRD builds a bridge toward arbitrary networks.

### 3.4 Where pod tokens live under provider mode (scope-split honest)

Unchanged from prd-relay.md §2.2: **memory/crypto-held, client-side** — never in relay KV, never in logs, never inside cookie values on the relay face. Under provider mode the edge additionally holds only account-shaped provider state, all row-shaped and scoped:

- the slot row: `{ slotId (g<hex>), acctId, createdAt, keepaliveAt, revokedAt? }` — PII-free (an id and timestamps; the ACCOUNT store is the only row that holds an email, §3.8);
- the voucher rows and the one-time-code rows (§3.8: code rows hold only the code HASH routed to the acctId, TTL-bounded).

Side note, revised for ruling 8: the voucher does not grant a profile — **the ACCOUNT grants the voucher; the voucher grants the slot.** The KV-backed layers therefore stop being optional UNDER provider mode (§3.1's co-requisite); for pure operator use (own-edge-bridge only, VANT_RELAY_PROVIDER_MODE unset) the deployment needs stay exactly as prd-web.md defined them.

### 3.5 What an account is (build-time shape, PII-honest)

- One row per account in BOLETE_KV: `{ acctId, email, createdAt, lastLoginAt }`. The email IS stored here — this is the ONE deviation from the "append PII-free" ledger law of prd-web.md, and it is pinned here deliberately: the account store is its own KV namespace, separate from the guest ledger and the slot ledger; nothing slot-shaped ever references the email, only `acctId`. No profile data, no preferences, no third-party identity — an email and a server side session binding, nothing else.

### 3.6 Slot caps + the squatter rails (owner ruling 6, answered)

**Both levels, both enforced:**

- `VANT_RELAY_PROVIDER_SLOTS = 32` (DEFAULT) — the install-wide ceiling: total live member slots across all accounts. Above it, registration refuses with a TYPED message ("this deployment's provider quota is full"), not a spin. The breaker honors it venue-wide like every other limit. The community face runs `100` (owner-declared, ruling 13).
- `VANT_RELAY_PROVIDER_SLOTS_PER_USER = 1` (DEFAULT) — the per-account ceiling. One pod per account by default; an operator may raise it for members who genuinely run several pods, but the default makes slot-farming need one verified email EACH. Fungible email signup inflation is bounded by (a) one code at a time per email (§3.8), (b) code-send rate limits, and (c) the perish-axis rails below — anonymous slot-vandal math just does not close anymore.

**Squatters and the "I set it up and forgot" person (owner's stated worry):** a slot is LEASE-SHAPED, not a fixture:

| Rail | Mechanic | Receipt |
|------|----------|---------|
| A slot dies with its dial | the only thing keeping a slot live is the pod's own outbound keepalive; past a grace window, the slot is reaped at the edge — it falls out of the property list and stops being counted against BOTH caps. | grace = the keepalive WRITE cadence × tolerance, not raw dial beats (see the capacity math below; 48h LAW, ruling 15) |
| Reaping is edge-scoped, graceful | the reap deletes ONLY the edge-side slot row; the pod keeps its guest ledger and token untouched. The member re-pairs later and a fresh slot mints honestly — same pod, new id, no "stranded ghost" state | the reap must never call pod doors — the edge has no authority to mutate a member's pod, and takes none |
| Self-service cleanup | the provider panel lists YOUR slots (acctId-scoped) with creation times; a DETACH action revokes the pairing and frees the slot immediately (pod-side, the CLI verb `vant provider detach` closes the outbound session too) | panel-side: refusal-honest; never pretends a detach propagated that hasn't |
| Self-repair beats ghost-parking | nobody must re-register a dead slot's id — a re-pair mints a fresh one. No repair requests, no operator tickets for leftovers | leas-shaped state needs no janition by design |
| Squat-vandal math closes | account gate + per-user default 1 + both caps + reap + venue-wide rate limit/breaker (existing `VANT_EDGE_RATE_PER_MIN` + per-property breaker, applied venue-wide to provider slots) | the operative answer to owner's "how do we prevent squatters" |

**At the cap ARRIVAL:** when the install-wide cap is full, the queue answer is an honest WAIT or the typed full-refusal — never a queue that silently promises. The panel shows `slots: yours 1 of 1 · deployment 31 of 100` (owner-declared cap) so the family of numbers is visible. The cap NAME rides NOTHING (turning any family var off is a one-line env change).

**Capacity math at the declared 100 slots (the "how many users can CF Pages free take" ruling):** reap grace is throttled by the KV WRITE budget, not by slots. A free Workers account has ~1,000 KV writes/DAY — SHARED account-wide across the Creadev Pages family — so the edge writes a slot's keepalive row no more often than every 12h (a beat arriving sooner only refreshes a local timestamp; the row rewrite gates on the threshold). At 100 slots that is ≈200 writes/day for the whole keepalive face, plus single-use voucher/code/session writes for a handful of sign-ins — a fraction of the shared budget. With the 12h write cadence, a reap grace of ≥4 missed windows is the flapping-safe zone: 48h (RULLED — ruling 15) survives any pod that sleeps nights AND any normal weekend-away, while a dead pod still frees itself inside two days. Read lane: sessions/slots read per dashboard hop — thousands of reads/day against a 100k/day free read budget: no constraint. STRONGEST truth: slot count is NOT the binding constraint on the free tier — the Boxes-wide shared KV WRITE budget is, and 100 slots fits; raising past ~300 live slots wants the write threshold raised (18h+) or the KV paid plan, which is a two-line change when a family stage arrives. Fixes all documented here because the owner's Second-ruling worry ("free-takeability") deserves the shape in print, not a hunch.

### 3.7 Cross-device: slots ride the sovereign profile (owner ruling 7, RULED)

They ride — the export already carries chain + keys + tokens; the slot id is part of the chain's `own` hop shape, so it rides the transported profile. BUILD-TIME claim, pinned for the PM4 rung: the slot row rides the profile transport under its provider hop (never requires re-pairing to be signaled capability); IMPORT stamps the slot with the SAME acctId (it carries its own); a slot carried in a profile never needs re-pairing on the second device or any new mint. The dedup law: an import whose carried slot row matches an existing row updates it, never doubles it.

### 3.8 The account lane: email-code auth, NOTHING password-shaped (owner rulings 8–9)

- **First visit:** the AuthGate's account lane asks for an EMAIL only. "We sent you a code" screen. Code: 6 digits, TTL 10 minutes, SINGLE-use, consumed at verify, hash-only in KV (code rows: `{ codeHash, acctId, expiresAt }`). Resend-throttle: 1 active code per email, and a per-email + per-IP send budget (existing rate-gate posture, generous for a human, unspeakable for a loop).
- **No password exists anywhere.** No password hash, no reset flow, no "strength meter" module. A code that was never stored in plain, TTL-bounded and single-use REPLACES the password concept for the family of auth we ship here.
- **Session:** the existing prd-web.md §3.5 server-side binding under this account — the AuthGate's successful code-verify is just another branch of the flows it already types.
- **Envelope dirty math check:** the account lane rides the same KV as session-token binding — at brain.creadev.org today this lane answers `E_STORE_UNCONFIGURED` 503, meaning provider ON also answers with it (§3.1's co-requisite). Deploys that carry accounts but not provider mode change NOTHING except the panel going away.

### 3.9 The mail handlers: a connector interface, Purelymail first, Resend backup (owner ruling 10)

- **The interface, vendor-blind:** bolete (the dashboard edge) speaks to ONE interface: `sendMail({ to, subject, text })` — text-only OTP and system notices, no HTML tracking pixels, no templates to fiddle. The connector REGISTRY is an ordered list read from env (`VANT_RELAY_MAIL_CONNECTORS = purelymail, resend` — fail through to the next connector at each failure, and after the last connector, the typed refusal "code could not be sent" — never a fake "sent"). One OTP send = one attempt chain that is honest end to end (each connector response recorded on the attempt row, provider name + verbatim status code + retry count). Keys are Pages env ONLY: `Purelymail/ SMTP-app-password || RESEND_API_KEY` from Sites → Secrets, never client-visible, never in repo files (the key-handling law).
- **Env names ride the EXISTING P2 email face (DEPLOY.md §12.1), nothing invented:** the connector chain env is `VANT_RELAY_MAIL_CONNECTORS` (new, e.g. `purelymail, resend`); the sender From is `EMAIL_FROM` (the P2 var, REUSED — owner-ruled to `hello@creadev.org`, ruling 14); admin alerts get `EMAIL_ADMIN_TO` (new, same mailbox "hehe"); resend's credential is the existing `RESEND_API_KEY`; purelymail's credential is the pair `PURELYMAIL_SMTP_USER` + `PURELYMAIL_SMTP_APP_PASSWORD` (both Pages Secrets) — the owner mints the app password at purelymail → Users → App Passwords, SMTP scope (their docs' "SEND ONLY SERVICES" guidance: a compromised value can send, never read).
- **purelymail (connector #1, shipping FIRST — ruling 11):** SPEAKS SMTP at `smtp.purelymail.com:465` (implicit TLS). **The "if they allow it" ruling question is ANSWERED with receipts:** there is NO HTTP send API (the REST surface is account-management only — verified from the docs index and the API's operation list), and SMTP is the only send-in door — but their own ToS and homepage explicitly allow transactional mail ("you can generally send transactional related emails to customers"), and their own docs define "SEND ONLY SERVICES" with an SMTP-scoped app password — an OTP service is that exact shape. Rate ceiling: ~3,000 external sends/day, 300 at once — thousands of slots' worth of headroom. **The catch is transport, not policy** — and the transport is ANSWERED (ruling 11): `connect()` from `cloudflare:sockets` is an official Workers runtime API (docs updated Oct 2026; SMTP named among supported protocols; Pages Functions run the same workerd runtime), so connector #1 talks SMTP bytes over the socket INSIDE the Pages function. Honest build-day receipt kept: the STARTTLS-on-587 path has an open flakiness issue in workerd — build on port 465 `secureTransport: "on"`, not 587, and the first PM-A wave must prove ONE live send through BOTH sockets paths in CI-less sanity before the panel ships.
- **resend (connector #2, the backup):** plain HTTP — `POST https://api.resend.com/emails`, `Authorization: Bearer <RESEND_API_KEY>`, JSON `{ from, to, subject, text }`, verified sender domain. Works with only a `fetch()` from a worker — landed and hard in one wave. Free tier: 3,000/mo, but 100/day — a fine BACKUP, thin as a permanent primary.
- **Domain coherence:** both connectors share the operator's mail domain (the From edge is `EMAIL_FROM` — one var, both connectors), the MX for incoming is already on purelymail.

---

## 4. Risks + rails (each: threat, rail, where the rail already exists)

| Threat | Rail |
|--------|------|
| Voucher replay after expiry/refusal | single-use, timing-safe, 24h expiry rejected plainly (the existing pair() law) |
| Property-slot squatting on ids | ids are MINTED from guest ids at redeem, not user-chosen; a guest forfeiture/rotation mints a fresh slot honestly |
| Squatting accounts to farm slots | the account gate (ruling 8) + `..._PER_USER` default 1 + both caps + the reap rails (§3.6) close the math |
| Forgot-my-slot pollution (owner's own worry) | lease-shaped slots: dead dial past grace = reaped against BOTH caps, panel lists/detaches (§3.6) |
| Relay-side credential capture | scope split: the e2e key rides INSIDE the sovereign profile; the voucher is consumed at the pod, not held at the edge |
| Credential stuffing / code brute-force on the CODE lane | 6-digit code TTL 10 min + 1-active-code/email + per-email+per-IP budgets + timing-safe verify (§3.8); the account lane gains the same typed-refusal on abusers |
| Code could not be sent = NO LOOK | typed refusal after the LAST connector; on-failure relay-state recorded with the provider + verbatim code; user can retry (resend-throttled); the "fake sent" = a UI face banned by prd-web.md's honesty law |
| Purelymail deliverability | their docs note that unusual sending domains sometimes hit the snag; the CONNECTOR chain (Resend #2) is the rail — exactly what the backup exists for |
| After the OWN address/premise is deemed unverified/spam-prone by an upstream | the perk of a swapped-out connector: the STORE step stays, the transport impl swaps when the owner rules |
| Hammering the relay via member pods | the existing rate gate (`VANT_EDGE_RATE_PER_MIN`) and the per-property breaker (already in bridge.ts) apply VENUE-WIDE to provider slots — a bad actor's pod gets its own breaker trip |
| A revoked guest's slot going stale | revocation is denylist-backed (auth.revokeToken → guests.revoke); a revoked slot answers the door's raw 401 with an honest reason, never a silent ghost |
| UI promising a lane that doesn't answer | the /chain badge + state.lastRoute name the ACTUAL lane; the refusal surface (Refusal.tsx) already renders honest reasons for dead tokens |

## 5. UI surfaces (dashboard only; relay face stays minimal-always)

- A provider panel in Settings (rendering only when caps read `provider: offering` AND the session is account-scoped): the voucher mint button + the four-step member copy (paste-level, no jargon), state: minted/copied/consumed; lists YOUR slots with detach; shows the family of cap numbers ("yours 1 of 1 · deployment 31 of 32"). Signed-out → the panel collapses to the "why: slots need an account (email + code, no passwords)" line, honest.
- The AuthGate: account lane added (email → code → verify — §3.8), inline with its existing lanes' typing. A member who paired simply finds `g<hex>` in the property switcher — no property typing, no URL field, NO new paste mode.
- The posture card: unchanged read-only honesty — provider ON/OFF is the operator's env fact (6.1's two-sided law holds verbatim).

## 6. Migration (feature-shaped, honest)

- brain.creadev.org can turn provider mode on with the gate + the KV (no schema bump, no wire versioning). Vouchers ride the existing ledger mechanics; slots ride the existing property plumbing; accounts and codes ride BOLETE_KV's namespace. OFF → ON is additive; ON → OFF hides the panel and orphans slots (they answer honestly unreachable — documented everywhere the panel prints).
- DEPLOY.md gains §12.x (dashboard-relay provider posture): the gate + co-requisite KV + the connector envs (mail FROM + connector credentials from Sites → Secrets) + the caps-read self-check.

## 7. Non-goals (this spec)

- NO new edge-side forwarding lane to user-named origins (§3.3, recorded).
- **REVISED from v0.1 (owner ruling 8):** provider slots DO require an account — that "NO account requirement" non-goal is now REFUSED (the older position is what the owner overruled). The scoping that survived from v0.1: accounts are REQUIRED for slots but still OPTIONAL for the operator's own dashboard use (own-edge-bridge stays open without one; provider ON makes the KV co-requisite on the registration face only, not on the operator's token flows).
- NO pod-side changes beyond what Mode A already requires. The protected invariant stands: the pod's DOOR AUTH POSTURE does not change to make provider mode work.
- NO global directory of member pods (mesh discovery stays opt-in-and-later, prd-relay.md §9 gating).
- NO password storage, anywhere, including "helpfully hashed" ones — ruling 9 is absolute; the email code REPLACES the password concept on this face.
- NO HTML email, tracking pixels, or marketing mail through the handler — the purelymail connector is transactional by its ToS and its design; the entire connector family signs that law.

## 8. Open questions FOR the owner (v0.4 — NONE OPEN; the envelope is set)

Both questions this section carried were resolved owner-side the same session they were asked:

1. **The reap grace window → RULING 15, LAW.** Owner ticked 48h and set `VANT_RELAY_PROVIDER_GRACE_HOURS=48` in the Pages panel. The 12h keepalive write threshold × 4 tolerated missed windows is the shipped law; 72h retired.
2. **The purelymail app password → DONE.** The owner minted the SMTP-scoped app password, set BOTH connector credentials (`PURELYMAIL_SMTP_USER/_APP_PASSWORD`, `RESEND_API_KEY`), bound `BOLETE_KV`, and set `EMAIL_ADMIN_TO` (as Secret — their menu choice; the connector reads it identically). The provider envelope has zero remaining configuration; DEPLOY.md §12.5 remains the panel mirror.

Open-question count: **0**. The rungs in §10 are unblocked.

Closed by rulings 11–14 this pass: transport sequencing = purelymail FIRST (sockets receipts verified; port 465, not 587); `_PER_USER` = 1 (owner set it); install-wide slots = 100 (owner set it; 32 stays the untuned default); sender identity = `hello@creadev.org` for the From and for admin alerts.

## 9. The definition ledger (defined / built / ruled / refused — the ledger v0.2)

| Element | Truth-state |
|---------|-------------|
| Provider gate (env fact, capabilities line `provider: offering \| absent`) | RULED (ruling 5) + DEFINED (§3.1) |
| Install-wide slots = 100 on the community face (32 default) | RULED (ruling 13; owner set it in the Pages panel) |
| Per-account slots default 1 | RULED (ruling 12; owner set it in the Pages panel) |
| Purelymail connector FIRST via `cloudflare:sockets` (port 465, implicit TLS) | RULED (ruling 11; receipts verified this session — SCTP docs page + workerd 587 flakiness noted) |
| Sender `hello@creadev.org` From + admin alerts; P2 env names REUSED (`EMAIL_FROM`, `RESEND_API_KEY`) | RULED (ruling 14; DEPLOY.md §12.5 documents the surface) |
| Voucher-issued provider property slots (`p = g<guest id hex>`) | DEFINED (§3.2) |
| Account-locked slot acquisition (BOLETE_KV co-requisite) | RULED (ruling 8) + DEFINED (§3.1/§3.5) |
| Email-code account lane (no passwords anywhere) | RULED (ruling 9) + DEFINED (§3.8) |
| Mail-handler connector interface; Purelymail #1, Resend #2 | RULED (rulings 10 + 11); receipts verified live (§3.9); transport impl = build-day receipt kept (465 not 587) |
| Slot caps, both levels + squatter rails + lease-shaped reap | RULED (ruling 6) + DEFINED (§3.6); grace = 48h LAW (ruling 15; `VANT_RELAY_PROVIDER_GRACE_HOURS` owner-set) |
| Slots ride sovereign-profile import | RULED (ruling 7); dedup law PENDING PIN (import wave; PM4 tests it) |
| URL-in-token edge lane (user-named origins) | REFUSED (this spec §2, recorded with receipts) |
| Voucher→pod dial→edge acceptance→slot mints (the 4-step member flow) | DEFINED (§3.2) |
| Sealed-ride as the member's primary lane; owning-edge unchanged | BUILT (prd-relay.md; provider re-rides it, adds nothing) |
| Provider panel + AuthGate account lane + property-switcher behavior | DEFINED (UI rung, §5) |
| Tier-2 risk rails (slot caps env, breaker span, revocation UX, reap) | DEFINED (§4/§8) |

## 10. Acceptance criteria per rung

- **PM1 — gate + caps.** With `VANT_RELAY_PROVIDER_MODE` absent, the dashboard is byte-identical to today (snapshots prove it); caps omit the provider key. With the gate set, caps answer `provider: offering` and the panel exists. With the gate set but `BOLETE_KV` absent, caps read `offering` while registration answers the TYPED E-store refusal. Nothing else changes on any posture.
- **PM-A — account lane + mail handlers.** An email receives a 6-digit code via the connector chain; a wrong/expired/reused code refuses TYPED and throttled; a successful verify opens the session under the §3.5 binding; run the family under connector #1 (purelymail) and re-roll the receipt with connector #1 failover → #2 (resend) by fault injection; brute-force math refused (rate budget); no password-shaped value appears in any KV row anywhere (grep/print pins); the KV namespace check: the code rows carry only `{ codeHash, acctId, expiresAt }`.
- **PM-B — slot caps + reap.** Both caps enforce with typed messages (`..._SLOTS` full, `_PER_USER` saturated); a slot's-out-keepalive reap frees BOTH counters and honestly removes the property (no reload bounce needed); the detach action on the panel revokes the pairing (returns to unreachable). At cap-saturation the deposit of registration is refusal-typed.
- **PM2 — voucher → slot.** Sign in (email-code, connector chain), mint a voucher under the gate; redeem on a real second pod with relay armed; the redeem reply carries the e2e key ONCE; the dashboard's property switcher names `g<hex>`; the pod's outbound dial answers the caps probe; a `sealed-ride-e2e` door call reaches THIS pod's ledger (a mint-on-your-pod token works bounce-for-bounce — the fail that opened this investigation cannot recur through the provider path).
- **PM3 — refusal honesty.** An expired/misused voucher refuses typed; a revoked guest's slot answers 401; a gated-off deploy answers 404 (no provider surface); the /chain badge names the lane that actually answered.
- **PM4 — two devices.** The sovereign profile export/import carries a provider slot: same member pod reached from a second dashboard hop without re-pairing; the edge held nothing new between them; the carried slot duplicates NOTHING at import (dedup law).

## 11. Verify it (after build waves, from anywhere)

```bash
node test/relay.test.js                # the ride face this mode rides (38 pins, untouched)
node test/relay-parity.test.js         # r/2 contract + pins (40); provider adds NOTHING to the wire
(web/dashboard) node_modules/.bin/vitest run test/provider-gate.test.ts   # PM1 pins: OFF omits the key entirely (no null-server lie), ON adds the provider line additive-only, the gate-ON/KV-absent middle reads offering + storeReady:false, malformed numerals fall back to defaults
```

Operational face: docs/operations/relay-playbook.md and this spec; config face: §8's env keys (the gate, the caps, the connectors, the FROM).
