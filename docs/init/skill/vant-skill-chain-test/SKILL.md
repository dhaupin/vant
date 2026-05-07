---
name: chain-test
description: Complete test chain. Runs all test skills in order: smoke → unit → contract → e2e → integration → regression → snapshot → fuzz → load → pen → chaos → audit-qos. Use before deploy or when full test coverage needed.
license: MIT
metadata:
  author: vant
  version: "1.0"
  # Chain: explicitly ordered skills to run
  chain:
    - test-smoke
    - test-unit
    - test-contract
    - test-e2e
    - test-integration
    - test-regression
    - test-snapshot
    - test-fuzz
    - test-load
    - test-pen
    - test-chaos
    - audit-qos
---

# Full Test Chain

> Complete testing coverage.

## Run In Order

### Phase 1: Quick Checks

1. **test-smoke** - Quick sanity check
2. **test-unit** - Unit tests
3. **test-contract** - Schema validation

### Phase 2: Functional

4. **test-e2e** - End-to-end flows
5. **test-integration** - Integration tests
6. **test-regression** - No new breaks

### Phase 3: Extended

7. **test-snapshot** - Visual regression
8. **test-fuzz** - Random input testing
9. **test-load** - Load/performance

### Phase 4: Security

10. **test-pen** - Penetration testing
11. **test-chaos** - Resilience testing

### Phase 5: Verify

12. **audit-qos** - Performance verification

## Output

```
## Full Test Audit

| Phase | Skills | Result |
|-------|--------|--------|
| 1 | smoke, unit, contract | [PASS] |
| 2 | e2e, integration, regression | [PASS] |
| 3 | snapshot, fuzz, load | [PASS] |
| 4 | pen, chaos | [PASS] |
| 5 | qos | [PASS] |

### Summary
- [One paragraph]
```

## Individual Skills

- [test-smoke/SKILL.md](test-smoke/SKILL.md)
- [test-unit/SKILL.md](test-unit/SKILL.md)
- [test-contract/SKILL.md](test-contract/SKILL.md)
- [test-e2e/SKILL.md](test-e2e/SKILL.md)
- [test-integration/SKILL.md](test-integration/SKILL.md)
- [test-regression/SKILL.md](test-regression/SKILL.md)
- [test-snapshot/SKILL.md](test-snapshot/SKILL.md)
- [test-fuzz/SKILL.md](test-fuzz/SKILL.md)
- [test-load/SKILL.md](test-load/SKILL.md)
- [test-pen/SKILL.md](test-pen/SKILL.md)
- [test-chaos/SKILL.md](test-chaos/SKILL.md)
- [audit-qos/SKILL.md](audit-qos/SKILL.md)