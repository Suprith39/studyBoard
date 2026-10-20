import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Toaster } from 'react-hot-toast';
import { nanoid } from 'nanoid';

import type {
  BoardItem, CursorPosition, PresenceState,
  RoomSession, SyncStatus, Tool, StudyBoard, Viewport,
} from '../types/board';
import type { ShapeKind } from '../types/board';
import type {
  RemoteStrokeProgress, RemoteStickyDrag, LaserPoint, EmojiReaction,
} from '../lib/presenceService';
import { STROKE_COLORS } from '../lib/colors';
import { loadRoom, getMyMembership } from '../lib/roomService';
import {
  loadBoards, createBoard, renameBoard, deleteBoard,
  loadBoardItems, subscribeToBoardItems, clearBoardItems, deleteBoardItem,
  type BoardChangeHandler,
} from '../lib/boardService';
import {
  createRoomChannel, leaveRoomChannel,
  broadcastEmoji,
} from '../lib/presenceService';
import { supabase } from '../lib/supabase';

import { TopBar } from '../components/TopBar';
import { ToolPalette } from '../components/ToolPalette';
import { Whiteboard } from '../components/Whiteboard';
import { BoardTabs } from '../components/BoardTabs';
import { ChatPanel } from '../components/ChatPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { EmojiOverlay } from '../components/EmojiOverlay';
import { RoomSettingsModal } from '../components/RoomSettingsModal';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<RoomSession | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [boards, setBoards] = useState<StudyBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [items, setItems] = useState<BoardItem[]>([]);
  const [participants, setParticipants] = useState<PresenceState[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<CursorPosition[]>([]);
  const [remoteStrokes, setRemoteStrokes] = useState<Map<string, RemoteStrokeProgress>>(new Map());
  const [remoteStickyDrags, setRemoteStickyDrags] = useState<Map<string, RemoteStickyDrag>>(new Map());
  const [remoteLasers, setRemoteLasers] = useState<Map<string, LaserPoint>>(new Map());
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });

  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(STROKE_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const boardChannelRef = useRef<ReturnType<typeof subscribeToBoardItems> | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const cursorTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const laserTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Cursor cleanup ─────────────────────────────────────────────────────────
  const handleRemoteCursor = useCallback((cursor: CursorPosition) => {
    setRemoteCursors(prev => [...prev.filter(c => c.user_id !== cursor.user_id), cursor]);
    const t = cursorTimers.current.get(cursor.user_id);
    if (t) clearTimeout(t);
    cursorTimers.current.set(cursor.user_id, setTimeout(() => {
      setRemoteCursors(prev => prev.filter(c => c.user_id !== cursor.user_id));
      cursorTimers.current.delete(cursor.user_id);
    }, 5000));
  }, []);

  // ── Stroke progress ────────────────────────────────────────────────────────
  const handleStrokeProgress = useCallback((stroke: RemoteStrokeProgress | null, userId: string) => {
    setRemoteStrokes(prev => {
      const next = new Map(prev);
      if (stroke === null) next.delete(userId); else next.set(userId, stroke);
      return next;
    });
  }, []);

  // ── Sticky drag ────────────────────────────────────────────────────────────
  const handleStickyDrag = useCallback((drag: RemoteStickyDrag) => {
    setRemoteStickyDrags(prev => new Map(prev).set(drag.item_id, drag));
  }, []);

  // ── Laser ──────────────────────────────────────────────────────────────────
  const handleLaser = useCallback((laser: LaserPoint | null, userId: string) => {
    setRemoteLasers(prev => {
      const next = new Map(prev);
      if (laser === null) { next.delete(userId); return next; }
      next.set(userId, laser);
      return next;
    });
    if (laser !== null) {
      const t = laserTimers.current.get(userId);
      if (t) clearTimeout(t);
      laserTimers.current.set(userId, setTimeout(() => {
        setRemoteLasers(prev => { const n = new Map(prev); n.delete(userId); return n; });
      }, 2000));
    }
  }, []);

  // ── Emoji ──────────────────────────────────────────────────────────────────
  const handleEmoji = useCallback((reaction: EmojiReaction) => {
    setEmojiReactions(prev => [...prev, reaction]);
    setTimeout(() => {
      setEmojiReactions(prev => prev.filter(r => r.id !== reaction.id));
    }, 4000);
  }, []);

  // ── Board change ───────────────────────────────────────────────────────────
  const handleBoardChange = useCallback<BoardChangeHandler>(change => {
    if (change.event === 'INSERT') {
      setItems(prev => prev.some(i => i.id === change.item.id) ? prev : [...prev, change.item]);
    } else if (change.event === 'UPDATE') {
      setItems(prev => prev.map(i => {
        if (i.id !== change.item.id) return i;
        if (change.item.updated_at >= i.updated_at) return change.item;
        return i;
      }));
      setRemoteStickyDrags(prev => { const n = new Map(prev); n.delete(change.item.id); return n; });
    } else {
      setItems(prev => prev.filter(i => i.id !== change.itemId));
    }
  }, []);

  // ── Load board items for active board ──────────────────────────────────────
  const loadActiveBoard = useCallback(async (boardId: string) => {
    try {
      const boardItems = await loadBoardItems(boardId);
      setItems(boardItems);
    } catch { /* ignore */ }
  }, []);

  // ── Setup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) { navigate('/'); return; }
    let cancelled = false;

    const setup = async () => {
      setSyncStatus('connecting');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/'); return; }

        const room = await loadRoom(roomId);
        const member = await getMyMembership(roomId);
        if (!member) {
          setError('You are not a member of this room. Use an invite link to join.');
          setSyncStatus('error');
          return;
        }
        if (cancelled) return;

        const sess: RoomSession = { room, member, userId: user.id };
        setSession(sess);

        // Load boards
        const roomBoards = await loadBoards(roomId);
        if (cancelled) return;
        setBoards(roomBoards);
        const firstBoard = roomBoards[0];
        if (firstBoard) {
          setActiveBoardId(firstBoard.id);
          const boardItems = await loadBoardItems(firstBoard.id);
          if (cancelled) return;
          setItems(boardItems);
        }

        boardChannelRef.current = subscribeToBoardItems(roomId, handleBoardChange);

        presenceChannelRef.current = createRoomChannel(
          roomId,
          { user_id: user.id, display_name: member.display_name, color: member.color, online_at: new Date().toISOString() },
          setParticipants,
          handleRemoteCursor,
          handleStrokeProgress,
          handleStickyDrag,
          handleLaser,
          handleEmoji,
        );

        setSyncStatus('live');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load room';
        setError(msg);
        setSyncStatus('error');
      }
    };

    setup();
    return () => {
      cancelled = true;
      if (boardChannelRef.current) supabase.removeChannel(boardChannelRef.current);
      if (presenceChannelRef.current) leaveRoomChannel(presenceChannelRef.current);
      cursorTimers.current.forEach(t => clearTimeout(t));
      laserTimers.current.forEach(t => clearTimeout(t));
    };
  }, [roomId, navigate, handleBoardChange, handleRemoteCursor, handleStrokeProgress, handleStickyDrag, handleLaser, handleEmoji]);

  // ── Network ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const off = () => setSyncStatus('offline');
    const on = () => setSyncStatus('reconnecting');
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, []);

  // ── Undo ───────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const lastId = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    const item = items.find(i => i.id === lastId);
    if (!item || !session || item.updated_by !== session.userId) return;
    await deleteBoardItem(lastId);
    setItems(prev => prev.filter(i => i.id !== lastId));
  }, [undoStack, items, session]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleUndo]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!session) return;
    if (!window.confirm('Clear the entire board? This cannot be undone.')) return;
    await clearBoardItems(activeBoardId).catch(() => null);
    setItems([]);
    setUndoStack([]);
  };

  // ── Items change ───────────────────────────────────────────────────────────
  const handleItemsChange = useCallback((updater: (prev: BoardItem[]) => BoardItem[]) => {
    setItems(prev => {
      const next = updater(prev);
      const added = next.find(n =>
        !n.id.startsWith('tmp-') && !prev.some(p => p.id === n.id) && n.created_by === session?.userId
      );
      if (added) setUndoStack(s => [...s.slice(-19), added.id]);
      return next;
    });
  }, [session?.userId]);

  // ── Board tab management ───────────────────────────────────────────────────
  const handleAddBoard = async (name: string) => {
    if (!session) return;
    try {
      const board = await createBoard(session.room.id, name, session.userId);
      setBoards(prev => [...prev, board]);
      setActiveBoardId(board.id);
      setItems([]);
      setUndoStack([]);
    } catch { /* ignore */ }
  };

  const handleRenameBoard = async (id: string, name: string) => {
    await renameBoard(id, name).catch(() => null);
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b));
  };

  const handleDeleteBoard = async (id: string) => {
    await deleteBoard(id).catch(() => null);
    const remaining = boards.filter(b => b.id !== id);
    setBoards(remaining);
    if (activeBoardId === id && remaining.length > 0) {
      setActiveBoardId(remaining[0].id);
      await loadActiveBoard(remaining[0].id);
    }
  };

  const handleSelectBoard = async (id: string) => {
    setActiveBoardId(id);
    setItems([]);
    setUndoStack([]);
    await loadActiveBoard(id);
  };

  // ── Emoji send ─────────────────────────────────────────────────────────────
  const handleSendEmoji = (emoji: string) => {
    if (!session || !presenceChannelRef.current) return;
    const reaction: EmojiReaction = {
      id: nanoid(),
      user_id: session.userId,
      display_name: session.member.display_name,
      emoji,
      x: 20 + Math.random() * 60, // random horizontal % position
      y: 0,
    };
    handleEmoji(reaction);
    broadcastEmoji(presenceChannelRef.current, reaction);
  };

  // ── Image file picker ──────────────────────────────────────────────────────
  const handleOpenImagePicker = () => {
    imageInputRef.current?.click();
    setTool('select');
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    e.target.value = '';

    const { processImageFile, processPdfFile } = await import('../lib/imageUpload');
    const { createBoardItem } = await import('../lib/boardService');
    const centerX = 400;
    const centerY = 300;

    if (file.type === 'application/pdf') {
      const pages = await processPdfFile(file, centerX, centerY);
      for (const imgData of pages) {
        const saved = await createBoardItem(session.room.id, activeBoardId, session.userId, 'image', imgData);
        setItems(prev => [...prev, saved]);
      }
    } else if (file.type.startsWith('image/')) {
      const imgData = await processImageFile(file, centerX, centerY);
      const saved = await createBoardItem(session.room.id, activeBoardId, session.userId, 'image', imgData);
      setItems(prev => [...prev, saved]);
    }
  };

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? null;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="error-page">
        <div className="error-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2>{error}</h2>
          <button className="btn btn--primary" onClick={() => navigate('/')}>Go home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-layout">
      <Toaster position="bottom-center" />
      <TopBar
        room={session?.room ?? null}
        member={session?.member ?? null}
        syncStatus={syncStatus}
        participants={participants}
        onOpenSettings={session ? () => setSettingsOpen(true) : undefined}
      />
      <BoardTabs
        boards={boards}
        activeBoardId={activeBoardId}
        onSelect={handleSelectBoard}
        onAdd={handleAddBoard}
        onRename={handleRenameBoard}
        onDelete={handleDeleteBoard}
      />
      <div className="room-body">
        <Whiteboard
          items={items.filter(i => i.board_id === activeBoardId || i.id.startsWith('tmp-'))}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          shapeKind={shapeKind}
          remoteCursors={remoteCursors.filter(c => c.user_id !== session?.userId)}
          remoteStrokes={remoteStrokes}
          remoteStickyDrags={remoteStickyDrags}
          remoteLasers={remoteLasers}
          session={session}
          channel={presenceChannelRef.current}
          boardId={activeBoardId}
          onItemsChange={handleItemsChange}
          onUndo={handleUndo}
          undoStack={undoStack}
          viewport={viewport}
          onViewportChange={setViewport}
        />
        <ToolPalette
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          shapeKind={shapeKind}
          onToolChange={setTool}
          onColorChange={setColor}
          onStrokeWidthChange={setStrokeWidth}
          onShapeKindChange={setShapeKind}
          onUndo={handleUndo}
          onClear={handleClear}
          canUndo={undoStack.length > 0}
          onOpenImagePicker={handleOpenImagePicker}
          onSendEmoji={handleSendEmoji}
        />
        <EmojiOverlay reactions={emojiReactions} />
        {session && (
          <ChatPanel
            session={session}
            isOpen={chatOpen}
            onToggle={() => setChatOpen(v => !v)}
          />
        )}
        {session && activeBoard && (
          <HistoryPanel
            session={session}
            board={activeBoard}
            items={items.filter(i => i.board_id === activeBoardId)}
            isOpen={historyOpen}
            onToggle={() => setHistoryOpen(v => !v)}
            onRestored={() => loadActiveBoard(activeBoardId)}
          />
        )}
      </div>
      {settingsOpen && session && (
        <RoomSettingsModal session={session} onClose={() => setSettingsOpen(false)} />
      )}
      {/* Hidden file input for images */}
      <input ref={imageInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
        onChange={handleImageFile} aria-hidden="true" />
    </div>
  );
}
