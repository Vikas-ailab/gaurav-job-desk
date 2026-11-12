create table if not exists public.user_workspace(user_id uuid primary key references auth.users(id) on delete cascade,jobs jsonb not null default '[]'::jsonb,tracker jsonb not null default '[]'::jsonb,updated_at timestamptz not null default now());
alter table public.user_workspace enable row level security;
create policy "read own workspace" on public.user_workspace for select to authenticated using(auth.uid()=user_id);
create policy "insert own workspace" on public.user_workspace for insert to authenticated with check(auth.uid()=user_id);
create policy "update own workspace" on public.user_workspace for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update on public.user_workspace to authenticated;