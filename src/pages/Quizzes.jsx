import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ListChecks, Trash2, Play } from 'lucide-react'
import * as docStore from '../services/storage/documents.js'
import QuizPanel from '../components/ai/QuizPanel.jsx'

export default function Quizzes() {
  const { documents } = useOutletContext()
  const [quizzes, setQuizzes] = useState([])
  const [filterDoc, setFilterDoc] = useState('all')
  const [active, setActive] = useState(null)

  useEffect(() => {
    docStore.listQuizzes().then(setQuizzes)
  }, [])

  const filtered = useMemo(
    () => (filterDoc === 'all' ? quizzes : quizzes.filter((q) => q.documentId === filterDoc)),
    [quizzes, filterDoc]
  )

  async function handleDelete(id) {
    await docStore.deleteQuiz(id)
    setQuizzes((prev) => prev.filter((q) => q.id !== id))
  }

  async function handleComplete(quizId, score, total) {
    const updated = await docStore.recordQuizAttempt(quizId, { score, total })
    if (updated) setQuizzes((prev) => prev.map((q) => (q.id === quizId ? updated : q)))
  }

  const documentTitle = (docId) => documents.find((d) => d.id === docId)?.title

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="serif text-2xl font-semibold">Quizzes</h1>
        <select
          value={filterDoc}
          onChange={(e) => setFilterDoc(e.target.value)}
          className="rounded-card border border-border bg-paper px-2 py-1.5 text-sm outline-none"
        >
          <option value="all">All documents ({quizzes.length})</option>
          {documents
            .filter((d) => quizzes.some((q) => q.documentId === d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({quizzes.filter((q) => q.documentId === d.id).length})
              </option>
            ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-16 text-center text-muted">
          <ListChecks className="mx-auto mb-3" size={26} />
          <p className="text-sm">
            No quizzes yet. Open a PDF and use the{' '}
            <ListChecks className="inline" size={13} /> button in its toolbar to generate one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((q) => {
            const lastAttempt = q.attempts[q.attempts.length - 1]
            const bestAttempt = q.attempts.reduce(
              (best, a) => (!best || a.score / a.total > best.score / best.total ? a : best),
              null
            )
            return (
              <div
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="text-xs text-muted">
                    {q.questions.length} questions
                    {q.documentId && ` · ${documentTitle(q.documentId)}`}
                    {q.attempts.length > 0 &&
                      ` · last ${lastAttempt.score}/${lastAttempt.total}${
                        bestAttempt && bestAttempt !== lastAttempt
                          ? ` (best ${bestAttempt.score}/${bestAttempt.total})`
                          : ''
                      }`}
                    {q.attempts.length === 0 && ' · not taken yet'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setActive(q)}
                    className="flex items-center gap-1.5 rounded-card border border-accent bg-accent-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-accent hover:text-white"
                  >
                    <Play size={13} /> {q.attempts.length > 0 ? 'Retake' : 'Start'}
                  </button>
                  <button
                    aria-label="Delete quiz"
                    onClick={() => handleDelete(q.id)}
                    className="rounded-card p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active && (
        <QuizPanel
          quiz={active}
          floating
          onClose={() => setActive(null)}
          onComplete={(score, total) => handleComplete(active.id, score, total)}
        />
      )}
    </div>
  )
}
