# AGENTS.md — server/frontend

Next.js and TypeScript frontend. Use Node.js 22 (see the repository `.nvmrc`) and npm.

## Commands

Run from `server/frontend`:

```bash
npm ci
npm run build
npx playwright install chromium
npm test
```

`npm test` runs the Playwright suite in `tests/e2e/`. Install Chromium once in a fresh environment before running the suite. Use `npm ci` for reproducible installs and keep `server/frontend/package-lock.json` committed.

## Environment

Copy `.env.example` to `.env.local` for local development; `.env.local` is ignored by git. Only public browser configuration belongs in `NEXT_PUBLIC_*` values. Never put secrets, service-role keys, or probe tokens in `NEXT_PUBLIC_*` variables or committed files. For local Supabase values, use `npx supabase status` from `server/`.
