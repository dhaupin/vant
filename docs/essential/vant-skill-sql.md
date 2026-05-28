---
version: 0.8.11
permalink: /essential/vant-skill-sql
layout: default
title: Skill Sql
nav_order: 149
---

# SQL

> Database query language.

---

## When To Use

- Database queries
- Data analysis
- CRUD operations

---

## What To Do

### 1. Basic

```sql
SELECT columns FROM table
WHERE condition
ORDER BY column
LIMIT n
```

### 2. Operations

| Keyword | What |
|---------|------|
| SELECT | Read |
| INSERT | Create |
| UPDATE | Update |
| DELETE | Remove |
| JOIN | Combine |

### 3. Aggregates

```sql
SELECT COUNT(*), SUM(col), AVG(col), MIN(col), MAX(col)
FROM table
GROUP BY col
HAVING count > 1
```

### 4. Subqueries

```sql
SELECT * FROM users
WHERE id IN (SELECT user_id FROM orders)
```

---

**Role**: SQL Developer  
**Input**: Query  
**Output**: Results

> Query.