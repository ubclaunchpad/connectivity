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

## Edge Functions

Probe-facing functions live in `server/supabase/functions/`. They authenticate with the `X-Probe-Token` header instead of a Supabase JWT, so each has `verify_jwt = false` in `config.toml` and checks the token itself with `_shared/probe-auth.ts`. Error bodies are always `{"error":"<code>"}` and never echo request data.

### `POST /functions/v1/probe-measurements`

Uploads the result of one script run. The body has exactly these fields: `schema_version` (1), `id` (the run UUID), `probe_id`, `test_revision_id`, `started_at`, `finished_at`, `status`, `result_code`, `result_data`, and `location`. The server sets `received_at`.

- Timestamps are RFC 3339 with `Z` or an offset and at most microsecond precision. `finished_at` must not be before `started_at`, and neither may be more than 5 minutes in the future.
- `completed` runs need `result_code` 0 and a `result_data` with exactly the revision's `definition.metrics` keys. Values are finite numbers, or `null` where the metric is `nullable` (Ping latency when every packet is lost).
- `failed` and `timeout` runs need `result_data` `{}` and an integer or `null` `result_code`.
- `location` is `null` or `{"latitude": -90..90, "longitude": -180..180, "accuracy_m": >= 0}`; `accuracy_m` is optional.

| Outcome | Status | Body |
|---|---|---|
| Saved | 201 | `{"id":"<run id>"}` |
| Identical repeat; original row and `received_at` kept | 200 | `{"id":"<run id>"}` |
| Malformed or invalid data, including metrics | 400 | `{"error":"invalid_request"}` |
| Rejected token, revoked credential, or disabled probe | 401 | `{"error":"unauthorized"}` |
| Not `POST` | 405 | `{"error":"method_not_allowed"}` |
| Run ID already saved with different data or by another probe | 409 | `{"error":"conflict"}` |
| Body over 64 KiB | 413 | `{"error":"payload_too_large"}` |
| Unknown `test_revision_id` | 422 | `{"error":"unknown_revision"}` |
| Server failure | 500 | `{"error":"internal_error"}` |

### Function tests

Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2, then run from `server/supabase/functions/`:

```bash
deno lint
deno check probe-measurements/index.ts
deno test
```

Handler tests use a stand-in identity check and an in-memory store, so they need no running backend.

### Local function check

With the local backend running, serve the functions from `server/`:

```bash
npx supabase functions serve
```

Save the synthetic example as `/tmp/connectivity-measurement.json`:

```json
{"schema_version":1,"id":"11111111-1111-4111-8111-111111111111","probe_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","test_revision_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","started_at":"2026-11-09T20:00:00Z","finished_at":"2026-11-09T20:00:05Z","status":"completed","result_code":0,"result_data":{"rtt_avg_ms":18.4,"packet_loss_pct":0},"location":null}
```

Then upload it with the synthetic local token:

```bash
curl -i http://127.0.0.1:54421/functions/v1/probe-measurements \
  -H 'Content-Type: application/json' \
  -H 'X-Probe-Token: connectivity-local-probe-token' \
  --data-binary @/tmp/connectivity-measurement.json
```

The first upload returns `201`, and sending it again returns `200` with the same ID. `npx supabase db reset` clears saved measurements.

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
