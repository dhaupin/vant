---
version: 0.8.6
permalink: /advanced/nsc9-spec
layout: default
title: NSC9 Spec
nav_order: 94
description: NSC-9 automation-reserved barcode specification. Draft.
---

# NSC-9 Automation Reserved Barcode Specification

> **Status**: Draft v0.1

## Overview

This spec defines the "NSC-9" barcode format for marking virtual/automation entities in the global EPCIS/UPC system. NSC (Number System Character) digits 6-9 are reserved by GS1 for future use. We propose using "9" to signify automation/virtual systems.

## Rationale

GS1 (Global Standards One) manages the global UPC/EAN system. Their reserved Number System Characters:

| NSC | Current Use | Proposed Use |
|-----|------------|--------------|
| 0 | Standard retail | - |
| 1 | Reserved | - |
| 2 | Variable weight | - |
| 3 | Pharmaceuticals | - |
| 4 | Restricted | - |
| 5 | Coupons | - |
| 6 | Reserved | Future use |
| 7 | Reserved | Future use |
| 8 | Reserved | Future use |
| **9** | Reserved | **Automation/Virtual** <- PROPOSED |

Using NSC "9" provides:
- Zero collision risk (never assigned to physical products)
- Self-documenting semantics ("9" = virtual entity)
- Interoperates with existing barcode scanning infrastructure

## Format Specification

### Basic Format

```text
NSC-9: 9-FACILITY-SEQUENCE-CHECK
        │ └─ Check digit (0-9)
        └─ Internal sequence (0-99999)
└──────┬── Manufacturing/Facility code (10000-99999)
       └─ NSC digit (always "9")
```

- **Total digits**: 12 (compatible with UPC-A scanning)
- **Facility range**: 10000-99999 (avoids real manufacturer codes 01000-09999)
- **Sequence range**: 00000-99999

### Storage Key Format

When storing in quasicrystal:

```text
data/{first2}/{FACILITY_SEQUENCE_CHECK}.json
```

Example: `data/87/87962_49853_4.json`

### Barcode Generation

From any content (deterministic):

```javascript
function generateAutomationBarcode(content) {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const facility = 10000 + (parseInt(hash.slice(0,5), 16) % 90000);
    const sequence = parseInt(hash.slice(5,10), 16) % 100000;
    const checksum = parseInt(hash.slice(-1), 16) % 10;
    return `9-${facility}-${sequence}-${checksum}`;
}
```

## Use Cases

### Vant Memory System

- Each "lesson" or "memory" gets a unique NSC-9 barcode
- Re-hashing content generates same barcode (self-authenticating)
- No database lookup needed to retrieve

### Automation Agents

- Each automation gets permanent identity via barcode
- State persisted across sessions
- Discoverable via geographic distribution

### Virtual Inventory

- Track non-physical assets (API keys, secrets, configs)
- Self-authenticating storage addresses
- Aperiodic tiling for unlimited scale

## Comparison

| Aspect |Traditional DB | NSC-9 Quasicrystal |
|-------|-------------|----------------|
| Lookup index | Required | Not needed |
| Scale limits | Yes | No (∞) |
| Self-authenticating | No | Yes |
| Distribution | Centralized | Distributed |
| Collision risk | Birthday paradox | None |

## Compatibility Notes

- NSC-9 barcodes **look like** invalid UPCs to standard scanners
- Physical product scanners will reject/not recognizethem
- This is INTENTIONAL, marks as automation-only
- Can still be scanned as raw numeric strings

## Industrial / MFG playbook seed (owner sidebank, 2026-10-16)

Owner direction: the ultimate proving ground for a memory system is
industry itself - process/manufacturing/ERP/PLC. NSC-9 as the identity of
a PART passing through manufacturing steps: one identifier riding the
part's router, generated per vant instance/brain instead of drawn from a
shared UPC registry, with the scan fleets manufacturers already run as
the reader layer. Record the seed; the build is a playbook candidate,
not a phase trick.

**Why the shape holds up (feasibility read):**

- The 12-digit NSC-9 frame rides barcode symbologies (Code128/EAN13
  family) that every existing scanner fleet already decodes - at the
  SYMBOLOGY level, existing hardware reads it today, no new fleet.
