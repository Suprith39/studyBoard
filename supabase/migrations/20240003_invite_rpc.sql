-- Public RPC to look up a room by invite code WITHOUT requiring membership.
-- This is necessary because RLS on study_rooms only allows members to read.
-- The function runs as SECURITY DEFINER so it bypasses RLS for the lookup.

create or replace function public.get_room_by_invite(p_invite_code text)
returns setof public.study_rooms
language sql
security definer
stable
as $$
  select * from public.study_rooms where invite_code = p_invite_code limit 1;
$$;

-- Grant execute to anonymous and authenticated roles
grant execute on function public.get_room_by_invite(text) to anon;
grant execute on function public.get_room_by_invite(text) to authenticated;
