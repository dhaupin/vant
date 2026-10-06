---
name: test-contract
description: Verify API schemas and contracts match expected format. Validate request/response structures. Use when testing APIs, before integration, or after schema changes.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Test Contract

> API schema validation.

## When To Use

- API testing
- Before integration
- After schema changes

## What To Test

### 1. Request Schema

```javascript
const requestSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 }
  }
}
```

### 2. Response Schema

```javascript
const responseSchema = {
  type: 'object',
  required: ['id', 'email'],
  properties: {
    id: { type: 'string' },
    email: { type: 'string' }
  }
}
```

### 3. Validate

```javascript
const Ajv = require('ajv')
const ajv = new Ajv()
const validate = ajv.compile(requestSchema)
const valid = validate(requestBody)
```

## Tools

| Tool | Use |
|------|-----|
| ajv | JSON Schema validation |
| json-schema-validator | Node validation |
| Swagger/OpenAPI | API spec validation |

---

## Output

```
## Contract Tests

| Schema | Valid |
|--------|-------|
| Request | [PASS/FAIL] |
| Response | [PASS/FAIL] |

### Errors
- [n] violations
```

**Role**: Contract Tester  
**Input**: Schema + Data  
**Output**: Validation results