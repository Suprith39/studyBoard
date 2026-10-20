import { useState } from 'react';
import type { RoomSession } from '../types/board';
import { setRoomPin } from '../lib/roomService';
import toast from 'react-hot-toast';

interface Props {
  session: RoomSession;
  onClose: () => void;
}

export function RoomSettingsModal({ session, onClose }: Props) {
  const [pin, setPin] = useState('');
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSetPin = async () => {
    if (pin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    setSaving(true);
    try {
      await setRoomPin(session.room.id, pin);
      toast.success('PIN set');
      setPin('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set PIN');
    } finally { setSaving(false); }
  };

  const handleRemovePin = async () => {
    setRemoving(true);
    try {
      await setRoomPin(session.room.id, null);
      toast.success('PIN removed');
    } catch { toast.error('Failed to remove PIN'); }
    finally { setRemoving(false); }
  };

  const isOwner = session.room.created_by === session.userId;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Room settings">
        <div className="modal__header">
          <h2>Room Settings</h2>
          <button className="btn btn--ghost btn--sm btn--icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal__body">
          <p className="modal__room-name"><strong>Room:</strong> {session.room.name}</p>
          <p className="modal__invite"><strong>Invite code:</strong> <code>{session.room.invite_code}</code></p>

          {isOwner && (
            <div className="modal__section">
              <h3>PIN Protection</h3>
              <p className="modal__hint">
                {session.room.pin_hash
                  ? 'This room is PIN-protected. New members must enter the PIN to join.'
                  : 'Set a PIN to require new members to enter it before joining.'}
              </p>
              <div className="modal__pin-row">
                <input className="field__input" type="password" value={pin}
                  onChange={e => setPin(e.target.value)} placeholder="New PIN (4+ digits)"
                  maxLength={12} aria-label="New PIN" />
                <button className="btn btn--primary btn--sm" onClick={handleSetPin} disabled={saving || !pin}>
                  {saving ? 'Saving…' : 'Set PIN'}
                </button>
              </div>
              {session.room.pin_hash && (
                <button className="btn btn--ghost btn--sm" onClick={handleRemovePin} disabled={removing}>
                  {removing ? 'Removing…' : 'Remove PIN'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
