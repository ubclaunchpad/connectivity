# AGENTS.md

Connectivity collects internet measurements from distributed probes. Keep changes scoped to the area you are touching, and run that area's checks before finishing.

## Repository layout

- `probe/` — probe software: Python 3.13, packaged with `pyproject.toml`, and run in Docker through `compose.yaml`.
- `server/frontend/` — Next.js and TypeScript frontend: Node.js 22 (see `.nvmrc`) and npm.
- `server/supabase/` — backend for the server (Postgres, Auth, Storage, Edge Functions). Its configuration lives at `server/supabase/config.toml`; run Supabase CLI commands from `server/`.

Bash test scripts and their `test.json` manifests live in the separate [connectivity-tests](https://github.com/ubclaunchpad/connectivity-tests) repository. Changes there are reviewed separately; do not add test scripts to this repository.

## Skills

Use the installed skills before relevant changes:

- `.agents/skills/supabase/SKILL.md` for Supabase features, clients, Auth, RLS, Storage, Edge Functions, and debugging.
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` for schema, SQL, migrations, indexes, RLS, and query or performance work.

Keep `.agents/skills/` and `skills-lock.json` in sync with the official skills, and commit lockfile changes.

## Backend and data

- Make schema changes in versioned SQL migrations under `server/supabase/migrations/`; do not treat a local database edit as the source of truth.
- Keep local seed data synthetic. Never use real probe identities, locations, tokens, or measurement data in migrations, seeds, tests, or fixtures.
- Apply and verify migrations with the Supabase CLI from `server/`, then check `npx supabase status`. Use `npx supabase stop` when finished.

## Secrets and lockfiles

This repository is public. Do not commit credentials, API keys, tokens, private endpoints, `.env*` values, or probe identities and locations. Keep local values in ignored environment files.

Commit dependency lockfiles whenever they change: `server/frontend/package-lock.json`, `server/package-lock.json`, and `skills-lock.json`.

## Checks

Probe (from `probe/`):

```bash
docker compose --env-file .env.example config --quiet
docker compose up --build
```

The probe validates `PROBE_ID`, `BACKEND_URL`, and `PROBE_TOKEN`, prints `config valid`, and exits. For a non-Docker check, run `PYTHONPATH=src python3 -m probe` with those variables set.

Backend (from `server/`):

Install dependencies with `npm ci` from `server/`, then use the Supabase CLI from the same directory. See the [README](README.md) for local setup and the CLI service commands.

For frontend changes, use the scoped commands in `server/frontend/AGENTS.md`. Run the checks for every area you change.
