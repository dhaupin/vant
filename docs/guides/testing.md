---
permalink: /guides/testing.html
layout: default
title: Testing
---
# Testing

How to test Vant.

## Test Command
Run release commands.

### Basic Test
Test this feature.

```bash
vant test
```

Runs all build tests:
- Syntax validation
- Module loading
- Brain integrity

### Verbose Output
Show detailed output.

```bash
vant test --verbose
```

Shows all test output.

## Test Types
Types of tests available.

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
Test your Vant setup and agents.

### Brain Loading
Test brain loading.

```bash
# Load brain
vant load

# Check output
vant health
```

### CLI Commands
Command-line usage.

```bash
# Test each command
vant start
vant sync
vant health
vant summary
vant rate
```

### MCP Server
MCP server functionality.

```bash
# Start MCP
vant mcp &

# Test endpoint
curl http://localhost:3456/health
```

## Test Patterns
Common test patterns.

### Happy Path
Normal operation test.

```bash
vant start
# Expected: Brain loads, no errors
```

Example:

### Error Handling
Handle this error case.

```bash
# Invalid token
GITHUB_TOKEN=invalid vant sync
# Expected: Error with code GITHUB_AUTH
```

Example:

### Rate Limit
Check rate limits.

```bash
# Exhaust rate limit
for i in {1..100}; do vant sync; done

# Expected: RATE_LIMIT error
```

Example:

### Brain Corruption
Handle corrupted brain files.

```bash
# Delete brain file
rm models/public/identity.md

# Reload
vant load
# Expected: Error with code BRAIN_LOAD_FAIL
```

Example:

## Test Data
Key information for the plugin.

### Test Brain

Create test brain:

```bash
mkdir -p models/test
echo "# Test Identity" > models/test/identity.md
echo "name: Test" >> models/test/identity.md
```

### Test Config
Configuration options.

```bash
# Invalid config
echo "INVALID=true" > config.ini
vant health
# Expected: Error with code CONFIG_INVALID
```

Example:

## CI/CD Testing
Test your Vant setup and agents.

### GitHub Actions
Fix GitHub connection issues.

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
Debug test failures.

### Verbose Mode
Show detailed output.

```bash
VERBOSE=true vant start
```

### Trace Mode
Trace test execution.

```bash
TRACE=true vant start
```

### Log Output
Logging configuration.

```bash
vant start 2>&1 | tee vant.log
```

See also: [CLI Reference](/vant/reference/cli.html), [Troubleshooting](/vant/guides/troubleshooting.html)