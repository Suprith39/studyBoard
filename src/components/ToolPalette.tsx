import { useState } from 'react';
import type { Tool } from '../types/board';
import type { ShapeKind } from '../types/board';
import { STROKE_COLORS } from '../lib/colors';

interface Props {
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapeKind: ShapeKind;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onShapeKindChange: (k: ShapeKind) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  onOpenImagePicker: () => void;
  onSendEmoji: (emoji: string) => void;
}

const STROKE_WIDTHS = [2, 4, 8, 14];
const EMOJIS = ['👍','❤️','😂','🎉','❓','💡','⭐','🔥'];

export function ToolPalette({
  tool, color, strokeWidth, shapeKind,
  onToolChange, onColorChange, onStrokeWidthChange, onShapeKindChange,
  onUndo, onClear, canUndo, onOpenImagePicker, onSendEmoji,
}: Props) {
  const [showEmojis, setShowEmojis] = useState(false);

  return (
    <div className="tool-palette" role="toolbar" aria-label="Drawing tools">

      {/* ── Select ── */}
      <ToolBtn id="select" active={tool === 'select'} label="Select (V)" onClick={() => onToolChange('select')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-7 1-4 7L5 3z" strokeLinejoin="round"/></svg>
      </ToolBtn>

      {/* ── Draw ── */}
      <ToolBtn id="draw" active={tool === 'draw'} label="Draw (D)" onClick={() => onToolChange('draw')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2"/></svg>
      </ToolBtn>

      {/* ── Eraser ── */}
      <ToolBtn id="eraser" active={tool === 'eraser'} label="Eraser (E)" onClick={() => onToolChange('eraser')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16l11-11 6 6-1.5 1.5"/><path d="M6.01 15.99l4-4"/></svg>
      </ToolBtn>

      {/* ── Shape ── */}
      <ToolBtn id="shape" active={tool === 'shape'} label="Shapes (S)" onClick={() => onToolChange('shape')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      </ToolBtn>

      {/* ── Text ── */}
      <ToolBtn id="text" active={tool === 'text'} label="Text (T)" onClick={() => onToolChange('text')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
      </ToolBtn>

      {/* ── Sticky ── */}
      <ToolBtn id="sticky" active={tool === 'sticky'} label="Sticky note (N)" onClick={() => onToolChange('sticky')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
      </ToolBtn>

      {/* ── Laser ── */}
      <ToolBtn id="laser" active={tool === 'laser'} label="Laser pointer (L)" onClick={() => onToolChange('laser')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="4"/></svg>
      </ToolBtn>

      {/* ── Image ── */}
      <ToolBtn id="image" active={tool === 'image'} label="Upload image / PDF" onClick={onOpenImagePicker}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </ToolBtn>

      <div className="tool-palette__divider" aria-hidden="true" />

      {/* ── Shape kind (only when shape tool) ── */}
      {tool === 'shape' && (
        <>
          <div className="tool-palette__section tool-palette__shapes" role="group" aria-label="Shape kind">
            {(['rect','circle','arrow'] as ShapeKind[]).map(k => (
              <button key={k} className={`shape-btn${shapeKind === k ? ' shape-btn--active' : ''}`}
                onClick={() => onShapeKindChange(k)} aria-label={k} aria-pressed={shapeKind === k} title={k}>
                {k === 'rect' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>}
                {k === 'circle' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="9"/></svg>}
                {k === 'arrow' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>}
              </button>
            ))}
          </div>
          <div className="tool-palette__divider" aria-hidden="true" />
        </>
      )}

      {/* ── Colors (draw/shape/text/eraser) ── */}
      {(tool === 'draw' || tool === 'shape' || tool === 'text') && (
        <>
          <div className="tool-palette__section tool-palette__colors" role="group" aria-label="Colors">
            {STROKE_COLORS.map(c => (
              <button key={c} className={`color-swatch${color === c ? ' color-swatch--active' : ''}`}
                style={{ backgroundColor: c }} onClick={() => onColorChange(c)}
                aria-label={`Color ${c}`} aria-pressed={color === c} title={c} />
            ))}
          </div>
          <div className="tool-palette__divider" aria-hidden="true" />
        </>
      )}

      {/* ── Stroke widths (draw/shape) ── */}
      {(tool === 'draw' || tool === 'shape') && (
        <>
          <div className="tool-palette__section" role="group" aria-label="Stroke width">
            {STROKE_WIDTHS.map(w => (
              <button key={w} className={`stroke-width-btn${strokeWidth === w ? ' stroke-width-btn--active' : ''}`}
                onClick={() => onStrokeWidthChange(w)} aria-label={`Stroke width ${w}`} aria-pressed={strokeWidth === w} title={`${w}px`}>
                <span style={{ width: w, height: w, borderRadius: w, background: 'currentColor', display: 'block' }} />
              </button>
            ))}
          </div>
          <div className="tool-palette__divider" aria-hidden="true" />
        </>
      )}

      {/* ── Undo / Clear ── */}
      <div className="tool-palette__section">
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
        </button>
        <button className="tool-btn tool-btn--danger" onClick={onClear} aria-label="Clear board" title="Clear all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>

      <div className="tool-palette__divider" aria-hidden="true" />

      {/* ── Emoji reactions ── */}
      <div className="tool-palette__section" style={{ position: 'relative' }}>
        <button className="tool-btn" onClick={() => setShowEmojis(v => !v)} aria-label="Send emoji reaction" title="Emoji reaction" aria-expanded={showEmojis}>
          <span style={{ fontSize: 18 }} aria-hidden="true">😊</span>
        </button>
        {showEmojis && (
          <div className="emoji-picker" role="dialog" aria-label="Pick emoji">
            {EMOJIS.map(em => (
              <button key={em} className="emoji-btn" onClick={() => { onSendEmoji(em); setShowEmojis(false); }}
                aria-label={`React with ${em}`}>{em}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ id: _id, active, label, onClick, children }: {
  id: string; active: boolean; label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button className={`tool-btn${active ? ' tool-btn--active' : ''}`}
      onClick={onClick} aria-label={label} aria-pressed={active} title={label}>
      {children}
    </button>
  );
}
