---
version: 0.8.11
permalink: /essential/vant-skill-chain-security.md
layout: default
title: Skill Chain security
nav_order: 114
---

# Security Chain

> Full security analysis.

---

## Chain

This skill chains multiple skills together.

### Load First (in order)

1. **vant-skill-hat-white.md**
   - Can I check this?
   - Am I allowed?

2. **vant-skill-review-code.md**  
   - First pass: Read it
   - Check for vulnerabilities

3. **vant-skill-audit-security.md**
   - Credentials check
   - Input validation
   - Auth checks

### Run This Last

After loading all above, run:

```markdown
## Your Analysis

### Am I Allowed?
- [YES/NO] hat-white check passed

### Code Issues Found
- [list from review-code]

### Security Issues
- [list from audit-security]
```

---

## Output

```
## Security Chain Complete

### Authorization
- [YES/NO]

### Findings
| Skill | Issues | Severity |
|-------|--------|-----------|
| Code | [n] | - |
| Security | [n] | HIGH/MED |

### Fixes
1. [fix 1]
2. [fix 2]
```

---

**Chain**: hat-white → review-code → audit-security  
**Output**: Full security analysis