-- Drop and recreate policies to work correctly with anonymous (asymmetric JWT) users.
-- The core fix: explicitly target the `authenticated` role on all policies,
-- and verify uid server-side via auth.uid() which works once the JWT is validated.

-- ── study_rooms ───────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can create rooms" on public.study_rooms;

create policy "authenticated users can create rooms"
  on public.study_rooms
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "members can read room" on public.study_rooms;

create policy "members can read room"
  on public.study_rooms
  for select
  to authenticated
  using (public.is_room_member(id));

-- ── study_room_members ────────────────────────────────────────────────────────
drop policy if exists "authenticated users can join rooms" on public.study_room_members;

create policy "authenticated users can join rooms"
  on public.study_room_members
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "members can read room members" on public.study_room_members;

create policy "members can read room members"
  on public.study_room_members
  for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members can update own membership" on public.study_room_members;

create policy "members can update own membership"
  on public.study_room_members
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── study_board_items ─────────────────────────────────────────────────────────
drop policy if exists "members can read board items" on public.study_board_items;

create policy "members can read board items"
  on public.study_board_items
  for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members can insert board items" on public.study_board_items;

create policy "members can insert board items"
  on public.study_board_items
  for insert
  to authenticated
  with check (
    public.is_room_member(room_id)
    and auth.uid() = created_by
    and auth.uid() = updated_by
  );

drop policy if exists "members can update board items" on public.study_board_items;

create policy "members can update board items"
  on public.study_board_items
  for update
  to authenticated
  using (public.is_room_member(room_id))
  with check (
    public.is_room_member(room_id)
    and auth.uid() = updated_by
  );

drop policy if exists "members can delete board items" on public.study_board_items;

create policy "members can delete board items"
  on public.study_board_items
  for delete
  to authenticated
  using (public.is_room_member(room_id));

-- Also fix the is_room_member helper to explicitly run as the calling user's context
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
