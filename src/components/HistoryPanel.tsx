import { useState, useEffect } from 'react';
import type { BoardSnapshot, RoomSession, StudyBoard } from '../types/board';
import { loadSnapshots, createSnapshot, restoreSnapshot } from '../lib/boardService';
import type { BoardItem } from '../types/board';
import toast from 'react-hot-toast';

interface Props {
  session: RoomSession;
  board: StudyBoard;
  items: BoardItem[];
  isOpen: boolean;
  onToggle: () => void;
  onRestored: () => void;
}

export function HistoryPanel({ session, board, items, isOpen, onToggle, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<BoardSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    loadSnapshots(board.id).then(s => { setSnapshots(s); setLoading(false); }).catch(() => setLoading(false));
  }, [isOpen, board.id]);

  const handleSave = async () => {
    const l = label.trim() || new Date().toLocaleString();
    try {
      await createSnapshot(session.room.id, board.id, session.userId, l, items);
      setLabel('');
      const fresh = await loadSnapshots(board.id);
      setSnapshots(fresh);
      toast.success('Snapshot saved');
    } catch { toast.error('Failed to save snapshot'); }
  };

  const handleRestore = async (snap: BoardSnapshot) => {
    if (!window.confirm(`Restore to "${snap.label}"? The current board will be replaced.`)) return;
    try {
      await restoreSnapshot(snap.id, session.userId);
      onRestored();
      toast.success('Board restored');
    } catch { toast.error('Restore failed'); }
  };

  return (
    <div className={`history-panel${isOpen ? ' history-panel--open' : ''}`}>
      <button className="history-toggle" onClick={onToggle}
        aria-label={isOpen ? 'Close history' : 'Open history'} aria-expanded={isOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" aria-hidden="true">
          <polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5-4H7"/>
        </svg>
        {!isOpen && <span>History</span>}
      </button>

      {isOpen && (
        <div className="history-panel__body">
          <div className="history-panel__header">
            <span>Board History</span>
            <button className="btn btn--ghost btn--sm btn--icon" onClick={onToggle} aria-label="Close history">×</button>
          </div>

          <div className="history-save-row">
            <input className="field__input" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Snapshot label (optional)" aria-label="Snapshot label" />
            <button className="btn btn--primary btn--sm" onClick={handleSave}>Save now</button>
          </div>

          <div className="history-list">
            {loading && <p className="history-loading">Loading…</p>}
            {snapshots.length === 0 && !loading && <p className="history-empty">No snapshots yet. Save one above.</p>}
            {snapshots.map(snap => (
              <div key={snap.id} className="history-item">
                <div className="history-item__info">
                  <span className="history-item__label">{snap.label}</span>
                  <span className="history-item__time">{new Date(snap.created_at).toLocaleString()}</span>
                  <span className="history-item__count">{snap.items_json.length} items</span>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => handleRestore(snap)}
                  aria-label={`Restore snapshot: ${snap.label}`}>Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
