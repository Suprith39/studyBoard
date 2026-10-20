// ─── Board item types ─────────────────────────────────────────────────────────

export type BoardItemType = 'stroke' | 'sticky' | 'shape' | 'text' | 'image';

/** Freehand stroke */
export interface StrokeData {
  points: number[];
  color: string;
  strokeWidth: number;
}

/** Sticky note */
export interface StickyData {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

/** Shape: rect | circle | arrow */
export type ShapeKind = 'rect' | 'circle' | 'arrow';
export interface ShapeData {
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  fill: string;      // 'none' or a color
  // Arrow-specific
  points?: number[]; // flat [x1,y1,x2,y2]
}

/** Text box */
export interface TextData {
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

/** Image / PDF page placed on board */
export interface ImageData {
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;       // base64 data URL or storage URL
  originalWidth: number;
  originalHeight: number;
}

export type BoardItemData = StrokeData | StickyData | ShapeData | TextData | ImageData;

export interface BoardItem {
  id: string;
  room_id: string;
  board_id: string;  // which board tab this belongs to
  type: BoardItemType;
  data: BoardItemData;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Board (tab) types ────────────────────────────────────────────────────────

export interface StudyBoard {
  id: string;
  room_id: string;
  name: string;
  position: number;  // display order
  created_by: string;
  created_at: string;
}

// ─── Room types ───────────────────────────────────────────────────────────────

export interface StudyRoom {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  pin_hash: string | null; // bcrypt hash of PIN, null = no password
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  color: string;
  joined_at: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  color: string;
  text: string;
  created_at: string;
}

// ─── Board history snapshot ───────────────────────────────────────────────────

export interface BoardSnapshot {
  id: string;
  room_id: string;
  board_id: string;
  label: string;
  items_json: BoardItem[];
  created_by: string;
  created_at: string;
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

export type Tool =
  | 'select'
  | 'draw'
  | 'eraser'
  | 'shape'
  | 'text'
  | 'sticky'
  | 'laser'
  | 'image';

export type SyncStatus =
  | 'local'
  | 'connecting'
  | 'live'
  | 'saving'
  | 'offline'
  | 'reconnecting'
  | 'error';

export interface RoomSession {
  room: StudyRoom;
  member: RoomMember;
  userId: string;
}

// ─── Viewport ─────────────────────────────────────────────────────────────────
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
