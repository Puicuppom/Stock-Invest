-- Run in Supabase > SQL Editor. Existing portfolio data is not changed.
create table if not exists public.watchlists (
  sync_key text primary key,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.watchlists enable row level security;
grant select, insert, update on public.watchlists to anon;
-- Shared personal app, no user login: the configured key identifies the list.
-- The key is NOT user authentication. Anyone using this app shares the list.
drop policy if exists watchlist_read on public.watchlists;
create policy watchlist_read on public.watchlists for select to anon
using (sync_key = (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-watchlist-key'));
drop policy if exists watchlist_insert on public.watchlists;
create policy watchlist_insert on public.watchlists for insert to anon
with check (sync_key = (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-watchlist-key'));
drop policy if exists watchlist_update on public.watchlists;
create policy watchlist_update on public.watchlists for update to anon
using (sync_key = (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-watchlist-key'))
with check (sync_key = (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-watchlist-key'));
