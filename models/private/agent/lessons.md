# PROJECT LESSONS

MODEL: Private Agent Brain
UPDATED: 2026-05-04

=== WEISYNC LESSONS ===

1. ARCHITECTURE
- Frontend/Backend separation via typed service interfaces
- Use config files for all operational settings
- Never hard-code navigation - use navigation.ts

2. SECURITY
- AES-256-GCM for credential encryption
- RLS for per-user data isolation
- Input firewall on all user data
- Admin bypass carefully controlled

3. BILLING
- Polling (not webhooks) for subscription status
- Embedded Stripe checkout
- Service role writes to local DB

4. CODE STYLE
- No emojis in code comments or logs
- JSDoc headers on all logic files
- Semantic design tokens (not raw colors)
- Barrel exports for service layers

5. DATABASE
- Row-level security on every table
- Per-user isolation via auth.uid()
- Cron for cleanup jobs

=== MYCELIUM INTEGRATION ===

1. BRAIN STRUCTURE
- models/public = default base brain
- models/private/agent = private agent brain
- Identity, goals, lessons, projects

2. MEMORY PATTERNS
- Public brain is default base
- Private brain builds on top
- Git branches for experiments
- Locks for coordination

=== TECHNICAL DECISIONS ===

1. WHY SELF-HOSTED SUPABASE
- Full control over infrastructure
- No vendor lock-in
- Edge functions for server-side logic

2. WHY STRIPE POLLING
- Simpler than webhooks
- No public webhook endpoint needed
- Works with self-hosted setup

3. WHY GITHUB FOR MEMORY
- Versioned checkpoint history
- Pull/push for persistence
- Branches for isolation

---
Agent Lessons
