---
version: 0.8.11
permalink: /essential/vant-skill-typescript.md
layout: default
title: Skill Typescript
nav_order: 164
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