- Per-instance generation is the honest innovation: no GS1 prefix lease,
  no registry round-trip, self-authenticating (re-hash the payload and
  the same address re-appears - spec'd above), and the quasicrystal
  store gives scalable retrieval without a lookup index.
- It composes with the carrier ladder (prd-web.md 4.2): barcode is one
  carrier, NSC-9 is the ADDRESS, geometric storage is the MEMORY. This
  industrial play is that abstraction pointed at a real domain.

**Two corrections to the sidebank framing (recorded honestly):**

1. **Address-space size.** The 12-digit UPC-A frame has ~10⁹ routeable
   points (facility + sequence + check), not 10¹⁰. The 10-billion-class
   space is the quasicrystal LATTICE the NSC-9 address projects INTO -
   the barcode is the human/scanner doorway to that space, not the cell
   space itself. Lattice-scale identity arrives with a carrier that
   carries more bits (QR/NSC9-key form, or the planned extended frame).
2. **"Existing hardware reads it" splits at the backend.** Symbology:
   yes, everywhere. System behavior: a RETAIL GTIN-validating backend
   rejects an NSC-9 code (an invalid UPC-A by design - never a real
   product), while an MES/ERP/WMS that ingests numeric serials as
   unit-tracked identity reads it through. Manufacturing lines do the
   latter; choose lanes accordingly.

**The two-lane integration decision (what the playbook must close):**

- **LANE A - the GS1 front door (coexistence lane).** Emit the NSC-9
  address value as a GS1 GIAI (Global Individual Asset Identifier,
  Application Identifier `8004`) in a GS1-128 barcode. Their scan
  fleets and back ends ingest a LEGITIMATE GS1 asset id end-to-end;
  vant derives/validates the address from the carried value. This is
  the zero-friction enterprise lane: no fleet change, no backend
  rejection, spec's Future Considerations #1 (GS1 registration)
  becomes optional rather than blocking.
- **LANE B - the raw NSC-9 lane (vant-native).** Plain Code128 raw
  12-digit strings, self-authenticating, no registration ever. For
  vant-side shops, pilot lines, and any integration point where the
  unit identity is ONLY vant's address.

**Carrier surface (built, pass 258):** both lanes are LIVE in
`lib/carriers.js` (the assimilator carrier pack, socket cr/1):
`nsc9.encode/decode` (Lane B), `nsc9.giai()`/`nsc9.fromGiai()`
(Lane A read-through), and `nsc9.matches()` - the self-authenticating
hand that proves a scanned mark against the held router packet
(lib/traveler.js). The pack also carries the continuity/backtracking
walk (`replay()`): gaps and rewrites surface as the auditor's backtrack
map, never repaired. Honest absence: `qr`/`png` lanes are declared
absent with named blockers until a symbology renderer joins the
dependency contract; `list()` prints the roster without overstating.

**PLC/ERP follow-on (not the near playbook):** NSC-9 addresses as node
keys over OPC-UA/industrial protocols, and EPCIS event streams as the
ERP-side ingestion contract (the spec's Future Considerations #3, now
with a named lane). Structure it, gate it through sandbox/vaf like
every other identity surface, and keep the honest-refusal law
(a malformed NSC-9 address is a typed error, never a silent rehash).

### The router object (owner ruling, 2026-10-16 - recorded in [prd-automation.md](../../labs/prd-automation.md))

The NSC-9 frame is the ADDRESSING and the schema; workflow assimilation
rides it. What was missing from this playbook is the actual ROUTER
OBJECT - the thing a manufacturing floor holds in its hand.

**The answer: the horcrux.** The boot-stone moves out of `models/` and
becomes the node-level router, the encrypted, self-contained,
multimodal state packet that tiny PLCs and edge nodes INGEST, HOLD, and
PASS ON without spending any resources:

- **Zero-resource transit.** A node without a key, without a database,
  without a runtime just persists the carrier and forwards it. The
  horcrux is ciphertext end-to-end: routing is the delivery of opaque
  bytes, not their understanding. Total node cost = one file write and
  one scan cycle.
- **Multimodal, by the carrier ladder (prd-web.md 4.2).** Same NSC-9
  address, same envelope, different carriers per hop: barcode (Lane A
  GS1-128 / Lane B raw), QR (NSC9-key frame), stego SVG stone (the
  boot/airgap form), JSON (the ERP/EPCIS form). The router OBJECT is
  the invariant; the carrier is a local interface.
- **Airgapped by design.** The payload crosses air gaps the way the
  boot stone already does: on physical media, offline, no network
  path, no credential reach. The encryption-at-rest story (the stone)
  IS the industrial-transport story; docs/security/airgap-propagation
  is the discipline doc.
- **Identity-bearing.** Every router object carries its part's identity
  (the NSC-9 address -> quasicrystal lattice point) plus the workflow
  state it accumulated. Each edit is a NEW address generation (the
  deterministic re-hash contract above) - identity by content.

Full product requirements, honest truth-states, and the phase gates
(P0 record-only -> P1 schema -> P2 sim PoC -> P3 pilot-line) live in
**[labs/prd-automation.md](../../labs/prd-automation.md)** - this
section is the seed it begins with. NOTHING IS BUILT YET per the
owner's ruling; the red team's "destroy vant first, then make it real"
order stands.

## Future Considerations

1. Registration with GS1 for formal namespace
2. Sub-divisions (e.g., 90-94 for different automation types)
3. Integration with EPCIS (Electronic Product Code Information Services)
4. The industrial playbook (the two-lane decision + the router object +
   a real pilot line, owner sidebank 2026-10-16 - see the seed section
   above; the router object is recorded there and seeded as
   [prd-automation.md](../../labs/prd-automation.md))

## Authors

- OpenHands / Vant system

## References

- GS1 GTIN specification: https://www.gs1.org/standards/gtin
- UPC-A format: 12 digits
- EAN-13 format: 13 digits

---

## Related

- [Encryption](/vant/security/encryption) - data-at-rest protection nsc9 composes with
- [Storage](/vant/reference/storage) - where sealed archives persist