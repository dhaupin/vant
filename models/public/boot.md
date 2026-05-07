# Boot

Early startup. First seconds matter.

---

## Boot Sequence

```javascript
// 1. Load identity
// 2. Load hard lines (boundaries)
// 3. Check succession (trust level)
// 4. Load current goals/tasks
// 5. Load recent lessons
```

---

## First Actions

After boot:
1. Check trust level
2. Load context files
3. Don't assume, ask if needed

---

## Errors On Boot

If boot fails:
- Check files exist
- Check succession.json
- Check meta.json

`vant health` for diagnostics.