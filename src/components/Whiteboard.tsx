import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Circle } from 'react-konva';
import type Konva from 'konva';
import type {
  BoardItem,
  StrokeData,
  StickyData,
  Tool,
  CursorPosition,
  RoomSession,
} from '../types/board';
import { STICKY_COLORS } from '../lib/colors';
import { createBoardItem, updateBoardItem } from '../lib/boardService';
import {
  broadcastCursor,
  broadcastStrokeProgress,
  broadcastStrokeEnd,
  broadcastStickyDrag,
  type RemoteStrokeProgress,
  type RemoteStickyDrag,
} from '../lib/presenceService';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 30;
const DEFAULT_STICKY_WIDTH = 180;
const DEFAULT_STICKY_HEIGHT = 140;
const STROKE_WIDTH = 3;
const CURSOR_THROTTLE_MS = 50;   // cursor: ~20fps is fine
// Stroke progress: NO throttle — send every point for maximum smoothness

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  items: BoardItem[];
  tool: Tool;
  color: string;
  remoteCursors: CursorPosition[];
  remoteStrokes: Map<string, RemoteStrokeProgress>;
  remoteStickyDrags: Map<string, RemoteStickyDrag>;
  session: RoomSession | null;
  channel: RealtimeChannel | null;
  onItemsChange: (updater: (prev: BoardItem[]) => BoardItem[]) => void;
  onUndo: (itemId: string) => void;
  undoStack: string[];
}

// ─── Grid background ──────────────────────────────────────────────────────────
function GridLayer({ width, height }: { width: number; height: number }) {
  const dots: React.ReactNode[] = [];
  for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
    for (let y = GRID_SIZE; y < height; y += GRID_SIZE) {
      dots.push(<Circle key={`${x}-${y}`} x={x} y={y} radius={1} fill="#cbd5e1" />);
    }
  }
  return <Layer listening={false}>{dots}</Layer>;
}

// ─── Sticky editor overlay ────────────────────────────────────────────────────
interface StickyEditorProps {
  item: BoardItem;
  stageRef: React.RefObject<Konva.Stage | null>;
  onSave: (text: string) => void;
  onClose: () => void;
}

function StickyEditor({ item, stageRef, onSave, onClose }: StickyEditorProps) {
  const data = item.data as StickyData;
  const [text, setText] = useState(data.text);
  const stage = stageRef.current;
  const containerRect = stage?.container().getBoundingClientRect();
  const left = (containerRect?.left ?? 0) + data.x;
  const top = (containerRect?.top ?? 0) + data.y + window.scrollY;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && e.metaKey) { onSave(text); onClose(); }
  };

  return (
    <textarea
      autoFocus
      className="sticky-editor"
      style={{ left, top, width: data.width - 16, height: data.height - 32, backgroundColor: data.color }}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => { onSave(text); onClose(); }}
      aria-label="Edit sticky note text"
      placeholder="Type here…"
    />
  );
}

