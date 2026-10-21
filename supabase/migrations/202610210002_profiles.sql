-- Apply in the Supabase SQL Editor as the postgres role, or with `supabase db push`.
-- Auth owns accounts; this table makes their display metadata visible in Table Editor.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text check (char_length(username) <= 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Username is editable display metadata, never an authorization claim.
-- Normalize missing/blank values and trim oversized metadata so signups still work.
create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, created_at)
  values (
    new.id,
    nullif(btrim(left(new.raw_user_meta_data ->> 'username', 60)), ''),
    coalesce(new.created_at, now())
  )
  on conflict (id) do update set username = excluded.username;
  return new;
end;
$$;

revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;

drop trigger if exists coderecall_auth_user_created on auth.users;
create trigger coderecall_auth_user_created
  after insert on auth.users
  for each row execute function public.sync_auth_user_profile();

drop trigger if exists coderecall_auth_user_metadata_updated on auth.users;
create trigger coderecall_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.sync_auth_user_profile();

-- Include accounts created before this migration; rerunning keeps existing IDs/dates.
insert into public.profiles (id, username, created_at)
select
  id,
  nullif(btrim(left(raw_user_meta_data ->> 'username', 60)), ''),
  coalesce(created_at, now())
from auth.users
on conflict (id) do update set username = excluded.username;

commit;
