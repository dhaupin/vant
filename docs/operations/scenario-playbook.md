---
version: 0.8.6
permalink: /operations/scenario-playbook
layout: default
title: Scenario Playbook
nav_order: 139
description: Governance scenario crews - one shared escrow pool, quarantine has teeth at delegation, and a task only closes on a voted consensus outcome.
---

# Scenario Playbook

> Untrusted multi-agent scenarios where escrow + consensus are the REAL
> gates - not a demo rubber stamp. (Wave U3, `labs/prd-universe.md`.)

A **scenario crew** is N agents drawing from ONE shared escrow budget
pool. A **scenario task** is one delegated piece of work that must pass
three live gates before anything is signed off:

```text
crew assembled (arch-A ledger)
        │
        ▼
gate 1 · QUARANTINE ──── trust.isQuarantined for EVERY member
        │                refused fail-closed BEFORE any escrow draw;
        │                the refusal is recorded (who, why, when)
        ▼
gate 2 · ESCROW ──────── the SHARED workspace pool is charged
        │                (hold taken, quota ticked); an empty pool
        │                refuses the task (E_SCENARIO_BUDGET)
        ▼
work ──── delegation through the production agent pipeline
        │
        ▼
gate 3 · CONSENSUS ───── the crew votes complete/incomplete;
        │                closeout requires QUORUM - no
        │                single-agent bless (E_SCENARIO_NO_QUORUM)
        ▼
decision · resolution.logDelta - the voted verdict is logged as a
           persisted delta line (survives restart)
```

## Quick start

```bash
# Assemble a crew over a 500-credit shared pool
vant scenario crew audit-world --agents 3 --budget 500

# Run one gated task end-to-end
vant scenario task audit-world "Verify the pinned universe ledger" --cost 250

# Inspect roster + live pool headroom
vant scenario status audit-world
```

Every verb accepts `--json` for machine-readable output. Exit codes:
`0` ok, `1` typed lib error (code on stderr), `2` usage error.

## What the gates actually do

| Gate | Module | Failure mode |
|------|--------|--------------|
| Quarantine | `lib/trust.js` | Refused **before** any budget draw; refusal ledger carries agent id + staging |
| Budget | `lib/escrow.js` workspace pool | `E_SCENARIO_BUDGET`; the hold is never taken |
| Delegation | `lib/agents` | `E_SCENARIO_DELEGATE`; hold released (work never happened) |
| Closeout | `lib/consensus.js` quorum ballot | `E_SCENARIO_NO_QUORUM`; hold released |
| Decision | `lib/resolution.js` `logDelta` | Failure is surfaced in `refusals`, closeout stands |

Hard rules pinned by `test/scenario-crew.test.js`:

- A crew where every member is quarantined cannot delegate at all
  (`E_SCENARIO_QUARANTINED`) - and the escrow draw is never touched.
- A single remaining live voter can never pass closeout: the ballot's
  `minQuorum` is `max(2, live-voters)`, so no single-agent bless exists.
- Re-assembling a crew does **not** refill its pool (`ensureWorkspaceBudget`
  sizes a missing pool, never refills an existing one).

## Resume with byte-restoring materialization

U2's resume wrote a verified marker; U3 completes it with the **escrow-gated
executor**. Record a manifest with cell *values*, then resume with
`materialize: true` (CLI/MCP drives the same path):

```bash
vant universe record alpha --state-root <64hex> --values '{"<cellAddr>": "value"}'
vant universe resume <id> --actor operator --materialize
```

The materialization bills **1 escrow credit per restored cell** against the
actor's budget (`scenario:materialize:<actor>`), writes the frozen values
back through the arch-A state store (WAL included), reports
`materialized: true` + `bytesRestored`, and refunds on a store-write denial.
A broke actor is refused typed (`E_SNAPSHOT_BUDGET`) before any write lands.

## Byte-restoring pin points (U3 additions to the U2 suite)

| PRD item | Delivered | Pinned by |
|---|---|---|
| U3.1 crew + escrow gate | `lib/scenario.js` (`assembleCrew`, `runScenarioTask`) + `bin/scenario.js` + MCP `vant_scenario_crew/_task/_status` | suite + CLI live-fire |
| U3.2 quarantine drill | refusal recorded who/why; drawn **before** the budget gate | drill pins (one-q + all-q) |
| U3.3 voted closeout | quorum ballot + `resolution.logDelta` | no-single-bless pin |
| U3.4 this page | playbook doc | coverage gates |
| U3.5 pin suite | `test/scenario-crew.test.js` (8 pins) | CI sweep |

## Crew budgets and hygiene

- Crew names: alphanumeric plus `._-` (≤64 chars); hostile input fails
  closed typed (`E_SCENARIO_NAME`).
- Crew size: 2-10 (mirrors the `agents.maxAgents` default).
- Task text: ≤512 chars; hostile text is refused before any gate runs.
- Budget: `≥ crew size` and `≤ 100000` credits; the task cost defaults to
  half the pool and is pool-capped by construction.
- The scenario ledger lives in
  `models/private/<brain>/state/universe-scenarios.json` - arch-A rules,
  WAL included, brain-scoped.

## Where the rest lives

- Universe engine and manifests: [`lib/state/genesis-snapshot.js`](https://github.com/dhaupin/vant/blob/main/lib/state/genesis-snapshot.js) (`labs/prd-universe.md` U1-U3)
- Escrow budgets and workspace pools: [Escrow](/security/escrow)
- Consensus voting: [Consensus](/reference/consensus)
- Trust quarantine: [Succession](/multi-agent/succession)
