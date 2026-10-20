import { useState } from 'react';
import type { StudyRoom, RoomMember, SyncStatus, PresenceState } from '../types/board';
import { buildInviteUrl } from '../lib/roomService';

interface Props {
  room: StudyRoom | null;
  member: RoomMember | null;
  syncStatus: SyncStatus;
  participants: PresenceState[];
  onOpenSettings?: () => void;
}

const STATUS_CONFIG: Record<SyncStatus, { label: string; cls: string }> = {
  local:        { label: 'Local',         cls: 'status--local' },
  connecting:   { label: 'Connecting…',   cls: 'status--connecting' },
  live:         { label: 'Live',          cls: 'status--live' },
  saving:       { label: 'Saving…',       cls: 'status--saving' },
  offline:      { label: 'Offline',       cls: 'status--offline' },
  reconnecting: { label: 'Reconnecting…', cls: 'status--reconnecting' },
  error:        { label: 'Error',         cls: 'status--error' },
};

export function TopBar({ room, member: _member, syncStatus, participants, onOpenSettings }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!room) return;
    const url = buildInviteUrl(room.invite_code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this invite link:', url);
    }
  };

  const { label, cls } = STATUS_CONFIG[syncStatus];

  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand">
        <svg className="topbar__logo" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8h10M7 12h6M7 16h8" strokeLinecap="round" />
        </svg>
        <span className="topbar__appname">Studyboard</span>
      </div>

      <div className="topbar__center">
        {room ? (
          <span className="topbar__roomname" title={room.name}>{room.name}</span>
        ) : (
          <span className="topbar__roomname topbar__roomname--empty">No room</span>
        )}
      </div>

      <div className="topbar__right">
        <span className={`status-pill ${cls}`} role="status" aria-live="polite">
          <span className="status-pill__dot" aria-hidden="true" />
          {label}
        </span>

        {participants.length > 0 && (
          <div className="participant-avatars" aria-label={`${participants.length} participant${participants.length === 1 ? '' : 's'} online`}>
            {participants.slice(0, 6).map(p => (
              <div key={p.user_id} className="avatar" style={{ backgroundColor: p.color }}
                title={p.display_name} aria-label={p.display_name}>
                {p.display_name.charAt(0).toUpperCase()}
              </div>
            ))}
            {participants.length > 6 && (
              <div className="avatar avatar--overflow" title={`${participants.length - 6} more`}>
                +{participants.length - 6}
              </div>
            )}
          </div>
        )}

        {room && (
          <button className="btn btn--ghost btn--sm" onClick={handleCopy}
            aria-label="Copy invite link" title="Copy invite link">
            {copied ? (
              <><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
            ) : (
              <><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Invite</>
            )}
          </button>
        )}

        {onOpenSettings && (
          <button className="btn btn--ghost btn--sm btn--icon" onClick={onOpenSettings}
            aria-label="Room settings" title="Room settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
