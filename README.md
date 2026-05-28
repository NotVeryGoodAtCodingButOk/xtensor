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
cp .env.example .env.local
corepack pnpm dev
```

Variables requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (URL canónica, por ejemplo `https://tu-dominio.com`; en Vercel puede omitirse si las variables de sistema están expuestas)
- `FACTORY_COOKIE_SECRET`

En Vercel, si configuras `NEXT_PUBLIC_APP_URL` manualmente, usa una URL completa con `https://`. Las variables de sistema de Vercel como `VERCEL_URL` no incluyen protocolo; la app las normaliza automáticamente cuando están disponibles.

## Supabase

1. Crear un proyecto Supabase.
2. Ejecutar `supabase/migrations/0001_initial_schema.sql`.
3. Ejecutar `supabase/seed.sql` solo para bootstrap local o inicial.
4. Crear usuarios admin en Supabase Auth.
5. Insertar sus registros en `profiles` con `role = 'admin'`.
6. Cambiar la contraseña de planta antes de producción.

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
