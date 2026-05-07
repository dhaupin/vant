# E2E Test Reference

## Tools

| Tool | Use |
|------|-----|
| Playwright | Browser automation |
| Cypress | E2E testing |
| Puppeteer | Headless Chrome |
| Selenium | Cross-browser |

## Best Practices

1. **Test user flows, not implementation**
2. **Use real data when possible**
3. **Clean up after tests**
4. **Mock only external services**
5. **Run in CI/CD pipeline**

## Common Flows

### Login Flow
```javascript
test('login flow', async () => {
  await page.goto('/login')
  await page.fill('#email', 'test@example.com')
  await page.fill('#password', 'password')
  await page.click('#submit')
  expect(page.url()).toContain('/dashboard')
})
```

### Purchase Flow
```javascript
test('purchase flow', async () => {
  await addToCart(productId)
  await goToCheckout()
  await fillPayment(details)
  await submitOrder()
  expect(confirmation).toBeVisible()
})
```