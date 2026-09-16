import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { newId } from '../../services/storage/db.js'

const MIN_TEXT_WIDTH = 80
const MIN_TEXT_HEIGHT = 32
const MIN_IMAGE_SIZE = 40
const DEFAULT_TEXT_WIDTH = 220
const DEFAULT_TEXT_HEIGHT = 90
const DRAG_THRESHOLD = 2

// A DOM overlay (not canvas-drawn) rendered on top of the ink canvas that
// holds "typed" elements: text boxes and images. Kept separate from
// DrawingCanvas because these elements need real interactivity — text
// editing, dragging, resizing — that's awkward to build on a <canvas>.
//
// Selection here is independent of the ink stroke selection in
// DrawingCanvas; the parent page sums both counts for the toolbar and
// calls deleteSelected() on both refs. Known simplification: selection is
// single-element only (no shift-click multi-select, no rectangle-drag
// select for text/images — that still only ropes in strokes). Good enough
// for now; revisit if multi-element layout work becomes common.
const ElementsLayer = forwardRef(function ElementsLayer(
  { elements, tool, textDefaults, onChange, onSelectionChange, pageWidth, pageHeight },
  ref
) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingId, setEditingId] = useState(null)
  const [dragPreview, setDragPreview] = useState(null) // { [id]: {x,y} }
  const [resizePreview, setResizePreview] = useState(null) // { [id]: {width,height} }

  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  const items = elements.filter((el) => el.type === 'text' || el.type === 'image')

  // Selection (and any in-progress edit) is cleared whenever the tool
  // switches away from "select", matching DrawingCanvas's behavior.
  useEffect(() => {
    if (tool !== 'select') {
      if (selectedIds.size > 0) {
        setSelectedIds(new Set())
        onSelectionChange?.(0)
      }
      setEditingId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  useImperativeHandle(ref, () => ({
    deleteSelected() {
      if (selectedIds.size === 0) return
      onChange(elements.filter((el) => !selectedIds.has(el.id)))
      setSelectedIds(new Set())
      onSelectionChange?.(0)
    },
    addImage(src, naturalWidth, naturalHeight) {
      const maxDim = 360
      let width = naturalWidth || 240
      let height = naturalHeight || 180
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width *= scale
        height *= scale
      }
      const el = {
        id: newId('el'),
        type: 'image',
        x: Math.max(0, (pageWidth - width) / 2),
        y: Math.max(0, (pageHeight - height) / 2),
        width,
        height,
        src
      }
      onChange([...elements, el])
      setSelectedIds(new Set([el.id]))
      onSelectionChange?.(1)
    }
  }))

  function toPagePoint(e) {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * pageWidth,
      y: ((e.clientY - rect.top) / rect.height) * pageHeight
    }
  }

  // Clicking empty page space while the "text" tool is active drops a new
  // text box there and opens it for editing immediately.
  function handleBackgroundPointerDown(e) {
    if (tool !== 'text') return
    const point = toPagePoint(e)
    const el = {
      id: newId('el'),
      type: 'text',
      x: Math.min(point.x, pageWidth - DEFAULT_TEXT_WIDTH),
      y: Math.min(point.y, pageHeight - DEFAULT_TEXT_HEIGHT),
      width: DEFAULT_TEXT_WIDTH,
      height: DEFAULT_TEXT_HEIGHT,
      text: '',
      fontSize: textDefaults?.fontSize ?? 16,
      color: textDefaults?.color ?? '#1f2933',
      bold: !!textDefaults?.bold,
      italic: !!textDefaults?.italic,
      align: textDefaults?.align ?? 'left'
    }
    onChange([...elements, el])
    setSelectedIds(new Set([el.id]))
    onSelectionChange?.(1)
    setEditingId(el.id)
  }

  function handleElementPointerDown(e, el) {
    if (tool !== 'select') return
    e.stopPropagation()
    if (!selectedIds.has(el.id)) {
      setSelectedIds(new Set([el.id]))
      onSelectionChange?.(1)
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = toPagePoint(e)
    dragRef.current = {
      id: el.id,
      startX: start.x,
      startY: start.y,
      originX: el.x,
      originY: el.y,
      width: el.width,
      height: el.height,
      moved: false
    }
  }

  function handleContainerPointerMove(e) {
    if (dragRef.current) {
      const point = toPagePoint(e)
      const dx = point.x - dragRef.current.startX
      const dy = point.y - dragRef.current.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragRef.current.moved = true
      const { id, width, height } = dragRef.current
      setDragPreview({
        [id]: {
          x: clamp(dragRef.current.originX + dx, 0, pageWidth - width),
          y: clamp(dragRef.current.originY + dy, 0, pageHeight - height)
        }
      })
    } else if (resizeRef.current) {
      const point = toPagePoint(e)
      const dx = point.x - resizeRef.current.startX
      const dy = point.y - resizeRef.current.startY
      const min = resizeRef.current.type === 'image' ? MIN_IMAGE_SIZE : MIN_TEXT_WIDTH
      const minH = resizeRef.current.type === 'image' ? MIN_IMAGE_SIZE : MIN_TEXT_HEIGHT
      setResizePreview({
        [resizeRef.current.id]: {
          width: Math.max(min, resizeRef.current.startWidth + dx),
          height: Math.max(minH, resizeRef.current.startHeight + dy)
        }
      })
    }
  }

  function handleContainerPointerUp() {
    if (dragRef.current) {
      const { id } = dragRef.current
      const preview = dragPreview?.[id]
      dragRef.current = null
      if (preview) {
        onChange(elements.map((el) => (el.id === id ? { ...el, x: preview.x, y: preview.y } : el)))
      }
      setDragPreview(null)
    } else if (resizeRef.current) {
      const { id } = resizeRef.current
      const preview = resizePreview?.[id]
      resizeRef.current = null
      if (preview) {
        onChange(
          elements.map((el) => (el.id === id ? { ...el, width: preview.width, height: preview.height } : el))
        )
      }
      setResizePreview(null)
    }
  }

  function handleResizePointerDown(e, el) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = toPagePoint(e)
    resizeRef.current = {
      id: el.id,
      type: el.type,
      startX: start.x,
      startY: start.y,
      startWidth: el.width,
      startHeight: el.height
    }
  }

  function handleDoubleClick(el) {
    if (tool !== 'select' || el.type !== 'text') return
    setEditingId(el.id)
  }

  function handleTextBlur(el, value) {
    onChange(elements.map((e) => (e.id === el.id ? { ...e, text: value } : e)))
    setEditingId(null)
  }

  // Only intercept clicks ourselves for text placement; everything else
  // (drawing, erasing, rect-select of strokes) should fall through to the
  // ink canvas underneath, so the container itself stays non-interactive
  // except while placing text. Individual elements opt back in to
  // pointer events when the select tool is active.
  const containerPointerEvents = tool === 'text' ? 'auto' : 'none'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: containerPointerEvents }}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
    >
      {items.map((el) => {
        const pos = dragPreview?.[el.id] ?? { x: el.x, y: el.y }
        const size = resizePreview?.[el.id] ?? { width: el.width, height: el.height }
        const selected = tool === 'select' && selectedIds.has(el.id)
        const style = {
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          width: size.width,
          height: size.height,
          pointerEvents: tool === 'select' ? 'auto' : 'none'
        }

        if (el.type === 'text') {
          return (
            <div
              key={el.id}
              style={style}
              className={selected ? 'ring-2 ring-accent' : ''}
              onPointerDown={(e) => handleElementPointerDown(e, el)}
              onDoubleClick={() => handleDoubleClick(el)}
            >
              {editingId === el.id ? (
                <textarea
                  autoFocus
                  defaultValue={el.text}
                  onBlur={(e) => handleTextBlur(el, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    height: '100%',
                    resize: 'none',
                    fontSize: el.fontSize,
                    color: el.color,
                    fontWeight: el.bold ? 700 : 400,
                    fontStyle: el.italic ? 'italic' : 'normal',
                    textAlign: el.align,
                    background: 'var(--surface)',
                    border: '1px dashed var(--accent)',
                    borderRadius: 4,
                    padding: 4,
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    fontSize: el.fontSize,
                    color: el.color,
                    fontWeight: el.bold ? 700 : 400,
                    fontStyle: el.italic ? 'italic' : 'normal',
                    textAlign: el.align,
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    padding: 4,
                    cursor: tool === 'select' ? 'move' : 'default'
                  }}
                >
                  {el.text}
                </div>
              )}
              {selected && editingId !== el.id && (
                <ResizeHandle onPointerDown={(e) => handleResizePointerDown(e, el)} />
              )}
            </div>
          )
        }

        return (
          <div
            key={el.id}
            style={style}
            className={selected ? 'ring-2 ring-accent' : ''}
            onPointerDown={(e) => handleElementPointerDown(e, el)}
          >
            <img
              src={el.src}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                cursor: tool === 'select' ? 'move' : 'default'
              }}
            />
            {selected && <ResizeHandle onPointerDown={(e) => handleResizePointerDown(e, el)} />}
          </div>
        )
      })}
    </div>
  )
})

function ResizeHandle({ onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border border-white bg-accent"
      style={{ pointerEvents: 'auto' }}
    />
  )
}

function clamp(value, min, max) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

export default ElementsLayer