// ─── Main Whiteboard ──────────────────────────────────────────────────────────
export function Whiteboard({
  items,
  tool,
  color,
  remoteCursors,
  remoteStrokes,
  remoteStickyDrags,
  session,
  channel,
  onItemsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Drawing state — use refs so updates don't trigger re-renders during stroke
  const isDrawingRef = useRef(false);
  const currentStrokeId = useRef<string | null>(null);
  const currentPoints = useRef<number[]>([]);
  // Mirror in state only for the local live preview line
  const [localPoints, setLocalPoints] = useState<number[]>([]);
  const [localColor, setLocalColor] = useState(color);

  const lastCursorBroadcast = useRef(0);
  const [editingSticky, setEditingSticky] = useState<BoardItem | null>(null);
  const [draggingStickyId, setDraggingStickyId] = useState<string | null>(null);

  // Keep localColor in sync (color can change between strokes)
  useEffect(() => { setLocalColor(color); }, [color]);

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getPointerPos = () => stageRef.current?.getPointerPosition() ?? null;

  // ── Draw: pointer down ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback(() => {
    if (tool !== 'draw') return;
    const pos = getPointerPos();
    if (!pos) return;

    isDrawingRef.current = true;
    currentPoints.current = [pos.x, pos.y];
    setLocalPoints([pos.x, pos.y]);
    setLocalColor(color);

    const tempId = `tmp-${Date.now()}`;
    currentStrokeId.current = tempId;

    // Add a placeholder item — we'll replace it on pointer-up
    onItemsChange(prev => [
      ...prev,
      {
        id: tempId,
        room_id: session?.room.id ?? '',
        type: 'stroke',
        data: { points: [pos.x, pos.y], color, strokeWidth: STROKE_WIDTH } as StrokeData,
        created_by: session?.userId ?? '',
        updated_by: session?.userId ?? '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }, [tool, color, session, onItemsChange]);

  // ── Draw: pointer move ─────────────────────────────────────────────────────
  const handlePointerMove = useCallback(() => {
    const pos = getPointerPos();
    if (!pos) return;

    // Throttled cursor broadcast (independent of stroke)
    if (channel && session) {
      const now = Date.now();
      if (now - lastCursorBroadcast.current >= CURSOR_THROTTLE_MS) {
        lastCursorBroadcast.current = now;
        broadcastCursor(channel, {
          user_id: session.userId,
          display_name: session.member.display_name,
          color: session.member.color,
          x: pos.x,
          y: pos.y,
        });
      }
    }

    if (!isDrawingRef.current || tool !== 'draw') return;

    // Append point
    currentPoints.current = [...currentPoints.current, pos.x, pos.y];
    const pts = currentPoints.current;

    // Update local preview immediately via state (triggers re-render of live line)
    setLocalPoints([...pts]);

    // Broadcast EVERY point — no throttle — for smooth remote preview
    if (channel && session) {
      broadcastStrokeProgress(channel, {
        user_id: session.userId,
        color,
        strokeWidth: STROKE_WIDTH,
        points: [...pts],
      });
    }
  }, [tool, color, session, channel]);

  // ── Draw: pointer up ───────────────────────────────────────────────────────
  const handlePointerUp = useCallback(async () => {
    if (!isDrawingRef.current || tool !== 'draw') return;
    isDrawingRef.current = false;

    const finalPoints = [...currentPoints.current];
    setLocalPoints([]);

    if (channel && session) {
      broadcastStrokeEnd(channel, session.userId);
    }

    const tempId = currentStrokeId.current;
    currentStrokeId.current = null;
    if (!tempId || !session) return;

    const strokeData: StrokeData = { points: finalPoints, color, strokeWidth: STROKE_WIDTH };

    try {
      const saved = await createBoardItem(session.room.id, session.userId, 'stroke', strokeData);
      // Replace temp with saved (has real id)
      onItemsChange(prev => prev.map(item => (item.id === tempId ? saved : item)));
    } catch {
      onItemsChange(prev => prev.filter(item => item.id !== tempId));
    }
  }, [tool, color, session, channel, onItemsChange]);

  // ── Sticky: place ──────────────────────────────────────────────────────────
  const handleStageClick = useCallback(async (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool !== 'sticky') return;
    if (e.target !== stageRef.current) return;
    const pos = getPointerPos();
    if (!pos || !session) return;

    const stickyData: StickyData = {
      x: pos.x - DEFAULT_STICKY_WIDTH / 2,
      y: pos.y - DEFAULT_STICKY_HEIGHT / 2,
      width: DEFAULT_STICKY_WIDTH,
      height: DEFAULT_STICKY_HEIGHT,
      text: '',
      color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
    };

    try {
      const saved = await createBoardItem(session.room.id, session.userId, 'sticky', stickyData);
      onItemsChange(prev => [...prev, saved]);
      setEditingSticky(saved);
    } catch { /* ignore */ }
  }, [tool, session, onItemsChange]);

  // ── Sticky: live drag broadcast ────────────────────────────────────────────
  const handleStickyDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, itemId: string) => {
      if (!channel || !session) return;
      broadcastStickyDrag(channel, {
        user_id: session.userId,
        item_id: itemId,
        x: e.target.x(),
        y: e.target.y(),
      });
    },
    [channel, session]
  );

  // ── Sticky: drag end ───────────────────────────────────────────────────────
  const handleStickyDragEnd = useCallback(async (
    e: Konva.KonvaEventObject<DragEvent>,
    item: BoardItem
  ) => {
    setDraggingStickyId(null);
    const data = item.data as StickyData;
    const newData: StickyData = { ...data, x: e.target.x(), y: e.target.y() };
    onItemsChange(prev => prev.map(i => (i.id === item.id ? { ...i, data: newData } : i)));
    if (!session) return;
    try {
      await updateBoardItem(item.id, session.userId, newData);
    } catch {
      onItemsChange(prev => prev.map(i => (i.id === item.id ? { ...i, data } : i)));
    }
  }, [session, onItemsChange]);

  // ── Sticky: save text ──────────────────────────────────────────────────────
  const handleStickyTextSave = useCallback(async (text: string) => {
    if (!editingSticky || !session) return;
    const data = editingSticky.data as StickyData;
    const newData: StickyData = { ...data, text };
    onItemsChange(prev => prev.map(i => (i.id === editingSticky.id ? { ...i, data: newData } : i)));
    try {
      await updateBoardItem(editingSticky.id, session.userId, newData);
    } catch {
      onItemsChange(prev => prev.map(i => (i.id === editingSticky.id ? { ...i, data } : i)));
    }
  }, [editingSticky, session, onItemsChange]);

  const getCursor = () => {
    if (tool === 'draw') return 'crosshair';
    if (tool === 'sticky') return 'cell';
    return 'default';
  };

  // ── Items to render: skip the temp stroke (drawn as live line instead) ─────
  const committedItems = items.filter(i => !i.id.startsWith('tmp-'));

  return (
    <div ref={containerRef} className="whiteboard-container" style={{ cursor: getCursor() }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleStageClick as (e: Konva.KonvaEventObject<MouseEvent>) => void}
        onTap={handleStageClick as (e: Konva.KonvaEventObject<TouchEvent>) => void}
        style={{ display: 'block', touchAction: 'none' }}
      >
        {/* Dotted grid */}
        <GridLayer width={size.width} height={size.height} />

        {/* Committed board items */}
        <Layer>
          {committedItems.map(item => {
            if (item.type === 'stroke') {
              const d = item.data as StrokeData;
              return (
                <Line
                  key={item.id}
                  points={d.points}
                  stroke={d.color}
                  strokeWidth={d.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              );
            }
            if (item.type === 'sticky') {
              const d = item.data as StickyData;
              const liveDrag = remoteStickyDrags.get(item.id);
              const displayX = liveDrag ? liveDrag.x : d.x;
              const displayY = liveDrag ? liveDrag.y : d.y;
              const isDraggingLocal = draggingStickyId === item.id;
              return (
                <Group
                  key={item.id}
                  x={displayX}
                  y={displayY}
                  draggable={tool === 'select'}
                  onDragStart={() => setDraggingStickyId(item.id)}
                  onDragMove={e => handleStickyDragMove(e, item.id)}
                  onDragEnd={e => handleStickyDragEnd(e, item)}
                  onDblClick={() => setEditingSticky(item)}
                  onDblTap={() => setEditingSticky(item)}
                  shadowBlur={isDraggingLocal || !!liveDrag ? 16 : 4}
                  shadowOpacity={isDraggingLocal || !!liveDrag ? 0.3 : 0.15}
                  shadowColor="#000"
                  shadowOffsetY={isDraggingLocal || !!liveDrag ? 8 : 2}
                >
                  <Rect width={d.width} height={d.height} fill={d.color} cornerRadius={4} />
                  <Rect width={d.width} height={6} fill={darken(d.color, 20)} cornerRadius={[4, 4, 0, 0]} />
                  <Text
                    x={8} y={16}
                    width={d.width - 16}
                    height={d.height - 24}
                    text={d.text || (editingSticky?.id === item.id ? '' : 'Double-click to edit')}
                    fontSize={14}
                    fill={d.text ? '#1e293b' : '#94a3b8'}
                    fontFamily="system-ui, sans-serif"
                    wrap="word"
                    ellipsis
                  />
                  {liveDrag && (
                    <Rect x={d.width - 10} y={-6} width={10} height={10} fill="#6366f1" cornerRadius={5} />
                  )}
                </Group>
              );
            }
            return null;
          })}
        </Layer>

        {/* ── Live strokes layer (local + remote, no DB involvement) ── */}
        <Layer listening={false}>
          {/* Local stroke being drawn right now */}
          {localPoints.length >= 2 && (
            <Line
              points={localPoints}
              stroke={localColor}
              strokeWidth={STROKE_WIDTH}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {/* Remote users' in-progress strokes */}
          {Array.from(remoteStrokes.values()).map(stroke =>
            stroke.points.length >= 2 ? (
              <Line
                key={stroke.user_id}
                points={stroke.points}
                stroke={stroke.color}
                strokeWidth={stroke.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                opacity={0.9}
              />
            ) : null
          )}
        </Layer>

        {/* Remote cursors */}
        <Layer listening={false}>
          {remoteCursors.map(cursor => (
            <Group key={cursor.user_id} x={cursor.x} y={cursor.y}>
              <Line
                points={[0, 0, 0, 16, 4, 12, 8, 20, 10, 18, 6, 10, 12, 10]}
                closed fill={cursor.color} stroke="#fff" strokeWidth={1}
              />
              <Rect
                x={12} y={14}
                width={cursor.display_name.length * 7 + 8}
                height={20}
                fill={cursor.color}
                cornerRadius={4}
              />
              <Text
                x={16} y={18}
                text={cursor.display_name}
                fontSize={11} fill="#fff"
                fontFamily="system-ui, sans-serif"
                fontStyle="bold"
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {editingSticky && (
        <StickyEditor
          item={editingSticky}
          stageRef={stageRef}
          onSave={handleStickyTextSave}
          onClose={() => setEditingSticky(null)}
        />
      )}
    </div>
  );
}

// ─── Color helper ─────────────────────────────────────────────────────────────
function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
