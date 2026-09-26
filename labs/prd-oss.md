# Vant OSS — Convergence and Consistency Through the Frames — PRD

> **Status: PROPOSED (v0.1).** The public layer of vant gets the same
> discipline its internals already have: every surface names its source
> of truth, every claim maps to a real, testable endpoint, and
> consistency is enforced by checkers — not by hope.
>
> Hosted by Buffy Labs. Companion frames: [frame.md](frame.md) (the
> Commons), [prd-mesh.md](prd-mesh.md) (federation), the
> [white paper](whitepaper/README.md) (build in public).

---

## 1. Overview

Vant is built by agents, documented by agents, and used by agents —
plus the humans who steer both. Its public surface (README, AGENTS.md,
docs/, CONTRIBUTING, CLI help cards, MCP tools, issues/discussions) is
therefore not decoration: it is the project's **second codebase**, and
it gets debugged with the same rigor.

Today that codebase has the disease the mesh cured internally: many
heads, no convergence. The proof is already on the table:

- **A phantom endpoint in the first doc agents read.** AGENTS.md
  documents `POST /rpc` with `brain_agent_spawn|list|kill` — zero hits
  in lib/ or bin/. An agent following our own onboarding hits a wall
  and learns our docs lie.
- **Three contributing docs, three depths, one drift.** Root
  CONTRIBUTING.md, docs/getting-started/contributing.md, and the
  session record in labs/ disagree on commands, links, and process.
- **Claims without a checker.** docs/reference/cli.md carries ~330
  command references against 119 bin/ files; nothing mechanical
  verifies the mapping. Broken newcomer links already shipped
  (`dhaupin/discussions` — wrong repo) and no gate caught them.

**The thesis:** the frames that fixed the internals converge the
public layer too.

| Internal rule (already shipped) | OSS-layer equivalent (this PRD) |
|---|---|
| Gates run where the state lives | Every doc section names its source-of-truth file |
| The wire never declares truth | No doc claims an endpoint the code doesn't ship |
| Merge-only adoption (in-memory wins) | Derived docs are generated/mark-linked, never hand-diverged |
| The reaper cleans up | A consistency checker retires stale claims automatically |
| Live-fire finds bugs before users do | Docs claims are pinned by tests, found by the same sweeps |

## 2. Design decisions (proposed, owner to confirm)

1. **One canonical source per truth.** Each repeated surface picks a
   home (e.g. the contribution flow lives in docs/, the root file
   becomes a short pointer; AGENTS.md owns the agent loop, docs/
   owns the human loop). Derived copies are marked and checked, not
   freehand.
2. **No phantom endpoints — either direction.** A documented endpoint
   that doesn't exist gets fixed in docs OR implemented in code (see
   the open decision below). An implemented endpoint that isn't
   documented gets surfaced. Both directions converge.
3. **Consistency is CI, not vigilance.** A new checker
   (surface-consistency) runs beside check-docs-links/style in CI and
   in the test suite; a failing claim blocks like a failing test.
4. **Community guidance uses the product's own shape.** Support routing
   is a decision tree (bug → issue, idea → discussion, vulnerability →
   advisory, question → discussion); governance documents how vant
   actually decides (PRDs → waves → passes → pins). The community layer
   should read like vant, not like a template.

## 3. The decision this PRD puts to the owner

**The AGENTS.md agent-crew endpoints: fix the docs or ship the code?**

`brain_agent_spawn/list/kill` are phantom, but the capability is real
(lib/agents facade: spawn, list, plus the 4-agent crew model). Two
honest paths:

- **Option A — implement (recommended):** wire the three tools into the
  real MCP surface (mcp.execute door, schema-gated, like the agora
  tools) and give `/rpc` a real story or retire it for `tools/call`.
  AGENTS.md becomes true; agents get a first-class crew endpoint; the
  multi-agent docs stop describing vapor.
- **Option B — document reality:** rewrite AGENTS.md's Multi-Agent
  section to the actual surfaces (programmatic `vant.agents()`, MCP
  tools that exist today). Cheaper; the crew-over-MCP capability stays
  hypothetical.

