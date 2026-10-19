# Vant Automation — The Industrial Router Object — Product Requirements Document

**Version:** 0.1 (DRAFT — seeded from the NSC-9 industrial playbook seed + the owner's router-object ruling)
**Date:** 2026-10-16
**Status:** Defining, not building. Nothing in here is IN CODE yet; §7 names the truth-state of every row explicitly. Cross-references: [nsc9-spec.md](../docs/advanced/nsc9-spec.md) (addressing + the two-lane decision), [prd-web.md](prd-web.md) §4.2 (the carrier ladder).
**Build order (owner ruling):** the red team's "destroy vant first, then make it real" order stands — no code in this arc until the security wave closes.

---

## 0. The direction log (owner rulings, recorded so nothing is lost)

1. *"Revisiting our nsc9 industrial router playbook… the UPC is the addressing and schema, workflow assimilation, but what is the actual router object? Horcrux. Multimodal — as laid out in web-prd, but on an industrial scale. Tiny PLCs and stuff can ingest, without using any resources, and pass it on. Router object, airgapped."*
2. *"We should record this in our industrial playbook, and make it real in code (at some point after we finish destroying, not now). Lets make a prd-automation that covers industrial and stuff. This playbook and router object is a first entry."*
3. *(ledger law holds)* Passes and pins only; truth-states are defined, never fuzzy.

---

## 1. The insight

The NSC-9 spec answered WHAT a part is called (addressing) and HOW the
floor talks about it (schema, the two-lane integration decision). It
named the recipient layers (ERP/MES/WMS via EPCIS) and the reader layer
(the existing scan fleets). What it had not named is the THING THAT
ROUTES — the object that exists on the factory floor, moves between
nodes, and carries the part's identity and workflow state between them.

**The router object is the horcrux.** The instrument the project already
trusts with its own soul — an encrypted, self-contained, multimodal
state packet validated at the boot of every session — pointed outward:
the same stone mechanics, at industrial scale, as the object every PLC
and edge node persists and forwards.

The elevation mirrors the relay's (prd-relay.md §1): a transport-blind
carrier with encryption as the default, where intermediaries never need
to understand what they carry.

## 2. The router object (definition)

A **router object** is a single horcrux-format artifact bound to one
part's NSC-9 address, carrying:

| Slot | Contents | Source contract |
|---|---|---|
| identity | NSC-9 address (12-digit frame) → quasicrystal lattice point | nsc9-spec storage-key format |
| workflow state | step ledger: events the part passed (gather → hash → NEW address — identity by content, the deterministic re-hash contract) | nsc9-spec "Barcode Generation" |
| payload | the encrypted brain-shaped state: memory islands, geometry fold fields, citations — whatever the workflow assimilation defines per step | horcrux format (transform.js, multi-brain layout) |
| proof | the `.sha256` pin sidecar discipline | boot stone refresh flow |

Properties the definition REQUIRES:

1. **Encrypted by default.** Every hop sees ciphertext; plaintext exists
   only at the endpoints that hold the key (the vant instance/brain, the
   ERP integration point). No "data room in the middle" exists.
2. **Self-contained.** One artifact = one part = one step. No sidecar
   databases, no shared session, no node-local index to reconcile.
3. **Deterministically re-addressed on edit.** Each state change REGENERATES
   the address (content-hash contract). A reader can verify a step by
   re-hashing the payload and re-deriving the same address — auth without
   a registry.
4. **Resource-bounded.** The ingest path is ONE scan cycle + ONE file
   write (and ONE forward). The honest-refusal law applies: a malformed
   router object is a typed error on the edge, never a silent rehash,
   and never an incentive for the node to "helpfully" interpret bytes.
5. **Verifier at boot.** The same `sha256sum -c` / inspect discipline the
   boot stone flow already runs IS the industrial verification flow.
   The router object reuses the existing tooling: `inspect` shows the
   roster (parts), `restore` is the ERP-side ingestion.

## 3. Zero-resource ingest contract (the PLC/edge lane)

The point of the shape: **Tiny PLCs and edge nodes can ingest, without
using any resources, and pass it on.**

- The node does NOT need: a key, a runtime, a database, a network path,
  or more than enough storage for one artifact.
- The node DOES: scan → validate shape (checksum/length, not semantics)
  → persist → forward on its next scheduled pass.
- Because the object is cryptographically opaque to the node, a
  compromised node cannot read, forge, or rewrite workflow state — it
  can only refuse to forward (visible as a gap; supply-chain-visible
  liveness, not tampering).
- Resource accounting is part of the spec: node footprint targets are
  named (P3 gate, §6), e.g. single-digit KB RAM steady state is the
  aspiration for the K-slot form; measured at pilot, never claimed.

## 4. Multimodal carriers (the ladder, industrialized)

prd-web.md §4.2's carrier ladder pointed at browsers and pods; this arc
points the SAME ladder at the floor:

| Carrier | Lane | Hop |
|---|---|---|
| GS1-128 barcode carrying the NSC-9 value as GIAI (AI `8004`) | Lane A (coexistence) | scanner fleet → MES/ERP |
| Raw Code128 12-digit NSC-9 string | Lane B (vant-native) | scanner fleet → vant-side edge |
| QR / NSC9-key frame | extended-frame carrier | more bits of lattice address per scan (the addressspace correction in nsc9-spec) |
| Stego SVG stone | boot + airgap form | physical media across air gaps; the security docs' airgap-propagation discipline |
| JSON (horcrux unwrap) | ERP/EPCIS ingestion form | EPCIS event stream contract |

The router object's identity and payload are INVARIANT across
carriers; the carrier is a local interface of the hop. A part might
enter as Lane A barcode, ride the line as stones taped to pallets
across an air gap, and land as an EPCIS event — the same object.

## 5. Airgap discipline (why the stone form matters)

The project already ships an airgap story (docs/security/
airgap-propagation.md): state propagates through offline channels with
verification at every hop. The industrial router object inherits it
whole:

- Physical media only across the gap; no network path, no credential
  reach, no discovery surface.
- Verification at EVERY landing (the boot-verify tooling) — a stone
  that fails `sha256sum -c` or inspect is quarantined offline, typed
  error, never auto-decoded.
- The encryption-at-rest story and the airgap story are the SAME story:
  the stone's security posture is portable to the floor because it was
  designed for exactly this threat shape.

## 6. Phase gates

- **P0 (NOW) — record only.** This PRD + the nsc9-spec seed section +
  the ledger pass. No code, no branch, no surface. ☑
- **P1 — schema.** Router-object format v1: slot table formalized,
  typed error family (`E_ROUTER_*` reusing the honest-refusal law),
  carrier mapping table pinned like the relay contract's constants.
- **P2 — sim PoC.** A vant-internal simulated line: N nodes, M steps,
  carriers Lane B + stone; the PoC must show zero-semantics transit
  (nodes hold ciphertext), content-hash identity transitions, and
  bounded per-node cost. Runs inside the unit-test harness — no
  industrial hardware required.
- **P3 — pilot line.** Real scanner fleet + one PLC + one airgap hop.
  Resource-boundary measurements (RAM/flash/scan-cycle time) are the
  gate, self-reported honestly.
- **P4 — ERP/EPCIS.** EPCIS event-stream ingestion contract; Lane A
  GIAI coexistence validated at a live backend; GS1 registration
  remains optional (Future Considerations #1).

## 7. Truth-state table (defined, never fuzzy)

| Row | Truth |
|---|---|
| NSC-9 addressing | SPEC'd in nsc9-spec (draft v0.1), not built |
| Two-lane integration decision | SPEC'd, not built |
| Router object = horcrux | DEFINED here (owner ruling, recorded) — not built |
| Zero-resource ingest contract | DEFINED here — not built |
| Carrier ladder (industrial) | DEFINED here — not built |
| Airgap discipline inheritance | DESIGN here; the security-side story exists in docs |
| Phase gates P1–P4 | NAMED here — none started |
| Prerequisite | Security wave closes first (owner ruling #2) |

## 8. Security gates (the red-team lessons ride in)

> **(pass 255) The enterprise twin is IN CODE now:** the industrial
> router object (this PRD) and the enterprise router object
> ([prd-web.md §11](prd-web.md) — the **Traveler**, tr/1) are the same
> application, different carriers: an auditable, traceable pin through a
> distributed workflow (ISO 9001 clause 8.5.2 adopted in both lanes).
> The Traveler ships as a working backend lib + CLI + MCP door AND the
> web-kit contract — cross-reference, not duplicate: the carrier is a
> local interface of the hop.

The pass-245/246 red team set the house law this PRD inherits: guest- and
edge-controlled inputs never become code (no guest terms compiled as
regex; no branch names shell-interpolated), secrets never ride argv or
filenames, every refusal is typed. For the router object that means:

- Scan/read of a router object is PATTERN-VALIDATION ONLY at the node —
  no interpretation, no decode attempt, no "fallback" that turns bytes
  into behavior (the BM25 and sync.js lessons, generalized).
- The NSC-9 address is validated structurally at every boundary and a
  malformed address is `E_ROUTER_*`, never a silent rehash.
- Key material → env / secret-store / prompt only (the horcrux #201
  chain); a floor node NEVER holds a key — that is the threat model
  working as designed.
- The P2 sim PoC must include an adversarial suite: bit-flipped stones,
  lying-name artifacts (the #201 PoC shape), and resource-exhaustion
  attempts at the ingest path.
