-- Create your owner account in Authentication > Users before running this file.
-- This script refuses to run unless that account is the only Auth user.
-- Disable public sign-ups before making the website live.

create table if not exists public.notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note_html text not null default '',
  concepts jsonb not null default '{}'::jsonb,
  shortcuts jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;
grant select, insert, update on public.notes to authenticated;

do $$
declare
  owner_id uuid;
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Create exactly one owner in Authentication > Users first';
  end if;
  select id into owner_id from auth.users limit 1;

  execute format(
    'create policy "owner reads notes" on public.notes for select to authenticated using (user_id = (select auth.uid()) and user_id = %L::uuid)',
    owner_id
  );
  execute format(
    'create policy "owner creates notes" on public.notes for insert to authenticated with check (user_id = (select auth.uid()) and user_id = %L::uuid)',
    owner_id
  );
  execute format(
    'create policy "owner updates notes" on public.notes for update to authenticated using (user_id = (select auth.uid()) and user_id = %L::uuid) with check (user_id = (select auth.uid()) and user_id = %L::uuid)',
    owner_id, owner_id
  );
end $$;
