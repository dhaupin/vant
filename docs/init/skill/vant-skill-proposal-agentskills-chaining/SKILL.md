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
- Current spec: "agent decides" is unpredictable
- Without explicit order: failures are mysterious
- Can't debug: don't know which skill ran when

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
| `async` | boolean | No | `false` | Sequential (false) or parallel (true) |
| `continue_on_error` | boolean | No | `true` | Continue if skill fails |
| `timeout` | integer | No | 0 | Max time per skill (0=unlimited) |
| `max_depth` | integer | No | 10 | Max nesting depth for nested chains |
| `parallel_limit` | integer | No | 5 | Max parallel skills when async=true |
| `validate_on_load` | boolean | No | `true` | Verify referenced skills exist |
| `cleanup_after` | boolean | No | `false` | Reset state after chain completes |

### Execution Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `early_exit_on` | string | No | `none` | Exit on: `none` `failure` `success` `critical` |
| `continue_on_success` | boolean | No | `false` | Continue only if previous skill passed |
| `pass_state` | boolean | No | `true` | Pass outputs to next skill in chain |
| `retry_count` | integer | No | 1 | Run entire chain N times |
| `retry_until` | string | No | `none` | Repeat until: `none` `stable` `success` |
| `race_mode` | boolean | No | `false` | First skill to complete wins (parallel only) |

### Subfolder Restriction

All skills in `chain` must be in same skillset subfolders:
- ✅ `test-unit`, `test-e2e` - same level
- ✅ `audit/security` - nested subfolder
- ❌ `../parent` - not allowed
- ❌ `/absolute` - not allowed

This enforces hierarchy: a chain above has more power than chain below.

### Chain Calls Chain

Chains can call other chains (with max_depth limit):
- ✅ `chain: [chain-test, chain-security]`
- With depth limit to prevent infinite recursion

### Async Flag Explanation

| `async` | Behavior | Use Case |
|---------|----------|----------|
| `false` (default) | Sequential: A → B → C | Dependent skills, ordered workflows |
| `true` | Parallel: Load all at once | Independent skills, maximum speed |

**Default is sequential (`false`)** because:
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

### early_exit_on

| `early_exit_on` | Behavior |
|---------------|----------|
| `none` (default) | Run all skills |
| `failure` | Stop on first failure |
| `success` | Stop on first success |
| `critical` | Stop on critical failure only |

**Use case**: Stop test chain immediately if smoke test fails.

### continue_on_success

| `continue_on_success` | Behavior |
|---------------------|----------|
| `false` (default) | Run all skills regardless |
| `true` | Skip if previous skill failed |

**Use case**: Only run e2e if unit tests passed.

### pass_state

| `pass_state` | Behavior |
|-------------|----------|
| `true` (default) | Pass outputs to next skill |
| `false` | Each skill starts fresh |

**Use case**: test-e2e gets errors from test-unit.

### retry_count

| `retry_count` | Behavior |
|--------------|----------|
| 1 (default) | Run chain once |
| N | Run entire chain N times |

**Use case**: Run stability test 3 times.

### retry_until

| `retry_until` | Behavior |
|-------------|----------|
| `none` (default) | Run once (or retry_count times) |
| `stable` | Repeat until output unchanged |
| `success` | Repeat until all pass |

**Use case**: Retry deploy until success.

### race_mode

| `race_mode` | Behavior |
|------------|----------|
| `false` (default) | Run all in order |
| `true` | First to complete wins (async only) |

**Use case**: Run against 3 mirrors, use first response.

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
2. **Debugging** - When chain fails, know exactly where
3. **Compose-ability** - Build complex from simple skills
4. **Portability** - Works same across all agents
5. **No agent luck** - Explicit beats implicit
6. **Real world need** - Test, security, deploy all need order
7. **Industry gap** - No chaining in spec is a missing feature

## Backward Compatibility

- Existing skills work unchanged
- No new required fields
- Default behavior (sequential) is safe
- Opt-in to async parallel

## Metadata Extension

From Agent Skills spec:

> **metadata field**: "Arbitrary key-value mapping for additional metadata. Clients can use this to store additional properties not defined by the Agent Skills spec."

These chain fields are metadata extensions:
- Agents that don't understand chain fields will ignore them
- Skills still valid per spec
- Validation tools should warn but not fail on unknown metadata
- Vant implements; others work but ignore

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
- Alternative considered: Use `scripts/` to chain
  - Rejected: That's for code, not skill ordering
  - Cleaner: metadata-level orchestration
- Prior art: Vant has chain-* skills working in production
- Q: Why not just "agent decides"?
- A: Works sometimes, fails mysteriously. Can't debug.

## See Also

- [chain-test/SKILL.md](chain-test/SKILL.md) - Example chain skill
- [test-e2e/SKILL.md](test-e2e/SKILL.md) - Example skill
- https://agentskills.io/specification - Current spec