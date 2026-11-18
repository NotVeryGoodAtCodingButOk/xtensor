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

Middleware (`src/middleware.ts` — must live in `src/` because the app uses `src/app`) only guards `/admin/*`. Factory and client routes handle auth themselves in Server Actions.

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
2. `calculateProgressPct(stageProgress, stages)` — weighted average across 7 stages (each stage has a `completionPercentage` threshold; completion values: the DB allows 0/25/50/75/100, the factory UI only uses 0 and 100)
3. `calculateQueue(machines, settings)` — sorts by `orderPosition`, accumulates remaining hours into a queue
4. `estimateDeliveryDate(accumulatedHours, startDate, settings, holidays)` — walks a labor calendar respecting Mon-Fri/Sat/Sun hours and Colombian holidays

The `clientEstimatedDate` adds `clientBufferDays` on top of the internal estimated date.

### Domain types

- `src/types/database.ts` — raw Supabase row types (snake_case, mirrors DB schema)
- `src/types/domain.ts` — view types used by the UI (camelCase: `MachineView`, `CalculatedMachineView`, `StageView`)

Services map from database rows → domain types. UI consumes domain types only.

### Key domain concepts

- **Machine**: a production order identified by `serial_number` (cotización/quote number). Has `orderPosition` for queue ordering and `status: "pending" (previos) | "in_production" | "finished" | "shipped" | "on_hold" (propias en espera)`.
- **Labor budget**: max hours = sale × labor % of the equipment (catalog, fallback `settings.labor_factor`) ÷ average hourly cost. Spent hours come from `work_sessions` (timers) for the whole life of the machine (`src/services/machine-labor.ts`); real cost uses each worker's `hourly_cost_cop`.
- **Reestimada**: baseline date compared against the live estimated date to flag delays. Every replan (reorder, queue entry/exit, % or capacity change) shifts it by the same days as the live date (`shiftReestimatedDates` in `machines.ts`), so planned changes don't create false delays but real slippage stays visible.
- **Stages**: 7 fixed production stages (Material → Armar → Resoldar → Pulir → Pintar → Ensamblar → Empacar). Defined as constants in `calculations.ts` as `DEFAULT_STAGES`, also stored in the `stages` DB table.
- **Settings**: single-row `settings` table with production parameters (labor factor, worker count, daily hours, etc.) and the factory floor password hash.
- **Workers**: factory floor operarios, selected per session. Stage updates are attributed to the active worker.

### Realtime

`src/components/realtime-refresh.tsx` subscribes to Supabase Realtime channels and triggers a `router.refresh()` (Next.js soft refresh) when changes arrive on the specified tables. Used on admin and the client portal.

The factory floor does NOT use Realtime: the tablet has no admin session and RLS is `is_admin()`-only, so it never received events. Cartelera and Almacén use `src/components/poll-refresh.tsx` (30 s, no supabase-js).

### Factory iPad performance rules

The floor runs on a 2016 iPad (iPadOS 16.7, Chrome 103). Keep `/planta` light:
- Functions run in `pdx1` (`vercel.json`), next to Supabase (us-west-2). Don't remove it.
- Worker selection goes through `selectWorkerAction` (sets the `xt_worker` cookie, then redirects). The cookie is the only source of the active worker; no `?workerId=`, no `router.prefetch` per worker.
- Server actions that call `revalidatePath` already return the fresh page: don't add `router.refresh()` after them.
- Connection guard: `ConnectionGuard` (in `src/app/planta/layout.tsx`) wraps `fetch` for Next requests (navigations, refreshes, server actions). On a network error or no response in 20 s it does NOT let them fail (Next would fall back to a full page load and Chrome would get stuck on its error page): it shows a "Sin conexión" overlay that blocks taps, probes `GET /planta/api/conexion` until the server answers, resends the request and then `router.refresh()`es. Resending actions is safe because start/finish/pause refuse duplicates. Never use `window.location.*` for navigation in planta, use the router.
- Connection log: the same component records offline periods, failed/slow requests, slow page loads, gaps (app not alive while the screen was on) and `waiting` (how long the overlay was up) to localStorage, then posts them to `/planta/api/conexion` → `connectivity_events`. Vercel only keeps 1 h of request logs and never sees requests that don't arrive, so query this table to diagnose "connection timed out" reports. It's a route handler (not a server action) so it never queues behind operator actions.
- Planta `<Link>`s use `prefetch={false}`. Don't serialize large lists into page props (load them on demand, like the Actividades machine list).

### UI components

`src/components/ui/` — minimal shadcn/ui-style primitives (Button, Card, Badge, Input, etc.) built with Radix UI + CVA + Tailwind 4.

### Database migrations

`supabase/migrations/` — run sequentially on a new Supabase project:
1. `0001_initial_schema.sql` — all tables, RLS policies, functions
2. `0002_idempotent_policies_and_seed.sql` — idempotent policy updates
3. `0003`–`0028` — previos, statuses, reestimated date, work sessions (timers), activity catalog, RPC lock-down
4. `0029_equipment_labor_factor.sql` — `equipment_catalog.labor_factor` (labor % per equipment; null = `settings.labor_factor`)
5. `0030_activity_catalog_5s.sql` — non-machine activities: 5S, Empaque/carga/instalación, Arreglar máquinas; `merge_activity_type` RPC
6. `0031_reorder_production_queue.sql` — atomic queue order + reestimated date RPC; `0032` drops the old reorder RPC
7. `0033_connectivity_events.sql` — connection log from the factory devices (see below); `0034` adds the `waiting` kind

New migrations: add a numbered file AND apply it to the online DB (Management API). Keep them idempotent and compatible with the deployed build until the next deploy.

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
