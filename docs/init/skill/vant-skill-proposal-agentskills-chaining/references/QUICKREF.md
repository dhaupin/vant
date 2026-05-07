# Quick Reference

## TL;DR

Add this to skill metadata:

```yaml
metadata:
  chain:
    - skill-a
    - skill-b
    - skill-c
  async: false  # true for parallel
```

## Fields

| Field | Type | Default | Required |
|-------|------|---------|----------|
| chain | array | [] | No |
| async | boolean | false | No |
| continue_on_error | boolean | true | No |
| timeout | integer | 0 | No |
| max_depth | integer | 10 | No |
| parallel_limit | integer | 5 | No |
| validate_on_load | boolean | true | No |
| cleanup_after | boolean | false | No |

## Sequential (default, async: false)

```
smoke → unit → contract → e2e → integration → load → audit-qos
A then B then C
```

## Parallel (async: true)

```
audit-security + audit-qc + audit-ops
Load all together
max 5 at once (parallel_limit)
```

## Why Default Sequential?

1. Most skills need order
2. Less surprising
3. Debug easier
4. Explicit > implicit

## Edge Cases

| Field | Handles |
|-------|---------|
| max_depth | A → B → C → A (infinite) |
| parallel_limit | 100 parallel skills (memory) |
| validate_on_load | Missing skill in chain |
| cleanup_after | Run twice safely |