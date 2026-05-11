---
version: 0.8.11
permalink: /skills/vant-skill-chain-qc.md
layout: default
title: Skill Chain qc
nav_order: 89
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
