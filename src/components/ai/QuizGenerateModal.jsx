import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'

const COUNT_OPTIONS = [5, 10, 20] // spec §28
const TYPE_OPTIONS = [
  { id: 'multiple_choice', label: 'Multiple choice' },
  { id: 'true_false', label: 'True / False' },
  { id: 'identification', label: 'Identification' }
]

export default function QuizGenerateModal({ onClose, onGenerate, generating, error, errorCode }) {
  const [count, setCount] = useState(10)
  const [scope, setScope] = useState('page')
  const [types, setTypes] = useState(['multiple_choice', 'true_false'])

  function toggleType(id) {
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  return (
    <Modal
      title="Generate a quiz"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={generating || types.length === 0}
            onClick={() => onGenerate({ count, scope, questionTypes: types })}
          >
            {generating && <Loader2 size={14} className="animate-spin" />}
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">From</p>
          <div className="flex gap-2">
            {[
              { id: 'page', label: 'This page' },
              { id: 'document', label: 'Whole document (sampled)' }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`flex-1 rounded-card border px-3 py-2 text-sm ${
                  scope === s.id ? 'border-accent bg-accent-soft text-ink' : 'border-border text-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Number of questions</p>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex-1 rounded-card border px-3 py-2 text-sm ${
                  count === n ? 'border-accent bg-accent-soft text-ink' : 'border-border text-muted'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Question types</p>
          <div className="flex flex-col gap-1.5">
            {TYPE_OPTIONS.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 rounded-card border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={types.includes(t.id)}
                  onChange={() => toggleType(t.id)}
                  className="accent-accent"
                />
                {t.label}
              </label>
            ))}
          </div>
          {types.length === 0 && (
            <p className="mt-1 text-xs text-red-500">Pick at least one question type.</p>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-500">
            <p>{error}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
