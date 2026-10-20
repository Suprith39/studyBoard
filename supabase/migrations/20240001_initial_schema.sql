-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── study_rooms ───────────────────────────────────────────────────────────────
create table if not exists public.study_rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.study_rooms enable row level security;

-- ─── study_room_members ───────────────────────────────────────────────────────
create table if not exists public.study_room_members (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.study_rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color        text not null default '#6366f1',
  joined_at    timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.study_room_members enable row level security;

-- ─── study_board_items ───────────────────────────────────────────────────────
create table if not exists public.study_board_items (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.study_rooms(id) on delete cascade,
  type       text not null check (type in ('stroke','sticky')),
  data       jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_board_items enable row level security;

-- ─── Helper: is the current user a member of a room? ─────────────────────────
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.study_room_members
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

-- ─── RLS policies: study_rooms ────────────────────────────────────────────────
-- Members can read the room
create policy "members can read room"
  on public.study_rooms
  for select
  using (public.is_room_member(id));

-- Authenticated users can create rooms
create policy "authenticated users can create rooms"
  on public.study_rooms
  for insert
  with check (auth.uid() = created_by);

-- ─── RLS policies: study_room_members ────────────────────────────────────────
-- Members can see other members in their rooms
create policy "members can read room members"
  on public.study_room_members
  for select
  using (public.is_room_member(room_id));

-- Any authenticated user can insert themselves (to join via invite code)
create policy "authenticated users can join rooms"
  on public.study_room_members
  for insert
  with check (auth.uid() = user_id);

-- Members can update their own membership (e.g. display_name)
create policy "members can update own membership"
  on public.study_room_members
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── RLS policies: study_board_items ─────────────────────────────────────────
-- Room members can read board items
create policy "members can read board items"
  on public.study_board_items
  for select
  using (public.is_room_member(room_id));

-- Room members can insert board items
create policy "members can insert board items"
  on public.study_board_items
  for insert
  with check (
    public.is_room_member(room_id)
    and auth.uid() = created_by
    and auth.uid() = updated_by
  );

-- Room members can update board items (latest-write-wins)
create policy "members can update board items"
  on public.study_board_items
  for update
  using (public.is_room_member(room_id))
  with check (
    public.is_room_member(room_id)
    and auth.uid() = updated_by
  );

-- Room members can delete board items
create policy "members can delete board items"
  on public.study_board_items
  for delete
  using (public.is_room_member(room_id));
