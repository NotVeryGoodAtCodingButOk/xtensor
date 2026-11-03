-- Catálogo de labores fuera de máquina agrupado como lo pidió el dueño:
--   1. 5S                           (aseo, orden, limpieza, mantenimiento de planta)
--   2. Empaque, carga e instalación (se asocia a una máquina; la instalación se cobra aparte)
--   3. Arreglar máquinas            (garantías)
-- Idempotente y re-ejecutable. Funciona tanto con los nombres sembrados en la
-- 0027 (Aseo, Orden, Mejoras planta, Instalación externa) como con los que el
-- dueño dejó en producción desde Configuración (Aseo y Orden, Mantenimiento
-- Planta, Cargue / Descargue, Empacar). Las horas de los tipos absorbidos se
-- mueven al tipo destino antes de borrarlos, así que no se pierde tiempo.

alter table public.activity_types add column if not exists description text;

do $$
declare
  five_s_id uuid;
  packing_id uuid;
  source_id uuid;
begin
  -- 5S: conserva el id de Aseo (o de su renombre) si existe.
  select id into five_s_id from public.activity_types where name = '5S';
  if five_s_id is null then
    select id into five_s_id from public.activity_types
    where lower(name) in ('aseo', 'aseo y orden')
    order by sort_order, created_at
    limit 1;
    if five_s_id is null then
      insert into public.activity_types (name, sort_order, allows_machine)
      values ('5S', 1, false)
      returning id into five_s_id;
    else
      update public.activity_types set name = '5S' where id = five_s_id;
    end if;
  end if;

  for source_id in
    select id from public.activity_types
    where id <> five_s_id
      and lower(name) in ('aseo', 'aseo y orden', 'orden', 'mejoras planta', 'mantenimiento planta')
  loop
    insert into public.work_session_activity_types (session_id, activity_type_id)
    select session_id, five_s_id from public.work_session_activity_types where activity_type_id = source_id
    on conflict do nothing;
    delete from public.work_session_activity_types where activity_type_id = source_id;
    delete from public.activity_types where id = source_id;
  end loop;

  update public.activity_types
  set description = 'Aseo, orden, limpieza y mantenimiento de planta',
      allows_machine = false,
      is_active = true,
      sort_order = 1
  where id = five_s_id;

  -- Empaque, carga e instalación: conserva el id de Instalación externa si existe.
  select id into packing_id from public.activity_types where name = 'Empaque, carga e instalación';
  if packing_id is null then
    select id into packing_id from public.activity_types
    where lower(name) in ('instalación externa', 'empacar', 'cargue / descargue')
    order by case lower(name) when 'instalación externa' then 0 else 1 end, sort_order, created_at
    limit 1;
    if packing_id is null then
      insert into public.activity_types (name, sort_order, allows_machine)
      values ('Empaque, carga e instalación', 2, true)
      returning id into packing_id;
    else
      update public.activity_types set name = 'Empaque, carga e instalación' where id = packing_id;
    end if;
  end if;

  for source_id in
    select id from public.activity_types
    where id <> packing_id
      and lower(name) in ('instalación externa', 'empacar', 'cargue / descargue')
  loop
    insert into public.work_session_activity_types (session_id, activity_type_id)
    select session_id, packing_id from public.work_session_activity_types where activity_type_id = source_id
    on conflict do nothing;
    delete from public.work_session_activity_types where activity_type_id = source_id;
    delete from public.activity_types where id = source_id;
  end loop;

  update public.activity_types
  set description = 'Empacar, cargar el camión e instalar donde el cliente',
      allows_machine = true,
      is_active = true,
      sort_order = 2
  where id = packing_id;

  -- Arreglar máquinas (garantías): se conserva; si ya no existe se vuelve a crear.
  insert into public.activity_types (name, sort_order, allows_machine)
  values ('Arreglar máquinas', 3, true)
  on conflict (name) do nothing;

  update public.activity_types
  set description = 'Garantías y arreglos de máquinas de clientes',
      allows_machine = true,
      sort_order = 3
  where name = 'Arreglar máquinas';
end $$;

-- Borrar una actividad con horas: mueve sus vínculos a otra y borra la de origen.
-- Mismo patrón de guardas y permisos que 0028_lock_down_definer_rpcs.sql.
create or replace function public.merge_activity_type(source_activity_type_id uuid, target_activity_type_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if source_activity_type_id is null or target_activity_type_id is null then
    raise exception 'Faltan las actividades a fusionar.' using errcode = '22023';
  end if;

  if source_activity_type_id = target_activity_type_id then
    raise exception 'Elige una actividad distinta para mover las horas.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.activity_types where id = source_activity_type_id) then
    raise exception 'La actividad a eliminar no existe.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.activity_types where id = target_activity_type_id) then
    raise exception 'La actividad destino no existe.' using errcode = 'P0002';
  end if;

  insert into public.work_session_activity_types (session_id, activity_type_id)
  select session_id, target_activity_type_id
  from public.work_session_activity_types
  where activity_type_id = source_activity_type_id
  on conflict do nothing;

  delete from public.work_session_activity_types where activity_type_id = source_activity_type_id;
  delete from public.activity_types where id = source_activity_type_id;
end;
$$;

revoke all on function public.merge_activity_type(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_activity_type(uuid, uuid) to service_role;
