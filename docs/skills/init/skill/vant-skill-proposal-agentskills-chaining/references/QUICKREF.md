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
| early_exit_on | string | none | No |
| continue_on_success | boolean | false | No |
| pass_state | boolean | true | No |
| retry_count | integer | 1 | No |
| retry_until | string | none | No |
| race_mode | boolean | false | No |

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

## Execution Control

| Field | What |
|-------|------|
| early_exit_on: failure | Stop on first fail |
| continue_on_success: true | Skip if prev failed |
| pass_state: true | Pass outputs to next |
| retry_count: 3 | Run 3 times |
| retry_until: stable | Repeat until unchanged |
| race_mode: true | First wins |

## Subfolder Restriction

- ✅ Same subfolder: `test-unit`, `test-e2e`
- ❌ No `../parent`
- ❌ No `/absolute`

## Chain Calls Chain

```
chain: [chain-test, chain-security]
```