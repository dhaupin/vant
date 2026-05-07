# Redis

> In-memory data store.

---

## When To Use

- Caching
- Sessions
- Real-time
- Rate limiting

---

## What To Do

### 1. Connect

```javascript
import { createClient } from 'redis'

const client = createClient({
  url: 'redis://localhost:6379'
})
await client.connect()
```

### 2. Operations

| Command | What |
|---------|------|
| get/set | String values |
| hget/hset | Hash values |
| lpush/lrange | Lists |
| sadd/smembers | Sets |
| publish | Pub/sub |

### 3. Patterns

```javascript
// Cache
await client.set('user:1', JSON.stringify(user))
const user = JSON.parse(await client.get('user:1'))

// Session
await client.setex(`sess:${id}`, 3600, data)

// Rate limit
const count = await client.incr(`ratelimit:${key}`)
```

### 4. Use Cases

| Use | Benefit |
|-----|----------|
| Cache DB | Speed |
| Session store | Speed |
| Pub/Sub | Real-time |
| Rate limit | Security |

---

## Output

```
## Redis

| Key | Type | TTL |
|-----|------|-----|
| user:1 | string | [n]s |

### operations
- [n] total
```

---

**Role**: Redis Operator  
**Input**: Keys, values  
**Output**: Fast data

> In-memory speed.