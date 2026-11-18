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
| Factory floor | `/planta/*` | Shared factory password → HMAC-signed cookie (`xt_factory`); active worker is chosen on the device (offline app, see below) |
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

The factory floor does NOT use Realtime: the tablet has no admin session and RLS is `is_admin()`-only, so it never received events. Cartelera uses `src/components/poll-refresh.tsx` (30 s, no supabase-js); the floor app refreshes its own snapshot every 30 s.

### Offline floor (`/planta/piso`)

The factory iPad loses Wi-Fi often, so the floor is a local-first app that keeps working with no connection:
- One client shell, `/planta/piso` → `src/components/floor/floor-app.tsx`. Views (operarios, máquinas, máquina, grupo, almacén) are React state + sessionStorage, never routes, so changing view needs no network. Old routes (`/planta/operarios`, `/planta/maquinas*`, `/planta/almacen`) redirect into it with `?v=`.
- Engine: `src/lib/floor/client.ts` (no React). Every tap becomes a **command** (`src/lib/floor/commands.ts`) with a client UUID (idempotency key), per-device `seq` and the real tap time. It is written to the localStorage outbox **before** the UI updates, then sent to `POST /planta/api/piso/sync` in `seq` order. The UI renders `projectState(snapshot, outbox)` from the pure reducer `src/lib/floor/state.ts`; the snapshot comes from `GET /planta/api/piso` (ETag, `src/services/floor-snapshot.ts`).
- Server: `src/services/floor-sync/` claims each command in `floor_commands`, corrects the device clock (`sentAt` vs server now), and applies it idempotently (client ids for sessions, `command_id` unique on `stage_logs`/`machine_previo_events`, closes only `where ended_at is null`). Resending a batch never duplicates anything.
- Conflicts ("keep the work, flag it"): worked time is always saved; status changes that no longer apply (machine left production, someone changed the stage later) are skipped and flagged. Flagged/rejected commands show in a small corner pill on the iPad and in `/admin/sincronizacion`, along with `floor_devices` (last sync, pending count, service-worker support).
- **Never write floor data outside the sync path.** Any new operator action = a new command type handled in `state.ts` (client rules) and `floor-sync/apply.ts` (server), with unit tests.
- **Command versioning:** the server must keep accepting every `v` a device may still hold in its outbox. Changing a payload shape = new `v`, never an in-place change.
- Service worker `public/sw.js` (scope `/planta/`, `no-cache` header) caches the shell and `/_next/static` so a reload offline still opens the app. If Chrome on the iPad can't run it (`floor_devices.sw_supported = false`), use the Safari home-screen app (manifest + apple meta in `src/app/planta/layout.tsx`): Safari → `/planta` → Compartir → Agregar a inicio → clave.
- The offline notice is a small, non-blocking pill. Never block the operator's screen because of the network.

### Factory iPad performance rules

The floor runs on a 2016 iPad (iPadOS 16.7, Chrome 103). Keep `/planta` light:
- Functions run in `pdx1` (`vercel.json`), next to Supabase (us-west-2). Don't remove it.
- `ConnectionGuard` (in `src/app/planta/layout.tsx`) wraps `fetch` for Next requests: on a network error it silently waits for `GET /planta/api/conexion` and resends (no overlay). It matters for the cartelera/TV; the floor app has its own outbox. Never use `window.location.*` for navigation in planta.
- Connection log: the same component records offline periods, failed/slow requests, slow page loads, gaps (app not alive while the screen was on) and `waiting` to localStorage, then posts them to `/planta/api/conexion` → `connectivity_events`. Vercel only keeps 1 h of request logs and never sees requests that don't arrive, so query this table to diagnose "connection timed out" reports. It's a route handler (not a server action) so it never queues behind operator actions.
- Planta `<Link>`s use `prefetch={false}`. Don't serialize large lists into page props.

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
8. `0035_floor_offline.sql` — offline floor: `floor_commands` (sync log / idempotency), `floor_devices`, `command_id` on `stage_logs` and `machine_previo_events`

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
