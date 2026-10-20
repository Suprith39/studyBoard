import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Stage, Layer, Line, Rect, Ellipse, Arrow,
  Text as KText, Group, Circle, Image as KImage, Transformer,
} from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import type {
  BoardItem, StrokeData, StickyData, ShapeData, TextData, ImageData,
  Tool, CursorPosition, RoomSession, Viewport,
} from '../types/board';
import { STICKY_COLORS } from '../lib/colors';
import { createBoardItem, updateBoardItem, deleteBoardItem } from '../lib/boardService';
import {
  broadcastCursor, broadcastStrokeProgress, broadcastStrokeEnd,
  broadcastStickyDrag, broadcastLaser, broadcastLaserEnd,
  type RemoteStrokeProgress, type RemoteStickyDrag, type LaserPoint,
} from '../lib/presenceService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { processImageFile, processPdfFile } from '../lib/imageUpload';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 30;
const CURSOR_THROTTLE_MS = 50;
const LASER_THROTTLE_MS = 16; // ~60fps for laser
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const SCALE_BY = 1.08;

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  items: BoardItem[];
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapeKind: import('../types/board').ShapeKind;
  remoteCursors: CursorPosition[];
  remoteStrokes: Map<string, RemoteStrokeProgress>;
  remoteStickyDrags: Map<string, RemoteStickyDrag>;
  remoteLasers: Map<string, LaserPoint>;
  session: RoomSession | null;
  channel: RealtimeChannel | null;
  boardId: string;
  onItemsChange: (updater: (prev: BoardItem[]) => BoardItem[]) => void;
  onUndo: () => void;
  undoStack: string[];
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function GridLayer({ width, height, viewport }: { width: number; height: number; viewport: Viewport }) {
  const dots: React.ReactNode[] = [];
  const { x: ox, y: oy, scale } = viewport;
  const gridScaled = GRID_SIZE * scale;
  const startX = Math.floor(-ox / scale / GRID_SIZE) * GRID_SIZE * scale + (ox % gridScaled);
  const startY = Math.floor(-oy / scale / GRID_SIZE) * GRID_SIZE * scale + (oy % gridScaled);

  for (let gx = startX; gx < width; gx += gridScaled) {
    for (let gy = startY; gy < height; gy += gridScaled) {
      dots.push(<Circle key={`${Math.round(gx)}-${Math.round(gy)}`} x={gx} y={gy} radius={1} fill="#cbd5e1" />);
    }
  }
  return <Layer listening={false}>{dots}</Layer>;
}

// ─── Sticky editor ────────────────────────────────────────────────────────────
interface StickyEditorProps {
  item: BoardItem;
  stageRef: React.RefObject<Konva.Stage | null>;
  viewport: Viewport;
  onSave: (text: string) => void;
  onClose: () => void;
}
function StickyEditor({ item, stageRef, viewport, onSave, onClose }: StickyEditorProps) {
  const data = item.data as StickyData;
  const [text, setText] = useState(data.text);
  const stage = stageRef.current;
  const containerRect = stage?.container().getBoundingClientRect();
  const left = (containerRect?.left ?? 0) + data.x * viewport.scale + viewport.x;
  const top = (containerRect?.top ?? 0) + data.y * viewport.scale + viewport.y + window.scrollY;
  return (
    <textarea
      autoFocus
      className="sticky-editor"
      style={{
        left, top,
        width: data.width * viewport.scale - 16,
        height: data.height * viewport.scale - 32,
        backgroundColor: data.color,
        fontSize: 14 * viewport.scale,
      }}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && e.metaKey) { onSave(text); onClose(); }
      }}
      onBlur={() => { onSave(text); onClose(); }}
      aria-label="Edit sticky note"
      placeholder="Type here…"
    />
  );
}

// ─── Text editor overlay ──────────────────────────────────────────────────────
interface TextEditorProps {
  item: BoardItem;
  stageRef: React.RefObject<Konva.Stage | null>;
  viewport: Viewport;
  onSave: (text: string) => void;
  onClose: () => void;
}
function TextEditor({ item, stageRef, viewport, onSave, onClose }: TextEditorProps) {
  const data = item.data as TextData;
  const [text, setText] = useState(data.text);
  const stage = stageRef.current;
  const containerRect = stage?.container().getBoundingClientRect();
  const left = (containerRect?.left ?? 0) + data.x * viewport.scale + viewport.x;
  const top = (containerRect?.top ?? 0) + data.y * viewport.scale + viewport.y + window.scrollY;
  return (
    <textarea
      autoFocus
      className="text-editor-overlay"
      style={{
        left, top,
        width: Math.max(data.width * viewport.scale, 120),
        fontSize: data.fontSize * viewport.scale,
        color: data.color,
        fontWeight: data.bold ? 'bold' : 'normal',
        fontStyle: data.italic ? 'italic' : 'normal',
      }}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') { onSave(text); onClose(); }
      }}
      onBlur={() => { onSave(text); onClose(); }}
      aria-label="Edit text"
      placeholder="Type here…"
    />
  );
}

