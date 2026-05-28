
# Help

> How do I do X?

---

## Quick - What Do You Need?

| Need | Go To |
|------|-------|
| Run something | # Run |
| Understand code | # Read |
| Fix something | # Debug |
| Check something | # Verify |
| Build something | # Build |
| Find something | # Search |

---

## Run

### I want to run this project

```bash
# Check package.json for scripts
cat package.json | grep -A20 '"scripts"'

# Common commands
npm install
npm run dev
npm test
npm run build
npm start
```

### I want to add a script

```bash
# Edit scripts in package.json
nano package.json
```

---

## Read

### I want to understand this code

1. Find entry point:
```bash
# CLI: main file
head -20 bin/*

# Library: main export
grep "^module.exports" lib/*.js | head -10
```

2. Trace what happens:
- Read top to bottom
- Functions call functions
- Find where data comes from/goes to

3. Check dependencies:
```bash
# What does it use?
grep -h "^const\|^import" *.js | sort -u
```

---

## Debug

### It's not working

1. **Check error message** - Read what it says
2. **Find the error** - grep for it
3. **Check recent changes** - git diff
4. **Check env** - variables set?
5. **Run with debug** - NODE_DEBUG=* node app.js

### Common fixes:

| Error | Fix |
|-------|-----|
| Cannot find module | npm install |
| Syntax error | Check line number |
| Auth error | Check API keys |
| Port in use | Kill process: lsof -i :port |

---

## Verify

### Check if something works

```bash
# Test the thing
npm test

# Check output
node file.js

# Verify version
node -v
npm -v
```

---

## Build

### I want to build/deploy

1. **Check build command:**
```bash
grep build package.json
```

2. **Common builds:**
```bash
npm run build      # Frontend
npm run package  # Backend
```

3. **Deploy:**
```bash
npm publish      # npm
git push        # deploy
```

---

## Search

### Find something in code

```bash
# Find string
grep -r "string" .

# Find function
grep -r "function name" .

# Find file
find . -name "*.js"
```

---

## Output

When asking for help, include:

1. **What you're trying to do**
2. **What you tried**
3. **What happened**
4. **Environment** (node -v, npm -v)

---

**Role**: Helper  
**Input**: What you need  
**Output**: How to do it