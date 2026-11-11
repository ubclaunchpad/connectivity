# Server

This directory holds the server-side code.

- `frontend/` — Next.js and TypeScript web app. Run `npm ci` and `npm run dev` from `server/frontend`.
- `supabase/` — Postgres, Auth, Storage, and Edge Functions, configured for local development.
- `package.json` — pinned tooling for this directory, including the Supabase CLI.

See the [root README](../README.md) for setup.

## Supabase

Run all Supabase commands from `server/`. Install the pinned CLI first:

```bash
npm ci
npx supabase start
npx supabase status
```

The local API is at `http://127.0.0.1:54421` and Supabase Studio is at `http://127.0.0.1:54423`. These separate ports allow this Supabase project to run alongside another local Supabase project.

When you are finished, stop the local backend:

```bash
npx supabase stop
```

### Migrations

Schema changes live in `server/supabase/migrations/` as timestamped SQL files. Create them with `npx supabase migration new <name>`, then apply pending migrations locally with `npx supabase migration up`.

### Local reset

`npx supabase db reset` replaces all local database data, then replays all migrations and loads `server/supabase/seed.sql`. Seeding is enabled in `[db.seed]` in `server/supabase/config.toml`; keep seed data synthetic.

### Database tests

Database tests use pgTAP and live in `server/supabase/tests/database/`. With the local backend running, run them from `server/`:

```bash
npx supabase test db
```

Future migrations should add tests for their schema changes, constraints, functions, and RLS policies. Keep fixtures synthetic, and wrap tests in a transaction that rolls back.

If the frontend needs Supabase locally, copy `.env.example` to `.env.local` in `server/frontend` and use values from `npx supabase status` run in `server/`:

- `NEXT_PUBLIC_SUPABASE_URL` — the local API URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the local publishable (anon) key.

## Playwright

Tests live in `server/frontend/`. From `server/frontend/`, install dependencies first:

```bash
npm ci
```

Run browser-free unit tests without installing Chromium or starting a server:

```bash
npm run test:unit
```

Run the browser-based end-to-end tests after installing Chromium and building the app:

```bash
npm run build
npx playwright install chromium
npm test
```
