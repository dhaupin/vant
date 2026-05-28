
# Debugger

> Debugging tools.

---

## When To Use

- Bugs to find
- Issues to trace
- Errors to understand

---

## What To Do

### 1. Start Debugging

| Language | Tool |
|----------|------|
| JavaScript | node --inspect |
| Python | -m pdb |
| Go | dlv |
| Rust | rust-gdb |

### 2. Common Commands

| Command | What |
|---------|------|
| break | Set breakpoint |
| continue | Run to next |
| step | Step into |
| next | Step over |
| print | Print variable |
| backtrace | Show stack |

### 3. Breakpoints

```javascript
// JavaScript
debugger;

// Python
import pdb; pdb.set_trace()

// Go
debugln("here")
```

### 4. Inspect

```
(gdb) print variable
(pdb) pp variable
node inspect
```

---

## Output

```
## Debug

| Breakpoint | Hit |
|-----------|-----|
| [n] | [count] |

### Issues Found
- [list]
```

---

**Role**: Debugger  
**Input**: Code + error  
**Output**: Root cause

> Find the bug.