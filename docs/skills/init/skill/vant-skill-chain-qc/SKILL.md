---
name: chain-qc
description: Full quality control.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# QC Chain

> Full quality control.

---

## Chain

### Load First

1. **vant-skill-test-unit.md**
   - Unit tests run?

2. **vant-skill-review-code.md**
   - Read the code

3. **vant-skill-audit-qc.md**
   - Standards check

### Run This Last

```markdown
## QC Chain Complete

### Tests
- [n] passed

### Code Quality
- [issues]

### Standards
- [issues]
```

---

## Output

```
## QC Chain

### Tests
- Passed: [n]
- Failed: [n]

### Quality
- [PASS/FAIL]

### Standards
- [PASS/FAIL]
```

---

**Chain**: test-unit → review-code → audit-qc  
**Output**: Full QC
