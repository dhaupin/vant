# Test Chain Reference

## Chain Order

| # | Skill | Phase | Purpose |
|----|-------|-------|---------|
| 1 | test-smoke | Quick | Sanity check |
| 2 | test-unit | Quick | Unit tests |
| 3 | test-contract | Quick | API schemas |
| 4 | test-e2e | Functional | User flows |
| 5 | test-integration | Functional | Components |
| 6 | test-regression | Functional | No breaks |
| 7 | test-snapshot | Extended | Visual |
| 8 | test-fuzz | Extended | Random inputs |
| 9 | test-load | Extended | Performance |
| 10 | test-pen | Security | Pen testing |
| 11 | test-chaos | Security | Resilience |
| 12 | audit-qos | Verify | Performance |

## Running

```bash
# Run individual
npx vant load test-smoke

# Run chain
npx vant load chain-test
```

## Skip Phases

```bash
# Just quick checks
SKIP_EXTENDED=true npx vant load chain-test

# Skip security
SKIP_SECURITY=true npx vant load chain-test
```