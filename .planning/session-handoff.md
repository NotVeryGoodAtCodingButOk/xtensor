# Session handoff

## Latest work

- Implemented the project scaffold, Supabase migration, service layer, route surfaces, Excel fixture extractor, and workbook parity tests.
- Installed dependencies with Corepack pnpm.
- Verified lint, typecheck, tests, and production build.

## Commands run

- `ls -la`
- `find . -name AGENTS.md -print`
- Python XML inspection scripts for `Plan Prod mayo 2026.xlsx`
- `python3 scripts/extract_excel_fixtures.py`
- `corepack pnpm install`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

## Changed files

- Project scaffold and config files.
- Supabase migration and seed.
- `src/app` routes for admin, factory, and client portal.
- `src/services` calculation, schedule, machine, stage, settings, client, and catalog modules.
- Workbook fixture extractor and tests.

## Next exact task

Connect Supabase credentials, run `supabase/migrations/0001_initial_schema.sql` and `supabase/seed.sql`, create admin profiles, then test live workflows.
