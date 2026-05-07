# Test Contract

> API/schema validation.

---

## When To Use

- APIs
- Schemas
- Contracts between services
- OpenAPI specs

---

## What To Test

### 1. Schema Validation

```javascript
const schema = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' }
  }
}
```

### 2. Contract Tests

```javascript
test('user matches schema', () => {
  expect(user).toMatchSchema(userSchema)
})
```

### 3. API Contracts

| Check | Tool |
|--------|-------|
| OpenAPI | swagger-cli |
| GraphQL | graphql-tools |
| JSON Schema | ajv |

---

## Output

```
## Contract Tests

| Schema | Valid |
|--------|-------|
| User | [YES/NO] |
| Order | [YES/NO] |
| API | [YES/NO] |

### Failed
- [violations]
```

---

**Role**: Contract Tester  
**Input**: Schemas, specs  
**Output**: Contract valid?

> Contracts are sacred.