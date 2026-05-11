---
version: 0.8.11
permalink: /skills/vant-skill-postgresql.md
layout: default
title: Skill Postgresql
nav_order: 113
---

# PostgreSQL

> Database operations.

---

## When To Use

- Relational data
- Complex queries
- ACID compliance

---

## What To Do

### 1. Connect

```javascript
// pg
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgres://user:pass@localhost:5432/db'
})

const client = await pool.connect()
```

### 2. Common Queries

| Query | What |
|-------|------|
| SELECT | Read data |
| INSERT | Create data |
| UPDATE | Modify data |
| DELETE | Remove data |

### 3. Patterns

```sql
-- Basic
SELECT * FROM users WHERE id = 1

-- Join
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id

-- Aggregate
SELECT COUNT(*), SUM(total) FROM orders
```

### 4. Migrations

```bash
# node-pg-migrate
npx node-pg-migrate create add_users
npx node-pg-migrate up
```

---

## Output

```
## PostgreSQL

| Query | Rows | Time |
|-------|------|------|
| SELECT | [n] | [n]ms |

### Tables
- [list]
```

---

**Role**: PostgreSQL DBA  
**Input**: SQL, schema  
**Output**: Data

> Relational data.