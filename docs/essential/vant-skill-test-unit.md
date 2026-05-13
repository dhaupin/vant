---
version: 0.8.11
permalink: /essential/vant-skill-test-unit.md
layout: default
title: Skill Test unit
nav_order: 163
---

# Unit Test

> Test individual functions.

---

## When To Use

- New function
- After bug fix
- Before commit

---

## What To Test

### 1. Happy Path

```javascript
test('add works', () => {
  expect(add(1, 2)).toBe(3)
})
```

### 2. Edge Cases

```javascript
test('add handles null', () => {
  expect(add(null, 2)).toBe(2)
})

test('add handles string', () => {
  expect(add('1', 2)).toBe(3)
})
```

### 3. Errors

```javascript
test('add throws on invalid', () => {
  expect(() => add()).toThrow()
})
```

---

## Patterns

| Test | For |
|------|-----|
| toBe | Exact value |
| toEqual | Structure |
| toThrow | Errors |
| toHaveBeenCalled | Functions |

---

## Output

```
## Unit Tests

### Passed
- [n] tests

### Failed
- [n] tests

### Coverage
- [n]%
```

---

**Role**: Unit Tester  
**Input**: Test file  
**Output**: Test results

> Test the smallest pieces.