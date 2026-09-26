---
name: tailwind
description: Utility-first CSS.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Tailwind

> Utility-first CSS.

---

## When To Use

- Rapid styling
- Modern UIs
- Component libraries

---

## What To Do

### 1. Classes

```html
<div class="p-4 bg-blue-500 text-white rounded-lg">
  Content
</div>
```

### 2. Common

| Class | What |
|-------|------|
| p-4 / m-4 | Padding/Margin |
| flex / grid | Layout |
| bg-red-500 | Background |
| text-sm | Text size |
| w-full | Width |

### 3. Responsive

```html
<div class="w-full md:w-1/2">
  Mobile first
</div>
```

### 4. Config

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: []
}
```

---

**Role**: Tailwind Developer  
**Input**: HTML  
**Output**: Styled

> Utility CSS.