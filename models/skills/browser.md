
# Browser Automation

> Web browser control.

---

## When To Use

- Web interaction required
- JavaScript rendering
- UI testing

---

## What To Do

### 1. Navigation

```bash
browser_navigate url="https://..."
```

### 2. Interaction

| Action | Tool |
|--------|------|
| Click | browser_click |
| Type | browser_type |
| Scroll | browser_scroll |
| Get content | browser_get_content |

### 3. Extract Data

```javascript
// Get page content
browser_get_content()

// Get screenshot
browser_get_state(include_screenshot=true)
```

### 4. Wait for JS

```bash
# Pages render dynamically
# Use browser_get_state after navigate
```

---

## Output

```
## Browser Automation

| Action | Result |
|--------|--------|
| Navigate | [URL] |
| Click | [element] |
| Extract | [data] |

### Screenshots
- [count]
```

---

**Role**: Browser Automator  
**Input**: URLs  
**Output**: Extracted data

> Web at your command.