// ─── Image item renderer ──────────────────────────────────────────────────────
function ImageItem({
  item, tool, isSelected, onSelect, onDragEnd, onTransformEnd,
}: {
  item: BoardItem;
  tool: Tool;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, w: number, h: number) => void;
}) {
  const d = item.data as ImageData;
  const [img] = useImage(d.src);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KImage
        ref={shapeRef}
        image={img}
        x={d.x} y={d.y}
        width={d.width} height={d.height}
        draggable={tool === 'select'}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={e => onDragEnd(e.target.x(), e.target.y())}
        onTransformEnd={() => {
          const node = shapeRef.current!;
          onTransformEnd(node.x(), node.y(), node.width() * node.scaleX(), node.height() * node.scaleY());
          node.scaleX(1); node.scaleY(1);
        }}
        shadowBlur={isSelected ? 8 : 0}
        shadowColor="#6366f1"
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          keepRatio
          boundBoxFunc={(_, newBox) => newBox}
        />
      )}
    </>
  );
}

// ─── Shape item renderer ──────────────────────────────────────────────────────
function ShapeItem({
  item, tool, isSelected, onSelect, onDragEnd, onTransformEnd,
}: {
  item: BoardItem;
  tool: Tool;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, w: number, h: number) => void;
}) {
  const d = item.data as ShapeData;
  const shapeRef = useRef<Konva.Shape>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const commonProps = {
    draggable: tool === 'select',
    onClick: onSelect,
    onTap: onSelect,
    stroke: d.color,
    strokeWidth: d.strokeWidth,
    fill: d.fill === 'none' ? undefined : d.fill,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(e.target.x(), e.target.y()),
    onTransformEnd: () => {
      const node = shapeRef.current!;
      onTransformEnd(node.x(), node.y(), node.width() * node.scaleX(), node.height() * node.scaleY());
      node.scaleX(1); node.scaleY(1);
    },
    shadowBlur: isSelected ? 8 : 0,
    shadowColor: '#6366f1',
  };

  return (
    <>
      {d.kind === 'rect' && (
        <Rect ref={shapeRef as React.RefObject<Konva.Rect>} x={d.x} y={d.y} width={d.width} height={d.height} cornerRadius={4} {...commonProps} />
      )}
      {d.kind === 'circle' && (
        <Ellipse ref={shapeRef as React.RefObject<Konva.Ellipse>} x={d.x + d.width / 2} y={d.y + d.height / 2} radiusX={d.width / 2} radiusY={d.height / 2} {...commonProps} />
      )}
      {d.kind === 'arrow' && d.points && (
        <Arrow ref={shapeRef as React.RefObject<Konva.Arrow>}
          points={d.points}
          pointerLength={12} pointerWidth={10}
          fill={d.color}
          stroke={d.color} strokeWidth={d.strokeWidth}
          draggable={tool === 'select'}
          onClick={onSelect} onTap={onSelect}
          onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
          shadowBlur={isSelected ? 8 : 0} shadowColor="#6366f1"
        />
      )}
      {isSelected && d.kind !== 'arrow' && (
        <Transformer ref={trRef} keepRatio={false} boundBoxFunc={(_, nb) => nb} />
      )}
    </>
  );
}

