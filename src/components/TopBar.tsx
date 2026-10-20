import { useState } from 'react';
import type { StudyRoom, RoomMember, SyncStatus, PresenceState } from '../types/board';
import { buildInviteUrl } from '../lib/roomService';

interface Props {
  room: StudyRoom | null;
  member: RoomMember | null;
  syncStatus: SyncStatus;
  participants: PresenceState[];
}

const STATUS_CONFIG: Record<SyncStatus, { label: string; cls: string }> = {
  local:        { label: 'Local',        cls: 'status--local' },
  connecting:   { label: 'Connecting…',  cls: 'status--connecting' },
  live:         { label: 'Live',         cls: 'status--live' },
  saving:       { label: 'Saving…',      cls: 'status--saving' },
  offline:      { label: 'Offline',      cls: 'status--offline' },
  reconnecting: { label: 'Reconnecting…',cls: 'status--reconnecting' },
  error:        { label: 'Error',        cls: 'status--error' },
};

export function TopBar({ room, member: _member, syncStatus, participants }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!room) return;
    const url = buildInviteUrl(room.invite_code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
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
        {/* Sync status pill */}
        <span className={`status-pill ${cls}`} role="status" aria-live="polite">
          <span className="status-pill__dot" aria-hidden="true" />
          {label}
        </span>

        {/* Participant avatars */}
        {participants.length > 0 && (
          <div className="participant-avatars" aria-label={`${participants.length} participant${participants.length === 1 ? '' : 's'} online`}>
            {participants.slice(0, 6).map(p => (
              <div
                key={p.user_id}
                className="avatar"
                style={{ backgroundColor: p.color }}
                title={p.display_name}
                aria-label={p.display_name}
              >
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

        {/* Copy invite button */}
        {room && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleCopy}
            aria-label="Copy invite link"
            title="Copy invite link"
          >
            {copied ? (
              <>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Invite
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
