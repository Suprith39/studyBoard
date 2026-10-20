import type { Tool } from '../types/board';
import { STROKE_COLORS } from '../lib/colors';

interface Props {
  tool: Tool;
  color: string;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
}

interface ToolDef {
  id: Tool;
  label: string;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 3l14 9-7 1-4 7L5 3z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'draw',
    label: 'Draw',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
  },
  {
    id: 'sticky',
    label: 'Sticky Note',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="12" y2="17" />
      </svg>
    ),
  },
];

export function ToolPalette({
  tool,
  color,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
  canUndo,
}: Props) {
  return (
    <div className="tool-palette" role="toolbar" aria-label="Drawing tools">
      {/* Tool buttons */}
      <div className="tool-palette__section">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`tool-btn${tool === t.id ? ' tool-btn--active' : ''}`}
            onClick={() => onToolChange(t.id)}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="tool-palette__divider" aria-hidden="true" />

      {/* Color swatches — only shown for draw tool */}
      {tool === 'draw' && (
        <>
          <div className="tool-palette__section tool-palette__colors" role="group" aria-label="Drawing colors">
            {STROKE_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch${color === c ? ' color-swatch--active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                title={c}
              />
            ))}
          </div>
          <div className="tool-palette__divider" aria-hidden="true" />
        </>
      )}

      {/* Actions */}
      <div className="tool-palette__section">
        <button
          className="tool-btn"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last action"
          title="Undo (Ctrl+Z)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        <button
          className="tool-btn tool-btn--danger"
          onClick={onClear}
          aria-label="Clear board"
          title="Clear all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
