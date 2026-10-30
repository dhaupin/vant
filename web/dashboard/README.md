# vant-dashboard (codename: Bolete)

The Vant dashboard: **a guest identity with a browser** (labs/prd-web.md). Everything this app needs lives in this folder - see the self-containment rule (prd-web.md 3.7) and AGENTS.md's web/ boundary (the pod must never require anything here; this app never requires the pod's lib graph).

## Stack (prd-web.md 2.6)

React + Vite + TypeScript, Tailwind v4 tokens, shadcn-style components with **Base UI as the ONLY headless-primitive source**, TanStack Router (frame spine "registry" + routes), Query, Table; zod at the proxy boundary; lucide icons. Motion only where functional.

## Layout

```
src/
  frame/     the ONE set of frame-owned pieces: registry, shell, auth
             gate, footer, help layer, ONE loading system, ONE modal
             system, refusal primitive, error boundary
  modules/   one folder per module (typed manifest; the frame code-splits)
  pages/     404, app-error, terms, privacy
functions/   Cloudflare Pages Worker functions (/api/* proxy contract,
             prd-web.md 3.1) - deployed with this Pages project
```

## Bounds for this scaffold (P1)

- Login is the paste-token gate (memory only); email-OTP accounts land at P2 (prd-web.md 3.5).
- Module routes render from `src/frame/registry.ts`; new module = new folder + one registry row. Nav/tier gating is PRESENTATION only - the door still gates the data.
- SSE fanout, breaker, and the door-visible board render when the Worker functions (3.1) are deployed beside a reachable pod.

## Commands

```bash
npm install        # inside this folder (never at the repo root)
npm run dev        # vite dev server
npm run build      # tsc --noEmit && vite build -> dist/
npm run typecheck
```
