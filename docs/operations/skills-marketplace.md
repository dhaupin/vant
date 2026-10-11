---
version: 0.8.6
permalink: /operations-skills-marketplace
layout: default
title: Skills Marketplace Playbook (Wave U6.5 - productized)
nav_order: 61
description: Operating the credentialed marketplace - gate config, CLI verbs, MCP tools, escrow settlement, trust economics, failure modes.
---

# Skills Marketplace Playbook (U6.5 productized)

> The Wave U6 prototype is now a **product**. The gate is still OFF by
> default - turning it on is an explicit operator act. Design source:
> [labs/prototype-marketplace.md](../../labs/prototype-marketplace.md)
> (schema §1, trust feed §2, delivery contract §3, failure modes §4).
> The full waves ledger (U1-U6): [prd-universe.md](../../labs/prd-universe.md).

## 1. Turning the surface on

The gate is `market.skillsEnabled`. OFF by default. Three mounting paths,
strongest first:

```bash
# 1. Env alias (deployment-level; instantiate overrides everything)
VANT_MARKET_SKILLS_ENABLED=true vant market skill-status <id>

# 2. Brain-config toggle (persisted in models/private/<brain>/config.json)
vant market skill-gate on      # writes market.skillsEnabled = true
vant market skill-gate off     # writes false

# 3. Programmatic / MCP
vant config set market.skillsEnabled true
# MCP: market_skill_gate {value: true}
```

Query the live value (exit 3 when off - discoverable-not-active):

```bash
vant market skill-gate
```

While the gate is off, EVERY skill op (CLI and MCP) returns typed
`E_SKILLS_DISABLED` - the surface is inert, not absent. Turning the gate
on does not migrate anything: listings/trades live in the market's own
WAL-backed store, unchanged from the prototype.

## 2. The trade lifecycle (CLI)

```bash
# SELLER lists - NO payload attached. Payloads are validated AT
# DELIVERY, never at listing (launch-payload listings refused typed).
vant market skill-list "nsc9-fingerprint-verify" \
    --price 25 --kind code --desc "Verifies NSC9 cell fingerprints"

# BUYER previews BEFORE paying (reputation is visible pre-trade)
vant market skill-status <listingId>

# BUYER buys - escrow HOLD only. No money moved yet.
vant market skill-buy <listingId> --buyer buyer-1

# SELLER delivers the payload (from a string, or '-' = stdin)
vant market skill-deliver <tradeId> "$(cat payload.txt)" --seller seller-1
vant market skill-deliver <tradeId> - --seller seller-1 < payload.txt

# BUYER settles - the ONLY release paths:
vant market skill-settle <tradeId> confirm --buyer buyer-1
vant market skill-settle <tradeId> refute  --buyer buyer-1

# OPERATOR SWEEP (on-demand; cron-able) - release stale holds:
vant market skill-sweep
```

Every verb: exit 0 ok · 1 typed lib error (code on stderr) ·
2 usage · 3 gate off.

## 3. The settlement economics (ESCROW is real)

,U6.5 closed the prototype's honest gap. The invariant, verified against
the real escrow store and pinned in `test/market-skills.test.js`:

| Stage | Escrow | Money |
|-------|--------|-------|
| `skill-buy` | `canSpend` check + **hold** under `skill:<listing>:<buyer>` | **nothing moves** |
| `skill-deliver` | (unchanged; hash only) | nothing |
| `skill-settle confirm` | `recordSpend` (**the ONE debit**) + hold released | buyer pays `price` exactly once |
| `skill-settle refute` | hold released, **NO debit**, listing supply restored | buyer pays nothing |

Pin names: `U6.5 SINGLE-DEBIT invariant`, `U6.5 refute economics`,
`U6.5 payroll` (a broke buyer cannot even hold - `E_SKILL_BUDGET`).

This replaces the prototype's double-charge: `buySkill` used to delegate
to `market.trade()`, whose settle path debited at TRADE time - then
confirm debited again. The skill flow now owns its own hold-first
contract; `trade.debit` is null until the buyer's confirm.

## 4. Trust economics (unchanged from the prototype)

Extracted from §2 of the design doc - settle outcomes write REAL
cooperation records keyed to the LISTING's seller (the trade row's
`seller` field can be 'anonymous'):

| Outcome | Record | Effect |
|---------|--------|--------|
| buyer confirms | `trust.record(seller, 'market_skill_delivery', { positive: true, value: min(0.2, price/50) })` | seller reputation up, scaled by deal size |
| buyer refutes | `{ positive: false, note: 'skill_delivery_refuted', tradeId }` | seller reputation down |
| settle never happens | nothing (hold stays; the market door expires it) | honest default |

Buyer-side scoping (each typed):

- The **seller cannot settle their own sale** - `E_SKILL_NOT_BUYER`.
  The settle is the buyer's decision only.
- The **buyer cannot deliver** - `E_SKILL_NOT_SELLER`. Delivery is
  seller-scoped by construction.
- **Double settlement refused** - `E_SKILL_ALREADY_SETTLED`.
- Verify first: `skillStatus` returns `sellerReputation` BEFORE paying.

## 5. MCP tools (agent-door surface)

Six tools, same invariants as the CLI, plus gate:

