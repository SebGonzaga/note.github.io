import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { strokeHitByPoint, strokeIntersectsRect, normalizeRect } from '../../utils/strokes.js'
import { newId } from '../../services/storage/db.js'

export const PAGE_WIDTH = 850
export const PAGE_HEIGHT = 1100

// A drawing surface for one page. Renders at a fixed logical resolution
// (`width` x `height`, defaulting to the notebook page size PAGE_WIDTH x
// PAGE_HEIGHT) and is scaled visually via CSS transform for zoom (applied
// by the parent), so pointer math never has to special-case zoom level and
// zooming never triggers a redraw. PDF pages (Phase 4) pass their own
// per-document base size instead of the defaults.
const DrawingCanvas = forwardRef(function DrawingCanvas(
  { elements, onChange, tool, toolSettings, onSelectionChange, width = PAGE_WIDTH, height = PAGE_HEIGHT, allowSelect = true },
  ref
) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const drawingRef = useRef(null) // in-progress stroke, kept out of React state
  const erasedIdsRef = useRef(new Set())
  const selectRectRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Reset selection whenever the tool changes away from "select".
  useEffect(() => {
    if (tool !== 'select' && selectedIds.size > 0) {
      setSelectedIds(new Set())
      onSelectionChange?.(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  useImperativeHandle(ref, () => ({
    deleteSelected() {
      if (selectedIds.size === 0) return
      const next = elements.filter((el) => !selectedIds.has(el.id))
      setSelectedIds(new Set())
      onSelectionChange?.(0)
      onChange(next)
    }
  }))

  // --- Rendering ---------------------------------------------------------

  function drawStroke(ctx, stroke, highlight) {
    const pts = stroke.points
    if (pts.length === 0) return

    ctx.save()
    ctx.globalAlpha = stroke.opacity
    ctx.strokeStyle = stroke.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? 'multiply' : 'source-over'

    if (pts.length === 1) {
      ctx.beginPath()
      ctx.fillStyle = stroke.color
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const pressure = ((p1.pressure ?? 0.5) + (p2.pressure ?? 0.5)) / 2
        ctx.lineWidth = stroke.width * (0.5 + pressure)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }
    ctx.restore()

    if (highlight) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#2563eb'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      const pad = stroke.width / 2 + 4
      const minX = Math.min(...xs) - pad
      const minY = Math.min(...ys) - pad
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2
      const h = Math.max(...ys) - Math.min(...ys) + pad * 2
      ctx.strokeRect(minX, minY, w, h)
      ctx.restore()
    }
  }

  function redraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    for (const el of elements) {
      if (el.type === 'stroke' && !erasedIdsRef.current.has(el.id)) {
        drawStroke(ctx, el, selectedIds.has(el.id))
      }
    }
  }

  useEffect(() => {
    erasedIdsRef.current = new Set()
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedIds])

  // Set up the canvas backing resolution (crisp on retina displays). Re-runs
  // if width/height change — e.g. a PDF page's base size becomes known only
  // after pdf.js loads it, or a different-sized page is swapped in.
  useEffect(() => {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.getContext('2d').scale(dpr, dpr)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  // --- Pointer handling ----------------------------------------------------

  function toPagePoint(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width
    const y = ((e.clientY - rect.top) / rect.height) * height
    return { x, y, pressure: e.pressure > 0 ? e.pressure : 0.5 }
  }

  function handlePointerDown(e) {
    const point = toPagePoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'pen' || tool === 'pencil' || tool === 'highlighter') {
      drawingRef.current = {
        id: newId('el'),
        type: 'stroke',
        tool,
        color: toolSettings.color,
        width: toolSettings.width,
        opacity: toolSettings.opacity,
        points: [point]
      }
    } else if (tool === 'eraser') {
      erasedIdsRef.current = new Set()
      eraseAt(point)
    } else if (tool === 'select') {
      selectRectRef.current = { x1: point.x, y1: point.y, x2: point.x, y2: point.y }
      drawOverlayRect()
    }
  }

  function handlePointerMove(e) {
    if (e.buttons === 0) return
    const point = toPagePoint(e)

    if (drawingRef.current) {
      drawingRef.current.points.push(point)
      // Incremental draw for responsive feedback without a full redraw.
      const ctx = canvasRef.current.getContext('2d')
      const pts = drawingRef.current.points
      const p1 = pts[pts.length - 2] || pts[0]
      const p2 = pts[pts.length - 1]
      drawStroke(ctx, { ...drawingRef.current, points: [p1, p2] }, false)
    } else if (tool === 'eraser') {
      eraseAt(point)
    } else if (selectRectRef.current) {
      selectRectRef.current.x2 = point.x
      selectRectRef.current.y2 = point.y
      drawOverlayRect()
    }
  }

  function handlePointerUp() {
    if (drawingRef.current) {
      const finished = drawingRef.current
      drawingRef.current = null
      if (finished.points.length > 0) {
        onChange([...elements, finished])
      }
    } else if (tool === 'eraser' && erasedIdsRef.current.size > 0) {
      const next = elements.filter((el) => !erasedIdsRef.current.has(el.id))
      erasedIdsRef.current = new Set()
      onChange(next)
    } else if (selectRectRef.current) {
      const rect = normalizeRect(
        selectRectRef.current.x1,
        selectRectRef.current.y1,
        selectRectRef.current.x2,
        selectRectRef.current.y2
      )
      selectRectRef.current = null
      clearOverlay()

      const hitIds = new Set(
        elements.filter((el) => el.type === 'stroke' && strokeIntersectsRect(el, rect)).map((el) => el.id)
      )
      setSelectedIds(hitIds)
      onSelectionChange?.(hitIds.size)
    }
  }

  function eraseAt(point) {
    const radius = (toolSettings.width || 22) / 2
    let changed = false
    for (const el of elements) {
      if (el.type !== 'stroke' || erasedIdsRef.current.has(el.id)) continue
      if (strokeHitByPoint(el, point, radius)) {
        erasedIdsRef.current.add(el.id)
        changed = true
      }
    }
    if (changed) redraw()
  }

  function drawOverlayRect() {
    const overlay = overlayRef.current
    if (!overlay || !selectRectRef.current) return
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    const rect = normalizeRect(
      selectRectRef.current.x1,
      selectRectRef.current.y1,
      selectRectRef.current.x2,
      selectRectRef.current.y2
    )
    ctx.save()
    ctx.strokeStyle = '#2563eb'
    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1
    ctx.fillRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY)
    ctx.strokeRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY)
    ctx.restore()
  }

  function clearOverlay() {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.getContext('2d').clearRect(0, 0, width, height)
  }

  useEffect(() => {
    const overlay = overlayRef.current
    const dpr = window.devicePixelRatio || 1
    overlay.width = width * dpr
    overlay.height = height * dpr
    overlay.getContext('2d').scale(dpr, dpr)
  }, [width, height])

  const cursor = tool === 'eraser' ? 'cell' : tool === 'select' ? 'crosshair' : 'crosshair'
  const pointerEvents = tool === 'select' && !allowSelect ? 'none' : 'auto'

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, cursor, touchAction: 'none', pointerEvents }}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <canvas
        ref={overlayRef}
        style={{ width, height }}
        className="pointer-events-none absolute inset-0"
      />
    </div>
  )
})

export default DrawingCanvas
