---
version: 0.8.11
permalink: /skills/vant-skill-react.md
layout: default
title: Skill React
nav_order: 116
---

# React

> Frontend component library.

---

## When To Use

- DOM components
- SPA framework
- Component-based UI

---

## What To Do

### 1. Component Pattern

```jsx
function MyComponent({ prop }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    // side effects
  }, [])

  return <div>{prop}</div>
}
```

### 2. Common Hooks

| Hook | What |
|------|------|
| useState | Local state |
| useEffect | Side effects |
| useContext | Shared state |
| useRef | DOM reference |
| useMemo | Memorized value |
| useCallback | Memorized function |

### 3. Patterns

```jsx
// Conditional
{condition && <Component />}

// List
items.map(item => <Item key={item.id} {...item} />)

// Form
<form onSubmit={handleSubmit}>
  <input value={value} onChange={e => setValue(e.target.value)} />
</form>
```

### 4. Testing

```javascript
render(<MyComponent prop="value" />)
expect(screen.getByText('value')).toBeInTheDocument()
```

---

## Output

```
## React

| Component | Tested | Status |
|------------|--------|--------|
| [name] | [YES/NO] | [OK] |

### Props Interface
- [list]
```

---

**Role**: React Developer  
**Input**: Components  
**Output**: Working UI

> Component-based UI.