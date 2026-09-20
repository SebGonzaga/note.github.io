import { useState } from 'react'
import { X, Check, XCircle, RotateCcw, ChevronRight } from 'lucide-react'

// Takes a saved quiz one question at a time: pick an answer, check it,
// read the explanation, move on.
//
// Two layouts, controlled by `floating`:
//  - false (default): docked side panel — full-screen on mobile, a fixed
//    384px column on desktop. Used inside Document.jsx's flex-row layout,
//    matching AiPanel's responsive pattern.
//  - true: a centered modal card at any screen size. Used from the
//    standalone /quizzes library page, which isn't a flex-row layout for a
//    docked panel to sit inside, and where "retake" is its own focused
//    moment rather than something happening alongside a document.
export default function QuizPanel({ quiz, onClose, onComplete, floating = false }) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null) // chosen option, or typed text for identification
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const question = quiz.questions[index]
  const isLast = index === quiz.questions.length - 1
  const isCorrect = checked && normalize(selected) === normalize(question.correctAnswer)

  function check() {
    if (selected === null || (typeof selected === 'string' && selected.trim() === '')) return
    setChecked(true)
    if (normalize(selected) === normalize(question.correctAnswer)) setScore((s) => s + 1)
  }

  function next() {
    if (isLast) {
      // `score` already reflects this question — it's incremented inside
      // check() before next() can be reached.
      setFinished(true)
      onComplete(score, quiz.questions.length)
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setChecked(false)
  }

  function restart() {
    setIndex(0)
    setSelected(null)
    setChecked(false)
    setScore(0)
    setFinished(false)
  }

  const panel = (
    <div
      className={
        floating
          ? 'flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-border bg-surface shadow-xl'
          : 'fixed inset-0 z-30 flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface lg:static lg:inset-auto lg:z-auto lg:w-96 lg:shrink-0'
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">{quiz.title}</p>
        <div className="flex-1" />
        {!finished && (
          <span className="text-xs text-muted">
            {index + 1} / {quiz.questions.length}
          </span>
        )}
        <button
          aria-label="Close quiz"
          onClick={onClose}
          className="rounded-card p-1 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {finished ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-3xl font-semibold">
              {score}/{quiz.questions.length}
            </p>
            <p className="mt-1 text-sm text-muted">
              {Math.round((score / quiz.questions.length) * 100)}% correct
            </p>
            <button
              onClick={restart}
              className="mt-5 flex items-center gap-1.5 rounded-card border border-border px-3 py-1.5 text-sm text-ink hover:bg-accent-soft"
            >
              <RotateCcw size={14} /> Retake
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm font-medium leading-relaxed">{question.prompt}</p>

            {question.type === 'identification' ? (
              <input
                value={selected ?? ''}
                onChange={(e) => !checked && setSelected(e.target.value)}
                disabled={checked}
                placeholder="Type your answer…"
                className="w-full rounded-card border border-border bg-paper px-3 py-2 text-sm outline-none disabled:opacity-70"
              />
            ) : (
              <div className="flex flex-col gap-2">
                {question.options.map((opt) => {
                  const isSelected = selected === opt
                  const isThisCorrect = checked && normalize(opt) === normalize(question.correctAnswer)
                  const isThisWrong = checked && isSelected && !isThisCorrect
                  return (
                    <button
                      key={opt}
                      onClick={() => !checked && setSelected(opt)}
                      disabled={checked}
                      className={`flex items-center justify-between rounded-card border px-3 py-2 text-left text-sm transition-colors ${
                        isThisCorrect
                          ? 'border-green-400 bg-green-500/10'
                          : isThisWrong
                          ? 'border-red-400 bg-red-500/10'
                          : isSelected
                          ? 'border-accent bg-accent-soft'
                          : 'border-border hover:bg-accent-soft'
                      }`}
                    >
                      {opt}
                      {isThisCorrect && <Check size={15} className="text-green-600" />}
                      {isThisWrong && <XCircle size={15} className="text-red-500" />}
                    </button>
                  )
                })}
              </div>
            )}

            {checked && (
              <div
                className={`mt-3 rounded-card border p-2.5 text-xs ${
                  isCorrect ? 'border-green-400 bg-green-500/10 text-green-700' : 'border-red-400 bg-red-500/10 text-red-600'
                }`}
              >
                <p className="mb-1 font-medium">
                  {isCorrect ? 'Correct' : `Not quite — correct answer: ${question.correctAnswer}`}
                </p>
                {question.explanation && <p className="text-ink/80">{question.explanation}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {!finished && (
        <div className="border-t border-border p-3">
          {checked ? (
            <button
              onClick={next}
              className="flex w-full items-center justify-center gap-1.5 rounded-card bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {isLast ? 'See results' : 'Next question'} <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={check}
              disabled={selected === null || (typeof selected === 'string' && selected.trim() === '')}
              className="w-full rounded-card border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-ink hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check answer
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (!floating) return panel

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{panel}</div>
    </div>
  )
}

function normalize(v) {
  return String(v ?? '').trim().toLowerCase()
}
