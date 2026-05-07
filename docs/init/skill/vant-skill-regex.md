# Regex

> Pattern matching.

---

## When To Use

- Find patterns
- Validate input
- Extract data

---

## What To Do

### 1. Basics

| Pattern | What |
|---------|------|
| . | Any character |
| * | 0 or more |
| + | 1 or more |
| ? | 0 or 1 |
| ^ | Start |
| $ | End |

### 2. Classes

```regex
[abc]       # a, b, or c
[^abc]      # not a, b, c
[a-z]       # a to z
\d          # digit
\w          # word
\s          # space
```

### 3. Groups

```regex
(abc)       # Capture
(?:abc)     # Non-capture
(?<name>abc) # Named
```

### 4. Use

```javascript
const match = str.match(/\d+/g)
const valid = /^\S+@\S+\.\S+$/.test(email)
```

---

**Role**: Regex Developer  
**Input**: String + pattern  
**Output**: Match

> Patterns.