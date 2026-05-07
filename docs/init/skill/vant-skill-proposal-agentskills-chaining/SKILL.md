---
name: proposal-agentskills-chaining
description: "PROPOSAL: Add explicit skill chaining to Agent Skills spec. Defines chain metadata field for ordered skill execution with async option for sequential/parallel loading. Use to propose chaining feature to https://agentskills.io"
license: MIT
compatibility: All agent products
metadata:
  author: vant
  version: "1.0"
  proposal: true
  spec_location: https://agentskills.io/specification
---

# Proposal: Skill Chaining for Agent Skills

## Problem

Agent Skills spec relies on "agent decides which skills to load" - no explicit ordering.

**Current behavior:**
- Skills are independent
- Agent decides order (implicit, unpredictable)
- No guarantee skills run in any particular sequence
- Works sometimes, fails mysteriously

**Why this matters:**
- Test chains need unit → integration → e2e order
- Security: scan → review → audit order
- Deploy: test → build → deploy order

## Solution

Add `chain` field to skill metadata:

```yaml
---
name: chain-test
description: Complete test chain...
metadata:
  chain:
    - test-smoke
    - test-unit
    - test-contract
    - test-e2e
---

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `chain` | array | Yes | - | Ordered list of skill names to load |
| `async` | boolean | No | `true` | Load sequentially (false) or parallel (true) |
| `continue_on_error` | boolean | No | `true` | Continue if skill fails |
| `timeout` | integer | No | 0 | Max time per skill (0=unlimited) |

### Async Flag Explanation

| `async` | Behavior | Use Case |
|---------|----------|----------|
| `false` (default) | Sequential: A → B → C | Dependent skills, ordered workflows |
| `true` | Parallel: Load all at once | Independent skills, maximum speed |

**Default is sequential** because:
1. Most workflows need order (test before deploy)
2. Less surprising behavior
3. Explicit beats implicit
4. Can opt-in to parallel if needed

### Continue on Error

| `continue_on_error` | Behavior |
|--------------------|----------|
| `false` | Stop at first failure |
| `true` (default) | Run all, report failures |

### Timeout

| `timeout` | Behavior |
|-----------|----------|
| 0 (default) | No limit |
| positive integer | Seconds per skill |

## Example: Test Chain

```yaml
---
name: chain-test
description: Complete test chain
metadata:
  chain:
    - test-smoke      # Quick sanity first
    - test-unit     # Then unit tests
    - test-contract # Schema validation
    - test-e2e     # User flows
    - test-integration  # Component tests
    - test-regression  # Verify no breaks
    - test-load     # Performance
    - audit-qos   # Final verification
  async: false
  continue_on_error: false
---
```

## Example: Fast Audit

```yaml
---
name: audit-fast
description: Quick parallel audit
metadata:
  chain:
    - audit-security
    - audit-qc
    - audit-ops
  async: true
---
```

##动机 (Why This Matters)

1. **Deterministic workflows** - Same input → Same output
2. **Debugging** - When chain fails, know where
3. **Compose-ability** - Build complex from simple
4. **Portability** - Works same across all agents
5. **No agent luck** - Explicit beats implicit

## Backward Compatibility

- Existing skills work unchanged
- No new required fields
- Default behavior (sequential) is safe
- Opt-in to async parallel

## Affected Skills

This proposal adds chaining to these existing patterns:

| Pattern | Example Chain |
|--------|---------------|
| Test | smoke → unit → contract → e2e → integration → regression → load → audit-qos |
| Security | hat-white → audit-security → review-code → audit-reliability |
| Deploy | audit-ci → review-code → test-e2e → audit-deploy |
| Full Audit | audit-general → audit-qc → audit-security → audit-reliability |

## Implementation Notes

1. Client loads skills in `chain` order
2. If `async: false`, wait for each skill before loading next
3. If `async: true`, load all then aggregate results
4. Report per-skill status + summary
5. Stop if `continue_on_error: false` and any fail

## Discussion

- GitHub Discussion: https://github.com/agentskills/agentskills/discussions
- Alternative: Use `scripts/` to chain (but that's for code, not skills)
- This is metadata-level, cleaner

## See Also

- [chain-test/SKILL.md](chain-test/SKILL.md) - Example chain skill
- [test-e2e/SKILL.md](test-e2e/SKILL.md) - Example skill
- https://agentskills.io/specification - Current spec