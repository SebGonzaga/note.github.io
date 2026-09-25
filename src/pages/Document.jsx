import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, X, PanelLeft, ListChecks } from 'lucide-react'
import Toolbar from '../components/toolbar/Toolbar.jsx'
import PdfPage from '../components/pdf/PdfPage.jsx'
import PdfThumbnail from '../components/pdf/PdfThumbnail.jsx'
import Button from '../components/common/Button.jsx'
import AiPanel from '../components/ai/AiPanel.jsx'
import QuizGenerateModal from '../components/ai/QuizGenerateModal.jsx'
import QuizPanel from '../components/ai/QuizPanel.jsx'
import { loadPdf } from '../services/pdf/pdfjs.js'
import * as ai from '../services/ai/aiService.js'
import { buildPdfContext, getPageText, getDocumentSampleText, DEFAULT_CONTEXT_MODE } from '../services/ai/context.js'
import { indexDocument } from '../services/ai/rag.js'
import { useHistory } from '../hooks/useHistory.js'
import { useNeatWriting } from '../hooks/useNeatWriting.js'
import { STICKER_SIZE } from '../utils/stickers.js'
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
  const [zoom, setZoom] = useState(() => (window.innerWidth < 640 ? 0.75 : 1))
  const [showThumbnails, setShowThumbnails] = useState(() => window.innerWidth >= 1024)

  const [tool, setTool] = useState('select')
  const [toolSettingsMap, setToolSettingsMap] = useState(TOOL_DEFAULTS)
  const [strokeSelectionCount, setStrokeSelectionCount] = useState(0)
  const [elementSelectionCount, setElementSelectionCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  // AI state. `lastRequestRef` holds everything needed to replay the last
  // call, which is what powers both "Try again" and follow-up questions
  // (a follow-up is the same selection and context with a question added).
  const [aiState, setAiState] = useState(null) // { status, mode, selectedText, result, error }
  const [contextMode, setContextMode] = useState(DEFAULT_CONTEXT_MODE)
  const [indexProgress, setIndexProgress] = useState(null) // { done, total }
  const [indexStatus, setIndexStatus] = useState('none') // 'none' | 'indexing' | 'ready' | 'error'
  const [chunkCount, setChunkCount] = useState(0)
  const lastRequestRef = useRef(null)

  // Quiz state. `showQuizModal` is the config step; `quiz` is the generated
  // (and already-saved) quiz being taken; `quizGenError` surfaces a
  // generation failure back into the still-open modal rather than losing
  // it behind a closed dialog.
  const [showQuizModal, setShowQuizModal] = useState(false)
  const [quizGenerating, setQuizGenerating] = useState(false)
  const [quizGenError, setQuizGenError] = useState(null)
  const [quizGenErrorCode, setQuizGenErrorCode] = useState(null)
  const [quiz, setQuiz] = useState(null)

  const canvasApiRef = useRef(null)
  const elementsApiRef = useRef(null)
  const scrollRef = useRef(null)
  const saveTimerRef = useRef(null)
  const pendingRef = useRef(null)
  const skipNextSaveRef = useRef(false)

  const historyRef = useRef(null)
  const [neat, updateNeat] = useNeatWriting()
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
        setIndexStatus(record.indexStatus || 'none')
        setChunkCount(record.chunkCount || 0)
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
      } else if (e.key === 'Escape') {
        setAiState(null)
        setShowSearch(false)
        setQuiz(null)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setAiState(null)
        setQuiz(null)
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

  // --- AI: highlight → explain --------------------------------------------
  // The signature interaction. Gather context around the selection, call the
  // Edge Function through the AI service, and show the result.

  const runAi = useCallback(
    async ({ text, action, followUp }) => {
      if (!pdfDoc || !doc) return

      setShowSearch(false)
      setQuiz(null)
      setAiState({ status: 'loading', mode: followUp ? 'followUp' : action, selectedText: text })

      try {
        const { context, sources } = await buildPdfContext({
          pdfDoc,
          documentId: id,
          pageNumber,
          selectedText: text,
          documentTitle: doc.title,
          contextMode,
          indexStatus
        })

        const request = { selectedText: text, context, sources, contextMode }
        lastRequestRef.current = { text, action, request }

        let result
        if (followUp) {
          result = await ai.askQuestion({ ...request, mode: action }, followUp)
        } else if (action === 'explain') {
          result = await ai.explainSelection(request)
        } else if (action === 'simplify') {
          result = await ai.simplifySelection(request)
        } else if (action === 'inContext') {
          result = await ai.explainInContext(request)
        } else if (action === 'notes') {
          result = await ai.makeNotes(request)
        } else if (action === 'translate') {
          result = await ai.translate(request, navigator.language || 'English')
        } else if (action === 'flashcards') {
          result = await ai.generateFlashcards(request, 5)
        } else {
          throw new ai.AiError(`Unknown action "${action}".`)
        }

        setAiState({
          status: 'done',
          mode: followUp ? 'followUp' : action,
          selectedText: text,
          result
        })
      } catch (err) {
        setAiState({
          status: 'error',
          mode: followUp ? 'followUp' : action,
          selectedText: text,
          error: err?.message || 'Something went wrong.',
          errorCode: err?.code
        })
      }
    },
    [pdfDoc, doc, pageNumber, contextMode, indexStatus]
  )

  function handleFollowUp(question) {
    const last = lastRequestRef.current
    if (!last) return
    runAi({ text: last.text, action: last.action, followUp: question })
  }

  function handleRetry() {
    const last = lastRequestRef.current
    if (!last) return
    runAi({ text: last.text, action: last.action })
  }

  // --- RAG indexing (Phase 6) ----------------------------------------------
  // Optional, on-demand (not automatic on upload — see rag.js) so a 400-page
  // PDF someone only skims once doesn't spend embedding calls for nothing.

  const handleIndex = useCallback(async () => {
    if (!pdfDoc) return
    setIndexStatus('indexing')
    setIndexProgress({ done: 0, total: pdfDoc.numPages })
    try {
      const { chunkCount: count, warning } = await indexDocument({
        pdfDoc,
        documentId: id,
        onProgress: (done, total) => setIndexProgress({ done, total })
      })
      setIndexStatus('ready')
      setChunkCount(count)
      if (warning) {
        // Partial index — still useful, but the person should know it
        // didn't finish (most likely: ran out of monthly AI requests
        // partway through a long document).
        setAiState({ status: 'error', mode: 'explain', error: `Indexing stopped early: ${warning}` })
      }
    } catch (err) {
      setIndexStatus('error')
      setAiState({
        status: 'error',
        mode: 'explain',
        error: err?.message || 'Indexing failed.',
        errorCode: err?.code
      })
    } finally {
      setIndexProgress(null)
    }
  }, [pdfDoc, id])

  async function handleSaveFlashcards(cards) {
    await docStore.saveFlashcards(
      cards.map((c) => ({
        ...c,
        documentId: id,
        pageNumber,
        sourceText: aiState?.selectedText ?? null
      }))
    )
  }

  // --- Quiz generation (Phase 6) -------------------------------------------
  // Unlike flashcards (generated from a highlight, previewed, then
  // explicitly saved), a quiz is generated from a page/document scope you
  // pick up front and you're about to take immediately — so it's saved as
  // soon as it's generated (you'd want it in your library even if you
  // close the tab mid-quiz), and each full pass records an attempt.

  async function handleGenerateQuiz({ count, scope, questionTypes }) {
    setQuizGenerating(true)
    setQuizGenError(null)
    setQuizGenErrorCode(null)
    try {
      let text
      let sources
      if (scope === 'page') {
        text = await getPageText(pdfDoc, pageNumber)
        sources = [{ document: doc.title, page: pageNumber }]
      } else {
        const sample = await getDocumentSampleText(pdfDoc)
        text = sample.text
        sources = [{ document: doc.title }]
      }

      if (!text || !text.trim()) {
        setQuizGenError("Couldn't find any text to quiz on — this page may be a scanned image.")
        return
      }

      const request = {
        selectedText: scope === 'page' ? `Page ${pageNumber} of ${doc.title}` : doc.title,
        context: text,
        sources,
        contextMode: scope
      }
      const result = await ai.generateQuiz(request, { count, questionTypes })

      if (result.questions.length === 0) {
        setQuizGenError("Couldn't generate quiz questions from that material — try a different page or scope.")
        return
      }

      const saved = await docStore.saveQuiz({
        documentId: id,
        pageNumber: scope === 'page' ? pageNumber : null,
        title: `${doc.title}${scope === 'page' ? ` — page ${pageNumber}` : ''} quiz`,
        questions: result.questions,
        sources: result.sources
      })

      setAiState(null)
      setShowSearch(false)
      setShowQuizModal(false)
      setQuiz(saved)
    } catch (err) {
      setQuizGenError(err?.message || 'Something went wrong generating the quiz.')
      setQuizGenErrorCode(err?.code)
    } finally {
      setQuizGenerating(false)
    }
  }

  async function handleQuizComplete(score, total) {
    const updated = await docStore.recordQuizAttempt(quiz.id, { score, total })
    if (updated) setQuiz(updated)
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:gap-x-3 sm:px-4">
        <button
          aria-label="Toggle page thumbnails"
          onClick={() => setShowThumbnails((v) => !v)}
          className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <PanelLeft size={16} />
        </button>

        <div className="min-w-0 max-w-[45vw] sm:max-w-xs">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="truncate text-xs text-muted">
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
          aria-label="Generate quiz"
          onClick={() => setShowQuizModal(true)}
          className="rounded-card border border-border p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
        >
          <ListChecks size={15} />
        </button>

        <button
          aria-label="Search in document"
          onClick={() => {
            setShowSearch((v) => {
              if (!v) {
                setAiState(null)
                setQuiz(null)
              }
              return !v
            })
          }}
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
        onInsertSticker={(src) => elementsApiRef.current?.addImage(src, STICKER_SIZE, STICKER_SIZE)}
        neat={neat}
        onNeatChange={updateNeat}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {showThumbnails && (
          <>
            <div
              className="fixed inset-0 z-20 bg-black/40 lg:hidden"
              onClick={() => setShowThumbnails(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 left-0 z-30 w-36 shrink-0 overflow-y-auto border-r border-border bg-surface p-2 lg:static lg:z-auto">
              {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    goToPage(n)
                    if (window.innerWidth < 1024) setShowThumbnails(false)
                  }}
                  className={`mb-2 w-full rounded-card border p-1 text-left ${
                    n === pageNumber ? 'border-accent bg-accent-soft' : 'border-border hover:bg-accent-soft'
                  }`}
                >
                  <PdfThumbnail pdfDoc={pdfDoc} pageNumber={n} />
                  <span className="mt-1 block text-center text-xs text-muted">{n}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div ref={scrollRef} className="flex-1 overflow-auto bg-paper p-3 sm:p-6">
          <PdfPage
            key={pageNumber}
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            zoom={zoom}
            tool={tool}
            toolSettings={toolSettingsMap[tool] || {}}
            textDefaults={toolSettingsMap.text}
            neatWriting={neat}
            elements={history.value}
            onChange={history.commit}
            onStrokeSelectionChange={setStrokeSelectionCount}
            onElementSelectionChange={setElementSelectionCount}
            canvasRef={canvasApiRef}
            elementsRef={elementsApiRef}
            isActive
            onAskAi={runAi}
            aiDisabled={aiState?.status === 'loading'}
          />
        </div>

        {/* Below `lg`, the AI and search panels are near the width of the
            screen anyway (320px / 288px), so they become full-screen
            overlays rather than squeezing the PDF into a sliver. They're
            kept mutually exclusive (above) so at most one overlay is ever
            stacked. */}
        {aiState && (
          <AiPanel
            state={aiState}
            contextMode={contextMode}
            setContextMode={setContextMode}
            onClose={() => setAiState(null)}
            onFollowUp={handleFollowUp}
            onRetry={aiState.status === 'error' ? handleRetry : null}
            indexStatus={indexStatus}
            indexProgress={indexProgress}
            chunkCount={chunkCount}
            onIndex={handleIndex}
            onSaveFlashcards={handleSaveFlashcards}
          />
        )}

        {quiz && <QuizPanel quiz={quiz} onClose={() => setQuiz(null)} onComplete={handleQuizComplete} />}

        {showSearch && (
          <div className="fixed inset-0 z-30 w-full overflow-y-auto border-l border-border bg-surface p-3 lg:static lg:inset-auto lg:z-auto lg:w-72 lg:shrink-0">
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

      {showQuizModal && (
        <QuizGenerateModal
          onClose={() => {
            setShowQuizModal(false)
            setQuizGenError(null)
            setQuizGenErrorCode(null)
          }}
          onGenerate={handleGenerateQuiz}
          generating={quizGenerating}
          error={quizGenError}
          errorCode={quizGenErrorCode}
        />
      )}
    </div>
  )
}
