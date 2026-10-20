import { useState } from 'react';
import type { StudyBoard } from '../types/board';

interface Props {
  boards: StudyBoard[];
  activeBoardId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function BoardTabs({ boards, activeBoardId, onSelect, onAdd, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const startRename = (board: StudyBoard) => {
    setEditingId(board.id);
    setEditName(board.name);
  };

  const commitRename = (id: string) => {
    const name = editName.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  };

  const commitAdd = () => {
    const name = newName.trim();
    if (name) onAdd(name);
    setAdding(false);
    setNewName('');
  };

  return (
    <div className="board-tabs" role="tablist" aria-label="Board tabs">
      {boards.map(board => (
        <div key={board.id} className={`board-tab${board.id === activeBoardId ? ' board-tab--active' : ''}`}
          role="tab" aria-selected={board.id === activeBoardId}>
          {editingId === board.id ? (
            <input
              className="board-tab__input"
              value={editName}
              autoFocus
              onChange={e => setEditName(e.target.value)}
              onBlur={() => commitRename(board.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(board.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              aria-label="Rename board"
            />
          ) : (
            <button className="board-tab__name" onClick={() => onSelect(board.id)}
              onDoubleClick={() => startRename(board)} aria-label={`Switch to board: ${board.name}`}>
              {board.name}
            </button>
          )}
          {boards.length > 1 && (
            <button className="board-tab__delete" onClick={() => {
              if (window.confirm(`Delete board "${board.name}"? All items on it will be lost.`)) {
                onDelete(board.id);
              }
            }} aria-label={`Delete board ${board.name}`} title="Delete board">×</button>
          )}
        </div>
      ))}

      {adding ? (
        <div className="board-tab board-tab--adding">
          <input
            className="board-tab__input"
            value={newName}
            autoFocus
            placeholder="Board name"
            onChange={e => setNewName(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={e => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            aria-label="New board name"
          />
        </div>
      ) : (
        <button className="board-tab__add" onClick={() => setAdding(true)}
          aria-label="Add new board" title="New board">
          + New board
        </button>
      )}
    </div>
  );
}
