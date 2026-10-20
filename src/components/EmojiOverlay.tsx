import { useEffect, useState } from 'react';
import type { EmojiReaction } from '../lib/presenceService';

interface Props {
  reactions: EmojiReaction[];
}

export function EmojiOverlay({ reactions }: Props) {
  const [visible, setVisible] = useState<EmojiReaction[]>([]);

  useEffect(() => {
    setVisible(prev => {
      const ids = new Set(prev.map(r => r.id));
      const newOnes = reactions.filter(r => !ids.has(r.id));
      return [...prev, ...newOnes];
    });
  }, [reactions]);

  const handleAnimEnd = (id: string) => {
    setVisible(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="emoji-overlay" aria-hidden="true">
      {visible.map(r => (
        <div
          key={r.id}
          className="emoji-float"
          style={{ left: `${r.x}%`, bottom: '60px' }}
          onAnimationEnd={() => handleAnimEnd(r.id)}
        >
          <span className="emoji-float__bubble">{r.emoji}</span>
          <span className="emoji-float__name" style={{ color: '#fff' }}>{r.display_name}</span>
        </div>
      ))}
    </div>
  );
}
