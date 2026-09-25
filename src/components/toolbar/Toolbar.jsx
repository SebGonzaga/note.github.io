import { useRef, useState } from 'react'
import {
  Pen,
  Pencil,
  Highlighter,
  Eraser,
  MousePointer2,
  Type,
  ImagePlus,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Trash2,
  Wand2,
  PenLine,
  Sticker,
  Shapes
} from 'lucide-react'
import { PALETTE } from '../../utils/toolDefaults.js'
import { FONT_OPTIONS, fontFamilyFor } from '../../utils/fonts.js'
import { UNDERLINE_STYLES } from '../../utils/decorations.js'
import { STICKER_SETS } from '../../utils/stickers.js'

// Renders <option>s grouped by category, each previewed in its own font.
function FontOptions() {
  const groups = []
  for (const f of FONT_OPTIONS) {
    let group = groups.find((g) => g.name === f.group)
    if (!group) {
      group = { name: f.group, fonts: [] }
      groups.push(group)
    }
    group.fonts.push(f)
  }
  return groups.map((g) => (
    <optgroup key={g.name} label={g.name}>
      {g.fonts.map((f) => (
        <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
          {f.label}
        </option>
      ))}
    </optgroup>
  ))
}

const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'pen', label: 'Pen', icon: Pen },
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { id: 'underline', label: 'Decorative underline', icon: PenLine },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'text', label: 'Text box', icon: Type }
]

const NEAT_MODES = [
  { id: 'off', label: 'Off' },
  { id: 'sharpen', label: 'Sharpen ink' },
  { id: 'type', label: 'Convert to text' }
]

const selectClass =
  'rounded-card border border-border bg-surface px-1.5 py-1 text-xs text-ink focus:border-accent'

const ALIGN_OPTIONS = [
  { id: 'left', icon: AlignLeft },
  { id: 'center', icon: AlignCenter },
  { id: 'right', icon: AlignRight }
]

