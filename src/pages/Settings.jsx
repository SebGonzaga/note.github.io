import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Sun, Moon, CheckCircle2, Download, Upload, Loader2 } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import { exportBackup, downloadBackup, importBackup, BackupError } from '../services/storage/backup.js'

export default function Settings() {
  const { theme, toggleTheme, notebooks, documents, refresh, refreshDocuments } = useOutletContext()
  const [exportState, setExportState] = useState({ busy: false, stage: null, error: null })
  const [importState, setImportState] = useState({ busy: false, stage: null, error: null, result: null })

  const totalPages = notebooks?.length ?? 0
  const totalDocs = documents?.length ?? 0

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
          Storage
        </h2>
        <p className="text-sm text-muted">
          Notebooks, PDFs, and annotations are stored locally in this browser's IndexedDB —{' '}
          {totalPages} notebook{totalPages === 1 ? '' : 's'} and {totalDocs} PDF
          {totalDocs === 1 ? '' : 's'} saved so far. There's no account and nothing syncs —
          this data belongs to this browser, on this device, only.
        </p>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium">Backup</p>
          <p className="mb-3 text-xs text-muted">
            Download everything as a file you control — clearing browser data, switching
            browsers, or getting a new device all wipe local storage with no way to get it
            back. With no account and no cloud sync, this backup is the only safety net —
            worth doing before anything risky (clearing site data, a browser update, a new
            device).
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

        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-medium">No sign-in required</p>
            <p className="text-xs text-muted">
              Select text in a PDF to explain, simplify, translate, or turn it into
              flashcards and quizzes. AI requests go through this app's own server, which
              keeps the API key private — there's no account and no per-user usage limit;
              if a request is ever rejected as rate-limited, just wait a moment and retry.
            </p>
          </div>
        </div>
      </section>
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
