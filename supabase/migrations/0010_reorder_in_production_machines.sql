create or replace function public.reorder_in_production_machines(ordered_machine_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
