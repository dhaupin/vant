# Chaining Spec Addition

Add to Agent Skills spec at: https://agentskills.io/specification

---

## New Sections

### 4.5 Chain Metadata (Optional)

Add after "allowed-tools field" section:

#### 4.5.1 `chain` field

The optional `chain` field:

- Must be a YAML array of skill names (strings)
- Each skill name must match a skill in the loaded skillset
- Order matters: first skill loads first, second loads second
- Used for explicit skill orchestration

**Example:**
```yaml
metadata:
  chain:
    - test-unit
    - test-integration
    - test-e2e
```

#### 4.5.2 `async` field

The optional `async` field:

- Must be a boolean (`true` or `false`)
- Default: `false` (sequential loading)
- When `false`: load skills one after another in chain order
- When `true`: load all skills in parallel (when possible)

| Value | Behavior |
|-------|----------|
| `false` | Sequential: A → B → C |
| `true` | Parallel: Load A, B, C together |

**Default is sequential (`false`)** for predictable behavior.

#### 4.5.3 `continue_on_error` field

The optional `continue_on_error` field:

- Must be a boolean
- Default: `true` (continue even if a skill fails)
- When `false`: stop execution at first skill failure

#### 4.5.4 `timeout` field

The optional `timeout` field:

- Must be a positive integer (seconds)
- Default: 0 (no timeout)
- Applies per-skill execution time

#### 4.5.5 `max_depth` field

The optional `max_depth` field:

- Must be a positive integer
- Default: 10
- Maximum nesting depth for nested chains
- Prevents infinite recursion: A → B → C → A

#### 4.5.6 `parallel_limit` field

The optional `parallel_limit` field:

- Must be a positive integer
- Default: 5
- Maximum skills to load in parallel when async=true
- Prevents memory overload

#### 4.5.7 `validate_on_load` field

The optional `validate_on_load` field:

- Must be a boolean
- Default: `true`
- When `true`: verify all skills in chain exist before loading
- Fail fast with clear error

#### 4.5.8 `cleanup_after` field

The optional `cleanup_after` field:

- Must be a boolean
- Default: `false`
- When `true`: reset state after chain completes
- Useful for idempotent runs

#### 4.5.9 `early_exit_on` field

The optional `early_exit_on` field:

- Must be a string: `none`, `failure`, `success`, or `critical`
- Default: `none` (run all skills)
- When `failure`: stop at first skill failure
- When `success`: stop at first skill success
- When `critical`: stop on critical failure only

#### 4.5.10 `continue_on_success` field

The optional `continue_on_success` field:

- Must be a boolean
- Default: `false`
- When `true`: skip next skill if previous failed

#### 4.5.11 `pass_state` field

The optional `pass_state` field:

- Must be a boolean
- Default: `true`
- When `true`: pass skill outputs to next skill
- When `false`: each skill runs in isolation

#### 4.5.12 `retry_count` field

The optional `retry_count` field:

- Must be a positive integer
- Default: 1
- Run entire chain N times

#### 4.5.13 `retry_until` field

The optional `retry_until` field:

- Must be a string: `none`, `stable`, or `success`
- Default: `none`
- When `stable`: repeat until output unchanged
- When `success`: repeat until all pass

#### 4.5.14 `race_mode` field

The optional `race_mode` field:

- Must be a boolean
- Default: `false`
- When `true`: first skill to complete wins (requires async=true)

### 4.6 Subfolder Restriction

All skills in `chain` must be in subfolders of same skillset:
- No `../parent` references
- No `/absolute` paths
- Enforces hierarchy

### 4.7 Chain Calls Chain

Chains can call other chains with max_depth limit:
- Chains can include other chain names in chain array
- max_depth prevents infinite recursion

---

## Full Example

```yaml
---
name: full-test-chain
description: Complete test suite with all options
metadata:
  chain:
    - test-smoke
    - test-unit
    - test-contract
    - test-e2e
    - test-integration
    - audit-qos
  async: false
  continue_on_error: false
  timeout: 300
  max_depth: 5
  parallel_limit: 3
  validate_on_load: true
  cleanup_after: false
  early_exit_on: failure
  continue_on_success: true
  pass_state: true
  retry_count: 1
  retry_until: none
  race_mode: false
---
```

## Additional Edge Cases Handled

| Field | Handles |
|-------|---------|
| max_depth | Infinite nesting: A → B → C → A |
| parallel_limit | Memory: 100 parallel skills |
| validate_on_load | Missing skills: chain references unknown |
| cleanup_after | Idempotency: run twice safely |

---

## Validation

Skills with `chain` metadata should:

1. Validate all skill names exist in skillset
2. Validate no circular dependencies
3. Warn if skill references itself
4. Allow empty chain (no-op)

---

## Migration Path

- Existing skills unchanged
- New chain skills add metadata
- Default safe (sequential)
- Opt-in to parallel