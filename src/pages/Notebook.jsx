import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import {
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Pencil,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  PanelLeft
} from 'lucide-react'
import * as store from '../services/storage/notebooks.js'
import Button from '../components/common/Button.jsx'
import Toolbar from '../components/toolbar/Toolbar.jsx'
import DrawingCanvas, { PAGE_WIDTH, PAGE_HEIGHT } from '../components/canvas/DrawingCanvas.jsx'
import ElementsLayer from '../components/canvas/ElementsLayer.jsx'
import { useHistory } from '../hooks/useHistory.js'
import { TOOL_DEFAULTS } from '../utils/toolDefaults.js'

const TEMPLATES = [
  { id: 'blank', label: 'Blank' },
  { id: 'lined', label: 'Lined' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell' },
  { id: 'graph', label: 'Graph' }
]

export default function NotebookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh: refreshLibrary } = useOutletContext()

  const [notebook, setNotebook] = useState(null)
  const [pages, setPages] = useState([])
  const [activePageId, setActivePageId] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pageListOpen, setPageListOpen] = useState(false)
  const hasAutoFitRef = useRef(false)
  const canvasAreaRef = useRef(null)

  const [tool, setTool] = useState('pen')
  const [toolSettingsMap, setToolSettingsMap] = useState(() =>
    JSON.parse(JSON.stringify(TOOL_DEFAULTS))
  )
  const [strokeSelectionCount, setStrokeSelectionCount] = useState(0)
  const [elementSelectionCount, setElementSelectionCount] = useState(0)
  const canvasApiRef = useRef(null)
  const elementsApiRef = useRef(null)

  const history = useHistory([])
  const historyRef = useRef(history)
  historyRef.current = history

  async function load() {
    const nb = await store.getNotebook(id)
    const pgs = await store.listPages(id)
    setNotebook(nb)
    setPages(pgs)
    setActivePageId((current) => (current && pgs.some((p) => p.id === current) ? current : pgs[0]?.id ?? null))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const activePage = pages.find((p) => p.id === activePageId)

  // On first load, shrink to fit the available width if the full-size page
  // (850px) wouldn't fit — otherwise a phone screen opens straight into a
  // page that's mostly off-canvas, requiring horizontal scroll before you
  // can see anything. Runs once; after that, zoom is entirely up to the
  // person, and their choice persists across page switches within this
  // notebook.
  useEffect(() => {
    if (hasAutoFitRef.current || !canvasAreaRef.current) return
    hasAutoFitRef.current = true
    const available = canvasAreaRef.current.clientWidth - 32 // minus padding
    if (available > 0 && available < PAGE_WIDTH) {
      setZoom(Math.max(0.35, +(available / PAGE_WIDTH).toFixed(2)))
    }
  }, [activePage])

  // Re-seed undo history whenever the active page changes, so history never
  // leaks between pages.
  useEffect(() => {
    if (activePage) {
      historyRef.current.reset(activePage.elements || [])
      setStrokeSelectionCount(0)
      setElementSelectionCount(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId])

  // Persist to IndexedDB whenever the committed element set changes.
  useEffect(() => {
    if (activePageId) {
      store.setPageElements(activePageId, history.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.value, activePageId])

  // Keyboard shortcuts: undo/redo and delete-selection.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        historyRef.current.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        historyRef.current.redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') {
        e.preventDefault()
        canvasApiRef.current?.deleteSelected()
        elementsApiRef.current?.deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool])

  async function handleAddPage() {
    const page = await store.createPage(id)
    await load()
    setActivePageId(page.id)
  }

  async function handleDeletePage(pageId) {
    if (pages.length === 1) return
    await store.deletePage(pageId)
    await load()
  }

  async function handleDuplicatePage(pageId) {
    await store.duplicatePage(pageId)
    await load()
  }

  async function handleReorder(pageId, direction) {
    await store.reorderPage(pageId, direction)
    await load()
  }

  async function handleTemplateChange(template) {
    if (!activePage) return
    await store.setPageBackground(activePage.id, template)
    await load()
  }

  async function saveTitle() {
    if (titleDraft.trim()) {
      await store.renameNotebook(id, titleDraft.trim())
      await refreshLibrary()
      await load()
    }
    setEditingTitle(false)
  }

  function updateToolSettings(patch) {
    setToolSettingsMap((prev) => ({ ...prev, [tool]: { ...prev[tool], ...patch } }))
  }

  function handleInsertImage(dataUrl, naturalWidth, naturalHeight) {
    elementsApiRef.current?.addImage(dataUrl, naturalWidth, naturalHeight)
  }

  if (!notebook) {
    return <div className="p-8 text-sm text-muted">Loading notebook…</div>
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Page list — an off-canvas drawer below `lg`, since 192px is a lot
          of a phone screen to spend permanently on a page thumbnail rail. */}
      {pageListOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setPageListOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-30 flex w-48 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          pageListOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-border p-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <ChevronLeft size={14} />
            Library
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {pages.map((page, index) => (
            <div
              key={page.id}
              onClick={() => {
                setActivePageId(page.id)
                setPageListOpen(false)
              }}
              className={`group mb-2 cursor-pointer rounded-card border p-1.5 ${
                page.id === activePageId ? 'border-accent' : 'border-border'
              }`}
            >
              <div className={`mb-1 h-20 w-full rounded-[6px] paper-${page.background}`} />
              <div className="flex items-center justify-between">
                <span className="truncate text-xs text-ink">{page.title}</span>
                <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <IconBtn
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReorder(page.id, 'up')
                    }}
                    disabled={index === 0}
                  >
                    <ArrowUp size={11} />
                  </IconBtn>
                  <IconBtn
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReorder(page.id, 'down')
                    }}
                    disabled={index === pages.length - 1}
                  >
                    <ArrowDown size={11} />
                  </IconBtn>
                  <IconBtn
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicatePage(page.id)
                    }}
                  >
                    <Copy size={11} />
                  </IconBtn>
                  <IconBtn
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePage(page.id)
                    }}
                    disabled={pages.length === 1}
                  >
                    <Trash2 size={11} />
                  </IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button variant="outline" size="sm" className="w-full" onClick={handleAddPage}>
            <Plus size={14} />
            Add page
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
          <button
            aria-label="Toggle page list"
            onClick={() => setPageListOpen((v) => !v)}
            className="rounded-card p-1.5 text-muted hover:bg-accent-soft hover:text-ink lg:hidden"
          >
            <PanelLeft size={16} />
          </button>

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              className="serif min-w-0 rounded-card border border-border bg-paper px-2 py-1 text-lg font-semibold outline-none"
            />
          ) : (
            <button
              className="serif flex min-w-0 items-center gap-2 text-lg font-semibold hover:text-accent"
              onClick={() => {
                setTitleDraft(notebook.title)
                setEditingTitle(true)
              }}
            >
              <span className="truncate">{notebook.title}</span>
              <Pencil size={13} className="shrink-0 text-muted" />
            </button>
          )}

          <div className="flex-1" />

          {activePage && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateChange(t.id)}
                  className={`shrink-0 rounded-card border px-2 py-1 text-xs ${
                    activePage.background === t.id
                      ? 'border-accent text-accent'
                      : 'border-border text-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 border-l border-border pl-3">
            <IconBtn onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}>
              <ZoomOut size={14} />
            </IconBtn>
            <span className="w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <IconBtn onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
              <ZoomIn size={14} />
            </IconBtn>
          </div>
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
          onInsertImage={handleInsertImage}
        />

        <div ref={canvasAreaRef} className="flex-1 overflow-auto bg-paper p-4 sm:p-8">
          {activePage ? (
            <div
              className="mx-auto"
              style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}
            >
              <div
                className={`rounded-card border border-border shadow-sm paper-${activePage.background}`}
                style={{
                  width: PAGE_WIDTH,
                  height: PAGE_HEIGHT,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left'
                }}
              >
                <div className="relative" style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}>
                  <DrawingCanvas
                    ref={canvasApiRef}
                    elements={history.value}
                    onChange={history.commit}
                    tool={tool}
                    toolSettings={toolSettingsMap[tool] || {}}
                    onSelectionChange={setStrokeSelectionCount}
                  />
                  <ElementsLayer
                    ref={elementsApiRef}
                    elements={history.value}
                    onChange={history.commit}
                    tool={tool}
                    textDefaults={toolSettingsMap.text}
                    onSelectionChange={setElementSelectionCount}
                    pageWidth={PAGE_WIDTH}
                    pageHeight={PAGE_HEIGHT}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-muted">No page selected.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className="rounded-card p-1 text-muted hover:bg-accent-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  )
}
