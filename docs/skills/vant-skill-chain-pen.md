---
version: 0.8.11
permalink: /skills/vant-skill-chain-pen.md
layout: default
title: Skill Chain pen
nav_order: 88
---

# Pen Test Chain

> Full penetration test.

---

## Chain

### Load First

1. **vant-skill-hat-white.md**
   - Authorization check

2. **vant-skill-review-code.md**
   - Read the code

3. **vant-skill-audit-security.md**
   - Security baseline

4. **vant-skill-test-pen.md**
   - Exploit attempts

### Run This Last

```markdown
## Pen Test Chain

### Auth
- [YES/NO] Can test?

### Baseline
- [security issues]

### Exploits
- [findings]
```

---

## Output

```
## Pen Test Chain

### Authorization
- [YES/NO]

### Vulnerability
- [YES/NO]

### Findings
| Severity | Finding | Exploitable |
|----------|---------|------------|
| HIGH | [vuln] | YES |

### Fixes
1. [fix]
```

---

**Chain**: hat-white → review-code → audit-security → test-pen  
**Output**: Full pen test
