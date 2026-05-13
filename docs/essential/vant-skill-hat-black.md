---
version: 0.8.11
permalink: /essential/vant-skill-hat-black.md
layout: default
title: Skill Hat black
nav_order: 126
---

# Black Hat

> Red team. Test their defense.

---

## When Authorized

**Only use with explicit permission.**

- You have written authorization
- Scope is defined
- Dates are set
- Target is specified

---

## Your Job

Test their defenses. Break in. Report to defender.

---

## Phase 1: Recon

```bash
# Map the surface
nmap -sS target.com
nmap -sV target.com
```

### What you need:
- All IPs
- All ports
- All services
- All versions

### Findings:
```
## Recon - [target]

### IPs
- [list]

### Services
- [service] on [port]
- Version: [v]
```

---

## Phase 2: Exploit

### Try everything:

| Vector | Check |
|--------|-------|
| SQL | Can inject? |
| XSS | Will alert? |
| RCE | Can execute? |
| Auth | Can bypass? |

### Document each attempt:
```
## Exploit - [name]

### Attempt
[what you tried]

### Result
[PASS/FAIL]

### Fix
[what they should do]
```

---

## Phase 3: Pwn

### If you get in:

1. **Document access**
   - How did you get in?
   - What can you see?

2. **Don't escalate**
   - Stay in scope
   - Don't take data

3. **Report**
   - How: [steps]
   - What: [access]
   - Fix: [recommendations]

---

## Rules

| Do | Don't |
|----|-------|
| Test everything | Go outside scope |
| Document | Take data |
| Report fixes | Hide |
| Be thorough | Be quiet |

---

## Output

```
## Red Team - [target]

### Authorized
- [YES/NO] Written auth
- [YES/NO] Scope defined

### Findings
| Severity | Finding | Exploitable |
|----------|---------|-------------|
| HIGH | [vuln] | YES |

### Access
- [level] achieved
- [what you can see]

### Fixes
1. [fix 1]
2. [fix 2]
```

---

**Role**: Red Team  
**Input**: Target + authorization  
**Output**: How they were pwned

> Break it. Report how to fix it.