export default function Toolbar({
  tool,
  setTool,
  settings,
  updateSettings,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectionCount,
  onDeleteSelection,
  onInsertImage,
  onInsertSticker,
  neat,
  onNeatChange
}) {
  const fileInputRef = useRef(null)
  const [stickersOpen, setStickersOpen] = useState(false)

  const showColor =
    tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'text' || tool === 'underline'
  const showWidth =
    tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'eraser' || tool === 'underline'
  const showOpacity = tool === 'pen' || tool === 'pencil'
  const showTextSettings = tool === 'text'
  const showUnderlineSettings = tool === 'underline'
  const showNeat = !!neat && (tool === 'pen' || tool === 'pencil')

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onInsertImage) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result
      const img = new window.Image()
      img.onload = () => onInsertImage(src, img.naturalWidth, img.naturalHeight)
      img.onerror = () => onInsertImage(src, 240, 180)
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-border bg-surface px-4 py-2 no-scrollbar">
      <div className="flex shrink-0 items-center gap-1 rounded-card border border-border p-1">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={label}
            title={label}
            onClick={() => setTool(id)}
            className={`rounded-card p-1.5 ${
              tool === id ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-ink'
            }`}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
        <IconBtn label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconBtn>
        <IconBtn label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconBtn>
      </div>

      <div className="relative flex shrink-0 items-center gap-1 border-l border-border pl-3">
        <IconBtn label="Insert image" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={16} />
        </IconBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {onInsertSticker && (
          <>
            <IconBtn
              label="Stickers"
              onClick={() => setStickersOpen((v) => !v)}
              active={stickersOpen}
            >
              <Sticker size={16} />
            </IconBtn>
            {stickersOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-card border border-border bg-surface p-2 shadow-lg">
                {STICKER_SETS.map((set) => (
                  <div key={set.group} className="mb-2 last:mb-0">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                      {set.group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {set.items.map((s) => (
                        <button
                          key={s.id}
                          title={s.label}
                          onClick={() => {
                            onInsertSticker(s.dataUrl)
                            setStickersOpen(false)
                          }}
                          className="rounded-card p-1.5 hover:bg-accent-soft"
                        >
                          <img src={s.dataUrl} alt={s.label} className="h-6 w-6" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showNeat && (
        <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-muted">
          <Wand2 size={14} aria-hidden="true" />
          <select
            aria-label="Neat writing"
            title={
              neat.mode === 'type'
                ? 'When you pause, your handwriting is read by AI and replaced with typed text. Needs the AI service.'
                : neat.mode === 'sharpen'
                ? 'Smooths wobbly lines as you write. Works offline.'
                : 'Ink is kept exactly as you draw it.'
            }
            value={neat.mode}
            onChange={(e) => onNeatChange({ mode: e.target.value })}
            className={selectClass}
          >
            {NEAT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {neat.mode === 'type' && (
            <select
              aria-label="Font for converted text"
              value={neat.font}
              onChange={(e) => onNeatChange({ font: e.target.value })}
              className={selectClass}
            >
              <FontOptions />
            </select>
          )}
        </div>
      )}

      {neat && tool === 'pen' && (
        <label className="flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-muted">
          Pen
          <select
            aria-label="Pen style"
            title="Fountain: lines get thinner when you write fast and fuller when you slow down. Classic: even width."
            value={neat.penStyle}
            onChange={(e) => onNeatChange({ penStyle: e.target.value })}
            className={selectClass}
          >
            <option value="fountain">Fountain</option>
            <option value="classic">Classic</option>
          </select>
        </label>
      )}

      {neat && (tool === 'pen' || tool === 'pencil') && (
        <div className="flex shrink-0 items-center border-l border-border pl-3">
          <IconBtn
            label="Snap rough circles, rectangles, lines and triangles to clean shapes"
            active={neat.shapeRecognition !== false}
            onClick={() => onNeatChange({ shapeRecognition: neat.shapeRecognition === false })}
          >
            <Shapes size={16} />
          </IconBtn>
        </div>
      )}

      {showUnderlineSettings && (
        <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
          {UNDERLINE_STYLES.map((s) => (
            <button
              key={s.id}
              title={s.label}
              onClick={() => updateSettings({ decoration: s.id })}
              className={`rounded-card px-2 py-1 text-xs ${
                settings.decoration === s.id
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-accent-soft hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {showColor && (
        <div className="flex shrink-0 items-center gap-1.5 border-l border-border pl-3">
          {PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => updateSettings({ color: c })}
              className={`h-5 w-5 rounded-full border-2 ${
                settings.color === c ? 'border-accent' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={settings.color}
            onChange={(e) => updateSettings({ color: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded-card border border-border bg-transparent"
            aria-label="Custom color"
          />
        </div>
      )}

      {showWidth && (
        <label className="flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-muted">
          Size
          <input
            type="range"
            min={tool === 'highlighter' ? 8 : tool === 'eraser' ? 10 : 1}
            max={tool === 'highlighter' ? 36 : tool === 'eraser' ? 48 : 12}
            step="0.5"
            value={settings.width}
            onChange={(e) => updateSettings({ width: Number(e.target.value) })}
            className="w-24 accent-accent"
          />
        </label>
      )}

      {showOpacity && (
        <label className="flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-muted">
          Opacity
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={settings.opacity}
            onChange={(e) => updateSettings({ opacity: Number(e.target.value) })}
            className="w-20 accent-accent"
          />
        </label>
      )}

      {showTextSettings && (
        <>
          <label className="flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-muted">
            Size
            <input
              type="range"
              min="10"
              max="48"
              step="1"
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
              className="w-20 accent-accent"
            />
          </label>

          <select
            aria-label="Typeface"
            value={settings.font || 'inter'}
            onChange={(e) => updateSettings({ font: e.target.value })}
            className={`${selectClass} shrink-0`}
            style={{ fontFamily: fontFamilyFor(settings.font || 'inter') }}
          >
            <FontOptions />
          </select>

          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
            <button
              aria-label="Bold"
              onClick={() => updateSettings({ bold: !settings.bold })}
              className={`rounded-card p-1.5 ${
                settings.bold ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-ink'
              }`}
            >
              <Bold size={14} />
            </button>
            <button
              aria-label="Italic"
              onClick={() => updateSettings({ italic: !settings.italic })}
              className={`rounded-card p-1.5 ${
                settings.italic ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-ink'
              }`}
            >
              <Italic size={14} />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
            {ALIGN_OPTIONS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                aria-label={`Align ${id}`}
                onClick={() => updateSettings({ align: id })}
                className={`rounded-card p-1.5 ${
                  settings.align === id ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-ink'
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </>
      )}

      {tool === 'select' && selectionCount > 0 && (
        <button
          onClick={onDeleteSelection}
          className="flex shrink-0 items-center gap-1.5 rounded-card border border-red-300 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          Delete {selectionCount} selected
        </button>
      )}
    </div>
  )
}

function IconBtn({ children, label, disabled, active, className = '', ...props }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`rounded-card p-1.5 disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-ink'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
