-- Per-user data: favorite tools, tool history, and saved snippets.
-- Every table is private to its owner: row-level security allows a row only
-- when auth.uid() = user_id, for reads and writes alike.
-- `(select auth.uid())` rather than `auth.uid()` lets Postgres evaluate it once
-- per query instead of once per row.

-- Favorites: one row per starred tool.
create table public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

alter table public.favorites enable row level security;

create policy "Users manage their own favorites"
  on public.favorites
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- History: one row per tool, with the last time it was used. Upsert on
-- (user_id, tool_id) to bump used_at, like the local "Recently used" list.
create table public.history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 100),
  used_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create index history_user_recent_idx on public.history (user_id, used_at desc);

alter table public.history enable row level security;

create policy "Users manage their own history"
  on public.history
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Snippets: saved tool inputs. value is capped at 100 KB so one row can't
-- grow without bound.
create table public.snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 100),
  label text not null check (char_length(label) between 1 and 200),
  value text not null check (octet_length(value) <= 102400),
  created_at timestamptz not null default now()
);

create index snippets_user_tool_idx on public.snippets (user_id, tool_id, created_at desc);

alter table public.snippets enable row level security;

create policy "Users manage their own snippets"
  on public.snippets
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Explicit Data API access, so the tables work with "Automatically expose new
-- tables" turned off. Signed-in users get row access (still limited to their
-- own rows by the policies above); signed-out visitors get none.
revoke all on public.favorites, public.history, public.snippets from anon;
grant select, insert, update, delete on public.favorites, public.history, public.snippets to authenticated;
