---
version: 0.8.11
permalink: /essential/vant-skill-chain-ci.md
layout: default
title: Skill Chain ci
nav_order: 109
---

# Full CI Chain

> Complete CI/CD pipeline audit.

---

## Chain

### Load In Order

1. **vant-skill-audit-ci.md**
   - CI pipeline runs?

2. **vant-skill-audit-qos.md**
   - Quality of service

3. **vant-skill-audit-ops.md**
   - Operations health

4. **vant-skill-audit-deploy.md**
   - Deploy verified?

5. **vant-skill-audit-reliability.md**
   - Recovery plans?

---

## Output

```
## Full CI Audit

| Check | Result |
|-------|---------|
| CI | [PASS] |
| QoS | [PASS] |
| Ops | [UP] |
| Deploy | [PASS] |
| Reliability | [PASS] |

### Summary
- [One paragraph]
```