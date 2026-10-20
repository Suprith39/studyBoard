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
import {
  createBoardItem,
  updateBoardItem,
} from '../lib/boardService';
import { broadcastCursor } from '../lib/presenceService';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 30;
const DEFAULT_STICKY_WIDTH = 180;
const DEFAULT_STICKY_HEIGHT = 140;
const STROKE_WIDTH = 3;
const CURSOR_THROTTLE_MS = 40; // ~25fps

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  items: BoardItem[];
  tool: Tool;
  color: string;
  remoteCursors: CursorPosition[];
  session: RoomSession | null;
  channel: RealtimeChannel | null;
  onItemsChange: (updater: (prev: BoardItem[]) => BoardItem[]) => void;
  onUndo: (itemId: string) => void;
  undoStack: string[]; // ids we created locally
}

// ─── Grid background ──────────────────────────────────────────────────────────
function GridLayer({ width, height }: { width: number; height: number }) {
  const dots: React.ReactNode[] = [];
  for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
    for (let y = GRID_SIZE; y < height; y += GRID_SIZE) {
      dots.push(
        <Circle key={`${x}-${y}`} x={x} y={y} radius={1} fill="#cbd5e1" />
      );
    }
  }
  return <Layer listening={false}>{dots}</Layer>;
}

// ─── Sticky note editor overlay ───────────────────────────────────────────────
interface StickyEditorProps {
  item: BoardItem;
  stageRef: React.RefObject<Konva.Stage | null>;
  onSave: (text: string) => void;
  onClose: () => void;
}

