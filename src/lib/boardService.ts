import { supabase } from './supabase';
import type { BoardItem, BoardItemData, BoardItemType } from '../types/board';
import type { Json } from '../types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Row shape returned from Supabase ────────────────────────────────────────
interface BoardItemRow {
  id: string;
  room_id: string;
  type: string;
  data: Json;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: BoardItemRow): BoardItem {
  return {
    id: row.id,
    room_id: row.room_id,
    type: row.type as BoardItemType,
    data: row.data as unknown as BoardItemData,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadBoardItems(roomId: string): Promise<BoardItem[]> {
  const { data, error } = await supabase
    .from('study_board_items')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at');

  if (error) throw new Error(error.message);
  return ((data ?? []) as BoardItemRow[]).map(rowToItem);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createBoardItem(
  roomId: string,
  userId: string,
  type: BoardItemType,
  data: BoardItemData
): Promise<BoardItem> {
  const { data: row, error } = await supabase
    .from('study_board_items')
    .insert({
      room_id: roomId,
      type,
      data: data as unknown as Json,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();

  if (error || !row) throw new Error(error?.message ?? 'Failed to create board item');
  return rowToItem(row as BoardItemRow);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateBoardItem(
  itemId: string,
  userId: string,
  data: BoardItemData
): Promise<void> {
  const { error } = await supabase
    .from('study_board_items')
    .update({
      data: data as unknown as Json,
      updated_by: userId,
    })
    .eq('id', itemId);

  if (error) throw new Error(error.message);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteBoardItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('study_board_items')
    .delete()
    .eq('id', itemId);

  if (error) throw new Error(error.message);
}

export async function clearBoardItems(roomId: string): Promise<void> {
  const { error } = await supabase
    .from('study_board_items')
    .delete()
    .eq('room_id', roomId);

  if (error) throw new Error(error.message);
}

// ─── Realtime subscription ────────────────────────────────────────────────────

export type BoardChangeEvent =
  | { event: 'INSERT'; item: BoardItem }
  | { event: 'UPDATE'; item: BoardItem }
  | { event: 'DELETE'; itemId: string };

export type BoardChangeHandler = (change: BoardChangeEvent) => void;

export function subscribeToBoardItems(
  roomId: string,
  onChange: BoardChangeHandler
): RealtimeChannel {
  const channel = supabase
    .channel(`board:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'study_board_items',
        filter: `room_id=eq.${roomId}`,
      },
      payload => {
        const item = rowToItem(payload.new as BoardItemRow);
        onChange({ event: 'INSERT', item });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'study_board_items',
        filter: `room_id=eq.${roomId}`,
      },
      payload => {
        const item = rowToItem(payload.new as BoardItemRow);
        onChange({ event: 'UPDATE', item });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'study_board_items',
        filter: `room_id=eq.${roomId}`,
      },
      payload => {
        const itemId = (payload.old as { id: string }).id;
        onChange({ event: 'DELETE', itemId });
      }
    )
    .subscribe();

  return channel;
}
