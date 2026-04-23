---
permalink: /vant/guides/testing.html
layout: default
title: Testing
---
# Testing

How to test Vant.

## Test Command

### Basic Test

```bash
vant test
```

Runs all build tests:
- Syntax validation
- Module loading
- Brain integrity

### Verbose Output

```bash
vant test --verbose
```

Shows all test output.

## Test Types

### Unit Tests

Individual module tests:

```bash
node bin/build-test.js --unit
```

### Integration Tests

Full flow tests:

```bash
node bin/build-test.js --integration
```

### Load Tests

Brain loading tests:

```bash
node bin/build-test.js --load
```

## Manual Testing

### Brain Loading

```bash
# Load brain
vant load

# Check output
vant health
```

### CLI Commands

```bash
# Test each command
vant start
vant sync
vant health
vant summary
vant rate
```

### MCP Server

```bash
# Start MCP
vant mcp &

# Test endpoint
curl http://localhost:3456/health
```

## Test Patterns

### Happy Path

```bash
vant start
# Expected: Brain loads, no errors
```

### Error Handling

```bash
# Invalid token
GITHUB_TOKEN=invalid vant sync
# Expected: Error with code GITHUB_AUTH
```

### Rate Limit

```bash
# Exhaust rate limit
for i in {1..100}; do vant sync; done

# Expected: RATE_LIMIT error
```

### Brain Corruption

```bash
# Delete brain file
rm models/public/identity.md

# Reload
vant load
# Expected: Error with code BRAIN_LOAD_FAIL
```

## Test Data

### Test Brain

Create test brain:

```bash
mkdir -p models/test
echo "# Test Identity" > models/test/identity.md
echo "name: Test" >> models/test/identity.md
```

### Test Config

```bash
# Invalid config
echo "INVALID=true" > config.ini
vant health
# Expected: Error with code CONFIG_INVALID
```

## CI/CD Testing

### GitHub Actions

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm install
      - name: Test
        run: vant test
```

## Debugging

### Verbose Mode

```bash
VERBOSE=true vant start
```

### Trace Mode

```bash
TRACE=true vant start
```

### Log Output

```bash
vant start 2>&1 | tee vant.log
```

See also: [CLI Reference](../reference/cli.md), [Troubleshooting](./troubleshooting.md)