## 4. Wave plan

### Wave OSS-A — the phantom hunt (claims → reality)

- Inventory every command/tool/endpoint claim in README, AGENTS.md,
  docs/reference/cli.md, docs/runtime/*: CLI verbs vs bin/ dispatcher,
  MCP tools vs mcp.js registration, HTTP endpoints vs servers, config
  keys vs config.js, env vars vs code.
- Output: a claims registry (test fixture) mapping claim → file:line →
  proof (test or implementation). Unresolvable claims get fixed or
  retired in the same pass.
- Pins: test/surface.test.js — a claim with no proof fails the suite.

### Wave OSS-B — single sources of truth (convergence)

- Resolve the CONTRIBUTING split: canonical flow in docs/, root file
  becomes a pointer + the non-negotiables (conduct, license, PR door).
- AGENTS.md vs docs/getting-started/agent-onboarding.md: same loop,
  two audiences — align the shared facts (commands, paths, MCP
  contract) and mark each file's scope so future edits know which
  truths live where.
- Fix every known broken newcomer link (discussions URLs first).

### Wave OSS-C — consistency as CI

- New checker: scripts/check-surface-consistency.js (claims registry
  vs code reality), wired into .github/workflows/test.yml next to
  check-docs-links/style, and surfaced as a vant test mode.
- check-docs-links/style stay; the claims layer sits on top of them.

### Wave OSS-D — the community layer (guidance with real doors)

- SUPPORT.md: where questions/bugs/ideas/vulnerabilities actually go,
  with expected response shape (what a good bug report contains is
  already half-written in the issue templates — one voice).
- SECURITY.md: responsible disclosure via GitHub security advisories;
  the project's live-fire/security posture is the selling point — give
  reporters a real door and a promise (credit, timeline, no hostile
  surprise).
- CONTRIBUTING gains the honest paths: labels that exist, a
  good-first-issue contract (an issue labeled good-first-issue carries
  a reproduction + acceptance), and the agent-contributor note (PRs
  from agents follow the same pin/test conventions — see Wave OSS-E).

### Wave OSS-E — the agent-first contributor path (the differentiator)

- Publish how agents contribute to vant: AGENTS.md as the real
  interface, the wake/work/sleep loop as a contribution loop, the pin
  convention (every fix ships with the test that proves it), the
  honest build log as review culture.
- No other OSS project documents agent contributors as first-class;
  vant IS the proof. This wave is the white paper's public chapter.

## 5. Security notes

- SECURITY.md must route to GitHub private vulnerability reporting —
  never ask reporters to open public issues for exploitable findings.
- The claims registry lists endpoints but never secrets, tokens, or
  internal-only surface; the checker reads the repo, not the runtime.
- Phantom-endpoint sweeps double as attack-surface documentation: what
  we advertise is what we defend (the PRD rule "advertised = defended").

## 6. Files

- New: labs/prd-oss.md (this file), scripts/check-surface-consistency.js,
  test/surface.test.js, .github/SECURITY.md, .github/SUPPORT.md.
- Converged: AGENTS.md, CONTRIBUTING.md,
  docs/getting-started/contributing.md, README.md (links),
  docs/reference/cli.md (as claims get verified).
- Optional (owner decision): lib/mcp.js (agent-crew tools),
  bin/agents.js (CLI parity) under Wave-OSS-A Option A.

## 7. Success criteria

1. Every command/tool/endpoint claim in public docs resolves to a real,
   test-pinned implementation — and a CI checker keeps it true.
2. Each repeated surface names its canonical source; divergence is
   caught mechanically, not by readers.
3. A newcomer (human or agent) can go README → install → first
   contribution without hitting a lie: no broken links, no phantom
   endpoints, no dead doors.
4. The community layer (SUPPORT/SECURITY/CONTRIBUTING) reads like vant
   and routes every kind of contact to a real door.
5. The agent-contributor path is documented and true — the project's
   build-in-public story extends to its contributors.
