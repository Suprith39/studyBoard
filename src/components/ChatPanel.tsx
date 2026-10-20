import { useState, useEffect, useRef } from 'react';
import type { ChatMessage, RoomSession } from '../types/board';
import { loadChatMessages, sendChatMessage, subscribeToChatMessages } from '../lib/boardService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Props {
  session: RoomSession;
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatPanel({ session, isOpen, onToggle }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    loadChatMessages(session.room.id)
      .then(msgs => { setMessages(msgs); setLoading(false); })
      .catch(() => setLoading(false));

    channelRef.current = subscribeToChatMessages(session.room.id, msg => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [isOpen, session.room.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    try {
      await sendChatMessage(
        session.room.id,
        session.userId,
        session.member.display_name,
        session.member.color,
        trimmed
      );
    } catch { setText(trimmed); }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className={`chat-panel${isOpen ? ' chat-panel--open' : ''}`}>
      <button className="chat-toggle" onClick={onToggle} aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {!isOpen && <span>Chat</span>}
      </button>

      {isOpen && (
        <div className="chat-panel__body">
          <div className="chat-panel__header">
            <span>Room Chat</span>
            <button className="btn btn--ghost btn--sm btn--icon" onClick={onToggle} aria-label="Close chat">×</button>
          </div>

          <div className="chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
            {loading && <p className="chat-loading">Loading…</p>}
            {messages.map(msg => (
              <div key={msg.id} className={`chat-msg${msg.user_id === session.userId ? ' chat-msg--own' : ''}`}>
                <div className="chat-msg__avatar" style={{ backgroundColor: msg.color }}
                  aria-hidden="true">{msg.display_name.charAt(0).toUpperCase()}</div>
                <div className="chat-msg__content">
                  <span className="chat-msg__name" style={{ color: msg.color }}>{msg.display_name}</span>
                  <p className="chat-msg__text">{msg.text}</p>
                  <span className="chat-msg__time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <textarea
              className="chat-input"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message… (Enter to send)"
              rows={2}
              aria-label="Type a message"
              maxLength={500}
            />
            <button className="btn btn--primary btn--sm" onClick={handleSend}
              disabled={!text.trim()} aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
