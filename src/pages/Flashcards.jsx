import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Layers, RotateCcw, Check, X, Trash2, Shuffle } from 'lucide-react'
import * as docStore from '../services/storage/documents.js'

// Active recall (spec §29): show the question, let the student think, then
// reveal the answer and self-grade. "Correct"/"Missed" updates the card's
// running stats rather than anything fancier (spaced repetition scheduling
// is future work — see README) — this is deliberately the simplest version
// of the mechanic that's still genuinely useful.
export default function Flashcards() {
  const { documents } = useOutletContext()

  const [cards, setCards] = useState([])
  const [filterDoc, setFilterDoc] = useState('all')
  const [shuffleKey, setShuffleKey] = useState(0)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    docStore.listFlashcards().then(setCards)
  }, [])

  const filtered = useMemo(
    () => (filterDoc === 'all' ? cards : cards.filter((c) => c.documentId === filterDoc)),
    [cards, filterDoc]
  )

  // Computed synchronously during render (not in an effect) so there's
  // never a frame where `filtered` has cards but `order` doesn't — that gap
  // is exactly what crashed the "reveal answer" card on an empty `order`
  // the moment flashcards finished loading. `shuffleKey` gives the
  // Reshuffle button a way to force a new random order without needing its
  // own effect.
  const order = useMemo(
    () => shuffle(filtered.map((_, i) => i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered.length, filterDoc, shuffleKey]
  )

  // Resets belong to switching documents, not to every incidental change in
  // `filtered` (e.g. deleting the current card) — those are handled by
  // clamping below instead, so deleting a card doesn't wipe session stats.
  useEffect(() => {
    setIndex(0)
    setRevealed(false)
    setSessionStats({ correct: 0, total: 0 })
  }, [filterDoc])

  // Clamp defensively: if a card was deleted, `order` may be shorter than
  // `index` now points to.
  const current = order.length > 0 ? filtered[order[index % order.length]] : null

  function next() {
    setRevealed(false)
    setIndex((i) => (i + 1) % order.length)
  }

  async function grade(wasCorrect) {
    if (!current) return
    await docStore.recordFlashcardReview(current.id, wasCorrect)
    setCards((prev) =>
      prev.map((c) =>
        c.id === current.id
          ? { ...c, reviews: c.reviews + 1, correct: c.correct + (wasCorrect ? 1 : 0) }
          : c
      )
    )
    setSessionStats((s) => ({ correct: s.correct + (wasCorrect ? 1 : 0), total: s.total + 1 }))
    next()
  }

  async function handleDelete(id) {
    await docStore.deleteFlashcard(id)
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  function reshuffle() {
    setShuffleKey((k) => k + 1)
    setIndex(0)
    setRevealed(false)
  }

  const documentTitle = (docId) => documents.find((d) => d.id === docId)?.title

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="serif text-2xl font-semibold">Flashcards</h1>
        <select
          value={filterDoc}
          onChange={(e) => setFilterDoc(e.target.value)}
          className="rounded-card border border-border bg-paper px-2 py-1.5 text-sm outline-none"
        >
          <option value="all">All documents ({cards.length})</option>
          {documents
            .filter((d) => cards.some((c) => c.documentId === d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({cards.filter((c) => c.documentId === d.id).length})
              </option>
            ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-16 text-center text-muted">
          <Layers className="mx-auto mb-3" size={26} />
          <p className="text-sm">
            No flashcards yet. Select text in a PDF and choose{' '}
            <span className="font-medium text-ink">Flashcards</span> from the AI toolbar.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-center text-xs text-muted">
            Card {index + 1} of {order.length}
            {sessionStats.total > 0 && ` · ${sessionStats.correct}/${sessionStats.total} correct this session`}
          </p>

          <button
            onClick={() => setRevealed((r) => !r)}
            className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-card border border-border bg-surface p-6 text-center shadow-sm transition-transform active:scale-[0.99]"
          >
            {!revealed ? (
              <>
                <p className="text-lg font-medium leading-relaxed">{current.front}</p>
                <p className="mt-4 text-xs text-muted">Tap to reveal answer</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">{current.front}</p>
                <div className="my-3 h-px w-16 bg-border" />
                <p className="text-lg leading-relaxed">{current.back}</p>
              </>
            )}
          </button>

          {current.documentId && (
            <p className="mt-2 text-center text-xs text-muted">
              {documentTitle(current.documentId)}
              {current.pageNumber ? ` — page ${current.pageNumber}` : ''}
            </p>
          )}

          <div className="mt-4 flex items-center justify-center gap-2">
            {revealed ? (
              <>
                <button
                  onClick={() => grade(false)}
                  className="flex items-center gap-1.5 rounded-card border border-red-300 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
                >
                  <X size={15} /> Missed it
                </button>
                <button
                  onClick={() => grade(true)}
                  className="flex items-center gap-1.5 rounded-card border border-green-300 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-500/10"
                >
                  <Check size={15} /> Got it
                </button>
              </>
            ) : (
              <button
                onClick={next}
                className="flex items-center gap-1.5 rounded-card border border-border px-4 py-2 text-sm text-muted hover:bg-accent-soft hover:text-ink"
              >
                Skip
              </button>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border pt-3">
            <button
              onClick={reshuffle}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <Shuffle size={13} /> Reshuffle
            </button>
            <button
              onClick={() => handleDelete(current.id)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500"
            >
              <Trash2 size={13} /> Delete this card
            </button>
          </div>

          {current.reviews > 0 && (
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-muted">
              <RotateCcw size={11} />
              Reviewed {current.reviews} time{current.reviews === 1 ? '' : 's'} · {current.correct}/
              {current.reviews} correct overall
            </p>
          )}
        </>
      )}
    </div>
  )
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
