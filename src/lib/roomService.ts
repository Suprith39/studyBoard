import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { colorFromUserId } from './colors';
import type { StudyRoom, RoomMember } from '../types/board';

interface RoomRow {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  pin_hash: string | null;
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

export async function ensureAnonymousSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new Error(error?.message ?? 'Anonymous sign-in failed');

  for (let i = 0; i < 30; i++) {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.access_token) return s.user.id;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Session did not become active after anonymous sign-in');
}

export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/room` },
  });
  if (error) throw new Error(error.message);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// ─── Room creation ────────────────────────────────────────────────────────────

/** Hash a PIN using SHA-256 (browser SubtleCrypto) */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createRoom(
  name: string,
  displayName: string,
  pin?: string
): Promise<{ room: StudyRoom; member: RoomMember; boardId: string }> {
  const userId = await ensureAnonymousSession();
  const inviteCode = nanoid(10);
  const color = colorFromUserId(userId);
  const pinHash = pin ? await hashPin(pin) : null;

  const { data, error } = await supabase.rpc('create_room', {
    p_name: name,
    p_invite_code: inviteCode,
    p_user_id: userId,
    p_display_name: displayName,
    p_color: color,
    p_pin_hash: pinHash,
  });

  if (error || !data) throw new Error(error?.message ?? 'Failed to create room');
  const result = data as { room_id: string; member_id: string; board_id: string };

  const room = await loadRoom(result.room_id);
  const member = await getMyMembership(result.room_id);
  if (!member) throw new Error('Failed to load membership');

  return { room, member, boardId: result.board_id };
}

export async function joinRoomByCode(
  inviteCode: string,
  displayName: string,
  pin?: string
): Promise<{ room: StudyRoom; member: RoomMember }> {
  const userId = await ensureAnonymousSession();
  const color = colorFromUserId(userId);

  const { data: roomData, error: roomError } = await supabase
    .rpc('get_room_by_invite', { p_invite_code: inviteCode });
  if (roomError) throw new Error(roomError.message);

  const rows = (roomData ?? []) as RoomRow[];
  if (rows.length === 0) throw new Error('Invalid invite code or room not found.');

  const room = rows[0] as StudyRoom;

  // If room has a PIN, hash and pass it
  const pinHash = pin ? await hashPin(pin) : undefined;

  const { error: joinError } = await supabase.rpc('join_room', {
    p_room_id: room.id,
    p_user_id: userId,
    p_display_name: displayName,
    p_color: color,
    p_pin: pinHash ?? null,
  });

  if (joinError) {
    if (joinError.message.includes('PIN_REQUIRED')) throw new Error('PIN_REQUIRED');
    if (joinError.message.includes('PIN_INVALID')) throw new Error('PIN_INVALID');
    throw new Error(joinError.message);
  }

  const member = await getMyMembership(room.id);
  if (!member) throw new Error('Failed to load membership');
  return { room, member };
}

export async function loadRoom(roomId: string): Promise<StudyRoom> {
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('id', roomId).single();
  if (error || !data) throw new Error(error?.message ?? 'Room not found');
  return data as RoomRow as StudyRoom;
}

export async function loadRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('study_room_members').select('*').eq('room_id', roomId).order('joined_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as MemberRow[]) as RoomMember[];
}

export async function getMyMembership(roomId: string): Promise<RoomMember | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('study_room_members').select('*').eq('room_id', roomId).eq('user_id', userId).single();
  if (error) return null;
  return data as MemberRow as RoomMember;
}

export function buildInviteUrl(inviteCode: string): string {
  return `${window.location.origin}/join/${inviteCode}`;
}

/** Check if a room needs a PIN before we try to join */
export async function checkRoomPin(inviteCode: string): Promise<boolean> {
  const { data } = await supabase.rpc('get_room_by_invite', { p_invite_code: inviteCode });
  const rows = (data ?? []) as RoomRow[];
  return rows.length > 0 && rows[0].pin_hash !== null;
}

export async function setRoomPin(roomId: string, pin: string | null): Promise<void> {
  const userId = await getCurrentUserId();
  const pinHash = pin ? await hashPin(pin) : null;
  const { error } = await supabase.rpc('set_room_pin', {
    p_room_id: roomId,
    p_user_id: userId,
    p_pin_hash: pinHash,
  });
  if (error) throw new Error(error.message);
}
