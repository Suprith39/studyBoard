// ─── Board item types ────────────────────────────────────────────────────────

export type BoardItemType = 'stroke' | 'sticky';

/** A freehand stroke: an ordered list of (x,y) points */
export interface StrokeData {
  points: number[];   // flat [x0,y0, x1,y1, …]
  color: string;
  strokeWidth: number;
}

/** A sticky note */
export interface StickyData {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;        // background color
}

export type BoardItemData = StrokeData | StickyData;

export interface BoardItem {
  id: string;
  room_id: string;
  type: BoardItemType;
  data: BoardItemData;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Room types ───────────────────────────────────────────────────────────────

export interface StudyRoom {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  color: string;
  joined_at: string;
}

// ─── Presence / cursor types ──────────────────────────────────────────────────

export interface PresenceState {
  user_id: string;
  display_name: string;
  color: string;
  online_at: string;
}

export interface CursorPosition {
  user_id: string;
  display_name: string;
  color: string;
  x: number;
  y: number;
}

// ─── Tool / UI types ──────────────────────────────────────────────────────────

export type Tool = 'select' | 'draw' | 'sticky';

export type SyncStatus =
  | 'local'        // no room joined yet
  | 'connecting'   // subscribing to realtime
  | 'live'         // connected and synced
  | 'saving'       // write in flight
  | 'offline'      // lost connection
  | 'reconnecting' // auto-reconnecting
  | 'error';       // unrecoverable

export interface RoomSession {
  room: StudyRoom;
  member: RoomMember;
  userId: string;
}
