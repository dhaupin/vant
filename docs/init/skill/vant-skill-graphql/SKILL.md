---
name: graphql
description: Query language for APIs.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# GraphQL

> Query language for APIs.

---

## When To Use

- API queries
- Nested data
- Single request

---

## What To Do

### 1. Query

```graphql
query {
  user(id: 1) {
    name
    email
    posts {
      title
    }
  }
}
```

### 2. Mutation

```graphql
mutation {
  createUser(input: { name: "New" }) {
    id
    name
  }
}
```

### 3. Schema

```graphql
type User {
  id: ID!
  name: String!
  email: String
}

type Query {
  user(id: ID!): User
}
```

### 4. Tools

| Tool | Use |
|------|-----|
| Apollo | Server/Client |
| GraphQL Yoga | Server |
| urql | Client |

---

**Role**: GraphQL Developer  
**Input**: Query  
**Output**: Data

> Query.