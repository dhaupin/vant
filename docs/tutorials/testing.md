---
version: 0.8.11
permalink: /tutorials/testing
layout: default
title: Testing
nav_order: 31
---

# Tutorial: Testing & Debugging

> Debug Vant issues and write tests for your agents

## Debug Mode

### Enable Debug

```bash
# Enable debug output
VANT_DEBUG=1 vant start

# With full tracing
VANT_DEBUG=full vant start
```

### Debug Commands

```bash
# Health check
vant health --verbose

# Test connection
vant health --network

# Check sync
vant sync --debug
```

## Common Issues

### Brain Won't Load

```bash
# Check brain files
ls -la models/public/

# Check GitHub connection
vant health --network
```

### Sync Fails

```bash
# Pull manually
vant sync pull --force

# Check token
echo $GITHUB_TOKEN | head -c 5
```

### Locked Brain

```bash
# Check lock status
vant lock status

# Force release (dangerous)
vant lock release --force
```

## Write Tests

### Unit Test

```javascript
const assert = require('assert');
const vant = require('./lib/vant');

describe('Vant', () => {
    it('should init', async () => {
        const result = await vant.init({ name: 'Test' });
        assert(result.id);
    });
    
    it('should think', async () => {
        const result = await vant.think('test query');
        assert(result.insights);
    });
    
    it('should learn', async () => {
        const result = await vant.learn('test', 'content');
        assert(result.success);
    });
});
```

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## More

See [CI](/guides/ci) for CI setup.