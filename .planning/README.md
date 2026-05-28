# XTENSOR planning tracker

Source PRD: `PRD_XTENSOR.md`
Workbook source of truth: `Plan Prod mayo 2026.xlsx`
Deployment target: Vercel
Stack: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn-style UI, Supabase Auth/Postgres/Realtime

## Session rules

- Product UI text must remain Spanish-only.
- Keep Supabase service-role access server-only.
- Do not store calculated production values in the database.
- Update `STATUS.md` and `session-handoff.md` at the end of every session.
- Record formula, schema, or security decisions in `DECISIONS.md`.
- Mark PRD acceptance criteria in `ACCEPTANCE.md` only with implementation and verification evidence.

## Current implementation order

1. Planning tracker and project scaffold.
2. Supabase schema, RLS, seeds, and environment contract.
3. Core calculation, schedule, machine, stage, client, and settings services.
4. Admin, iPad factory, and client portal routes.
5. Excel import/parity fixtures and deployment verification.
