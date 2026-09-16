import { useOutletContext } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import Button from '../components/common/Button.jsx'

export default function Settings() {
  const { theme, toggleTheme, notebooks } = useOutletContext()

  const totalPages = notebooks?.length ?? 0

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="serif mb-6 text-2xl font-semibold">Settings</h1>

      <section className="mb-8 rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          General
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted">Switch between light and dark mode.</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
        </div>
      </section>

      <section className="mb-8 rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Storage
        </h2>
        <p className="text-sm text-muted">
          Everything is stored locally in this browser's IndexedDB — {totalPages} notebook
          {totalPages === 1 ? '' : 's'} saved so far. No account or internet connection is
          required to open your notes.
        </p>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          AI (coming in a later phase)
        </h2>
        <p className="text-sm text-muted">
          AI-powered explanations, flashcards, and quizzes will appear here once a provider
          is connected. The notebook works fully without one.
        </p>
      </section>
    </div>
  )
}
