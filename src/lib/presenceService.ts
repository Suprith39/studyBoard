import { supabase } from './supabase';
import type { PresenceState, CursorPosition } from '../types/board';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresenceHandler = (participants: PresenceState[]) => void;
export type CursorHandler = (cursor: CursorPosition) => void;

/** A live in-progress stroke being drawn by a remote user */
export interface RemoteStrokeProgress {
  user_id: string;
  color: string;
  strokeWidth: number;
  points: number[];
}

/** A sticky note being dragged live by a remote user */
export interface RemoteStickyDrag {
  user_id: string;
  item_id: string;
  x: number;
  y: number;
}

export type StrokeProgressHandler = (stroke: RemoteStrokeProgress | null, userId: string) => void;
export type StickyDragHandler = (drag: RemoteStickyDrag) => void;

// ─── Channel factory ──────────────────────────────────────────────────────────

/**
 * Creates a single Supabase Realtime channel for a room carrying:
 *  - Presence (who is online)
 *  - Broadcast: cursor positions (throttled)
 *  - Broadcast: in-progress stroke points (throttled, ~30fps)
 *  - Broadcast: live sticky drag positions (throttled)
 *  - Broadcast: stroke_end (remote user lifted pen)
 */
export function createRoomChannel(
  roomId: string,
  myPresence: PresenceState,
  onPresenceChange: PresenceHandler,
  onCursor: CursorHandler,
  onStrokeProgress: StrokeProgressHandler,
  onStickyDrag: StickyDragHandler,
): RealtimeChannel {
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: myPresence.user_id },
      broadcast: { ack: false, self: false },
    },
  });

  // ── Presence ──
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceState>();
    const participants = Object.values(state)
      .flat()
      .map(p => p as unknown as PresenceState);
    onPresenceChange(participants);
  });

  // ── Cursor ──
  channel.on(
    'broadcast',
    { event: 'cursor' },
    ({ payload }: { payload: CursorPosition }) => {
      onCursor(payload);
    }
  );

  // ── Live stroke progress ──
  channel.on(
    'broadcast',
    { event: 'stroke_progress' },
    ({ payload }: { payload: RemoteStrokeProgress }) => {
      onStrokeProgress(payload, payload.user_id);
    }
  );

  // ── Stroke ended (pen lifted) ──
  channel.on(
    'broadcast',
    { event: 'stroke_end' },
    ({ payload }: { payload: { user_id: string } }) => {
      onStrokeProgress(null, payload.user_id);
    }
  );

  // ── Live sticky drag ──
  channel.on(
    'broadcast',
    { event: 'sticky_drag' },
    ({ payload }: { payload: RemoteStickyDrag }) => {
      onStickyDrag(payload);
    }
  );

  channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await channel.track(myPresence);
    }
  });

  return channel;
}

/** Broadcast cursor position (call on pointermove, throttled by caller). */
export function broadcastCursor(
  channel: RealtimeChannel,
  cursor: CursorPosition
): void {
  channel.send({ type: 'broadcast', event: 'cursor', payload: cursor });
}

/** Broadcast in-progress stroke points (call on pointermove while drawing). */
export function broadcastStrokeProgress(
  channel: RealtimeChannel,
  stroke: RemoteStrokeProgress
): void {
  channel.send({ type: 'broadcast', event: 'stroke_progress', payload: stroke });
}

/** Broadcast that a stroke has ended (pen lifted). */
export function broadcastStrokeEnd(
  channel: RealtimeChannel,
  userId: string
): void {
  channel.send({ type: 'broadcast', event: 'stroke_end', payload: { user_id: userId } });
}

/** Broadcast live sticky drag position. */
export function broadcastStickyDrag(
  channel: RealtimeChannel,
  drag: RemoteStickyDrag
): void {
  channel.send({ type: 'broadcast', event: 'sticky_drag', payload: drag });
}

/** Unsubscribe and clean up. */
export async function leaveRoomChannel(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
