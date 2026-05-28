---
version: 0.8.11
permalink: /essential/vant-skill-chain-deploy
layout: default
title: Skill Chain deploy
nav_order: 110
---

# Deploy Chain

> Verify deploy.

---

## Chain

### Load First

1. **vant-skill-audit-ci.md**
   - CI runs?

2. **vant-skill-review-code.md**
   - Code OK?

3. **vant-skill-audit-qc.md**
   - Standards?

4. **vant-skill-audit-deploy.md**
   - Deploy works?

### Run This Last

```markdown
## Deploy Chain

### CI: [PASS/FAIL]
### Code: [PASS/FAIL]
### QC: [PASS/FAIL]
### Deploy: [PASS/FAIL]
```

---

## Output

```
## Deploy Chain

### Pre-deploy
- CI: [PASS]
- Code: [PASS]
- QC: [PASS]

### Deploy
- [PASS]

### Ready
- [YES/NO]
```

---

**Chain**: audit-ci → review-code → audit-qc → audit-deploy  
**Output**: Ready to deploy?