-- Run once in Supabase SQL Editor, or apply with `supabase db push`.
-- One private, versioned library snapshot per authenticated account.
create table public.library_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  library jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_snapshot_shape check (
    jsonb_typeof(library) = 'object'
    and library @> '{"version": 2}'::jsonb
    and jsonb_typeof(library -> 'nodes') = 'array'
    and jsonb_typeof(library -> 'tags') = 'array'
    and library ?& array['version', 'nodes', 'tags']
  ),
  constraint library_snapshot_size check (octet_length(library::text) <= 5242880)
);

alter table public.library_snapshots enable row level security;
revoke all on table public.library_snapshots from anon, authenticated;
grant select, insert, update on table public.library_snapshots to authenticated;

create policy "Read own library" on public.library_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own library" on public.library_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own library" on public.library_snapshots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The database owns revision numbers and timestamps, not the browser.
create function public.set_library_snapshot_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
    NEW.created_at := now();
  else
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger library_snapshot_revision
  before insert or update on public.library_snapshots
  for each row execute function public.set_library_snapshot_revision();