function StickyEditor({ item, stageRef, onSave, onClose }: StickyEditorProps) {
  const data = item.data as StickyData;
  const [text, setText] = useState(data.text);

  // Position the textarea over the sticky on the canvas
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
      style={{
        left,
        top,
        width: data.width - 16,
        height: data.height - 32,
        backgroundColor: data.color,
      }}
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
  session,
  channel,
  onItemsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeId = useRef<string | null>(null);
  const currentPoints = useRef<number[]>([]);
  const lastCursorBroadcast = useRef(0);
  const [editingSticky, setEditingSticky] = useState<BoardItem | null>(null);
  const [draggingStickyId, setDraggingStickyId] = useState<string | null>(null);

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

  // ── Keyboard shortcut: Ctrl/Cmd+Z ─────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        // handled by parent
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Cursor broadcast ───────────────────────────────────────────────────────
  const broadcastCursorThrottled = useCallback((x: number, y: number) => {
    if (!channel || !session) return;
    const now = Date.now();
    if (now - lastCursorBroadcast.current < CURSOR_THROTTLE_MS) return;
    lastCursorBroadcast.current = now;
    broadcastCursor(channel, {
      user_id: session.userId,
      display_name: session.member.display_name,
      color: session.member.color,
      x,
      y,
    });
  }, [channel, session]);

  // ── Pointer position helper ────────────────────────────────────────────────
  const getPointerPos = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.getPointerPosition();
  };

  // ── Draw: pointer down ──────────────────────────────────────────────────────
  const handlePointerDown = () => {
    if (tool !== 'draw') return;
    const pos = getPointerPos();
    if (!pos) return;
    setIsDrawing(true);
    currentPoints.current = [pos.x, pos.y];
    // Optimistic local stroke — will get a real id on save
    const tempId = `tmp-${Date.now()}`;
    currentStrokeId.current = tempId;
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
  };

  // ── Draw: pointer move ──────────────────────────────────────────────────────
  const handlePointerMove = () => {
    const pos = getPointerPos();
    if (!pos) return;
    broadcastCursorThrottled(pos.x, pos.y);

    if (!isDrawing || tool !== 'draw') return;
    currentPoints.current = [...currentPoints.current, pos.x, pos.y];
    const tempId = currentStrokeId.current;
    if (!tempId) return;
    onItemsChange(prev =>
      prev.map(item =>
        item.id === tempId
          ? {
              ...item,
              data: {
                ...(item.data as StrokeData),
                points: [...currentPoints.current],
              },
            }
          : item
      )
    );
  };

  // ── Draw: pointer up ────────────────────────────────────────────────────────
  const handlePointerUp = async () => {
    if (!isDrawing || tool !== 'draw') return;
    setIsDrawing(false);
    const tempId = currentStrokeId.current;
    currentStrokeId.current = null;
    if (!tempId || !session) return;

    const strokeData: StrokeData = {
      points: [...currentPoints.current],
      color,
      strokeWidth: STROKE_WIDTH,
    };

    try {
      const saved = await createBoardItem(session.room.id, session.userId, 'stroke', strokeData);
      // Replace temp item with real item
      onItemsChange(prev =>
        prev.map(item => (item.id === tempId ? saved : item))
      );
    } catch {
      // Remove failed stroke
      onItemsChange(prev => prev.filter(item => item.id !== tempId));
    }
  };

  // ── Sticky: place on canvas click ───────────────────────────────────────────
  const handleStageClick = async (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool !== 'sticky') return;
    if (e.target !== stageRef.current) return; // only on empty canvas
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
    } catch {
      // ignore
    }
  };

  // ── Sticky: drag end ────────────────────────────────────────────────────────
  const handleStickyDragEnd = async (
    e: Konva.KonvaEventObject<DragEvent>,
    item: BoardItem
  ) => {
    setDraggingStickyId(null);
    const data = item.data as StickyData;
    const newData: StickyData = {
      ...data,
      x: e.target.x(),
      y: e.target.y(),
    };

    onItemsChange(prev =>
      prev.map(i => (i.id === item.id ? { ...i, data: newData } : i))
    );

    if (!session) return;
    try {
      await updateBoardItem(item.id, session.userId, newData);
    } catch {
      // revert
      onItemsChange(prev =>
        prev.map(i => (i.id === item.id ? { ...i, data } : i))
      );
    }
  };

  // ── Save sticky text ────────────────────────────────────────────────────────
  const handleStickyTextSave = async (text: string) => {
    if (!editingSticky || !session) return;
    const data = editingSticky.data as StickyData;
    const newData: StickyData = { ...data, text };

    onItemsChange(prev =>
      prev.map(i => (i.id === editingSticky.id ? { ...i, data: newData } : i))
    );

    try {
      await updateBoardItem(editingSticky.id, session.userId, newData);
    } catch {
      // revert
      onItemsChange(prev =>
        prev.map(i => (i.id === editingSticky.id ? { ...i, data } : i))
      );
    }
  };

  // ── Cursor style ────────────────────────────────────────────────────────────
  const getCursor = () => {
    if (tool === 'draw') return 'crosshair';
    if (tool === 'sticky') return 'cell';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      className="whiteboard-container"
      style={{ cursor: getCursor() }}
    >
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
        {/* Grid */}
        <GridLayer width={size.width} height={size.height} />

        {/* Board items */}
        <Layer>
          {items.map(item => {
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
                  globalCompositeOperation="source-over"
                  listening={false}
                />
              );
            }
            if (item.type === 'sticky') {
              const d = item.data as StickyData;
              const isDragging = draggingStickyId === item.id;
              return (
                <Group
                  key={item.id}
                  x={d.x}
                  y={d.y}
                  draggable={tool === 'select'}
                  onDragStart={() => setDraggingStickyId(item.id)}
                  onDragEnd={e => handleStickyDragEnd(e, item)}
                  onDblClick={() => setEditingSticky(item)}
                  onDblTap={() => setEditingSticky(item)}
                  shadowBlur={isDragging ? 16 : 4}
                  shadowOpacity={isDragging ? 0.3 : 0.15}
                  shadowColor="#000"
                  shadowOffsetY={isDragging ? 8 : 2}
                >
                  <Rect
                    width={d.width}
                    height={d.height}
                    fill={d.color}
                    cornerRadius={4}
                  />
                  {/* Sticky top accent */}
                  <Rect
                    width={d.width}
                    height={6}
                    fill={darken(d.color, 20)}
                    cornerRadius={[4, 4, 0, 0]}
                  />
                  <Text
                    x={8}
                    y={16}
                    width={d.width - 16}
                    height={d.height - 24}
                    text={d.text || (editingSticky?.id === item.id ? '' : 'Double-click to edit')}
                    fontSize={14}
                    fill={d.text ? '#1e293b' : '#94a3b8'}
                    fontFamily="system-ui, sans-serif"
                    wrap="word"
                    ellipsis
                  />
                </Group>
              );
            }
            return null;
          })}
        </Layer>

        {/* Remote cursors */}
        <Layer listening={false}>
          {remoteCursors.map(cursor => (
            <Group key={cursor.user_id} x={cursor.x} y={cursor.y}>
              {/* Cursor arrow */}
              <Line
                points={[0, 0, 0, 16, 4, 12, 8, 20, 10, 18, 6, 10, 12, 10]}
                closed
                fill={cursor.color}
                stroke="#fff"
                strokeWidth={1}
              />
              {/* Name label */}
              <Rect
                x={12}
                y={14}
                width={cursor.display_name.length * 7 + 8}
                height={20}
                fill={cursor.color}
                cornerRadius={4}
              />
              <Text
                x={16}
                y={18}
                text={cursor.display_name}
                fontSize={11}
                fill="#fff"
                fontFamily="system-ui, sans-serif"
                fontStyle="bold"
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {/* Textarea overlay for sticky editing */}
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
