import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { colorFromUserId } from './colors';
import type { StudyRoom, RoomMember } from '../types/board';

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface RoomRow {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

interface MemberRow {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  color: string;
  joined_at: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Sign in anonymously (idempotent — reuses existing session). */
export async function ensureAnonymousSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new Error(error?.message ?? 'Anonymous sign-in failed');

  // Wait until the session is reflected in the client (up to 3s)
  for (let i = 0; i < 30; i++) {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.access_token) return s.user.id;
    await new Promise(r => setTimeout(r, 100));
  }

  throw new Error('Session did not become active after anonymous sign-in');
}

/** Return current authenticated user id, or throw. */
export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ─── Room creation ────────────────────────────────────────────────────────────

export async function createRoom(
  name: string,
  displayName: string
): Promise<{ room: StudyRoom; member: RoomMember }> {
  const userId = await ensureAnonymousSession();
  const inviteCode = nanoid(10);
  const color = colorFromUserId(userId);

  // Use security-definer RPC to bypass RLS (needed for asymmetric JWT projects)
  const { data, error } = await supabase.rpc('create_room', {
    p_name: name,
    p_invite_code: inviteCode,
    p_user_id: userId,
    p_display_name: displayName,
    p_color: color,
  });

  if (error || !data) throw new Error(error?.message ?? 'Failed to create room');

  const result = data as { room_id: string; member_id: string };

  // Load the created room and member
  const room = await loadRoom(result.room_id);
  const member = await getMyMembership(result.room_id);
  if (!member) throw new Error('Failed to load membership after room creation');

  return { room, member };
}

// ─── Room joining ─────────────────────────────────────────────────────────────

/** Join via public invite code. Returns room + member row. */
export async function joinRoomByCode(
  inviteCode: string,
  displayName: string
): Promise<{ room: StudyRoom; member: RoomMember }> {
  const userId = await ensureAnonymousSession();
  const color = colorFromUserId(userId);

  // Look up room by invite code (security-definer, no membership needed)
  const { data: roomData, error: roomError } = await supabase
    .rpc('get_room_by_invite', { p_invite_code: inviteCode });

  if (roomError) throw new Error(roomError.message);

  const rows = (roomData ?? []) as RoomRow[];
  if (rows.length === 0) throw new Error('Invalid invite code or room not found.');

  const room = rows[0] as StudyRoom;

  // Join via security-definer RPC
  const { error: joinError } = await supabase.rpc('join_room', {
    p_room_id: room.id,
    p_user_id: userId,
    p_display_name: displayName,
    p_color: color,
  });

  if (joinError) throw new Error(joinError.message);

  const member = await getMyMembership(room.id);
  if (!member) throw new Error('Failed to load membership after joining');

  return { room, member };
}

// ─── Room loading ─────────────────────────────────────────────────────────────

/** Load room details — works after membership exists (RLS allows it). */
export async function loadRoom(roomId: string): Promise<StudyRoom> {
  const { data, error } = await supabase
    .from('study_rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Room not found');
  return data as RoomRow as StudyRoom;
}

/** Load all members of a room. */
export async function loadRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('study_room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at');

  if (error) throw new Error(error.message);
  return ((data ?? []) as MemberRow[]) as RoomMember[];
}

/** Get the member row for the current user in a room. */
export async function getMyMembership(roomId: string): Promise<RoomMember | null> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('study_room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as MemberRow as RoomMember;
}

/** Build the full shareable invite URL. */
export function buildInviteUrl(inviteCode: string): string {
  return `${window.location.origin}/join/${inviteCode}`;
}
