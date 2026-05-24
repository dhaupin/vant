# Security Chain Pattern

> Generic multi-layer defense pattern - adaptable to any agent/app framework.

## THE CHAIN

```
REQUEST → [LAYER 1] → [LAYER 2] → [LAYER 3] → ... → [LAYER N] → EXECUTE
```

Each layer can deny. Order matters - earlier = physical, later = moral/priority.

## COMMON LAYERS

| Layer | Purpose | Example |
|-------|--------|---------|
| **Permissions** | Who can do what | sudo |
| **Confinement** | Stay in bounds | sandbox |
| **Rate** | Too much? | QoS |
| **Approval** | Need allowance? | escrow |
| **Compliance** | Legal? | license |

## KEY PRINCIPLES

1. **Defense in depth** - Multiple layers, not one gate
2. **Order matters** - Physical → Logical → Moral
3. **Fail closed** - Default deny
4. **Audit trail** - Log each layer decision

---

## ADAPTING

Pick layers relevant to your project:
- Filesystem app → sandbox first
- API → rate limit first  
- Commercial → license check last