-- ─── Migration 6: Feature expansion ─────────────────────────────────────────
-- Adds: multi-board tabs, chat, board history, room PIN, wider item types,
--       board_id column on items, Google/email auth support.

-- 1. Add pin_hash to study_rooms
alter table public.study_rooms
  add column if not exists pin_hash text default null;

-- 2. Widen study_board_items type constraint
alter table public.study_board_items
  drop constraint if exists study_board_items_type_check;

alter table public.study_board_items
  add constraint study_board_items_type_check
  check (type in ('stroke','sticky','shape','text','image'));

-- 3. Add board_id to study_board_items (nullable initially for migration safety)
alter table public.study_board_items
  add column if not exists board_id uuid references public.study_boards(id) on delete cascade;

-- 4. study_boards table
create table if not exists public.study_boards (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.study_rooms(id) on delete cascade,
  name       text not null default 'Board',
  position   integer not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.study_boards enable row level security;

-- 5. study_chat_messages table
create table if not exists public.study_chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.study_rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color        text not null default '#6366f1',
  text         text not null,
  created_at   timestamptz not null default now()
);

alter table public.study_chat_messages enable row level security;

-- 6. study_board_snapshots table
create table if not exists public.study_board_snapshots (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.study_rooms(id) on delete cascade,
  board_id   uuid not null references public.study_boards(id) on delete cascade,
  label      text not null,
  items_json jsonb not null default '[]',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.study_board_snapshots enable row level security;

-- ─── RLS: study_boards ───────────────────────────────────────────────────────
create policy "members can read boards"
  on public.study_boards for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can insert boards"
  on public.study_boards for insert to authenticated
  with check (public.is_room_member(room_id) and auth.uid() = created_by);

create policy "members can update boards"
  on public.study_boards for update to authenticated
  using (public.is_room_member(room_id));

create policy "members can delete boards"
  on public.study_boards for delete to authenticated
  using (public.is_room_member(room_id));

-- ─── RLS: study_chat_messages ────────────────────────────────────────────────
create policy "members can read chat"
  on public.study_chat_messages for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can insert chat"
  on public.study_chat_messages for insert to authenticated
  with check (public.is_room_member(room_id) and auth.uid() = user_id);

-- ─── RLS: study_board_snapshots ──────────────────────────────────────────────
create policy "members can read snapshots"
  on public.study_board_snapshots for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can insert snapshots"
  on public.study_board_snapshots for insert to authenticated
  with check (public.is_room_member(room_id) and auth.uid() = created_by);

create policy "members can delete snapshots"
  on public.study_board_snapshots for delete to authenticated
  using (public.is_room_member(room_id));

-- ─── Realtime for new tables ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.study_boards;
alter publication supabase_realtime add table public.study_chat_messages;
