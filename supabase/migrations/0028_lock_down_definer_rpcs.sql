-- reorder_in_production_machines is SECURITY DEFINER and had no authorization
-- check, and Supabase grants EXECUTE to anon/authenticated by default, so any
-- holder of the public anon key could reorder the production queue via RPC.
-- Both definer RPCs are only called from the server with the service-role key.

create or replace function public.reorder_in_production_machines(ordered_machine_ids uuid[])
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
    select id, ordinality::integer as position
    from unnest(ordered_machine_ids) with ordinality as t(id, ordinality)
  )
  update public.machines m
  set order_position = ordered.position
  from ordered
  where m.id = ordered.id
    and m.status = 'in_production';
end;
$$;

revoke all on function public.reorder_in_production_machines(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_in_production_machines(uuid[]) to service_role;

revoke all on function public.merge_clients(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_clients(uuid, uuid) to service_role;
