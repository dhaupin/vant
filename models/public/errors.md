# Errors

Error handling and recovery for Vant.

---

## Error Types

- **VantError** - General Vant errors (in lib/errors.js)
- **LockError** - Lock acquisition failures
- **BranchError** - Git branch operations
- **NetworkError** - GitHub API failures
- **ConfigError** - Configuration issues

## Handling

```javascript
const errors = require('./lib/errors');

try {
    await doSomething();
} catch (e) {
    if (errors.isLockError(e)) {
        // Retry later
    } else if (errors.isNetworkError(e)) {
        // Retry with backoff
    } else {
        // Unknown error, log and stop
        console.error(e);
    }
}
```

## Retry Strategy

- Network errors: Exponential backoff
- Lock errors: Wait and retry
- Git errors: Check state manually

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Lock held | Another agent has lock | Wait or use different agent ID |
| Branch exists | Branch already created | Switch to existing branch |
| Not found | File or endpoint missing | Check path/URL |
| Rate limited | GitHub API limit | Wait, reduce requests |

---

## Fail Safe

When in doubt:
1. Log the error
2. Stop the operation  
3. Do not corrupt state
4. Signal failure clearly