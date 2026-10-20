import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type {
  BoardItem,
  CursorPosition,
  PresenceState,
  RoomSession,
  SyncStatus,
  Tool,
} from '../types/board';
import { STROKE_COLORS } from '../lib/colors';
import { loadRoom, getMyMembership } from '../lib/roomService';
import {
  loadBoardItems,
  subscribeToBoardItems,
  clearBoardItems,
  deleteBoardItem,
  type BoardChangeHandler,
} from '../lib/boardService';
import {
  createRoomChannel,
  leaveRoomChannel,
} from '../lib/presenceService';
import { supabase } from '../lib/supabase';

import { TopBar } from '../components/TopBar';
import { ToolPalette } from '../components/ToolPalette';
import { Whiteboard } from '../components/Whiteboard';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<RoomSession | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [items, setItems] = useState<BoardItem[]>([]);
  const [participants, setParticipants] = useState<PresenceState[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<CursorPosition[]>([]);
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(STROKE_COLORS[0]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const boardChannelRef = useRef<ReturnType<typeof subscribeToBoardItems> | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // ── Remove stale cursors after 5s of inactivity ────────────────────────────
  const cursorTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleRemoteCursor = useCallback((cursor: CursorPosition) => {
    setRemoteCursors(prev => {
      const next = prev.filter(c => c.user_id !== cursor.user_id);
      return [...next, cursor];
    });
    const existing = cursorTimers.current.get(cursor.user_id);
    if (existing) clearTimeout(existing);
    cursorTimers.current.set(
      cursor.user_id,
      setTimeout(() => {
        setRemoteCursors(prev => prev.filter(c => c.user_id !== cursor.user_id));
        cursorTimers.current.delete(cursor.user_id);
      }, 5000)
    );
  }, []);

  // ── Board change handler ───────────────────────────────────────────────────
  const handleBoardChange = useCallback<BoardChangeHandler>(change => {
    if (change.event === 'INSERT') {
      setItems(prev => {
        // Don't add if already present (e.g. our own optimistic item)
        if (prev.some(i => i.id === change.item.id)) return prev;
        return [...prev, change.item];
      });
    } else if (change.event === 'UPDATE') {
      setItems(prev =>
        prev.map(i => {
          if (i.id !== change.item.id) return i;
          // Latest-write-wins: only update if remote is newer
          if (change.item.updated_at >= i.updated_at) return change.item;
          return i;
        })
      );
    } else if (change.event === 'DELETE') {
      setItems(prev => prev.filter(i => i.id !== change.itemId));
    }
  }, []);

  // ── Initial load + subscription setup ─────────────────────────────────────
  useEffect(() => {
    if (!roomId) { navigate('/'); return; }

    let cancelled = false;

    const setup = async () => {
      setSyncStatus('connecting');
      try {
        // Ensure auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/'); return; }

        // Load room
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

        // Load board snapshot
        const boardItems = await loadBoardItems(roomId);
        if (cancelled) return;
        setItems(boardItems);

        // Subscribe to board changes
        boardChannelRef.current = subscribeToBoardItems(roomId, handleBoardChange);

        // Set up presence + cursor channel
        presenceChannelRef.current = createRoomChannel(
          roomId,
          {
            user_id: user.id,
            display_name: member.display_name,
            color: member.color,
            online_at: new Date().toISOString(),
          },
          setParticipants,
          handleRemoteCursor
        );

        setSyncStatus('live');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load room';
        if (msg.includes('not found') || msg.includes('Invalid')) {
          setError(msg);
        }
        setSyncStatus('error');
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (boardChannelRef.current) {
        supabase.removeChannel(boardChannelRef.current);
      }
      if (presenceChannelRef.current) {
        leaveRoomChannel(presenceChannelRef.current);
      }
      cursorTimers.current.forEach(t => clearTimeout(t));
    };
  }, [roomId, navigate, handleBoardChange, handleRemoteCursor]);

  // ── Network status ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOffline = () => setSyncStatus('offline');
    const handleOnline = () => setSyncStatus('reconnecting');
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // ── Undo ───────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const lastId = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    // Only delete if the item still belongs to us and hasn't been edited by someone else
    const item = items.find(i => i.id === lastId);
    if (!item || !session) return;
    if (item.updated_by !== session.userId) return; // teammate edited it — skip
    await deleteBoardItem(lastId);
    setItems(prev => prev.filter(i => i.id !== lastId));
  }, [undoStack, items, session]);

  // ── Keyboard undo ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleUndo]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!session) return;
    if (!window.confirm('Clear the entire board? This cannot be undone.')) return;
    try {
      await clearBoardItems(session.room.id);
      setItems([]);
      setUndoStack([]);
    } catch {
      // ignore — realtime will handle
    }
  };

  // ── Track locally-created items for undo ──────────────────────────────────
  const handleItemsChange = useCallback(
    (updater: (prev: BoardItem[]) => BoardItem[]) => {
      setItems(prev => {
        const next = updater(prev);
        // If a new item was added that has a real id (not tmp-), push to undo stack
        const added = next.find(
          n =>
            !n.id.startsWith('tmp-') &&
            !prev.some(p => p.id === n.id) &&
            n.created_by === session?.userId
        );
        if (added) {
          setUndoStack(s => [...s.slice(-19), added.id]); // max 20
        }
        return next;
      });
    },
    [session?.userId]
  );

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="error-page">
        <div className="error-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2>{error}</h2>
          <button className="btn btn--primary" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-layout">
      <TopBar
        room={session?.room ?? null}
        member={session?.member ?? null}
        syncStatus={syncStatus}
        participants={participants}
      />
      <div className="room-body">
        <Whiteboard
          items={items}
          tool={tool}
          color={color}
          remoteCursors={remoteCursors.filter(c => c.user_id !== session?.userId)}
          session={session}
          channel={presenceChannelRef.current}
          onItemsChange={handleItemsChange}
          onUndo={handleUndo}
          undoStack={undoStack}
        />
        <ToolPalette
          tool={tool}
          color={color}
          onToolChange={setTool}
          onColorChange={setColor}
          onUndo={handleUndo}
          onClear={handleClear}
          canUndo={undoStack.length > 0}
        />
      </div>
    </div>
  );
}
