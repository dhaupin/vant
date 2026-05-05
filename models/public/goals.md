# BILLING PORT PLAN

## Status: Ready to Port

### Why Port to Threadforge?
- Weisync already has full Stripe billing
- Threadforge Settings has NO billing tab
- Paid tiers needed for business model
- Bidirectional parity on features

### Files to Port (Priority Order)

1. **src/types/billing.ts**
   - SubscriptionTier: free | pro | team
   - SubscriptionStatus: active | canceled | past_due | etc
   - PLAN_CATALOG with limits
   - IPaymentProcessor interface

2. **src/types/plugins.ts**
   - IPlugin base interface
   - RegistryScope types

3. **src/lib/billing/**
   - index.ts (barrel)
   - processor-registry.ts
   - stripe-plugin.ts

4. **src/components/settings/BillingTab.tsx**
   - Use Threadforge's shadcn/ui
   - Same design as weisync

5. **Database (future)**
   - Add subscription columns to profiles
   - Edge functions for webhooks

### How to Port
1. Copy types first (no deps)
2. Copy lib/billing (framework-agnostic)
3. Create BillingTab using Threadforge components
4. Add Settings route

### Key Decisions Made
- Keep same pricing as weisync
- Use Threadforge's supabase client
- Reuse PLAN_CATALOG from weisync
- Stripe keys via config

=== PORT CAN START TODAY ===
