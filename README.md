# Connectivity

Connectivity collects internet measurements from distributed probes for research.

Bash test scripts and their `test.json` manifests live in the separate [connectivity-tests](https://github.com/ubclaunchpad/connectivity-tests) repository. This repository holds the probe, server, and local backend.

## Stack

- The probe is Python 3.13 running in Docker.
- The web app uses Next.js and TypeScript in `server/frontend/`.
- The backend uses Supabase at `server/supabase/` (Postgres, Auth, Storage, Edge Functions).

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker

## Local setup

### Backend

The Supabase project lives in `server/supabase/`, and the Supabase CLI is a pinned dev dependency of the tooling package in `server/`. From `server/`, install the tooling once:

```bash
npm ci
```

Then start the local backend:

```bash
npx supabase start
npx supabase status
```

When you are finished, stop the backend:

```bash
npx supabase stop
```

#### Migrations

Add schema changes as timestamped SQL files in `server/supabase/migrations/`, then apply them locally with `npx supabase migration up` from `server/`. Do not edit the remote database by hand; commit migrations so everyone can reproduce the schema.

#### Local reset

`npx supabase db reset` from `server/` replaces all local database data, then replays every migration in order and loads `server/supabase/seed.sql`. The seed file is for synthetic local development rows only.

#### Database tests

Database tests use pgTAP and live in `server/supabase/tests/database/`. With the local backend running, run them from `server/`:

```bash
npx supabase test db
```

Future migrations should add tests for their schema changes, constraints, functions, and RLS policies. Keep fixtures synthetic, and wrap tests in a transaction that rolls back. See the [server README](server/README.md#database-tests) for details.

#### Edge Functions

Probe-facing Edge Functions live in `server/supabase/functions/`. Their tests use [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2; see the [server README](server/README.md#edge-functions) for the endpoint contract, test commands, and a local upload check.

### Frontend

```bash
cd server/frontend
npm ci
npm run dev
```

The frontend is currently a placeholder.

End-to-end tests use Playwright; see the [server README](server/README.md#playwright) for how to run them.

### Probe

```bash
cd probe
cp .env.example .env
docker compose up --build
```

The probe checks its configuration, prints `config valid`, and exits.

## Design notes

See the project design document shared with the team for current design decisions.

This repository is public. Do not commit credentials, private endpoints, or probe identities and locations.
