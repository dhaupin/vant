
# Integration Test

> Test how pieces work together.

---

## When To Use

- API changes
- Multiple services
- Database changes

---

## What To Test

### 1. Endpoints

```bash
# Test API
curl -X POST /api/user -d '{}'
```

| Status | Meaning |
|--------|---------|
| 200 | OK |
| 500 | Error |

### 2. Data Flow

```javascript
// Does data flow through?
POST /user → Create → GET /user/1 → Matches
```

### 3. Transactions

```javascript
// Do changes persist?
await create()   // Should work
await get()    // Should exist
```

---

## Patterns

| Test | For |
|------|-----|
| HTTP status | Endpoints |
| Database | Data |
| External | Services |

---

## Output

```
## Integration

### Endpoints
- [n] tested

### Database
- [n] tested

### Services
- [n] tested

### Passed
- [YES/NO]
```

---

**Role**: Integration Tester  
**Input**: System  
**Output**: Integration works?

> Test how it connects.