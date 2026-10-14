# functions/ - the Pages Worker bridge (prd-web.md 3.1)

This folder ships the Cloudflare Pages **Worker functions** that make
the dashboard SAME-ORIGIN with the pod bridge. Contract (Mode A -
primary reach):

```
GET/POST /api/mcp/exec    -> pod POST /mcp/exec   (auth header forwarded)
GET      /api/mcp/events  -> pod GET  /mcp/events (SSE streamed through)
GET      /api/mcp/tools   -> pod GET  /tools
GET      /api/health      -> pod /health
```

The P2 ACCOUNT layer (prd-web.md 3.5, email-OTP - this is dashboard
auth, NOT pod auth; the pod door remains the data authority):

```
POST   /api/auth/request-otp  {email}  -> mint + EMAIL a 6-digit
       single-use code (hashed sha-256 + per-code salt, ~10-min TTL,
       60s per-address cooldown; typed errors: E_EMAIL_INVALID 400,
       E_OTP_COOLDOWN 429, E_STORE_UNCONFIGURED/E_EMAIL_UNCONFIGURED
       503, E_EMAIL_DELIVERY 502)
POST   /api/auth/verify-otp   {email, code} -> single-use verify;
       5 attempts then the code burns; success sets an HttpOnly
       `bdash_session` cookie and creates the account (FIRST account
       on a deployment bootstraps admin, later ones viewer)
GET    /api/auth/session          -> {role, bound} or 401 E_NO_SESSION
DELETE /api/auth/session          -> destroy the session server-side
POST   /api/session?p=<id>        (existing paste intake) binds the
       vguest_ token SERVER-SIDE when a live account session exists;
       without one it stays the MVP raw-token cookie fallback
GET    /api/audit?limit=50        -> the frontend's OWN ledger (module
       #11): auth outcomes, refusals, session lifecycles; ADMIN-ONLY
       (typed 401/403/503 for unauthenticated/viewer/no-binding)
```

The app's own audit ledger (functions/lib/ledger.ts) records
PII-free rows (kind + safe detail, NO emails/tokens/session ids)
under `aud:<zero-padded-ts>:<rand>` with a two-week KV TTL as the
cap. Writes are BEST-EFFORT by design: a ledger failure never fails
the request it observes. Malformed keys under the prefix cannot eat
read-cap slots (the reader shape-gates names before capping).

Account-store rules:

- Bindings/settings only: the KV namespace binds as `BOLETE_KV`; the
  sender reads `RESEND_API_KEY` + `EMAIL_FROM` (first-party Resend,
  fetch-only, no SDK) or the generic `EMAIL_WEBHOOK_URL`
  [+ `EMAIL_WEBHOOK_TOKEN`]; `VANT_EMAIL_SALT` hashes the email.
  Missing pieces are TYPED states (503), never fake successes.
- Tokens bound to a session live ONLY records-side; the browser holds
  the opaque session id in an HttpOnly cookie (prd-web.md 3.5 session
  binding). The bridge resolves Authorization upstream; tokens are
  still never logged.
- Deployment override knobs: `VANT_EDGE_RATE_PER_MIN` (edge budget,
  applies to auth routes too). No atomic KV ops in the minimal shape:
  the bootstrap-admin race resolves last-writer-wins (single-operator
  boot pattern, stated in the PRD).

Hard rules (prd-web.md 3.1, 3.6):

- NO token logic, NO tenant logic, NO rate-limit logic HERE: the pod is
  the source of all of it. The Worker forwards and streams.
- The token is forwarded, NEVER logged.
- Property origins come from Pages settings env vars (`VANT_PROPERTY_<ID>_ORIGIN`),
  never from strings in code (prd-web.md 3.7).
- Per-session rate budget + request caps + the per-property circuit
  breaker live in these functions (prd-web.md 3.6).

Status: **implemented** - the bridge (`lib/bridge.ts`) forwards auth
(Bearer header, or the HttpOnly session cookie for the SSE stream -
browsers' EventSource cannot send headers), streams POST bodies, and
per-property resolves origins ONLY from Pages settings env vars
(`VANT_PROPERTY_<ID>_ORIGIN`). Edge owes: per-session rate budget
(`VANT_EDGE_RATE_PER_MIN`, default 120/min), a per-property circuit
breaker (opens after 5 consecutive failures, 15s cooldown, half-open
probe; `GET /api/breakers` exposes states for the status module), and
`VANT_BRIDGE_TIMEOUT_MS` (default 10s) on every upstream call. The pod
remains the authority for everything else.

Not yet deployed: these functions require a real Pages project with
property origins in settings; until then the frontend renders its
honest offline/dead states rather than faking data (prd-web.md 6).
