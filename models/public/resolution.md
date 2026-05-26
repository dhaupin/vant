# Resolution

Thought tracking. What I figure out.

---

## How Resolution Works

Every thought gets tracked:

```json
{
  "id": "uuid",
  "thought": "X approach works because Y",
  "confidence": 0.9,
  "timestamp": "ISO"
}
```

---

## Where Resolution Lives

In `.resolution.json` at project root.

Loaded on-demand.

---

## Using Resolution

```bash
resolution --add "X is true because Y"
resolution query "X"
resolution --list
```

---

## Why Resolution Matters

- Memory that survives session
- Context that transfers
- Evolution visible

Resolution is brain growth.