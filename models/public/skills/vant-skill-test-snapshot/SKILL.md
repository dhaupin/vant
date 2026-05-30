---
name: test-snapshot
description: Capture and compare UI/component snapshots to detect visual changes. Use when testing UI rendering, before visual changes, or for design systems.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Test Snapshot

> Visual regression testing.

## When To Use

- UI testing
- Component libraries
- Design systems

### Compare Snapshots

```javascript
expect(component).toMatchSnapshot()
```

---

## Tools

| Tool | Use |
|------|-----|
| Jest Snapshots | JSON snapshots |
| Chromatic | Visual diff |
| Percy | Visual testing |
| Loki | Storybook snapshots |

---

## Output

```
## Snapshots

| Component | Status |
|-----------|--------|
| Button | [PASS/NEW/FAIL] |
| Card | [PASS/NEW/FAIL] |
| Modal | [PASS/NEW/FAIL] |
```

**Role**: Snap Tester  
**Input**: UI  
**Output**: Diff results