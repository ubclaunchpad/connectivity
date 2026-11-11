# Server

This directory holds the server-side code.

- `frontend/` — Next.js and TypeScript web app. Run `npm ci` and `npm run dev` from `server/frontend`.
- Supabase backend — Postgres, Auth, Storage, and Edge Functions, configured at the repository root. Use `npx supabase start`, `npx supabase status`, and `npx supabase stop` from the root.

See the [root README](../README.md) for setup.

If the frontend needs Supabase locally, copy `.env.example` to `.env` in `server/frontend` and use values from `npx supabase status`:

- `NEXT_PUBLIC_SUPABASE_URL` — the local API URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the local publishable (anon) key.

Database migrations and Edge Functions are upcoming and will live in the root `supabase/` directory.
