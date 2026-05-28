# Current status

## Active phase

Phase 4/5: product surface completion, full CRUD polish, and Supabase deployment wiring.

## Completed

- Read full PRD.
- Inspected workbook structure without external spreadsheet dependencies.
- Confirmed workbook sheets: `plan de producción`, `Mano de obra`, `Precios y materiales `, `despachados`.
- Confirmed production sheet columns and cached formulas for progress, hours, accumulated hours, and estimated date.
- Created Next.js 15 project scaffold and Vercel-compatible config.
- Added Supabase migration with PRD tables, constraints, indexes, RLS, and Realtime publication.
- Added server services for calculations, schedules, machines, stages, settings, clients, and catalog reads.
- Built admin, factory iPad, and client portal route surfaces.
- Extracted workbook fixtures from `Plan Prod mayo 2026.xlsx`.
- Added calculation tests against 45 workbook rows.

## Blockers

- Supabase project credentials are not available yet, so live database verification cannot run.
- Full data migration into Supabase still needs a project and credentials.

## Latest verification

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

## Next task

Connect a Supabase project, run migration/seed, create admin users/profiles, and test the three workflows against live data.
