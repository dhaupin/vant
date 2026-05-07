# Deno

> Deno runtime operations.

---

## When To Use

- deno.json/deno.jsonc exists
- deno.lock present
- Scripts use deno

---

## What To Do

### 1. Common Commands

| Command | What |
|---------|------|
| deno init | Initialize project |
| deno run | Execute script |
| deno test | Run tests |
| deno add | Add dependency |
| deno task | Run task |
| deno fmt | Format code |
| deno lint | Lint code |

### 2. Add Dependencies

```bash
# JSR packages
deno add jsr:@std/path

# npm packages
deno add npm:react
```

### 3. Run with Permissions

```bash
deno run --allow-net --allow-read main.ts

# Test
deno test --allow-net --allow-read
```

### 4. Tasks

```bash
deno task dev    # Run dev task
deno task build # Run build task
```

---

## Output

```
## Deno

| Command | Status |
|---------|--------|
| Run | [PASS/FAIL] |
| Test | [n] passed |

### Dependencies
- [list]
```

---

**Role**: Deno Developer  
**Input**: deno scripts  
**Output**: Working code

> Secure JavaScript.