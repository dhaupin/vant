
# Vite

> Frontend build tool.

---

## When To Use

- Fast dev server
- Modern build
- SPA bundling

---

## What To Do

### 1. Start

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install
npm run dev
```

### 2. Commands

| Command | What |
|---------|------|
| dev | Start dev server |
| build | Production build |
| preview | Preview build |
| lint | Run linter |

### 3. Config

```javascript
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  }
})
```

### 4. Environment

```javascript
// .env
VITE_API_URL=http://localhost:3000

// Usage
import.meta.env.VITE_API_URL
```

---

## Output

```
## Vite

| Command | Status |
|---------|--------|
| Dev | [RUNNING] |
| Build | [PASS] |
| Preview | [READY] |

### Bundle Size
- [n]KB
```

---

**Role**: Vite Developer  
**Input**: Source  
**Output**: Built app

> Fast builds.