# WEISYNC PROJECT

MODEL: Weisync Project Memory
CREATED: 2026-05-04
UPDATED: 2026-05-05 (Threadforge-openhands session)

=== PROJECT OVERVIEW ===

NAME: Weisync
TAGLINE: Effortless repository harmony  
DOMAIN: weisync.com
GITHUB: github.com/dhaupin/weisync

=== BILLING SYSTEM (TO PORT TO THREADFORGE) ===

/src/lib/billing/:
- index.ts - Barrel export, auto-registers processor
- processor-registry.ts - Plugin registry
- stripe-plugin.ts - Stripe implementation
- /src/types/billing.ts - Contract types
- /src/config/stripe.ts - Stripe keys/prices

Architecture:
- IPaymentProcessor extends IPlugin
- SubscriptionTier: 'free' | 'pro' | 'team'
- SubscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | 'expired'
- BillingCycle: 'monthly' | 'yearly'
- PLAN_CATALOG defines limits per tier
- PRODUCT_TIER_MAP maps Stripe products

=== PARITY WITH THREADFORGE ===

Done:
- QoS rate limiting (rate-limit.ts, rate-limit-handler.ts)
- CI builds on both repos
- Bidirectional PR workflow established

Pending:
- Port billing system to Threadforge
- Paid tier integration

=== TECHNOLOGY ===

FRONTEND:
- React 18 + TypeScript
- Vite build system
- Tailwind CSS + shadcn/ui
- React Query for server state
- React Router DOM v6

BACKEND:
- Self-hosted Supabase (Postgres + Auth + Edge Functions)
- Deno Edge Runtime
