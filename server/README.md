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

### Local test revision fixture

For database-only work, the SQL seed is sufficient. Local demo downloads also need the two seeded revision files in the private `test-revisions` bucket, which seeding does not populate. Clone [connectivity-tests](https://github.com/ubclaunchpad/connectivity-tests) alongside the `connectivity` checkout, so from `server/` it is at `../../connectivity-tests`, then check out the exact commit recorded in `test_revisions.source_commit_sha`. Upload the files from that checkout:

```bash
npx supabase storage cp ../../connectivity-tests/ping/run.sh ss:///test-revisions/ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/run.sh --content-type text/x-shellscript --experimental
npx supabase storage cp ../../connectivity-tests/ping/test.json ss:///test-revisions/ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd/test.json --content-type application/json --experimental
npx supabase storage ls ss:///test-revisions/ping/dddddddd-dddd-4ddd-8ddd-dddddddddddd --recursive --experimental
```

The seeded `script_sha256` and `definition_sha256` values verify the uploaded bytes. The synthetic local probe fixture uses probe ID `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` and token `connectivity-local-probe-token`; do not reuse these outside local development. Re-run the uploads after `npx supabase db reset` before testing downloads.

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

## Local API

### Recent Measurements

`GET /api/results` returns up to 100 recent measurements, newest received first, with probe name, test name, revision, run time, status, and metrics with labels and units.
Null metric values are preserved and an empty list is returned when no results are available.
