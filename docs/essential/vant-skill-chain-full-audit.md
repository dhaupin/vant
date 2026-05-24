---
version: 0.8.11
permalink: /essential/vant-skill-chain-full-audit.md
layout: default
title: Skill Chain full audit
nav_order: 111
---

# Full Audit Chain

> Complete system audit.

---

## Chain

Run ALL audit skills in sequence for full coverage.

### Load In Order

1. **vant-skill-hat-white.md**
   - Authorization check first
   - Am I allowed?

2. **vant-skill-review-code.md**
   - Read the code
   - First pass review

3. **vant-skill-audit-security.md**
   - Security baseline

4. **vant-skill-audit-qc.md**
   - Quality standards

5. **vant-skill-audit-general.md**
   - General health

6. **vant-skill-audit-reliability.md**
   - Recovery capability

### Run Each Then Aggregate

```markdown
## Full Audit Results

### Auth
- [PASS/FAIL]

### Code Review
- [n] issues

### Security
- [n] issues

### QC
- [PASS/FAIL]

### Health
- [PASS/FAIL]

### Reliability
- [PASS/FAIL]
```

---

## Output

```
## Full Audit Complete

| Check | Result |
|-------|---------|
| Auth | [PASS] |
| Code | [n issues] |
| Security | [n issues] |
| QC | [PASS] |
| Health | [PASS] |
| Reliability | [PASS] |

### Summary
- [One paragraph]

### Next Actions
1. [action 1]
```

---

**Chain**: hat-white → review-code → security → qc → general → reliability  
**For**: Complete system audit