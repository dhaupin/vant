# THREADFORGE ARCHITECTURE NOTES

## Frontend Stack
- React 18 + Vite 5 + TypeScript
- Tailwind + shadcn/ui components
- TanStack Query (server state)
- React Router v6
- Sonner (toasts)
- Recharts
- Markdown rendering

## Backend (Supabase)
- Postgres with RLS on ALL tables
- Edge Functions (Deno runtime)
- Auth (Supabase + Reddit OAuth)

## Edge Functions
- assistant-chat (AI chat)
- manifest-compose (post composer)
- process-scheduled-tasks (cron)
- media-r2-proxy, media-s3-proxy
- Reddit OAuth + credentials encryption
- fetch-reddit-data/multi/flairs

## Key Features (No Billing Yet!)
- Dashboard with next-24h queue
- Analytics (live subreddit data)
- Assistant with tools
- Scheduler
- Lists, Templates, Content, Rules
- Media library
- Backup/restore

## Architecture Patterns
- Code-split routes in App.tsx (React.lazy)
- Every table has RLS
- Service role requires auth.getUser()
- Rate limiting built-in
- QoS context integrated

=== THREADFORGE STRUCTURE ===
