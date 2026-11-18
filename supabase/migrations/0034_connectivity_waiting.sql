-- Nuevo tipo de evento en la bitácora de conexión: 'waiting' = cuánto tiempo la
-- planta mostró "Sin conexión, reintentando…" antes de recuperarse sola.
alter table public.connectivity_events drop constraint if exists connectivity_events_kind_check;
alter table public.connectivity_events add constraint connectivity_events_kind_check
  check (kind in ('offline','fetch_failed','slow_request','slow_load','gap','waiting'));
