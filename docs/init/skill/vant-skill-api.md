# API

> Application programming interface.

---

## When To Use

- HTTP services
- REST/GraphQL
- External data

---

## What To Do

### 1. REST

| Method | What |
|--------|------|
| GET | Read |
| POST | Create |
| PUT | Replace |
| PATCH | Update |
| DELETE | Remove |

### 2. Request

```javascript
// Fetch
const res = await fetch('https://api.example.com/users')
const data = await res.json()

// Node
const axios = require('axios')
const res = await axios.get('https://api.example.com/users')
```

### 3. GraphQL

```graphql
query {
  user(id: 1) {
    name
    email
  }
}
```

### 4. Auth

| Type | Header |
|------|--------|
| Bearer | Authorization: Bearer token |
| Basic | Authorization: Basic base64(user:pass) |
| API Key | X-API-Key: key |

---

**Role**: API Developer  
**Input**: Endpoint  
**Output**: Data

> Programmable.