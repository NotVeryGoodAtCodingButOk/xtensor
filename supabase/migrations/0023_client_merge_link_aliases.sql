create table if not exists public.client_link_aliases (
  token text primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists client_link_aliases_client_id_idx
  on public.client_link_aliases (client_id);

alter table public.client_link_aliases enable row level security;

drop policy if exists "admins manage client link aliases" on public.client_link_aliases;
create policy "admins manage client link aliases"
  on public.client_link_aliases
  for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.merge_clients(source_client_id uuid, target_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  source_client public.clients%rowtype;
  target_client public.clients%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if source_client_id = target_client_id then
    raise exception 'Los clientes deben ser diferentes.';
  end if;

  select *
  into source_client
  from public.clients
  where id = source_client_id
  for update;

  if not found then
    raise exception 'No se encontró el cliente origen.';
  end if;

  select *
  into target_client
  from public.clients
  where id = target_client_id
  for update;

  if not found then
    raise exception 'No se encontró el cliente destino.';
  end if;

  insert into public.client_link_aliases (token, client_id)
  values (source_client.magic_link_token, target_client.id)
  on conflict (token) do update
    set client_id = excluded.client_id;

  update public.client_link_aliases
  set client_id = target_client.id
  where client_id = source_client.id;

  update public.machines
  set client_id = target_client.id
  where client_id = source_client.id;

  delete from public.clients
  where id = source_client.id;

  return target_client;
end;
$$;

revoke all on function public.merge_clients(uuid, uuid) from public;
grant execute on function public.merge_clients(uuid, uuid) to service_role;
