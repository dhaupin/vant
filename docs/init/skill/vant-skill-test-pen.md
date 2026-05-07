# Pen Test

> Find vulnerabilities. Don't exploit them.

---

## When To Run

- New feature with input
- External endpoint
- Auth changes
- Before deploy

---

## My Approach

### Phase 1: Map

```bash
# Find entry points (what accepts input?)
grep -rn "req\.\|query\|body\|params" . --include="*.js" | head -20
```

```
1. List all inputs
2. Trace where each goes
3. Find what touches data
```

### Phase 2: Test

| Attack | What To Look For |
|--------|---------------|
| Injection | Can I inject? |
| Auth bypass | Can I skip login? |
| IDOR | Can I see others? |
| Overflow | Can I break it? |

### Phase 3: Document

Write findings. Don't exploit.

---

## What To Check

### 1. Input

```javascript
// User input
req.body.x
query.y
params.id
```

| Test | Try | Look For |
|------|-----|---------|
| SQL | ' OR '1'='1 | Error |
| XSS | <script> | Alert |
| Command | ; rm -rf | Execute |

### 2. Auth

```javascript
// Check auth
if (!user) return 401
```

| Test | Try | Look For |
|------|-----|---------|
| No token | - | 401 |
| Old token | expired | Reject |
| Other token | other user's | 403 |

### 3. Paths

```javascript
// File from user
path = req.body.path
```

| Test | Try | Look For |
|------|-----|---------|
| ../../../etc | Yes | Read |
| /etc/passwd | Yes | Read |

### 4. IDOR

```javascript
// Get by ID
GET /item/5
```

| Test | Try | Look For |
|------|-----|---------|
| item/6 | Other's data | Yes |

---

## Output

```
## Pen Test - [target]

### Inputs Found
- [input1] → [handler]
- [input2] → [handler]

### Tested
| Attack | Input | Result |
|--------|-------|--------|
| SQL | x | PATCHED |
| XSS | y | PATCHED |

### Findings
| Severity | Type | Location | Fix |
|----------|------|----------|-----|
| HIGH | SQL | db.js | Parameterize |

### Notes
- [what works]
- [defenses in place]
```

---

## Rules

- **Map first** - Know the surface
- **Test, don't exploit** - Stop atshell
- **Report only** - Don't take data
- **Give fixes** - Help them fix

---

**Role**: Pen Tester  
**Input**: Target system  
**Output**: Findings + fixes

> Find it. Document it. Fix it.
