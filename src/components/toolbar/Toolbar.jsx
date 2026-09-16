import { useRef } from 'react'
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
  Trash2
} from 'lucide-react'
import { PALETTE } from '../../utils/toolDefaults.js'

const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'pen', label: 'Pen', icon: Pen },
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'text', label: 'Text box', icon: Type }
]

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
  onInsertImage
}) {
  const fileInputRef = useRef(null)

  const showColor = tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'text'
  const showWidth = tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'eraser'
  const showOpacity = tool === 'pen' || tool === 'pencil'
  const showTextSettings = tool === 'text'

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
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-1 rounded-card border border-border p-1">
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

      <div className="flex items-center gap-1 border-l border-border pl-3">
        <IconBtn label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconBtn>
        <IconBtn label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconBtn>
      </div>

      <div className="flex items-center gap-1 border-l border-border pl-3">
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
      </div>

      {showColor && (
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
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
        <label className="flex items-center gap-2 border-l border-border pl-3 text-xs text-muted">
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
        <label className="flex items-center gap-2 border-l border-border pl-3 text-xs text-muted">
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
          <label className="flex items-center gap-2 border-l border-border pl-3 text-xs text-muted">
            Font
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

          <div className="flex items-center gap-1 border-l border-border pl-3">
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

          <div className="flex items-center gap-1 border-l border-border pl-3">
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
          className="flex items-center gap-1.5 rounded-card border border-red-300 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
        >
          <Trash2 size={13} />
          Delete {selectionCount} selected
        </button>
      )}
    </div>
  )
}

function IconBtn({ children, label, disabled, ...props }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  )
}
