import { supabase } from './supabase';
import type { PresenceState, CursorPosition } from '../types/board';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresenceHandler = (participants: PresenceState[]) => void;
export type CursorHandler = (cursor: CursorPosition) => void;

// ─── Channel factory ──────────────────────────────────────────────────────────

/**
 * Creates a single Supabase Realtime channel for a room that carries:
 *  - Presence (who is online)
 *  - Broadcast cursor positions (throttled by the caller)
 */
export function createRoomChannel(
  roomId: string,
  myPresence: PresenceState,
  onPresenceChange: PresenceHandler,
  onCursor: CursorHandler
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

  // ── Cursor broadcast ──
  channel.on(
    'broadcast',
    { event: 'cursor' },
    ({ payload }: { payload: CursorPosition }) => {
      onCursor(payload);
    }
  );

  channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await channel.track(myPresence);
    }
  });

  return channel;
}

/** Broadcast a cursor position. Call this on mousemove / touchmove (throttled). */
export function broadcastCursor(
  channel: RealtimeChannel,
  cursor: CursorPosition
): void {
  channel.send({
    type: 'broadcast',
    event: 'cursor',
    payload: cursor,
  });
}

/** Unsubscribe and clean up. */
export async function leaveRoomChannel(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
