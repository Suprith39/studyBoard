import { supabase } from './supabase';
import type { BoardItem, BoardItemData, BoardItemType, StudyBoard } from '../types/board';
import type { Json } from '../types/database';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Row shapes ───────────────────────────────────────────────────────────────
interface BoardItemRow {
  id: string;
  room_id: string;
  board_id: string;
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
    board_id: row.board_id,
    type: row.type as BoardItemType,
    data: row.data as unknown as BoardItemData,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Boards (tabs) ────────────────────────────────────────────────────────────
interface BoardRow {
  id: string;
  room_id: string;
  name: string;
  position: number;
  created_by: string;
  created_at: string;
}

export async function loadBoards(roomId: string): Promise<StudyBoard[]> {
  const { data, error } = await supabase
    .from('study_boards')
    .select('*')
    .eq('room_id', roomId)
    .order('position');
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[] as StudyBoard[];
}

export async function createBoard(
  roomId: string,
  name: string,
  userId: string
): Promise<StudyBoard> {
  const { data, error } = await supabase
    .rpc('create_board', { p_room_id: roomId, p_name: name, p_user_id: userId });
  if (error || !data) throw new Error(error?.message ?? 'Failed to create board');
  const result = data as { board_id: string };
  // Load the created board
  const { data: boardData, error: bErr } = await supabase
    .from('study_boards')
    .select('*')
    .eq('id', result.board_id)
    .single();
  if (bErr || !boardData) throw new Error('Failed to load new board');
  return boardData as BoardRow as StudyBoard;
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('study_boards')
    .update({ name })
    .eq('id', boardId);
  if (error) throw new Error(error.message);
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase
    .from('study_boards')
    .delete()
    .eq('id', boardId);
  if (error) throw new Error(error.message);
}

// ─── Board items ──────────────────────────────────────────────────────────────

export async function loadBoardItems(boardId: string): Promise<BoardItem[]> {
  const { data, error } = await supabase
    .from('study_board_items')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as BoardItemRow[]).map(rowToItem);
}

export async function createBoardItem(
  roomId: string,
  boardId: string,
  userId: string,
  type: BoardItemType,
  data: BoardItemData
): Promise<BoardItem> {
  const { data: row, error } = await supabase
    .from('study_board_items')
    .insert({
      room_id: roomId,
      board_id: boardId,
      type,
      data: data as unknown as Json,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Failed to create item');
  return rowToItem(row as BoardItemRow);
}

export async function updateBoardItem(
  itemId: string,
  userId: string,
  data: BoardItemData
): Promise<void> {
  const { error } = await supabase
    .from('study_board_items')
    .update({ data: data as unknown as Json, updated_by: userId })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function deleteBoardItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('study_board_items').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function clearBoardItems(boardId: string): Promise<void> {
  const { error } = await supabase.from('study_board_items').delete().eq('board_id', boardId);
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_board_items', filter: `room_id=eq.${roomId}` }, payload => {
      onChange({ event: 'INSERT', item: rowToItem(payload.new as BoardItemRow) });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'study_board_items', filter: `room_id=eq.${roomId}` }, payload => {
      onChange({ event: 'UPDATE', item: rowToItem(payload.new as BoardItemRow) });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'study_board_items', filter: `room_id=eq.${roomId}` }, payload => {
      onChange({ event: 'DELETE', itemId: (payload.old as { id: string }).id });
    })
    .subscribe();
  return channel;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
import type { ChatMessage } from '../types/board';

export async function loadChatMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('study_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at')
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatMessage[];
}

export async function sendChatMessage(
  roomId: string,
  userId: string,
  displayName: string,
  color: string,
  text: string
): Promise<void> {
  const { error } = await supabase
    .from('study_chat_messages')
    .insert({ room_id: roomId, user_id: userId, display_name: displayName, color, text });
  if (error) throw new Error(error.message);
}

export type ChatChangeHandler = (msg: ChatMessage) => void;

export function subscribeToChatMessages(
  roomId: string,
  onMessage: ChatChangeHandler
): RealtimeChannel {
  return supabase
    .channel(`chat:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_chat_messages', filter: `room_id=eq.${roomId}` }, payload => {
      onMessage(payload.new as ChatMessage);
    })
    .subscribe();
}

// ─── Snapshots ────────────────────────────────────────────────────────────────
import type { BoardSnapshot } from '../types/board';

export async function loadSnapshots(boardId: string): Promise<BoardSnapshot[]> {
  const { data, error } = await supabase
    .from('study_board_snapshots')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({
    ...row,
    items_json: row.items_json as unknown as BoardItem[],
  })) as BoardSnapshot[];
}

export async function createSnapshot(
  roomId: string,
  boardId: string,
  userId: string,
  label: string,
  items: BoardItem[]
): Promise<void> {
  const { error } = await supabase
    .from('study_board_snapshots')
    .insert({
      room_id: roomId,
      board_id: boardId,
      label,
      items_json: items as unknown as Json,
      created_by: userId,
    });
  if (error) throw new Error(error.message);
}

export async function restoreSnapshot(snapshotId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .rpc('restore_snapshot', { p_snapshot_id: snapshotId, p_user_id: userId });
  if (error || !data) throw new Error(error?.message ?? 'Restore failed');
  return (data as { board_id: string }).board_id;
}
