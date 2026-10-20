import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createRoom, joinRoomByCode, checkRoomPin,
  signInWithGoogle, signInWithEmail, signUpWithEmail, signOut,
} from '../lib/roomService';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

type Mode = 'home' | 'create' | 'join' | 'account';

export function EntryPage() {
  const navigate = useNavigate();
  const { inviteCode: paramCode } = useParams<{ inviteCode?: string }>();

  const [mode, setMode] = useState<Mode>(paramCode ? 'join' : 'home');
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState(paramCode ?? '');
  const [pin, setPin] = useState('');
  const [roomPin, setRoomPin] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Account form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check if invite link room needs a PIN
  useEffect(() => {
    if (!paramCode) return;
    checkRoomPin(paramCode).then(needs => setNeedsPin(needs)).catch(() => null);
  }, [paramCode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !displayName.trim()) return;
    setLoading(true); setError(null);
    try {
      const { room } = await createRoom(roomName.trim(), displayName.trim(), pin || undefined);
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally { setLoading(false); }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !displayName.trim()) return;
    setLoading(true); setError(null);
    try {
      const { room } = await joinRoomByCode(inviteCode.trim(), displayName.trim(), roomPin || undefined);
      navigate(`/room/${room.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join';
      if (msg === 'PIN_REQUIRED') { setNeedsPin(true); setError('This room requires a PIN.'); }
      else if (msg === 'PIN_INVALID') setError('Incorrect PIN. Try again.');
      else setError(msg);
    } finally { setLoading(false); }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (isSignUp) await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
      setMode('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="entry-page">
      <div className="entry-card">
        {/* Brand */}
        <div className="entry-brand">
          <svg className="entry-brand__logo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="40" height="40" rx="10" fill="#6366f1"/>
            <rect x="12" y="14" width="24" height="3" rx="1.5" fill="white"/>
            <rect x="12" y="22" width="16" height="3" rx="1.5" fill="white"/>
            <rect x="12" y="30" width="20" height="3" rx="1.5" fill="white"/>
          </svg>
          <h1 className="entry-brand__name">Studyboard</h1>
          <p className="entry-brand__tagline">Collaborate in real time.</p>
        </div>

        {/* Signed-in user badge */}
        {user && !user.is_anonymous && (
          <div className="entry-user-badge">
            <span>Signed in as <strong>{user.email}</strong></span>
            <button className="btn btn--ghost btn--sm" onClick={() => signOut()}>Sign out</button>
          </div>
        )}

        {/* Home */}
        {mode === 'home' && (
          <div className="entry-actions">
            <button className="btn btn--primary btn--lg" onClick={() => setMode('create')}>Create a room</button>
            <button className="btn btn--ghost btn--lg" onClick={() => setMode('join')}>Join with invite code</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setMode('account')} style={{ marginTop: 4 }}>
              {user && !user.is_anonymous ? '👤 Account' : '🔑 Sign in / Create account'}
            </button>
          </div>
        )}

        {/* Create */}
        {mode === 'create' && (
          <form className="entry-form" onSubmit={handleCreate} noValidate>
            <h2 className="entry-form__title">New room</h2>
            <label className="field">
              <span className="field__label">Room name</span>
              <input className="field__input" type="text" value={roomName} onChange={e => setRoomName(e.target.value)}
                placeholder="Bio 101 Study Session" autoFocus maxLength={60} required />
            </label>
            <label className="field">
              <span className="field__label">Your display name</span>
              <input className="field__input" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Alex" maxLength={40} required />
            </label>
            <label className="field">
              <span className="field__label">PIN protection <span className="field__hint">(optional)</span></span>
              <input className="field__input" type="password" value={pin} onChange={e => setPin(e.target.value)}
                placeholder="Leave blank for no PIN" maxLength={12} />
            </label>
            {error && <p className="entry-error" role="alert">{error}</p>}
            <div className="entry-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => { setMode('home'); setError(null); }}>Back</button>
              <button type="submit" className="btn btn--primary" disabled={loading || !roomName.trim() || !displayName.trim()}>
                {loading ? 'Creating…' : 'Create room'}
              </button>
            </div>
          </form>
        )}

        {/* Join */}
        {mode === 'join' && (
          <form className="entry-form" onSubmit={handleJoin} noValidate>
            <h2 className="entry-form__title">Join a room</h2>
            <label className="field">
              <span className="field__label">Invite code</span>
              <input className="field__input" type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                placeholder="Paste invite code or link" autoFocus={!paramCode} required />
            </label>
            <label className="field">
              <span className="field__label">Your display name</span>
              <input className="field__input" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Jordan" maxLength={40} required autoFocus={!!paramCode} />
            </label>
            {needsPin && (
              <label className="field">
                <span className="field__label">Room PIN</span>
                <input className="field__input" type="password" value={roomPin} onChange={e => setRoomPin(e.target.value)}
                  placeholder="Enter PIN" required autoFocus />
              </label>
            )}
            {error && <p className="entry-error" role="alert">{error}</p>}
            <div className="entry-form__actions">
              {!paramCode && (
                <button type="button" className="btn btn--ghost" onClick={() => { setMode('home'); setError(null); }}>Back</button>
              )}
              <button type="submit" className="btn btn--primary"
                disabled={loading || !inviteCode.trim() || !displayName.trim()}>
                {loading ? 'Joining…' : 'Join room'}
              </button>
            </div>
          </form>
        )}

        {/* Account */}
        {mode === 'account' && (
          <form className="entry-form" onSubmit={handleAccountSubmit} noValidate>
            <h2 className="entry-form__title">{isSignUp ? 'Create account' : 'Sign in'}</h2>
            <label className="field">
              <span className="field__label">Email</span>
              <input className="field__input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoFocus required placeholder="you@example.com" />
            </label>
            <label className="field">
              <span className="field__label">Password</span>
              <input className="field__input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••" minLength={6} />
            </label>
            {error && <p className="entry-error" role="alert">{error}</p>}
            <div className="entry-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => { setMode('home'); setError(null); }}>Back</button>
              <button type="submit" className="btn btn--primary" disabled={loading || !email || !password}>
                {loading ? '…' : isSignUp ? 'Create account' : 'Sign in'}
              </button>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8, alignSelf: 'center' }}
              onClick={() => setIsSignUp(v => !v)}>
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
            <div className="entry-divider"><span>or</span></div>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => signInWithGoogle()}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
