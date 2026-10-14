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

Status in this scaffold: **contract documented, code lands with the P1
build-out** so the pod-side contract is exercised against a real door
first. The frontend already speaks this exact surface (`src/api.ts`).