// ─── Main Whiteboard ──────────────────────────────────────────────────────────
export function Whiteboard({
  items, tool, color, strokeWidth, shapeKind,
  remoteCursors, remoteStrokes, remoteStickyDrags, remoteLasers,
  session, channel, boardId,
  onItemsChange, viewport, onViewportChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Drawing
  const isDrawingRef = useRef(false);
  const isLaserRef = useRef(false);
  const currentStrokeId = useRef<string | null>(null);
  const currentPoints = useRef<number[]>([]);
  const [localPoints, setLocalPoints] = useState<number[]>([]);
  const [localColor, setLocalColor] = useState(color);
  const [localLaserPoints, setLocalLaserPoints] = useState<number[]>([]);

  // Shape drawing
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawingShape, setDrawingShape] = useState<ShapeData | null>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSticky, setEditingSticky] = useState<BoardItem | null>(null);
  const [editingText, setEditingText] = useState<BoardItem | null>(null);
  const [draggingStickyId, setDraggingStickyId] = useState<string | null>(null);

  // Throttle refs
  const lastCursorBroadcast = useRef(0);
  const lastLaserBroadcast = useRef(0);

  // Drop zone
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => { setLocalColor(color); }, [color]);

  // Resize observer
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

  // Deselect on tool change
  useEffect(() => { setSelectedId(null); }, [tool]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getCanvasPos = useCallback(() => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - viewport.x) / viewport.scale,
      y: (pos.y - viewport.y) / viewport.scale,
    };
  }, [viewport]);

  const getStagePos = useCallback(() => stageRef.current?.getPointerPosition() ?? null, []);

  // ── Scroll/pinch to zoom ───────────────────────────────────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = viewport.scale;
    const pointer = stage.getPointerPosition()!;
    const newScale = e.evt.ctrlKey || e.evt.metaKey
      ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * (e.evt.deltaY < 0 ? SCALE_BY : 1 / SCALE_BY)))
      : oldScale;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const mousePointTo = {
        x: (pointer.x - viewport.x) / oldScale,
        y: (pointer.y - viewport.y) / oldScale,
      };
      onViewportChange({
        scale: newScale,
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      onViewportChange({
        ...viewport,
        x: viewport.x - e.evt.deltaX,
        y: viewport.y - e.evt.deltaY,
      });
    }
  }, [viewport, onViewportChange]);

  // Touch pinch zoom
  const lastDist = useRef(0);
  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length !== 2) return;
    e.evt.preventDefault();
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (lastDist.current > 0) {
      const ratio = dist / lastDist.current;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const oldScale = viewport.scale;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * ratio));
      const mousePointTo = {
        x: (midX - viewport.x) / oldScale,
        y: (midY - viewport.y) / oldScale,
      };
      onViewportChange({
        scale: newScale,
        x: midX - mousePointTo.x * newScale,
        y: midY - mousePointTo.y * newScale,
      });
    }
    lastDist.current = dist;
  }, [viewport, onViewportChange]);

  // ── Pointer events ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    const pos = getCanvasPos();
    if (!pos) return;

    if (tool === 'select') {
      if (e.target === stageRef.current) setSelectedId(null);
      return;
    }

    if (tool === 'draw') {
      isDrawingRef.current = true;
      currentPoints.current = [pos.x, pos.y];
      setLocalPoints([pos.x, pos.y]);
      setLocalColor(color);
      const tempId = `tmp-${Date.now()}`;
      currentStrokeId.current = tempId;
      onItemsChange(prev => [...prev, {
        id: tempId, room_id: session?.room.id ?? '', board_id: boardId, type: 'stroke',
        data: { points: [pos.x, pos.y], color, strokeWidth } as StrokeData,
        created_by: session?.userId ?? '', updated_by: session?.userId ?? '',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]);
      return;
    }

    if (tool === 'eraser') {
      isDrawingRef.current = true;
      currentPoints.current = [pos.x, pos.y];
      return;
    }

    if (tool === 'laser') {
      isLaserRef.current = true;
      currentPoints.current = [pos.x, pos.y];
      setLocalLaserPoints([pos.x, pos.y]);
      return;
    }

    if (tool === 'shape') {
      shapeStartRef.current = pos;
      setDrawingShape({
        kind: shapeKind, x: pos.x, y: pos.y, width: 0, height: 0,
        color, strokeWidth, fill: 'none',
        ...(shapeKind === 'arrow' ? { points: [pos.x, pos.y, pos.x, pos.y] } : {}),
      });
      isDrawingRef.current = true;
      return;
    }
  }, [tool, color, strokeWidth, shapeKind, session, boardId, getCanvasPos, onItemsChange]);

  const handlePointerMove = useCallback(() => {
    const pos = getCanvasPos();
    const stagePos = getStagePos();
    if (!pos || !stagePos) return;

    // Cursor broadcast (throttled)
    if (channel && session) {
      const now = Date.now();
      if (now - lastCursorBroadcast.current >= CURSOR_THROTTLE_MS) {
        lastCursorBroadcast.current = now;
        broadcastCursor(channel, {
          user_id: session.userId,
          display_name: session.member.display_name,
          color: session.member.color,
          x: stagePos.x, y: stagePos.y,
        });
      }
    }

    if (!isDrawingRef.current && !isLaserRef.current) return;

    if (tool === 'draw') {
      currentPoints.current = [...currentPoints.current, pos.x, pos.y];
      setLocalPoints([...currentPoints.current]);
      if (channel && session) {
        broadcastStrokeProgress(channel, {
          user_id: session.userId, color, strokeWidth,
          points: [...currentPoints.current],
        });
      }
      return;
    }

    if (tool === 'eraser') {
      currentPoints.current = [...currentPoints.current, pos.x, pos.y];
      // Find and delete strokes that intersect this eraser path
      const eraserX = pos.x;
      const eraserY = pos.y;
      const ERASER_RADIUS = 20;
      onItemsChange(prev => {
        const toDelete: string[] = [];
        for (const item of prev) {
          if (item.type !== 'stroke') continue;
          const d = item.data as StrokeData;
          for (let i = 0; i < d.points.length - 1; i += 2) {
            const dx = d.points[i] - eraserX;
            const dy = d.points[i + 1] - eraserY;
            if (Math.hypot(dx, dy) < ERASER_RADIUS) {
              toDelete.push(item.id);
              break;
            }
          }
        }
        if (toDelete.length === 0) return prev;
        toDelete.forEach(id => deleteBoardItem(id).catch(() => null));
        return prev.filter(i => !toDelete.includes(i.id));
      });
      return;
    }

    if (tool === 'laser') {
      currentPoints.current = [...currentPoints.current, pos.x, pos.y];
      // Keep only last 40 points for the trail
      const pts = currentPoints.current.slice(-80);
      setLocalLaserPoints([...pts]);
      if (channel && session) {
        const now = Date.now();
        if (now - lastLaserBroadcast.current >= LASER_THROTTLE_MS) {
          lastLaserBroadcast.current = now;
          broadcastLaser(channel, {
            user_id: session.userId,
            color: session.member.color,
            display_name: session.member.display_name,
            points: pts,
            ts: now,
          });
        }
      }
      return;
    }

    if (tool === 'shape' && shapeStartRef.current) {
      const start = shapeStartRef.current;
      const w = pos.x - start.x;
      const h = pos.y - start.y;
      setDrawingShape(prev => {
        if (!prev) return null;
        if (shapeKind === 'arrow') {
          return { ...prev, points: [start.x, start.y, pos.x, pos.y] };
        }
        return {
          ...prev,
          x: w < 0 ? pos.x : start.x,
          y: h < 0 ? pos.y : start.y,
          width: Math.abs(w),
          height: Math.abs(h),
        };
      });
    }
  }, [tool, color, strokeWidth, shapeKind, session, channel, getCanvasPos, getStagePos, onItemsChange]);

  const handlePointerUp = useCallback(async () => {
    if (tool === 'draw' && isDrawingRef.current) {
      isDrawingRef.current = false;
      const finalPoints = [...currentPoints.current];
      setLocalPoints([]);
      if (channel && session) broadcastStrokeEnd(channel, session.userId);
      const tempId = currentStrokeId.current;
      currentStrokeId.current = null;
      if (!tempId || !session || finalPoints.length < 4) {
        if (tempId) onItemsChange(prev => prev.filter(i => i.id !== tempId));
        return;
      }
      const strokeData: StrokeData = { points: finalPoints, color, strokeWidth };
      try {
        const saved = await createBoardItem(session.room.id, boardId, session.userId, 'stroke', strokeData);
        onItemsChange(prev => prev.map(i => (i.id === tempId ? saved : i)));
      } catch { onItemsChange(prev => prev.filter(i => i.id !== tempId)); }
      return;
    }

    if (tool === 'eraser') { isDrawingRef.current = false; return; }

    if (tool === 'laser' && isLaserRef.current) {
      isLaserRef.current = false;
      setLocalLaserPoints([]);
      if (channel && session) broadcastLaserEnd(channel, session.userId);
      return;
    }

    if (tool === 'shape' && isDrawingRef.current && drawingShape && session) {
      isDrawingRef.current = false;
      const shape = { ...drawingShape };
      setDrawingShape(null);
      shapeStartRef.current = null;
      if (shape.width < 5 && shape.height < 5 && !shape.points) return;
      try {
        const saved = await createBoardItem(session.room.id, boardId, session.userId, 'shape', shape);
        onItemsChange(prev => [...prev, saved]);
      } catch { /* ignore */ }
    }
  }, [tool, color, strokeWidth, drawingShape, session, channel, boardId, onItemsChange]);

  // ── Stage click (sticky + text placement) ─────────────────────────────────
  const handleStageClick = useCallback(async (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target !== stageRef.current) return;
    const pos = getCanvasPos();
    if (!pos || !session) return;

    if (tool === 'sticky') {
      const stickyData: StickyData = {
        x: pos.x - 90, y: pos.y - 70, width: 180, height: 140, text: '',
        color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
      };
      try {
        const saved = await createBoardItem(session.room.id, boardId, session.userId, 'sticky', stickyData);
        onItemsChange(prev => [...prev, saved]);
        setEditingSticky(saved);
      } catch { /* ignore */ }
      return;
    }

    if (tool === 'text') {
      const textData: TextData = {
        x: pos.x, y: pos.y, width: 200, text: '',
        fontSize: 18, color, bold: false, italic: false,
      };
      try {
        const saved = await createBoardItem(session.room.id, boardId, session.userId, 'text', textData);
        onItemsChange(prev => [...prev, saved]);
        setEditingText(saved);
      } catch { /* ignore */ }
    }
  }, [tool, color, session, boardId, getCanvasPos, onItemsChange]);

  // ── Drag file onto canvas ──────────────────────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const stage = stageRef.current;
    if (!stage || !session) return;

    const rect = stage.container().getBoundingClientRect();
    const stageX = e.clientX - rect.left;
    const stageY = e.clientY - rect.top;
    const canvasX = (stageX - viewport.x) / viewport.scale;
    const canvasY = (stageY - viewport.y) / viewport.scale;

    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type === 'application/pdf') {
        toast.loading('Rendering PDF…', { id: 'pdf' });
        try {
          const pages = await processPdfFile(file, canvasX, canvasY);
          for (const imgData of pages) {
            const saved = await createBoardItem(session.room.id, boardId, session.userId, 'image', imgData);
            onItemsChange(prev => [...prev, saved]);
          }
          toast.success('PDF placed on board', { id: 'pdf' });
        } catch { toast.error('Failed to render PDF', { id: 'pdf' }); }
      } else if (file.type.startsWith('image/')) {
        try {
          const imgData = await processImageFile(file, canvasX, canvasY);
          const saved = await createBoardItem(session.room.id, boardId, session.userId, 'image', imgData);
          onItemsChange(prev => [...prev, saved]);
        } catch { toast.error('Failed to load image'); }
      }
    }
  }, [session, boardId, viewport, onItemsChange]);

  // ── Generic item drag/transform helpers ───────────────────────────────────
  const handleItemDragEnd = useCallback(async (item: BoardItem, x: number, y: number) => {
    const newData = { ...item.data, x, y } as BoardItemData;
    onItemsChange(prev => prev.map(i => i.id === item.id ? { ...i, data: newData } : i));
    if (session) await updateBoardItem(item.id, session.userId, newData).catch(() => null);
  }, [session, onItemsChange]);

  const handleItemTransformEnd = useCallback(async (item: BoardItem, x: number, y: number, w: number, h: number) => {
    const newData = { ...item.data, x, y, width: w, height: h } as BoardItemData;
    onItemsChange(prev => prev.map(i => i.id === item.id ? { ...i, data: newData } : i));
    if (session) await updateBoardItem(item.id, session.userId, newData).catch(() => null);
  }, [session, onItemsChange]);

  // Delete selected item on Delete/Backspace
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        deleteBoardItem(selectedId).catch(() => null);
        onItemsChange(prev => prev.filter(i => i.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedId, onItemsChange]);

  const getCursor = () => {
    if (tool === 'draw') return 'crosshair';
    if (tool === 'eraser') return 'cell';
    if (tool === 'sticky' || tool === 'text' || tool === 'image') return 'copy';
    if (tool === 'shape') return 'crosshair';
    if (tool === 'laser') return 'none';
    return 'default';
  };

  const committedItems = items.filter(i => !i.id.startsWith('tmp-'));

  return (
    <div
      ref={containerRef}
      className={`whiteboard-container${isDragOver ? ' whiteboard--dragover' : ''}`}
      style={{ cursor: getCursor() }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x} y={viewport.y}
        scaleX={viewport.scale} scaleY={viewport.scale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleStageClick as (e: Konva.KonvaEventObject<MouseEvent>) => void}
        onTap={handleStageClick as (e: Konva.KonvaEventObject<TouchEvent>) => void}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { lastDist.current = 0; }}
        style={{ display: 'block', touchAction: 'none' }}
      >
        {/* Grid — rendered in screen space */}
        <GridLayer width={size.width} height={size.height} viewport={viewport} />

        {/* Committed items */}
        <Layer>
          {committedItems.map(item => {
            if (item.type === 'stroke') {
              const d = item.data as StrokeData;
              return (
                <Line key={item.id} points={d.points} stroke={d.color} strokeWidth={d.strokeWidth}
                  tension={0.5} lineCap="round" lineJoin="round" listening={false} />
              );
            }
            if (item.type === 'sticky') {
              const d = item.data as StickyData;
              const liveDrag = remoteStickyDrags.get(item.id);
              const dx = liveDrag ? liveDrag.x : d.x;
              const dy = liveDrag ? liveDrag.y : d.y;
              return (
                <Group key={item.id} x={dx} y={dy}
                  draggable={tool === 'select'}
                  onDragStart={() => setDraggingStickyId(item.id)}
                  onDragMove={e => { if (channel && session) broadcastStickyDrag(channel, { user_id: session.userId, item_id: item.id, x: e.target.x(), y: e.target.y() }); }}
                  onDragEnd={e => { setDraggingStickyId(null); handleItemDragEnd(item, e.target.x(), e.target.y()); }}
                  onDblClick={() => setEditingSticky(item)}
                  onDblTap={() => setEditingSticky(item)}
                  onClick={() => setSelectedId(item.id)}
                  shadowBlur={draggingStickyId === item.id || !!liveDrag ? 16 : 4}
                  shadowOpacity={0.15} shadowColor="#000" shadowOffsetY={2}
                >
                  <Rect width={d.width} height={d.height} fill={d.color} cornerRadius={4} />
                  <Rect width={d.width} height={6} fill={darken(d.color, 20)} cornerRadius={[4, 4, 0, 0]} />
                  <KText x={8} y={16} width={d.width - 16} height={d.height - 24}
                    text={d.text || (editingSticky?.id === item.id ? '' : 'Double-click to edit')}
                    fontSize={14} fill={d.text ? '#1e293b' : '#94a3b8'}
                    fontFamily="system-ui, sans-serif" wrap="word" ellipsis />
                </Group>
              );
            }
            if (item.type === 'text') {
              const d = item.data as TextData;
              return (
                <KText key={item.id} x={d.x} y={d.y} width={d.width}
                  text={d.text || 'Click to edit'}
                  fontSize={d.fontSize} fill={d.color}
                  fontStyle={`${d.italic ? 'italic ' : ''}${d.bold ? 'bold' : 'normal'}`}
                  fontFamily="system-ui, sans-serif"
                  draggable={tool === 'select'}
                  onDragEnd={e => handleItemDragEnd(item, e.target.x(), e.target.y())}
                  onDblClick={() => setEditingText(item)}
                  onDblTap={() => setEditingText(item)}
                  onClick={() => setSelectedId(item.id)}
                />
              );
            }
            if (item.type === 'shape') {
              return (
                <ShapeItem key={item.id} item={item} tool={tool}
                  isSelected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onDragEnd={(x, y) => handleItemDragEnd(item, x, y)}
                  onTransformEnd={(x, y, w, h) => handleItemTransformEnd(item, x, y, w, h)}
                />
              );
            }
            if (item.type === 'image') {
              return (
                <ImageItem key={item.id} item={item} tool={tool}
                  isSelected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onDragEnd={(x, y) => handleItemDragEnd(item, x, y)}
                  onTransformEnd={(x, y, w, h) => handleItemTransformEnd(item, x, y, w, h)}
                />
              );
            }
            return null;
          })}

          {/* Shape being drawn */}
          {drawingShape && (() => {
            const d = drawingShape;
            if (d.kind === 'rect') return <Rect key="drawing-shape" x={d.x} y={d.y} width={d.width} height={d.height} stroke={d.color} strokeWidth={d.strokeWidth} fill={undefined} cornerRadius={4} listening={false} />;
            if (d.kind === 'circle') return <Ellipse key="drawing-shape" x={d.x + d.width / 2} y={d.y + d.height / 2} radiusX={d.width / 2} radiusY={d.height / 2} stroke={d.color} strokeWidth={d.strokeWidth} listening={false} />;
            if (d.kind === 'arrow' && d.points) return <Arrow key="drawing-shape" points={d.points} stroke={d.color} strokeWidth={d.strokeWidth} fill={d.color} pointerLength={12} pointerWidth={10} listening={false} />;
            return null;
          })()}
        </Layer>

        {/* Live strokes layer */}
        <Layer listening={false}>
          {localPoints.length >= 2 && (
            <Line points={localPoints} stroke={localColor} strokeWidth={strokeWidth}
              tension={0.5} lineCap="round" lineJoin="round" />
          )}
          {localLaserPoints.length >= 2 && (
            <Line points={localLaserPoints} stroke={session?.member.color ?? '#ef4444'}
              strokeWidth={4} tension={0.5} lineCap="round" opacity={0.8} />
          )}
          {Array.from(remoteStrokes.values()).map(s =>
            s.points.length >= 2 ? (
              <Line key={s.user_id} points={s.points} stroke={s.color} strokeWidth={s.strokeWidth}
                tension={0.5} lineCap="round" lineJoin="round" opacity={0.85} />
            ) : null
          )}
          {Array.from(remoteLasers.values()).map(l =>
            l.points.length >= 2 ? (
              <Line key={l.user_id} points={l.points} stroke={l.color}
                strokeWidth={4} tension={0.5} lineCap="round" opacity={0.8} />
            ) : null
          )}
        </Layer>

        {/* Remote cursors */}
        <Layer listening={false}>
          {remoteCursors.map(cursor => {
            // Convert cursor from stage coords to canvas coords for display
            const cx = (cursor.x - viewport.x) / viewport.scale;
            const cy = (cursor.y - viewport.y) / viewport.scale;
            return (
              <Group key={cursor.user_id} x={cx} y={cy}>
                <Line points={[0, 0, 0, 16, 4, 12, 8, 20, 10, 18, 6, 10, 12, 10]}
                  closed fill={cursor.color} stroke="#fff" strokeWidth={1} />
                <Rect x={12} y={14} width={cursor.display_name.length * 7 + 8} height={20}
                  fill={cursor.color} cornerRadius={4} />
                <KText x={16} y={18} text={cursor.display_name} fontSize={11}
                  fill="#fff" fontFamily="system-ui, sans-serif" fontStyle="bold" />
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {/* Sticky editor overlay */}
      {editingSticky && (
        <StickyEditor item={editingSticky} stageRef={stageRef} viewport={viewport}
          onSave={async text => {
            const data = editingSticky.data as StickyData;
            const newData = { ...data, text };
            onItemsChange(prev => prev.map(i => i.id === editingSticky.id ? { ...i, data: newData } : i));
            if (session) await updateBoardItem(editingSticky.id, session.userId, newData).catch(() => null);
          }}
          onClose={() => setEditingSticky(null)}
        />
      )}

      {/* Text editor overlay */}
      {editingText && (
        <TextEditor item={editingText} stageRef={stageRef} viewport={viewport}
          onSave={async text => {
            const data = editingText.data as TextData;
            const newData = { ...data, text };
            onItemsChange(prev => prev.map(i => i.id === editingText.id ? { ...i, data: newData } : i));
            if (session) await updateBoardItem(editingText.id, session.userId, newData).catch(() => null);
          }}
          onClose={() => setEditingText(null)}
        />
      )}

      {/* Drag-over overlay */}
      {isDragOver && (
        <div className="whiteboard-dropzone">
          <div className="whiteboard-dropzone__inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Drop image or PDF here</p>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => onViewportChange({ ...viewport, scale: Math.min(MAX_SCALE, viewport.scale * SCALE_BY) })} aria-label="Zoom in" title="Zoom in">+</button>
        <span className="zoom-label" title="Reset zoom" onClick={() => onViewportChange({ x: 0, y: 0, scale: 1 })}>{Math.round(viewport.scale * 100)}%</span>
        <button className="zoom-btn" onClick={() => onViewportChange({ ...viewport, scale: Math.max(MIN_SCALE, viewport.scale / SCALE_BY) })} aria-label="Zoom out" title="Zoom out">−</button>
      </div>
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

type BoardItemData = import('../types/board').BoardItemData;
