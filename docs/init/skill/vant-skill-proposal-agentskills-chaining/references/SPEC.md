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

**Default is sequential** for predictable behavior.

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

---

## Full Example

```yaml
---
name: full-test-chain
description: Complete test suite chain
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
---
```

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