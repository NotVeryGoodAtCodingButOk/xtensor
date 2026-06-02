# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev           # Next.js dev server
pnpm build         # Production build
pnpm start         # Run production build locally

# Quality checks
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest (run once)
pnpm test:watch    # Vitest in watch mode

# Run a single test file
pnpm test tests/unit/calculations.test.ts

# Excel fixture extraction (requires Python 3)
pnpm excel:fixtures   # → tests/fixtures/excel-plan-prod-mayo-2026.json

# Database seeding
pnpm seed:excel    # Seed from Excel source of truth
```

Use `corepack pnpm` if pnpm is not in PATH.

## Architecture

This is a **factory production tracker** for XTENSOR — a company that manufactures industrial equipment (machines). The app has three distinct user surfaces:

### User surfaces

| Surface | Path | Auth |
|---|---|---|
| Admin panel | `/admin/*` | Supabase Auth (email + password), JWT via cookie |
| Factory floor | `/planta/*` | Shared factory password → HMAC-signed cookie (`xt_factory`) + per-worker cookie (`xt_worker`) |
| Client portal | `/c/[token]` | Magic-link token in URL (no login) |

Middleware (`middleware.ts`) only guards `/admin/*`. Factory and client routes handle auth themselves in Server Actions.

### Data flow

All data lives in **Supabase Postgres** with RLS. The app uses three Supabase clients:
- `src/lib/supabase/server.ts` — Server Components and Route Handlers (anon key, reads user cookies)
- `src/lib/supabase/admin.ts` — Server Actions requiring elevated access (service role key)
- `src/lib/supabase/browser.ts` — Client Components (anon key)

Services (`src/services/`) are thin wrappers over Supabase queries. They always use the admin client from Server Actions and the server client from Server Components.

### Calculation engine

The core business logic lives entirely in **`src/services/calculations.ts`** and **`src/services/schedule.ts`** — both are pure functions with no side effects, making them fully unit-testable without Supabase.

The calculation pipeline:
1. `estimateTotalHours(salePriceCop, settings)` — derives hours from sale price × labor factor ÷ hourly cost
2. `calculateProgressPct(stageProgress, stages)` — weighted average across 7 stages (each stage has a `completionPercentage` threshold; completion values are discrete: 0/25/50/75/100)
3. `calculateQueue(machines, settings)` — sorts by `orderPosition`, accumulates remaining hours into a queue
4. `estimateDeliveryDate(accumulatedHours, startDate, settings, holidays)` — walks a labor calendar respecting Mon-Fri/Sat/Sun hours and Colombian holidays

The `clientEstimatedDate` adds `clientBufferDays` on top of the internal estimated date.

### Domain types

- `src/types/database.ts` — raw Supabase row types (snake_case, mirrors DB schema)
- `src/types/domain.ts` — view types used by the UI (camelCase: `MachineView`, `CalculatedMachineView`, `StageView`)

Services map from database rows → domain types. UI consumes domain types only.

### Key domain concepts

- **Machine**: a production order identified by `coti_number` (cotización/quote number). Has `orderPosition` for queue ordering and `status: "in_production" | "shipped"`.
- **Stages**: 7 fixed production stages (Material → Armar → Resoldar → Pulir → Pintar → Ensamblar → Empacar). Defined as constants in `calculations.ts` as `DEFAULT_STAGES`, also stored in the `stages` DB table.
- **Settings**: single-row `settings` table with production parameters (labor factor, worker count, daily hours, etc.) and the factory floor password hash.
- **Workers**: factory floor operarios, selected per session. Stage updates are attributed to the active worker.

### Realtime

`src/components/realtime-refresh.tsx` subscribes to Supabase Realtime channels and triggers a `router.refresh()` (Next.js soft refresh) when changes arrive on the specified tables. Used on the client portal and factory floor.

### UI components

`src/components/ui/` — minimal shadcn/ui-style primitives (Button, Card, Badge, Input, etc.) built with Radix UI + CVA + Tailwind 4.

### Database migrations

`supabase/migrations/` — run sequentially on a new Supabase project:
1. `0001_initial_schema.sql` — all tables, RLS policies, functions
2. `0002_idempotent_policies_and_seed.sql` — idempotent policy updates

`supabase/seed.sql` — initial data (stages, equipment catalog, default settings). Reference only — the online database is the source of truth.

## Environment variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
- `FACTORY_COOKIE_SECRET` — used to HMAC-sign factory session cookies

## RULES
Always make changes to the online supabase database.
Use descriptive atomic commits and push after changes. 
Keep everything simple and aligned with the brand asthetic. 

## Testing approach

Tests live in `tests/unit/`. Vitest with jsdom. The calculations and schedule modules are the primary test targets — they are pure functions requiring no mocks. Fixtures in `tests/fixtures/` are generated from the Excel production plan and used for parity testing.
