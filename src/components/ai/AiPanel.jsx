import { useEffect, useState } from 'react'
import { X, Copy, Check, Loader2, AlertCircle, Send, BookOpen, Globe, Layers, Database } from 'lucide-react'
import { CONTEXT_MODES } from '../../services/ai/context.js'

const MODE_TITLES = {
  explain: 'Explanation',
  simplify: 'Simplified',
  inContext: 'In context',
  notes: 'Notes',
  translate: 'Translation',
  followUp: 'Answer',
  flashcards: 'Flashcards'
}

// Shows the AI result (spec §43): loading state, the answer, where the
// answer came from, copy, follow-up questions, and graceful errors.
//
// The grounding badge is the honesty mechanism the spec keeps returning to:
// the student should always be able to tell "this came from your PDF" from
// "this is the model's general knowledge".
export default function AiPanel({
  state, // { status, mode, selectedText, result, error }
  contextMode,
  setContextMode,
  onClose,
  onFollowUp,
  onRetry,
  indexStatus, // 'none' | 'indexing' | 'ready' | 'error'
  indexProgress, // { done, total } while indexing
  chunkCount,
  onIndex,
  onSaveFlashcards
}) {
  const [copied, setCopied] = useState(false)
  const [question, setQuestion] = useState('')
  const [savedCount, setSavedCount] = useState(null)

  const { status, mode, selectedText, result, error } = state
  const isFlashcards = mode === 'flashcards'

  // A fresh request (new selection, or retrying) should forget any earlier
  // "Saved" state — otherwise generating a second set of cards would still
  // show the first set as saved.
  useEffect(() => {
    if (status === 'loading') setSavedCount(null)
  }, [status])

  function handleCopy() {
    if (!result?.answer) return
    navigator.clipboard.writeText(result.answer)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function submitFollowUp(e) {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    setQuestion('')
    onFollowUp(q)
  }

  return (
    <div className="fixed inset-0 z-30 flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface lg:static lg:inset-auto lg:z-auto lg:w-80 lg:shrink-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">{MODE_TITLES[mode] || 'AI'}</p>
        <div className="flex-1" />
        <button
          aria-label="Close AI panel"
          onClick={onClose}
          className="rounded-card p-1 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selectedText && (
          <blockquote className="mb-3 border-l-2 border-accent pl-2 text-xs italic text-muted">
            {selectedText.length > 220 ? `${selectedText.slice(0, 220)}…` : selectedText}
          </blockquote>
        )}

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" />
            Thinking…
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-card border border-red-500/30 bg-red-500/5 p-3">
            <div className="mb-2 flex items-start gap-2 text-sm text-red-500">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="rounded-card border border-border px-2 py-1 text-xs text-ink hover:bg-accent-soft"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {status === 'done' && result && isFlashcards && (
          <FlashcardsResult
            result={result}
            saved={savedCount}
            onSave={() => {
              onSaveFlashcards(result.cards)
              setSavedCount(result.cards.length)
            }}
          />
        )}

        {status === 'done' && result && !isFlashcards && (
          <>
            <GroundingBadge grounding={result.grounding} usedMaterial={result.usedMaterial} />

            <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</div>

            {result.usedMaterial && result.sources?.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium text-muted">Source material</p>
                {dedupeSources(result.sources).map((s, i) => (
                  <p key={i} className="text-xs text-muted">
                    {s.document}
                    {s.page ? ` — page ${s.page}` : ''}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-card border border-border px-2 py-1 text-xs text-muted hover:bg-accent-soft hover:text-ink"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {result.followUps?.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="mb-1.5 text-xs font-medium text-muted">Ask next</p>
                <div className="flex flex-col gap-1">
                  {result.followUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => onFollowUp(q)}
                      className="rounded-card border border-border px-2 py-1.5 text-left text-xs text-ink hover:bg-accent-soft"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border p-2">
        {!isFlashcards && (
          <form onSubmit={submitFollowUp} className="mb-2 flex items-center gap-1">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a follow-up…"
              disabled={status === 'loading'}
              className="flex-1 rounded-card border border-border bg-paper px-2 py-1.5 text-xs outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              aria-label="Send follow-up"
              disabled={status === 'loading'}
              className="rounded-card border border-border p-1.5 text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        )}

        <IndexControl
          indexStatus={indexStatus}
          indexProgress={indexProgress}
          chunkCount={chunkCount}
          onIndex={onIndex}
        />

        <div className="mt-2 flex items-center gap-2">
          <select
            value={contextMode}
            onChange={(e) => setContextMode(e.target.value)}
            className="flex-1 rounded-card border border-border bg-paper px-2 py-1 text-xs text-ink outline-none"
          >
            {CONTEXT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                Context: {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// Flashcards get their own result view: a stack of cards to skim and a
// single "Save" action, rather than the prose + copy + follow-ups UI that
// makes no sense for a set of Q/A pairs.
function FlashcardsResult({ result, saved, onSave }) {
  if (result.cards.length === 0) {
    return (
      <p className="text-sm text-muted">
        Couldn't generate flashcards from that selection — try selecting a bit more text.
      </p>
    )
  }

  return (
    <>
      <GroundingBadge grounding={result.grounding} usedMaterial={result.usedMaterial} />

      <div className="flex flex-col gap-2">
        {result.cards.map((card, i) => (
          <div key={i} className="rounded-card border border-border p-2">
            <p className="text-xs font-medium text-ink">{card.front}</p>
            <p className="mt-1 text-xs text-muted">{card.back}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onSave}
        disabled={saved !== null}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-card border border-accent bg-accent-soft px-2 py-1.5 text-xs font-medium text-ink hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saved !== null ? (
          <>
            <Check size={13} /> Saved {saved} card{saved === 1 ? '' : 's'}
          </>
        ) : (
          <>
            <Layers size={13} /> Save all {result.cards.length} to Flashcards
          </>
        )}
      </button>
    </>
  )
}

// Indexing controls (Phase 6 RAG). Shown for every AI mode — not just
// flashcards — since it affects "This PDF" context quality for any action.
function IndexControl({ indexStatus, indexProgress, chunkCount, onIndex }) {
  if (!onIndex) return null

  if (indexStatus === 'indexing') {
    const pct = indexProgress?.total ? Math.round((indexProgress.done / indexProgress.total) * 100) : 0
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Indexing page {indexProgress?.done ?? 0}/{indexProgress?.total ?? '?'}…
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (indexStatus === 'ready') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <Database size={12} />
        Indexed for full-document search ({chunkCount} passages)
      </p>
    )
  }

  return (
    <button
      onClick={onIndex}
      className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-border px-2 py-1.5 text-[11px] text-muted hover:border-accent hover:text-ink"
    >
      <Database size={12} />
      {indexStatus === 'error' ? 'Indexing failed — try again' : 'Index this PDF for smarter answers'}
    </button>
  )
}

function GroundingBadge({ grounding, usedMaterial }) {
  const fromMaterial = usedMaterial && grounding !== 'general'
  const Icon = fromMaterial ? BookOpen : Globe
  const label =
    grounding === 'material'
      ? 'Based on your study material'
      : grounding === 'mixed'
      ? 'Your material + general knowledge'
      : 'General explanation'

  return (
    <div
      className={`mb-2 inline-flex items-center gap-1.5 rounded-card px-2 py-1 text-[11px] ${
        fromMaterial ? 'bg-accent-soft text-ink' : 'border border-border text-muted'
      }`}
    >
      <Icon size={12} />
      {label}
    </div>
  )
}

function dedupeSources(sources) {
  const seen = new Set()
  return sources.filter((s) => {
    const key = `${s.document}|${s.page}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
