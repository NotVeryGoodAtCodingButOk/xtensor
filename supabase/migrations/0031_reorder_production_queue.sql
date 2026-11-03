-- Reordenar la cola y tomar la fecha reestimada en UNA sola sentencia.
-- Antes eran dos pasos (reorder_in_production_machines + un UPDATE por máquina
-- desde el servidor): si el segundo fallaba, el orden quedaba guardado pero la
-- Reestimada no. reestimated_dates = { "<machine uuid>": "yyyy-MM-dd" }; las
-- máquinas que no vienen en el jsonb conservan su reestimada.
--
-- reorder_in_production_machines se deja: la usa la versión desplegada. Se
-- borra en 0032 después del deploy.
create or replace function public.reorder_production_queue(ordered_machine_ids uuid[], reestimated_dates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if ordered_machine_ids is null or array_length(ordered_machine_ids, 1) is null then
    return;
  end if;

  with ordered as (
    select id, min(ordinality)::integer as position
    from unnest(ordered_machine_ids) with ordinality as t(id, ordinality)
    group by id
  )
  update public.machines m
  set order_position = ordered.position,
      reestimated_date = case
        when coalesce(reestimated_dates, '{}'::jsonb) ? m.id::text
          then (reestimated_dates ->> m.id::text)::date
        else m.reestimated_date
      end
  from ordered
  where m.id = ordered.id
    and m.status = 'in_production';
end;
$$;

revoke all on function public.reorder_production_queue(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.reorder_production_queue(uuid[], jsonb) to service_role;
