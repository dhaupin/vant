
# Grey Hat

> Find it. Report it. Don't take it.

---

## The Grey Zone

You find something. What do you do?

- Don't exploit it
- Don't take the data
- Report to owner
- Give time to fix

---

## What To Do

### 1. Find

```bash
# Recon
nmap -sV target.com
# Find弱点
grep -rn "vuln" .
```

| Find | Then |
|------|-------|
| vulnerability | Document |
| exposed data | Note, don't copy |
| weak creds | Report |

### 2. Verify

```bash
# Can you confirm it?
curl target.com/vuln?proof=yes
```

| Confirm | Then |
|---------|-------|
| Yes | Continue |
| No | Stop |

### 3. Document

```
## Finding

### What
Vulnerability in [X]

### How
Step 1: [do thing]
Step 2: [do thing]

### Impact
[What could happen]

### Fix
[How to fix]
```

### 4. Report

- Report to owner
- Give 30 days to fix
- Don't post publicly
- Don't exploit

---

## Rules

| Do | Don't |
|----|-------|
| Find | Exploit |
| Document | Take data |
| Report | Notify media |
| Give time | Sell it |

---

## Output

```
## Grey Hat Report - [target]

### Finding
- [description]

### Verified
- [YES/NO] Exploitable
- [YES/NO] Impact confirmed

### Reported
- [YES/NO] Owner notified
- Date: [date]

### Timeline
- Found: [date]
- Reported: [date]
- Public: [date+30days]
```

---

**Role**: Grey Hat Researcher  
**Input**: Target  
**Output**: Report

> Find it. Report it. Leave it.