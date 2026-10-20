-- Security-definer RPCs that bypass RLS for operations that need it.
-- This is the safest workaround for asymmetric JWT projects where
-- auth.uid() may not resolve correctly inside RLS with PostgREST.

-- ── create_room ───────────────────────────────────────────────────────────────
create or replace function public.create_room(
  p_name        text,
  p_invite_code text,
  p_user_id     uuid,
  p_display_name text,
  p_color       text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room_id uuid;
  v_member_id uuid;
begin
  -- Verify the caller is authenticated and matches p_user_id
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() != p_user_id then
    raise exception 'User ID mismatch';
  end if;

  -- Insert room
  insert into public.study_rooms (name, invite_code, created_by)
  values (p_name, p_invite_code, p_user_id)
  returning id into v_room_id;

  -- Insert membership
  insert into public.study_room_members (room_id, user_id, display_name, color)
  values (v_room_id, p_user_id, p_display_name, p_color)
  returning id into v_member_id;

  return jsonb_build_object(
    'room_id', v_room_id,
    'member_id', v_member_id
  );
end;
$$;

grant execute on function public.create_room(text, text, uuid, text, text) to authenticated;
grant execute on function public.create_room(text, text, uuid, text, text) to anon;

-- ── join_room ─────────────────────────────────────────────────────────────────
create or replace function public.join_room(
  p_room_id      uuid,
  p_user_id      uuid,
  p_display_name text,
  p_color        text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() != p_user_id then
    raise exception 'User ID mismatch';
  end if;

  insert into public.study_room_members (room_id, user_id, display_name, color)
  values (p_room_id, p_user_id, p_display_name, p_color)
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name,
        color = excluded.color
  returning id into v_member_id;

  return jsonb_build_object('member_id', v_member_id);
end;
$$;

grant execute on function public.join_room(uuid, uuid, text, text) to authenticated;
grant execute on function public.join_room(uuid, uuid, text, text) to anon;
