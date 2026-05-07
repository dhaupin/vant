---
name: test-e2e
description: End-to-end user workflow testing. Test complete user flows from action to result. Use when testing full stack, customer scenarios, or complete purchase/login/flow paths.
license: MIT
compatibility: Node.js, Python, any test framework
metadata:
  author: vant
  version: "1.0"
---

# Test E2E

> End-to-end user workflows.

## When To Use

- Complete user flows
- Full stack integration
- Customer scenarios

## What To Test

### 1. User Flow

```
User action → API → Database → UI update
```

Example: Login → Cart → Checkout → Confirmation

### 2. Critical Paths

| Path | User Action | Expected |
|------|------------|----------|
| Signup | Account created | Yes |
| Login | Authenticated | Yes |
| Purchase | Order confirmed | Yes |
| Search | Results shown | Yes |

### 3. Test Example

```javascript
test('complete purchase flow', async () => {
  await login.valid()
  await cart.add(item)
  await checkout.pay()
  await confirmation.seen()
})
```

## Output

```
## E2E Tests

| Flow | Status |
|------|--------|
| Signup | [PASS/FAIL] |
| Login | [PASS/FAIL] |
| Purchase | [PASS/FAIL] |
```

## See Also

- [test-unit](test-unit/SKILL.md) - Run unit tests first
- [test-integration](test-integration/SKILL.md) - Component integration
- [test-regression](test-regression/SKILL.md) - Verify no new breaks