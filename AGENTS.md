# Repository Guidelines

## Project Structure & Module Organization
`src/app` contains the Next.js App Router pages and route groups for admin, client, and plant flows. Shared UI lives in `src/components`, with domain-specific sections under `admin`, `client`, `factory`, and reusable primitives under `ui`. Business logic and integrations live in `src/services` and `src/lib`, with shared types in `src/types`. Tests live in `tests/unit`, fixtures in `tests/fixtures`, and test-only shims in `tests/stubs`. Database changes belong in `supabase/migrations`; seed data lives in `supabase/seed.sql`. Utility scripts for Excel import and seeding are in `scripts/`.

## Build, Test, and Development Commands
Use `corepack pnpm install` to install dependencies with the pinned pnpm version.

- `corepack pnpm dev` starts the local Next.js server.
- `corepack pnpm lint` runs ESLint with the Next.js and TypeScript rules.
- `corepack pnpm typecheck` runs strict TypeScript checks with `tsc --noEmit`.
- `corepack pnpm test` runs the Vitest suite once in `jsdom`.
- `corepack pnpm build` verifies the production build.
- `corepack pnpm excel:fixtures` refreshes the Excel parity fixture from `Plan Prod mayo 2026.xlsx`.

## Coding Style & Naming Conventions
Write TypeScript with `strict`-safe types and use the `@/*` path alias for imports from `src`. Follow the existing style: 2-space indentation, double quotes, semicolons, and PascalCase for React component files such as `src/components/app-shell.tsx`. Keep service and utility modules lowercase, for example `src/services/schedule.ts`. Prefer colocating UI concerns in components and moving data logic into `src/services` or `src/lib`.

## Testing Guidelines
Vitest is configured for `tests/**/*.test.ts` and `tests/**/*.test.tsx`. Name tests by behavior, for example `tests/unit/schedule.test.ts`. Add or update tests for every behavior change, especially around factory workflow state, Supabase-backed services, and Excel import parity. There is no enforced coverage threshold, so contributors are expected to keep coverage meaningful around changed code.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects, often with a scope: `feat(previos): ...`, `fix(previos): ...`, or a concise Spanish summary. Keep commits focused on one change. PRs should include a brief description, affected flows or routes, linked issue or task if available, and screenshots for UI changes. Note any required migration, seed, or environment updates explicitly.

## Configuration & Data Notes
Keep secrets in `.env.local` only. Required variables are listed in `README.md`, including Supabase keys and `FACTORY_COOKIE_SECRET`. This project uses the online Supabase project; do not assume a local database stack when validating migrations or seeds.

commit and push after your changes, before ending your work and doing the handoff to the user. 

Refer to CLAUDE.md for further instructions. 
