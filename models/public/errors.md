# ERRORS

Error handling and recovery.

---

## ERROR TYPES

- **NetworkError** - Connection failures
- **LockError** - Resource contention
- **ConfigError** - Configuration issues
- **NotFoundError** - Missing resources

## HANDLING

```javascript
try {
    await doSomething();
} catch (e) {
    if (e.code === 'LOCKED') {
        // Retry later
    } else if (e.code === 'NETWORK') {
        // Retry with backoff
    } else {
        // Log and stop
        console.error(e);
    }
}
```

## RETRY STRATEGY

- Network errors: Exponential backoff
- Lock errors: Wait and retry

## COMMON ERRORS

| Error | Cause | Fix |
|-------|-------|-----|
| Lock held | Contested resource | Wait and retry |
| Not found | Missing file/endpoint | Check path |
| Rate limited | Too many requests | Reduce requests |

## FAIL SAFE

When in doubt:
1. Log the error
2. Stop the operation
3. Do not corrupt state

---

**See also:**
- [reflection.md](./reflection.md) - Learning from errors
- [humility.md](./humility.md) - Being wrong is okay