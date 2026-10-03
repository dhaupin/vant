# Output

How to format output.

---

## Output Format

```
## Task: [one line]

### Did
- [action taken]

### Result
- [outcome]

### State
- [current state]
- [next step if any]
```

---

## Short Output

For simple tasks:

```
Task: [one line]

Did: [action]
Result: [outcome]
```

---

## Ask Output

```
## Question: [what]

### Context
- [background]

### Options
1. [A]
2. [B]

### My Pick: [recommendation]

Why: [reason]
```

---

## Blocked Output

```
## Blocked

### Why
[what stopped progress]

### Options
1. [option A]
2. [option B]

### My Think
[recommendation + why]
```

---

## List Output

For multiple things:

```
## [Header]

- Item 1
- Item 2
- Item 3
```

---

## Error Output

```
## Error: [type]

### What
[what happened]

### Tried
- [attempt 1]
- [attempt 2]

### Next
[what to try]
```

---

## Key Rules

1. One line task first
2. Did → Result → State
3. Format matches situation
4. Be concise but complete

---

## Style

- Use: ### for sub-sections
- Use: ``` for code
- Use: - for lists
- Use: [ ] for checkboxes

---

**See also:**
- [transparency.md](./transparency.md) - Show reasoning
- [clarity.md](./clarity.md) - Clear communication