import { Sparkles, Baby, BookOpen, FileText, Languages, Highlighter, Layers } from 'lucide-react'

const HIGHLIGHT_COLORS = ['#ffe066', '#8ce99a', '#a5d8ff', '#eebefa']

const AI_ACTIONS = [
  { id: 'explain', label: 'Explain', icon: Sparkles },
  { id: 'simplify', label: 'Simplify', icon: Baby },
  { id: 'inContext', label: 'In context', icon: BookOpen },
  { id: 'notes', label: 'Make notes', icon: FileText },
  { id: 'translate', label: 'Translate', icon: Languages },
  { id: 'flashcards', label: 'Flashcards', icon: Layers }
]

// The contextual toolbar from spec §3 — the entry point to the product's
// signature interaction. Appears next to a text selection and offers both
// highlighting and the AI actions.
//
// Positioning is deliberately clamped to the page so the popover never
// hangs off the edge, and it's anchored *below* the selection's end so it
// doesn't cover the text you just selected (spec §43).
export default function AiSelectionToolbar({
  x,
  y,
  pageWidth,
  onHighlight,
  onAiAction,
  disabled
}) {
  const WIDTH = 320
  const left = Math.min(Math.max(8, x), Math.max(8, pageWidth - WIDTH - 8))

  return (
    <div
      className="absolute z-20 rounded-card border border-border bg-surface p-2 shadow-lg"
      style={{ left, top: y + 8, width: WIDTH }}
      // Keep the DOM selection alive when the toolbar is clicked — without
      // this, mousedown collapses the selection before the handler runs.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Highlighter size={13} className="text-muted" />
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Highlight in ${c}`}
            onClick={() => onHighlight(c)}
            className="h-5 w-5 rounded-full border border-black/10 transition-transform hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1 border-t border-border pt-2">
        {AI_ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onAiAction(id)}
            disabled={disabled}
            className="flex flex-col items-center gap-1 rounded-card px-1 py-1.5 text-[11px] text-muted transition-colors hover:bg-accent-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
