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

### Probe check-in function

`POST /functions/v1/probe-check-in` is served from `server/supabase/functions/probe-check-in/`. The probe sends `{"probe_id": "<uuid>"}` with its device token in the `X-Probe-Token` header. Platform JWT verification is off for this function (`[functions.probe-check-in]` in `config.toml`), so the function checks the token itself using `functions/_shared/probe-auth.ts`. Any other probe-facing function must reuse that helper and add its own `verify_jwt = false` block.

A verified probe gets `200` with either `{"assignment": {...}}` (the revision ID plus a signed `download_path` and `sha256` for `script` and `definition`) or `{"assignment": null}`. Download paths start with `/storage/v1/` and resolve against the probe's `BACKEND_URL`; they expire after 5 minutes.

Errors are `{"error": "<code>"}`:

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Body is not a JSON object with a UUID `probe_id`. |
| 401 | `unauthorized` | Missing or wrong token, token for another probe, unknown probe, revoked credential, or disabled probe. Identical for all of them. |
| 405 | `method_not_allowed` | Not a `POST`. |
| 500 | `internal_error` | The identity check or the function itself failed. |
| 500 | `assignment_read_failed` | The assignment or revision could not be read. |
| 500 | `signing_failed` | The download links could not be signed. |

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
