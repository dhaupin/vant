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

## Sequential (default)

```
smoke → unit → contract → e2e → integration → load → audit-qos
A then B then C
```

## Parallel

```
audit-security + audit-qc + audit-ops
Load all together
```

## Why Default Sequential?

1. Most skills need order
2. Less surprising
3. Debug easier
4. Explicit > implicit