
# Supabase

> Backend operations.

---

## When To Use

- PostgreSQL backend
- Auth needed
- Real-time data
- Edge functions

---

## What To Do

### 1. Connect

```bash
# supabase-js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xxx.supabase.co',
  'public-anon-key'
)
```

### 2. Common Operations

| Operation | What |
|-----------|------|
| select | Query data |
| insert | Insert data |
| update | Update data |
| delete | Delete data |
| subscribe | Real-time |

### 3. Auth

```javascript
// Sign up
const { user, session } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

// Sign in
const { user, session } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})
```

### 4. Edge Functions

```bash
supabase functions serve
supabase functions deploy my-function
```

---

## Output

```
## Supabase

| Table | Rows | Status |
|-------|------|--------|
| [name] | [n] | [OK] |

### Functions
- [list]
```

---

**Role**: Supabase Backend  
**Input**: Tables, functions  
**Output**: Working backend

> Backend as a service.