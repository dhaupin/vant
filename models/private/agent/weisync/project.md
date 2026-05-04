# WEISYNC PROJECT

MODEL: Weisync Project Memory
CREATED: 2026-05-04
UPDATED: 2026-05-04

=== PROJECT OVERVIEW ===

NAME: Weisync
TAGLINE: Effortless repository harmony
DOMAIN: weisync.com

PURPOSE: Visual GitHub repository sync, merge, and consolidation tool for AI developers managing scattered repos across Lovable, Cursor, Bolt, Replit, V0, etc.

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

AUTH:
- Supabase Auth + GitHub OAuth
- Encrypted token storage

PAYMENTS:
- Stripe (Embedded Checkout + polling)

HOSTING:
- Cloudflare Pages (frontend)
- Self-hosted Supabase (backend)

=== NAVIGATION ORDER ===

HUB:
1. Dashboard
2. Pricing
3. Docs

CORE TOOLS:
4. Snapshot (Import/Export)
5. Clone
6. Sync
7. Merge
8. Revert
9. Purge
10. Diff
11. History

EXPERIMENTAL:
12. Cron Scheduler
13. Templates
14. Release
15. Canary

SETTINGS (always last)

=== FILES STRUCTURE ===

src/
├── pages/       - Route-level views
├── components/  - Shared UI + feature components
├── hooks/      - Auth, data fetching, feature flags
├── config/     - Branding, site ops, security, network, nav
├── types/      - Backend-agnostic data contracts
├── lib/       - API services, security, utilities
└── integrations/ - Auto-generated Supabase client + types

supabase/
└── functions/  - Edge Functions
    └── _shared/ - Shared utilities

=== DATABASE SCHEMA ===

TABLES:
- profiles - User settings, encrypted tokens
- connected_repositories - Linked repos
- sync_operations - Operation history
- subscriptions - Billing info
- operation_usage - Quota tracking
- rate_limits - Server-side rate limiting
- security_audit_log - Security events

VIEW:
- safe_profiles - Public-safe projection

FUNCTIONS:
- check_rate_limit
- cleanup_rate_limits
- cleanup_audit_logs
- handle_new_user
- is_admin

=== EDGE FUNCTIONS ===

19 functions:
- github-oauth
- fetch-github-repos
- sync-repos
- compare-repos
- compare-sync
- merge-files
- purge-repo
- upload-snapshot
- download-repo
- manage-credentials
- manage-account
- verify-turnstile
- billing-checkout
- billing-portal
- check-subscription
- admin-access
- admin-users
- send-email
- revert-repo

=== CONFIG FILES ===

src/config/
- branding.ts      - Brand identity
- site.ts         - Pagination, UI timing, maintenance, feature flags
- security.ts     - Input firewall, rate limiting
- network.ts      - Allowed domains, CORS
- navigation.ts   - Nav items (single source of truth)
- stripe.ts       - Stripe keys, price IDs
- env.ts          - Environment variable mapping

=== FEATURE FLAGS ===

EXPERIMENTAL:
- diff (moved from stable for UX)
- templates
- release
- canary
- cron_managed

=== ISSUES / TODOS ===

- Memory feature was a stub - removed 2026-05-04
- Teams/workspaces in backlog
- Stripe webhooks in backlog
- Multi-provider (GitLab, Bitbucket) in backlog

---
Weisync Project Memory
