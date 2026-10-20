-- Enable Realtime for the board items table so clients receive change events.
-- Supabase already creates a supabase_realtime publication; we just add our table.

-- Add study_board_items to the realtime publication
alter publication supabase_realtime add table public.study_board_items;

-- Add study_room_members so presence-like member joins/leaves broadcast too
alter publication supabase_realtime add table public.study_room_members;

-- Updated_at auto-update trigger for board items
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_board_items_updated_at
  before update on public.study_board_items
  for each row
  execute function public.set_updated_at();
