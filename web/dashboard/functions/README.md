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
