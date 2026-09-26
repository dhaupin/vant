---
name: typescript
description: Typed JavaScript.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# TypeScript

> Typed JavaScript.

---

## When To Use

- Type safety needed
- Large codebases
- Modern JS projects

---

## What To Do

### 1. Types

```typescript
interface User {
  id: number
  name: string
  email?: string  // optional
}

function getUser(id: number): User {
  return { id, name: 'User' }
}
```

### 2. Generics

```typescript
function first<T>(arr: T[]): T {
  return arr[0]
}
```

### 3. Compile

```bash
npx tsc --init
npx tsc
npx tsc --watch
```

### 4. Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true
  }
}
```

---

**Role**: TypeScript Developer  
**Input**: .ts files  
**Output**: .js files

> Typed JS.