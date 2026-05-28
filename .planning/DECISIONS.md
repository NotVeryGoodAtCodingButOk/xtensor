# Decisions

## D001 - Progress model

The PRD formula for weighted progress contains a known inconsistency. The current Excel workbook has a direct `Avance %` value in column `N`, and stage display formulas compare `N * 100` against thresholds 20/40/50/70/80/90/100 in columns `AH:AN`.

Implementation default:

- Store per-stage completion at 0/25/50/75/100 as required by the PRD.
- Compute app progress from stage thresholds unless an imported Excel row provides a known `excel_progress_pct` fixture for parity tests.
- Use workbook fixtures to validate and adjust the final progress algorithm before production migration.

## D002 - Calculation persistence

Calculated values are not stored in Supabase. Services return derived values for total hours, remaining hours, human-days, accumulated hours, internal estimated date, and client buffered date.

## D003 - Admin authorization

Admin data access uses Supabase Auth plus a `profiles.role = 'admin'` record. Server-side service-role calls are reserved for factory and client token workflows that cannot use user auth directly.

## D004 - Vercel runtime

The application targets Vercel serverless/server components. No persistent local filesystem writes are required at runtime.

## D005 - Human-days divisor

The workbook calculates `dias hom faltantes x invertir` as `Horas faltantes / 9`, not as `Horas faltantes / (active_workers_count * daily_hours)`. The app follows the workbook for the displayed human-days column while still using full plant capacity for delivery-date scheduling.