| Tool | Args | Notes |
|------|------|-------|
| `market_skill_list` | `title` (req), `description`, `payloadKind` (text\|code), `price`, `capabilityTag`, `context.agentId` | seller identity from `context`; launch refused |
| `market_skill_buy` | `listingId`, `buyerId` (req), `workspace` | hold-only buy |
| `market_skill_deliver` | `tradeId`, `payload` ≤64KB (req), `agentId` | `agentId` = the seller |
| `market_skill_settle` | `tradeId`, `decision` confirm\|refute (req), `agentId` | `agentId` = the buyer |
| `market_skill_sweep` | (none) | TTL evidence sweep for stale pending_delivery trades |
| `market_skill_status` | `listingId` | pre-trade snapshot incl. legacy + shill-resistant reputation |
| `market_skill_gate` | `value` (true/false) or none to read | persisted brain-config write |

All six are gate-inert (`E_SKILLS_DISABLED`) while `market.skillsEnabled`
is off - including the allowlist path through `lib/rules.js` (the skill
tool names contain no deny-substring; adding a name to
`SAFE_TOOL_ALLOWLIST` stays a deliberate review act).

## 6. Timeout automation + evidence rules (U6.6)

A trade left in `pending_delivery` releases its escrow hold when it
ages past `market.skillsTradeTtlMs` (default 72h; env alias
`VANT_MARKET_SKILLS_TRADE_TTL_MS`, clamp 60s-30d). The sweep is
ON-DEMAND - `vant market skill-sweep` / MCP `market_skill_sweep` (drive
it from cron if you want it periodic) - and it acts ONLY WITH EVIDENCE:

| skillState at sweep | What happens | Why |
|---|---|---|
| `pending_delivery` (aged out) | hold RELEASED, no debit, supply restored, NO trust record | silence from the seller is not mis-delivery evidence |
| `delivered` (even aged out) | untouched | the buyer owes the settle decision; auto-forfeiting favors whoever stops reacting |
| `settled` / `refuted` | untouched | terminal |

The trade row carries its evidence (`evidence.stage = 'pending_delivery'`,
aged TTL) and `settleDecision: 'timeout'`. Timeout is NOT a punishment:
no trust record is written in either direction.

## 6b. Shill-resistant reputation (U6.6)

`skillStatus` now surfaces a market reputation computed from the
seller's OWN settled trades, with three teeth against a shill ring:

1. **Per-buyer cap** - one buyer contributes at most `min(3, ceil(n/2))`
   weighted settles, so burst-pumping is capped.
2. **Distinct-buyer weighting** - the score scales by
   `distinct / total`; a high score needs real separate counterparties.
3. **Concentration flag** - `shillSuspicion: 'concentrated'` when one
   buyer owns >= 50% of the seller's sales (>= 3 transactions);
   surfaced to the buyer BEFORE paying.

Refusals stay out of the score on purpose: the tool refuses to pretend
it can prove a shill - it marks, buyers decide.

## 7. Boundary: 'launch' payloads (credentialed execution) - RESOLVED

The U6.6 disposition is FINAL: the whole credentialed-execution class
(`launch`, `eval`, `exec`, anything not `text` or `code`) is refused at
LISTING time with `E_SKILL_PAYLOAD_KIND`. The refusal message states
the why: credentialed execution needs a sandboxed eval surface plus a
threat model that does not exist. This is a product decision, not a
prototype TODO; the pin `U6.6 launch-payload DISPOSITION` enforces it.

## 8. Failure modes (each typed)

| Failure | Contract answer |
|---|---|
| seller never delivers | hold stays; buyer refutes: refund + trust hit; no automated timeout penalty (no evidence) |
| double settlement | second confirm/refute: `E_SKILL_ALREADY_SETTLED` |
| seller settles own sale | `E_SKILL_NOT_BUYER` |
| buyer tries to deliver | `E_SKILL_NOT_SELLER` |
| `payloadKind: 'launch'` | refused at LISTING time (`E_SKILL_PAYLOAD_KIND`) - documented boundary |
| empty / >64KB payload | `E_SKILL_PAYLOAD` (validated AT delivery, before any state change) |
| trade on revoked listing | `E_SKILL_REVOKED` |
| broke buyer | `E_SKILL_BUDGET` - the hold cannot even open |
| gate off | `E_SKILLS_DISABLED` (CLI exit 3 on a bare query) |
| destroyed/truncated state | arch-A store hydrate semantics (denied ≠ absent) |

## 9. Pin map

| Pin | Where |
|---|---|
| gate-inert typed | `test/market-skills.test.js` (U6.2) |
| listing boundaries (launch/price/title) | same (U6.4) |
| happy-path loop, hash, debit-on-confirm-only | same (U6.4) |
| seller-keyed reputation up AND down | same (U6.3/U6.4) |
| double-settlement, scope, delivery refusals | same (U6.4) |
| **SINGLE-DEBIT invariant** (real escrow) | same (U6.5) |
| **refute economics** (no debit, supply restored) | same (U6.5) |
| **payroll** (broke buyer cannot hold) | same (U6.5) |
| **skill fields persist** (payloadKind/capabilityTag) | same (U6.5) |
| **env-alias gate mounting** | same (U6.5) |
| **MCP door loop** (all six tools, typed) | same (U6.5) |
| **U6.6 sweep evidence rules** (release-only, no debit, no trust pen) | same (U6.6) |
| **U6.6 sweep scoping** (young trade untouched; delivered never auto-forfeits) | same (U6.6) |
| **U6.6 shill-resistant rep** (cap + weighting + concentration flag) | same (U6.6) |
| **U6.6 launch disposition** (whole executed-kind class refused) | same (U6.6) |
| grand tour door count 311 to 317 | `test/e2e-grand-tour.test.js` gate B |
