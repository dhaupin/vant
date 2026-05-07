# Test Fuzz

> Random input testing.

---

## When To Use

- Finding hidden bugs
- Invalid input handling
- Security vulnerabilities

---

## What To Test

### 1. Random Inputs

```bash
ffuf -w wordlist.txt               # Web fuzzing
radamsa input.txt                # Generate bad input
jsmith file                   # JSON fuzzing
```

### 2. Crash Detection

| Input | Result |
|--------|--------|
| Random string | Handle gracefully |
| Null bytes | No crash |
| Extreme numbers | No overflow |

### 3. Fuzz Tools

| Tool | Use |
|--------|-------|
| ffuf | Web fuzzing |
| radamsa | General fuzzing |
| jsmith | JSON fuzzing |
| AFL | Binary fuzzing |

---

## Output

```
## Fuzz Results

| Input | Crash | Hang | Result |
|-------|-------|------|--------|
| 1000 | [n] | [n] | [PASS/FAIL] |

### Crashes
- [reproduce steps]
```

> Throw chaos at it.