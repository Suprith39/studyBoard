import { supabase } from './supabase';
import type { PresenceState, CursorPosition } from '../types/board';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type PresenceHandler = (participants: PresenceState[]) => void;
export type CursorHandler = (cursor: CursorPosition) => void;

export interface RemoteStrokeProgress {
  user_id: string;
  color: string;
  strokeWidth: number;
  points: number[];
}

export interface RemoteStickyDrag {
  user_id: string;
  item_id: string;
  x: number;
  y: number;
}

export interface LaserPoint {
  user_id: string;
  color: string;
  display_name: string;
  points: number[];
  ts: number;
}

export interface EmojiReaction {
  user_id: string;
  display_name: string;
  emoji: string;
  x: number;
  y: number;
  id: string;
}

export type StrokeProgressHandler = (stroke: RemoteStrokeProgress | null, userId: string) => void;
export type StickyDragHandler = (drag: RemoteStickyDrag) => void;
export type LaserHandler = (laser: LaserPoint | null, userId: string) => void;
export type EmojiHandler = (reaction: EmojiReaction) => void;

export function createRoomChannel(
  roomId: string,
  myPresence: PresenceState,
  onPresenceChange: PresenceHandler,
  onCursor: CursorHandler,
  onStrokeProgress: StrokeProgressHandler,
  onStickyDrag: StickyDragHandler,
  onLaser: LaserHandler,
  onEmoji: EmojiHandler,
): RealtimeChannel {
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: myPresence.user_id },
      broadcast: { ack: false, self: false },
    },
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceState>();
    const participants = Object.values(state).flat().map(p => p as unknown as PresenceState);
    onPresenceChange(participants);
  });

  channel.on('broadcast', { event: 'cursor' }, ({ payload }: { payload: CursorPosition }) => {
    onCursor(payload);
  });

  channel.on('broadcast', { event: 'stroke_progress' }, ({ payload }: { payload: RemoteStrokeProgress }) => {
    onStrokeProgress(payload, payload.user_id);
  });

  channel.on('broadcast', { event: 'stroke_end' }, ({ payload }: { payload: { user_id: string } }) => {
    onStrokeProgress(null, payload.user_id);
  });

  channel.on('broadcast', { event: 'sticky_drag' }, ({ payload }: { payload: RemoteStickyDrag }) => {
    onStickyDrag(payload);
  });

  channel.on('broadcast', { event: 'laser' }, ({ payload }: { payload: LaserPoint }) => {
    onLaser(payload, payload.user_id);
  });

  channel.on('broadcast', { event: 'laser_end' }, ({ payload }: { payload: { user_id: string } }) => {
    onLaser(null, payload.user_id);
  });

  channel.on('broadcast', { event: 'emoji' }, ({ payload }: { payload: EmojiReaction }) => {
    onEmoji(payload);
  });

  channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') await channel.track(myPresence);
  });

  return channel;
}

export function broadcastCursor(channel: RealtimeChannel, cursor: CursorPosition): void {
  channel.send({ type: 'broadcast', event: 'cursor', payload: cursor });
}

export function broadcastStrokeProgress(channel: RealtimeChannel, stroke: RemoteStrokeProgress): void {
  channel.send({ type: 'broadcast', event: 'stroke_progress', payload: stroke });
}

export function broadcastStrokeEnd(channel: RealtimeChannel, userId: string): void {
  channel.send({ type: 'broadcast', event: 'stroke_end', payload: { user_id: userId } });
}

export function broadcastStickyDrag(channel: RealtimeChannel, drag: RemoteStickyDrag): void {
  channel.send({ type: 'broadcast', event: 'sticky_drag', payload: drag });
}

export function broadcastLaser(channel: RealtimeChannel, laser: LaserPoint): void {
  channel.send({ type: 'broadcast', event: 'laser', payload: laser });
}

export function broadcastLaserEnd(channel: RealtimeChannel, userId: string): void {
  channel.send({ type: 'broadcast', event: 'laser_end', payload: { user_id: userId } });
}

export function broadcastEmoji(channel: RealtimeChannel, reaction: EmojiReaction): void {
  channel.send({ type: 'broadcast', event: 'emoji', payload: reaction });
}

export async function leaveRoomChannel(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
