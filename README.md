# XTENSOR Producción

Aplicación web para seguimiento de producción de fábrica, basada en `PRD_XTENSOR.md` y preparada para Vercel + Supabase.

## Stack

- Next.js 15 App Router + React 19 + TypeScript
- Tailwind CSS 4 + componentes estilo shadcn/ui
- Supabase Auth, Postgres, RLS y Realtime
- Vercel como hosting

## Desarrollo local

```bash
corepack pnpm install
# Configura .env.local con las credenciales del proyecto Supabase online
corepack pnpm dev
```

Variables requeridas en `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
- `FACTORY_COOKIE_SECRET`

En Vercel, si configuras `NEXT_PUBLIC_APP_URL` manualmente, usa una URL completa con `https://`. Las variables de sistema de Vercel como `VERCEL_URL` no incluyen protocolo; la app las normaliza automáticamente cuando están disponibles.

## Supabase

El proyecto usa exclusivamente la base de datos online en Supabase. No se usa instancia local.

- Esquema: `supabase/migrations/`
- Para aplicar migraciones: `supabase db push --linked`
- Crear usuarios admin en Supabase Auth y registrar en `profiles` con `role = 'admin'`.

## Verificación

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Excel

El archivo `Plan Prod mayo 2026.xlsx` se usa como fuente de verdad para fixtures de paridad:

```bash
corepack pnpm excel:fixtures
```

Los fixtures quedan en `tests/fixtures/excel-plan-prod-mayo-2026.json`.
