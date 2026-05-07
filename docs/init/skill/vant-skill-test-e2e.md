# Test E2E

> End-to-end user workflows.

---

## When To Use

- Complete user flows
- Full stack integration
- Customer scenarios

---

## What To Test

### 1. User Flow

```
User action → API → Database → UI update
```

Example: Login → Cart → Checkout → Confirmation

### 2. Critical Paths

| Path | User Action |
|------|-------------|
| Signup | Account created |
| Login | Authenticated |
| Purchase | Order confirmed |
| Search | Results shown |

### 3. Happy Path + Edge

```javascript
test('complete purchase flow', async () => {
  await login.valid()
  await cart.add(item)
  await checkout.pay()
  await confirmation.seen()
})
```

---

## Output

```
## E2E Tests

| Flow | Status |
|------|--------|
| Signup | [PASS/FAIL] |
| Login | [PASS/FAIL] |
| Purchase | [PASS/FAIL] |

### Failed Flows
- [list]
```

---

**Role**: E2E Tester  
**Input**: User flows  
**Output**: Works end-to-end?

> Test what the user does.