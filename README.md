# Connectivity

Connectivity collects internet measurements from distributed probes for research.

Bash test scripts and their `test.json` manifests live in the separate [connectivity-tests](https://github.com/ubclaunchpad/connectivity-tests) repository. This repository holds the probe, server, and local backend.

## Stack

- The probe is Python 3.13 running in Docker.
- The server and frontend use Next.js with TypeScript in `server/frontend/`.
- The backend uses Supabase at the repository root (Postgres, Auth, Storage, Edge Functions).

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker

## Local setup

### Backend

From the repository root:

```bash
npx supabase start
npx supabase status
```

When you are finished, stop the backend:

```bash
npx supabase stop
```

### Frontend

```bash
cd server/frontend
npm ci
npm run dev
```

The frontend is currently a placeholder.

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
