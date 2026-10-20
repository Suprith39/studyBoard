-- ─── Updated create_room RPC (adds PIN support + creates default board) ───────
create or replace function public.create_room(
  p_name         text,
  p_invite_code  text,
  p_user_id      uuid,
  p_display_name text,
  p_color        text,
  p_pin_hash     text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room_id   uuid;
  v_member_id uuid;
  v_board_id  uuid;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Not authenticated';
  end if;

  insert into public.study_rooms (name, invite_code, created_by, pin_hash)
  values (p_name, p_invite_code, p_user_id, p_pin_hash)
  returning id into v_room_id;

  insert into public.study_room_members (room_id, user_id, display_name, color)
  values (v_room_id, p_user_id, p_display_name, p_color)
  returning id into v_member_id;

  -- Create default board tab
  insert into public.study_boards (room_id, name, position, created_by)
  values (v_room_id, 'Main Board', 0, p_user_id)
  returning id into v_board_id;

  return jsonb_build_object(
    'room_id', v_room_id,
    'member_id', v_member_id,
    'board_id', v_board_id
  );
end;
$$;

grant execute on function public.create_room(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.create_room(text, text, uuid, text, text, text) to anon;

-- ─── Updated join_room RPC (PIN check) ───────────────────────────────────────
create or replace function public.join_room(
  p_room_id      uuid,
  p_user_id      uuid,
  p_display_name text,
  p_color        text,
  p_pin          text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_member_id uuid;
  v_pin_hash  text;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Not authenticated';
  end if;

  -- Check PIN if room is protected
  select pin_hash into v_pin_hash from public.study_rooms where id = p_room_id;

  if v_pin_hash is not null then
    if p_pin is null then
      raise exception 'PIN_REQUIRED';
    end if;
    -- Simple check: store plain hash comparison (use pgcrypto crypt in production)
    -- We store sha256 hex on the client and compare here
    if v_pin_hash != p_pin then
      raise exception 'PIN_INVALID';
    end if;
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

grant execute on function public.join_room(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.join_room(uuid, uuid, text, text, text) to anon;

-- ─── create_board RPC ─────────────────────────────────────────────────────────
create or replace function public.create_board(
  p_room_id uuid,
  p_name    text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_board_id uuid;
  v_pos      integer;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Not authenticated';
  end if;

  select coalesce(max(position) + 1, 1)
  into v_pos
  from public.study_boards
  where room_id = p_room_id;

  insert into public.study_boards (room_id, name, position, created_by)
  values (p_room_id, p_name, v_pos, p_user_id)
  returning id into v_board_id;

  return jsonb_build_object('board_id', v_board_id);
end;
$$;

grant execute on function public.create_board(uuid, text, uuid) to authenticated;
grant execute on function public.create_board(uuid, text, uuid) to anon;

-- ─── restore_snapshot RPC ─────────────────────────────────────────────────────
create or replace function public.restore_snapshot(
  p_snapshot_id uuid,
  p_user_id     uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_snap  public.study_board_snapshots%rowtype;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Not authenticated';
  end if;

  select * into v_snap from public.study_board_snapshots where id = p_snapshot_id;
  if not found then raise exception 'Snapshot not found'; end if;

  -- Clear current board items
  delete from public.study_board_items
  where board_id = v_snap.board_id;

  -- Re-insert snapshot items
  insert into public.study_board_items
    (id, room_id, board_id, type, data, created_by, updated_by, created_at, updated_at)
  select
    (item->>'id')::uuid,
    v_snap.room_id,
    v_snap.board_id,
    item->>'type',
    item->'data',
    p_user_id,
    p_user_id,
    now(),
    now()
  from jsonb_array_elements(v_snap.items_json) as item;

  return jsonb_build_object('ok', true, 'board_id', v_snap.board_id);
end;
$$;

grant execute on function public.restore_snapshot(uuid, uuid) to authenticated;
grant execute on function public.restore_snapshot(uuid, uuid) to anon;

-- ─── set_room_pin RPC ─────────────────────────────────────────────────────────
create or replace function public.set_room_pin(
  p_room_id  uuid,
  p_user_id  uuid,
  p_pin_hash text  -- pass null to remove PIN
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Not authenticated';
  end if;

  -- Only room creator can set PIN
  update public.study_rooms
  set pin_hash = p_pin_hash
  where id = p_room_id and created_by = p_user_id;

  if not found then
    raise exception 'Not authorized to set PIN for this room';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_room_pin(uuid, uuid, text) to authenticated;
grant execute on function public.set_room_pin(uuid, uuid, text) to anon;
