import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createRoom, joinRoomByCode } from '../lib/roomService';

type Mode = 'home' | 'create' | 'join';

export function EntryPage() {
  const navigate = useNavigate();
  const { inviteCode: paramCode } = useParams<{ inviteCode?: string }>();

  const [mode, setMode] = useState<Mode>(paramCode ? 'join' : 'home');
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState(paramCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { room } = await createRoom(roomName.trim(), displayName.trim());
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { room } = await joinRoomByCode(inviteCode.trim(), displayName.trim());
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entry-page">
      <div className="entry-card">
        {/* Brand */}
        <div className="entry-brand">
          <svg className="entry-brand__logo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="40" height="40" rx="10" fill="#6366f1" />
            <rect x="12" y="14" width="24" height="3" rx="1.5" fill="white" />
            <rect x="12" y="22" width="16" height="3" rx="1.5" fill="white" />
            <rect x="12" y="30" width="20" height="3" rx="1.5" fill="white" />
          </svg>
          <h1 className="entry-brand__name">Studyboard</h1>
          <p className="entry-brand__tagline">Collaborate in real time.</p>
        </div>

        {/* Mode: home */}
        {mode === 'home' && (
          <div className="entry-actions">
            <button className="btn btn--primary btn--lg" onClick={() => setMode('create')}>
              Create a room
            </button>
            <button className="btn btn--ghost btn--lg" onClick={() => setMode('join')}>
              Join with invite code
            </button>
          </div>
        )}

        {/* Mode: create */}
        {mode === 'create' && (
          <form className="entry-form" onSubmit={handleCreate} noValidate>
            <h2 className="entry-form__title">New room</h2>
            <label className="field">
              <span className="field__label">Room name</span>
              <input
                className="field__input"
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder="e.g. Bio 101 Study Session"
                autoFocus
                maxLength={60}
                required
                aria-required="true"
              />
            </label>
            <label className="field">
              <span className="field__label">Your display name</span>
              <input
                className="field__input"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={40}
                required
                aria-required="true"
              />
            </label>
            {error && <p className="entry-error" role="alert">{error}</p>}
            <div className="entry-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => { setMode('home'); setError(null); }}>
                Back
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={loading || !roomName.trim() || !displayName.trim()}
              >
                {loading ? 'Creating…' : 'Create room'}
              </button>
            </div>
          </form>
        )}

        {/* Mode: join */}
        {mode === 'join' && (
          <form className="entry-form" onSubmit={handleJoin} noValidate>
            <h2 className="entry-form__title">Join a room</h2>
            <label className="field">
              <span className="field__label">Invite code</span>
              <input
                className="field__input"
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="Paste invite code or link"
                autoFocus={!paramCode}
                required
                aria-required="true"
              />
            </label>
            <label className="field">
              <span className="field__label">Your display name</span>
              <input
                className="field__input"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Jordan"
                maxLength={40}
                required
                aria-required="true"
                autoFocus={!!paramCode}
              />
            </label>
            {error && <p className="entry-error" role="alert">{error}</p>}
            <div className="entry-form__actions">
              {!paramCode && (
                <button type="button" className="btn btn--ghost" onClick={() => { setMode('home'); setError(null); }}>
                  Back
                </button>
              )}
              <button
                type="submit"
                className="btn btn--primary"
                disabled={loading || !inviteCode.trim() || !displayName.trim()}
              >
                {loading ? 'Joining…' : 'Join room'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
