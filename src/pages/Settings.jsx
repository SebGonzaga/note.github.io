import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Sun, Moon, CheckCircle2, AlertCircle } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import { isAiConfigured } from '../services/ai/aiService.js'
import { getUsage, resetUsage } from '../services/ai/usage.js'

export default function Settings() {
  const { theme, toggleTheme, notebooks, documents } = useOutletContext()
  const [usage, setUsage] = useState(() => getUsage())

  const totalPages = notebooks?.length ?? 0
  const totalDocs = documents?.length ?? 0
  const configured = isAiConfigured()

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
          {totalPages === 1 ? '' : 's'} and {totalDocs} PDF{totalDocs === 1 ? '' : 's'} saved
          so far. No account or internet connection is required to open your notes.
        </p>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">AI</h2>

        <div className="mb-4 flex items-start gap-2">
          {configured ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-medium">
              {configured ? 'Connected' : 'Not configured'}
            </p>
            <p className="text-xs text-muted">
              {configured
                ? 'Select text in a PDF to explain, simplify, or translate it.'
                : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env, then deploy the gemini-explain function. Everything else works without it.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium">
              AI requests this month: {usage.used} / {usage.limit}
            </p>
            <p className="text-xs text-muted">
              {usage.planName} plan. Resets at the start of each month.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetUsage()
              setUsage(getUsage())
            }}
          >
            Reset counter
          </Button>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
          />
        </div>

        <p className="mt-3 text-xs text-muted">
          Usage is currently counted in this browser only, which shapes cost during
          development but is not a security control. Server-side enforcement arrives with
          accounts in a later phase.
        </p>
      </section>
    </div>
  )
}
