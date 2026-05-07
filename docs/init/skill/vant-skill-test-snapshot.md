# Test Snapshot

> Visual/pixel regression.

---

## When To Use

- UI changes
- Visual components
- CSS changes

---

## What To Test

### 1. Screenshot Diff

```javascript
// Percy, Chromatic, BackstopJS
 Percy.compare({
   scheme: 'master',
   theme: 'new'
 })
```

### 2. Component Screenshots

| Component | Current | Previous | Diff |
|-----------|---------|----------|------|
| Button | [img] | [img] | [n%] |
| Header | [img] | [img] | [n%] |

### 3. Visual Tools

| Tool | Use |
|--------|-------|
| Percy | CI visual |
| Chromatic | Storybook |
| BackstopJS | Self-hosted |
| Pixelmatch | CLI |

---

## Output

```
## Visual Regression

| Element | Diff | Status |
|---------|------|--------|
| Button | 0.0% | ✓ |
| Header | 2.1% | FAIL |
| Footer | 0.0% | ✓ |

### Changed
- [elements]
```

> Did it look different?