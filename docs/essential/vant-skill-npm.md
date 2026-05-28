---
version: 0.8.11
permalink: /essential/vant-skill-npm
layout: default
title: Skill Npm
nav_order: 136
---

# NPM

> Node.js package manager.

---

## When To Use

- package.json exists
- node_modules present
- JavaScript/TypeScript projects

---

## What To Do

### 1. Common Commands

| Command | What |
|---------|------|
| npm install | Install deps |
| npm add | Add package |
| npm run | Run scripts |
| npm test | Run tests |
| npm start | Start app |
| npm build | Build |

### 2. Install

```bash
# Install all deps
npm install

# Add package
npm install lodash
npm install --save-dev typescript

# Global
npm install -g typescript
```

### 3. Run Scripts

```bash
npm run dev
npm run build
npm run test
```

### 4. Package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "jest"
  },
  "dependencies": {
    "lodash": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

---

## Output

```
## NPM

| Package | Version | Type |
|---------|---------|------|
| [name] | [version] | [dep/devDep] |

### Scripts
- [list]
```

---

**Role**: NPM Manager  
**Input**: package.json  
**Output**: Dependencies

> Node packages.