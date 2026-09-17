-- Pausa reanudable: una "actividad" pasa a ser una cadena de filas de
-- work_sessions que comparten activity_id. Cada fila sigue siendo un tramo
-- realmente trabajado (started_at → ended_at), así que el cálculo de horas
-- no cambia: pausar cierra el tramo, reanudar abre otro con el mismo
-- activity_id y el cronómetro muestra la suma de los tramos.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_sessions'
      and column_name = 'activity_id'
  ) then
    alter table public.work_sessions add column activity_id uuid;
    -- Cada sesión histórica es su propia actividad de un solo tramo.
    update public.work_sessions set activity_id = id;
    alter table public.work_sessions alter column activity_id set not null;
    alter table public.work_sessions alter column activity_id set default gen_random_uuid();
  end if;
end $$;

create index if not exists work_sessions_worker_activity_idx
  on public.work_sessions(worker_id, activity_id);
