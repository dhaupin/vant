# SRV-CONTRACT — the supported wire interface of the language sidecars

> Status: **supported interface** (vant#338, pass 368). Both shipped
> sidecars speak this contract — `lib/connectors/rust-srv/src/main.rs`
> (rust) and `lib/connectors/julia-srv.jl` (julia). A port that mirrors
> this wire shape for another language rides the same shared runtime
> (`lib/sidecar.js`) instead of forking a bespoke per-language sidecar.

## Wire (all JSON, token-checked)

| Endpoint | Direction | Body | Success response | Errors |
|----------|-----------|------|------------------|--------|
| `GET /health` | any | none | `{"ok":true,"lang":"<lang>","contract":1}` (HTTP 200) | n/a |
| `POST /eval` | `{"token":"<t>","code":"<snippet>"}` | — | `{"ok":true,"stdout":"…","stderr":"…"}` (HTTP 200; a failed eval is still `ok:true`-shaped with the failure inside `stdout`/`stderr`) | `{"ok":false,"stderr":"bad token"}` (HTTP 405, wrong/missing token); `{"ok":false,"stderr":"missing code"}` (HTTP 200, no `code` field) |
| `POST /stop` | `{"token":"<t>"}` | — | `{"ok":true}` (HTTP 200) — the sidecar process then exits 0 | `{"ok":false,"stderr":"bad token"}` (HTTP 405) |

## Fields

- **`token`** — the single shared bearer secret, handed to the spawned
  sidecar as `ARGV[1]` by the vant spawner. Wrong or missing token is a
  405 with `ok:false` — the token check runs before any path work.
- **`code`** — the snippet. Eval semantics are per-language and
  documented in each sidecar's header (`fn main()` snippet body for
  Rust; a Julia expression/script for Julia). Compilation/JIT is the
  caller's cost model, amortized by the one long-lived process.
- **`lang`** — the sidecar language id, echoed on `/health` so a stray
  process on the port never counts as ours (the shared runtime's
  `healthy()` probe checks `ok === true && lang === spec.lang`).
- **`contract`** — the contract-version marker introduced by this doc:
  `1`. Integrators negotiate on it instead of guessing. Bump it on
  any wire change (new field, changed error shape); additive fields
  inside a version are fine, breaking ones are a bump.

## Threat model

- **Loopback-only.** The sidecars bind `127.0.0.1` and are designed to
  stay there. Nothing here is intended for cross-host exposure: a
  deployment that wants a remote eval surface must put its own
  authenticated proxy in front and accept the risk review that comes
  with moving an unauthenticated-transport, single-token door onto a
  network.
- **One token, one process.** A sidecar answers exactly one token, and
  `POST /stop` is a privileged self-termination the same token can
  always reach.
- **Spawn-per-node default.** The runtime spawns one sidecar per node
  (per language, per install); there is no shared fleet pool to leak
  state across tenants. The ONE amortized process is trusted code-path
  territory — eval runs in the sidecar's own language runtime, which is
  exactly why the door stays loopback + token.

## Version marker history

- `contract: 1` — the initial pin (pass 368): endpoints, bodies, error
  shapes, the loopback token model, as above.
