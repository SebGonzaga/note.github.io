import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate, Link } from 'react-router-dom'
import {
  Sun,
  Moon,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Trash2,
  Loader2,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import { isAiConfigured } from '../services/ai/aiService.js'
import { getUsage } from '../services/ai/serverUsage.js'
import { signOut, deleteAccount } from '../services/auth/authService.js'
import { exportBackup, downloadBackup, importBackup, BackupError } from '../services/storage/backup.js'

export default function Settings() {
  const { theme, toggleTheme, notebooks, documents, auth, refresh, refreshDocuments } =
    useOutletContext()
  const navigate = useNavigate()
  const [usage, setUsage] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [exportState, setExportState] = useState({ busy: false, stage: null, error: null })
  const [importState, setImportState] = useState({ busy: false, stage: null, error: null, result: null })

  const totalPages = notebooks?.length ?? 0
  const totalDocs = documents?.length ?? 0
  const configured = isAiConfigured()

  function loadUsage() {
    if (!auth?.isSignedIn) return
    setUsageLoading(true)
    getUsage()
      .then(setUsage)
      .finally(() => setUsageLoading(false))
  }

  useEffect(() => {
    loadUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isSignedIn])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
      navigate('/')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  async function handleExport() {
    setExportState({ busy: true, stage: 'reading', error: null })
    try {
      const blob = await exportBackup({
        onProgress: (p) => setExportState((s) => ({ ...s, stage: p.stage }))
      })
      downloadBackup(blob)
      setExportState({ busy: false, stage: null, error: null })
    } catch (err) {
      setExportState({ busy: false, stage: null, error: err?.message || 'Export failed.' })
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file if they retry
    if (!file) return

    setImportState({ busy: true, stage: 'reading', error: null, result: null })
    try {
      const result = await importBackup(file, {
        onProgress: (p) => setImportState((s) => ({ ...s, stage: p.stage }))
      })
      setImportState({ busy: false, stage: null, error: null, result })
      // The library/document lists in the sidebar and Home came from
      // App.jsx's state, loaded once on mount — refresh them so the
      // restored notebooks/PDFs actually show up without a manual reload.
      await Promise.all([refresh?.(), refreshDocuments?.()])
    } catch (err) {
      const message =
        err instanceof BackupError ? err.message : err?.message || 'Restore failed. The file may be corrupted.'
      setImportState({ busy: false, stage: null, error: message, result: null })
    }
  }

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
          Account
        </h2>

        {auth?.loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : auth?.isSignedIn ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{auth.user.email}</p>
                <p className="text-xs text-muted">Signed in</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut size={14} /> Sign out
              </Button>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted">
                Deleting your account removes your profile and AI usage history immediately.
                Notebooks, PDFs, and annotations currently live only in this browser's storage
                (see the Storage section below) and aren't touched by this — cloud sync for that
                data is coming in a later phase.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmingDelete(true)
                  setDeleteError(null)
                }}
              >
                <Trash2 size={14} /> Delete account
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              Sign in to use AI features and, eventually, sync across devices.
            </p>
            <div className="flex shrink-0 gap-2">
              <Link to="/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Storage
        </h2>
        <p className="text-sm text-muted">
          Notebooks, PDFs, and annotations are stored locally in this browser's IndexedDB —{' '}
          {totalPages} notebook{totalPages === 1 ? '' : 's'} and {totalDocs} PDF
          {totalDocs === 1 ? '' : 's'} saved so far. This works fully offline and needs no
          account; it also means this data is specific to this browser until cloud sync lands.
        </p>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium">Backup</p>
          <p className="mb-3 text-xs text-muted">
            Download everything as a file you control — clearing browser data, switching
            browsers, or getting a new device all wipe local storage with no way to get it back.
            A backup is the safety net for that, independent of any account.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exportState.busy}>
              {exportState.busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exportState.busy ? exportProgressLabel(exportState.stage) : 'Download backup'}
            </Button>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-card border border-border px-2.5 py-1.5 text-sm text-ink hover:bg-accent-soft">
              {importState.busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importState.busy ? importProgressLabel(importState.stage) : 'Restore from backup'}
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={importState.busy}
                onChange={handleImportFile}
              />
            </label>
          </div>

          {exportState.error && <p className="mt-2 text-xs text-red-500">{exportState.error}</p>}
          {importState.error && <p className="mt-2 text-xs text-red-500">{importState.error}</p>}
          {importState.result && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 size={13} />
              Restored {importState.result.notebooks} notebook
              {importState.result.notebooks === 1 ? '' : 's'}, {importState.result.documents} PDF
              {importState.result.documents === 1 ? '' : 's'}, {importState.result.flashcards}{' '}
              flashcard{importState.result.flashcards === 1 ? '' : 's'}, and{' '}
              {importState.result.quizzes} quiz{importState.result.quizzes === 1 ? '' : 'zes'} as
              new items in your library.
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Restoring always adds new copies rather than overwriting what's already here, so
            it's safe to import into a library that already has data. RAG indexes aren't
            included in backups (they're regenerable from the PDF itself) — re-index a restored
            PDF from its AI panel if you want "This PDF" search back.
          </p>
        </div>
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
                ? 'Sign in, then select text in a PDF to explain, simplify, or translate it.'
                : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env, then deploy the Edge Functions. Everything else works without it.'}
            </p>
          </div>
        </div>

        {!auth?.isSignedIn ? (
          <p className="border-t border-border pt-3 text-sm text-muted">
            <Link to="/login" className="text-accent hover:underline">
              Sign in
            </Link>{' '}
            to see your usage.
          </p>
        ) : usage ? (
          <>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-medium">
                  AI requests this month: {usage.used} / {usage.limit}
                </p>
                <p className="text-xs text-muted">
                  {usage.planName} plan. Resets at the start of each month.
                </p>
              </div>
              <button
                aria-label="Refresh usage"
                onClick={loadUsage}
                className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
              >
                <RefreshCw size={14} className={usageLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
              />
            </div>

            <p className="mt-3 text-xs text-muted">
              This is your real usage, enforced server-side — not a number this browser is just
              trusting itself about.
            </p>
          </>
        ) : (
          <p className="border-t border-border pt-3 text-sm text-muted">
            {usageLoading ? 'Loading…' : 'Usage unavailable right now.'}
          </p>
        )}
      </section>

      {confirmingDelete && (
        <Modal
          title="Delete your account?"
          onClose={() => !deleting && setConfirmingDelete(false)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete account
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">
            This permanently deletes your profile and AI usage history. This can't be undone.
          </p>
          {deleteError && <p className="mt-2 text-sm text-red-500">{deleteError}</p>}
        </Modal>
      )}
    </div>
  )
}

function exportProgressLabel(stage) {
  if (stage === 'reading-file') return 'Reading PDFs…'
  if (stage === 'compressing') return 'Compressing…'
  return 'Reading data…'
}

function importProgressLabel(stage) {
  const labels = {
    reading: 'Opening file…',
    folders: 'Restoring folders…',
    notebooks: 'Restoring notebooks…',
    pages: 'Restoring pages…',
    documents: 'Restoring documents…',
    files: 'Restoring PDFs…',
    annotations: 'Restoring annotations…',
    flashcards: 'Restoring flashcards…',
    quizzes: 'Restoring quizzes…'
  }
  return labels[stage] || 'Restoring…'
}
