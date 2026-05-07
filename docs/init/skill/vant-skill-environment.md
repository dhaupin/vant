# Environment

> Environment variables.

---

## When To Use

- Config secrets
- API keys
- Environment-specific settings

---

## What To Do

### 1. Files

| File | What |
|------|------|
| .env | Local (gitignore) |
| .env.local | Local override |
| .env.production | Production |

### 2. Syntax

```
API_KEY=secret123
DATABASE_URL=postgres://localhost
DEBUG=true
```

### 3. Load

```javascript
// Node
require('dotenv').config()
process.env.API_KEY

# Python
from dotenv import load_dotenv
load_dotenv()
os.environ['API_KEY']
```

### 4. Best Practice

- Never commit secrets
- Use different values per env
- Validate required vars

---

**Role**: Environment Manager  
**Input**: .env files  
**Output**: Config

> Secrets.