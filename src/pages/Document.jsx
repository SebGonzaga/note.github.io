import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, X, PanelLeft } from 'lucide-react'
import Toolbar from '../components/toolbar/Toolbar.jsx'
import PdfPage from '../components/pdf/PdfPage.jsx'
import PdfThumbnail from '../components/pdf/PdfThumbnail.jsx'
import Button from '../components/common/Button.jsx'
import { loadPdf } from '../services/pdf/pdfjs.js'
import { useHistory } from '../hooks/useHistory.js'
import { TOOL_DEFAULTS } from '../utils/toolDefaults.js'
import * as docStore from '../services/storage/documents.js'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function Document() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [doc, setDoc] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [error, setError] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [showThumbnails, setShowThumbnails] = useState(true)

  const [tool, setTool] = useState('select')
  const [toolSettingsMap, setToolSettingsMap] = useState(TOOL_DEFAULTS)
  const [strokeSelectionCount, setStrokeSelectionCount] = useState(0)
  const [elementSelectionCount, setElementSelectionCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const canvasApiRef = useRef(null)
  const elementsApiRef = useRef(null)
  const scrollRef = useRef(null)
  const saveTimerRef = useRef(null)
  const pendingRef = useRef(null)
  const skipNextSaveRef = useRef(false)

  const historyRef = useRef(null)
  const history = useHistory([])
  historyRef.current = history

  // --- Load document + PDF ------------------------------------------------

  useEffect(() => {
    let cancelled = false
    setPdfDoc(null)
    setError(null)

    ;(async () => {
      const record = await docStore.getDocument(id)
      if (!record) {
        if (!cancelled) setError('This document no longer exists.')
        return
      }
      const blob = await docStore.getDocumentFile(id)
      if (!blob) {
        if (!cancelled) setError('The file for this document is missing.')
        return
      }
      try {
        const loaded = await loadPdf(blob)
        if (cancelled) return
        setDoc(record)
        setPdfDoc(loaded)
        setPageNumber(1)
      } catch {
        if (!cancelled) setError("This PDF couldn't be opened. It may be corrupted or password-protected.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  // Annotations are loaded per page and kept in the same undo/redo history
  // the notebook editor uses, so Ctrl+Z behaves identically in both places.
  // Switching pages resets history — undo doesn't reach across pages.
  useEffect(() => {
    let cancelled = false
    docStore.getPageAnnotations(id, pageNumber).then((elements) => {
      if (cancelled) return
      // Seeding history from storage shouldn't count as an edit, or merely
      // paging through a document would rewrite every page and keep bumping
      // the document's "last updated" time.
      skipNextSaveRef.current = true
      historyRef.current.reset(elements)
      setStrokeSelectionCount(0)
      setElementSelectionCount(0)
    })
    return () => {
      cancelled = true
    }
  }, [id, pageNumber])

  // Debounced persistence, matching the notebook editor's approach.
  //
  // `pendingRef` holds the most recent unsaved state along with the page it
  // belongs to. Without it, flipping pages within the debounce window would
  // cancel the timer and silently drop that page's last edit — so the
  // effect below flushes any pending write before the page changes.
  useEffect(() => {
    if (!pdfDoc) return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    pendingRef.current = { documentId: id, pageNumber, elements: history.value }
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      docStore.setPageAnnotations(pending.documentId, pending.pageNumber, pending.elements)
    }, 400)
    return () => clearTimeout(saveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.value])

  // Flush an unsaved edit when the page or document changes (cleanup runs
  // while `pendingRef` still points at the page being left) and on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      docStore.setPageAnnotations(pending.documentId, pending.pageNumber, pending.elements)
    }
  }, [id, pageNumber])

  // --- Keyboard shortcuts --------------------------------------------------

  useEffect(() => {
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
      if (typing) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowSearch(true)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') {
        canvasApiRef.current?.deleteSelected()
        elementsApiRef.current?.deleteSelected()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToPage(pageNumber + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPage(pageNumber - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, tool, pageNumber, pdfDoc])

  const goToPage = useCallback(
    (next) => {
      if (!pdfDoc) return
      const clamped = Math.min(Math.max(next, 1), pdfDoc.numPages)
      setPageNumber(clamped)
      scrollRef.current?.scrollTo({ top: 0 })
    },
    [pdfDoc]
  )

  // --- In-document search --------------------------------------------------
  // Scans page text via pdf.js. Results are page-level ("this page contains
  // your term") with a short surrounding snippet, which is enough to jump to
  // the right page. Match-level highlighting can layer on later using the
  // same text layer that already powers selection.

  async function runSearch(e) {
    e?.preventDefault()
    const query = searchQuery.trim()
    if (!query || !pdfDoc) return
    setSearching(true)
    const needle = query.toLowerCase()
    const found = []

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p)
      const content = await page.getTextContent()
      const text = content.items.map((i) => i.str).join(' ')
      const index = text.toLowerCase().indexOf(needle)
      if (index !== -1) {
        const start = Math.max(0, index - 40)
        found.push({
          page: p,
          snippet: `${start > 0 ? '…' : ''}${text.slice(start, index + needle.length + 40).trim()}…`
        })
      }
    }

    setSearchResults(found)
    setSearching(false)
  }

  function updateToolSettings(patch) {
    setToolSettingsMap((prev) => ({ ...prev, [tool]: { ...prev[tool], ...patch } }))
  }

  const annotationCount = useMemo(
    () => history.value.filter((el) => el.type === 'highlight').length,
    [history.value]
  )

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="mb-4 text-sm text-muted">{error}</p>
        <Button size="sm" onClick={() => navigate('/documents')}>
          Back to documents
        </Button>
      </div>
    )
  }

  if (!pdfDoc || !doc) {
    return <p className="px-6 py-16 text-center text-sm text-muted">Opening document…</p>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <button
          aria-label="Toggle page thumbnails"
          onClick={() => setShowThumbnails((v) => !v)}
          className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <PanelLeft size={16} />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted">
            {pdfDoc.numPages} page{pdfDoc.numPages === 1 ? '' : 's'}
            {annotationCount > 0 && ` · ${annotationCount} highlight${annotationCount === 1 ? '' : 's'} on this page`}
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button
            aria-label="Previous page"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            value={pageNumber}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) goToPage(n)
            }}
            className="w-12 rounded-card border border-border bg-paper px-2 py-1 text-center text-sm outline-none"
          />
          <span className="text-xs text-muted">/ {pdfDoc.numPages}</span>
          <button
            aria-label="Next page"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= pdfDoc.numPages}
            className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-l border-border pl-2">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)] ?? z)}
            className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
          >
            <ZoomOut size={16} />
          </button>
          <span className="w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() =>
              setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)] ?? z)
            }
            className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <button
          aria-label="Search in document"
          onClick={() => setShowSearch((v) => !v)}
          className="rounded-card border border-border p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <Search size={15} />
        </button>
      </div>

      <Toolbar
        tool={tool}
        setTool={setTool}
        settings={toolSettingsMap[tool] || {}}
        updateSettings={updateToolSettings}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        selectionCount={strokeSelectionCount + elementSelectionCount}
        onDeleteSelection={() => {
          canvasApiRef.current?.deleteSelected()
          elementsApiRef.current?.deleteSelected()
        }}
        onInsertImage={(src, w, h) => elementsApiRef.current?.addImage(src, w, h)}
      />

      <div className="flex flex-1 overflow-hidden">
        {showThumbnails && (
          <div className="w-36 shrink-0 overflow-y-auto border-r border-border bg-surface p-2">
            {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => goToPage(n)}
                className={`mb-2 w-full rounded-card border p-1 text-left ${
                  n === pageNumber ? 'border-accent bg-accent-soft' : 'border-border hover:bg-accent-soft'
                }`}
              >
                <PdfThumbnail pdfDoc={pdfDoc} pageNumber={n} />
                <span className="mt-1 block text-center text-xs text-muted">{n}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-auto bg-paper p-6">
          <PdfPage
            key={pageNumber}
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            zoom={zoom}
            tool={tool}
            toolSettings={toolSettingsMap[tool] || {}}
            textDefaults={toolSettingsMap.text}
            elements={history.value}
            onChange={history.commit}
            onStrokeSelectionChange={setStrokeSelectionCount}
            onElementSelectionChange={setElementSelectionCount}
            canvasRef={canvasApiRef}
            elementsRef={elementsApiRef}
            isActive
          />
        </div>

        {showSearch && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-3">
            <div className="mb-3 flex items-center gap-2">
              <form onSubmit={runSearch} className="flex-1">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search this document…"
                  className="w-full rounded-card border border-border bg-paper px-2 py-1.5 text-sm outline-none"
                />
              </form>
              <button
                aria-label="Close search"
                onClick={() => {
                  setShowSearch(false)
                  setSearchResults(null)
                }}
                className="rounded-card p-1 text-muted hover:bg-accent-soft"
              >
                <X size={15} />
              </button>
            </div>

            {searching && <p className="text-xs text-muted">Searching…</p>}

            {!searching && searchResults && (
              <>
                <p className="mb-2 text-xs text-muted">
                  {searchResults.length} page{searchResults.length === 1 ? '' : 's'} matched
                </p>
                {searchResults.map((r) => (
                  <button
                    key={r.page}
                    onClick={() => goToPage(r.page)}
                    className="mb-2 w-full rounded-card border border-border p-2 text-left hover:bg-accent-soft"
                  >
                    <span className="text-xs font-medium">Page {r.page}</span>
                    <p className="mt-1 line-clamp-3 text-xs text-muted">{r.snippet}</p>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
