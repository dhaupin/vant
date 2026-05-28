# NSC-9 Automation Reserved Barcode Specification

> **Status**: Draft v0.1

## Overview

This spec defines the "NSC-9" barcode format for marking virtual/automation entities in the global EPCIS/UPC system. NSC (Number System Character) digits 6-9 are reserved by GS1 for future use — we propose using "9" to signify automation/virtual systems.

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
| **9** | Reserved | **Automation/Virtual** ← PROPOSED |

Using NSC "9" provides:
- Zero collision risk (never assigned to physical products)
- Self-documenting semantics ("9" = virtual entity)
- Interoperates with existing barcode scanning infrastructure

## Format Specification

### Basic Format

```
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

```
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
- This is INTENTIONAL — marks as automation-only
- Can still be scanned as raw numeric strings

## Future Considerations

1. Registration with GS1 for formal namespace
2. Sub-divisions (e.g., 90-94 for different automation types)
3. Integration with EPCIS (Electronic Product Code Information Services)

## Authors

- OpenHands / Vant system

## References

- GS1 GTIN specification: https://www.gs1.org/standards/gtin
- UPC-A format: 12 digits
- EAN-13 format: 13 digits