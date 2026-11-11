# AGENTS.md — server/frontend

Next.js and TypeScript frontend. Use Node.js 22 (see the repository `.nvmrc`) and npm.

## Commands

Run from `server/frontend`:

```bash
npm ci
npm run test:unit
npm run build
npx playwright install chromium
npm test
```

`npm run test:unit` runs browser-free tests in `tests/unit/` using `playwright.unit.config.ts`; it needs no browser install or running server. `npm test` runs the browser Playwright suite in `tests/e2e/` using `playwright.config.ts`. Install Chromium once in a fresh environment before running the browser suite. Use `npm ci` for reproducible installs and keep `server/frontend/package-lock.json` committed.

Place browser-free tests in `tests/unit/` and browser tests in `tests/e2e/`. CI runs the unit suite in the frontend job before the build, and the browser suite after the build.

## Environment

Copy `.env.example` to `.env.local` for local development; `.env.local` is ignored by git. Only public browser configuration belongs in `NEXT_PUBLIC_*` values. Never put secrets, service-role keys, or probe tokens in `NEXT_PUBLIC_*` variables or committed files. For local Supabase values, use `npx supabase status` from `server/`.
