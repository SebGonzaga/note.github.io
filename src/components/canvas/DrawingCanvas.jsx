import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  strokeHitByPoint,
  strokeIntersectsRect,
  normalizeRect,
  smoothStroke,
  strokesBounds,
  nextFountainWidth,
  applyFountainWidths
} from '../../utils/strokes.js'
import { wavePath, zigzagPath, doublePaths } from '../../utils/decorations.js'
import { recognizeShape, shapeToPoints } from '../../services/ink/shapeRecognition.js'
import { newId } from '../../services/storage/db.js'
import { transcribeHandwriting } from '../../services/ai/aiService.js'
import {
  MIN_WRITING_SIZE,
  buildTextElement,
  renderStrokesToImage
} from '../../services/ink/neatWriting.js'

export const PAGE_WIDTH = 850
export const PAGE_HEIGHT = 1100

// "Convert to text" waits this long after the pen lifts before reading the
// handwriting, so a word or sentence is finished before it's converted.
const CONVERT_IDLE_MS = 1600
// Below this, a result is treated as a misread and the ink is kept.
const MIN_CONFIDENCE = 0.6
const NOTE_MS = 2600

const DEFAULT_NEAT = { mode: 'off', font: 'inter', penStyle: 'classic' }

// A drawing surface for one page. Renders at a fixed logical resolution
// (`width` x `height`, defaulting to the notebook page size PAGE_WIDTH x
// PAGE_HEIGHT) and is scaled visually via CSS transform for zoom (applied
// by the parent), so pointer math never has to special-case zoom level and
// zooming never triggers a redraw. PDF pages (Phase 4) pass their own
// per-document base size instead of the defaults.
const DrawingCanvas = forwardRef(function DrawingCanvas(
  {
    elements,
    onChange,
    tool,
    toolSettings,
    onSelectionChange,
    width = PAGE_WIDTH,
    height = PAGE_HEIGHT,
    allowSelect = true,
    neatWriting = DEFAULT_NEAT
  },
  ref
) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const drawingRef = useRef(null) // in-progress stroke, kept out of React state
  const erasedIdsRef = useRef(new Set())
  const selectRectRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // --- Neat writing (sharpen + convert-to-text) ----------------------------
  // Conversion is asynchronous, so by the time the AI answers, this render's
  // `elements`/`onChange` are stale (the parent's commit closes over its own
  // history index). The ref always holds the latest props from the most
  // recent render, and is read only *after* every await.
  const latestRef = useRef(null)
  latestRef.current = { elements, onChange, neatWriting, width, height }
  const pendingIdsRef = useRef([]) // strokes written but not yet converted
  const idleTimerRef = useRef(null)
  const convertDisabledRef = useRef(false) // set once the AI reports it's unavailable
  const noteCounterRef = useRef(0)
  const [notes, setNotes] = useState([]) // [{ key, rect, kind: 'busy' | 'info' | 'error', text }]

  useEffect(() => () => clearTimeout(idleTimerRef.current), [])

  function addNote(rect, kind, text) {
    const key = ++noteCounterRef.current
    setNotes((prev) => [...prev, { key, rect, kind, text }])
    return key
  }
  function removeNote(key) {
    setNotes((prev) => prev.filter((n) => n.key !== key))
  }
  function flashNote(rect, kind, text) {
    const key = addNote(rect, kind, text)
    setTimeout(() => removeNote(key), NOTE_MS)
  }

  function scheduleConversion() {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(runConversion, CONVERT_IDLE_MS)
  }

  function queueConversion(strokeId) {
    pendingIdsRef.current.push(strokeId)
    scheduleConversion()
  }

  async function runConversion() {
    const ids = pendingIdsRef.current
    pendingIdsRef.current = []
    if (ids.length === 0 || convertDisabledRef.current) return

    const strokes = latestRef.current.elements.filter((el) => el.type === 'stroke' && ids.includes(el.id))
    // If any of them are gone (erased, undone, or the page changed), the
    // writing is being edited — leave it alone rather than convert a fragment.
    if (strokes.length !== ids.length) return

    const box = strokesBounds(strokes)
    if (box.maxX - box.minX < MIN_WRITING_SIZE && box.maxY - box.minY < MIN_WRITING_SIZE) return
    const rect = { x: box.minX, y: box.minY, w: box.maxX - box.minX, h: box.maxY - box.minY }

    const busyKey = addNote(rect, 'busy', 'Reading…')
    try {
      const result = await transcribeHandwriting(renderStrokesToImage(strokes))

      if (!result?.isText || !result.text || (result.confidence ?? 0) < MIN_CONFIDENCE) {
        flashNote(rect, 'info', 'Kept as handwriting')
        return
      }

      const textEl = await buildTextElement({
        strokes,
        text: result.text,
        font: latestRef.current.neatWriting.font,
        pageWidth: latestRef.current.width,
        pageHeight: latestRef.current.height
      })

      // Re-read after the awaits: only swap if every stroke is still there.
      const latest = latestRef.current
      if (!ids.every((id) => latest.elements.some((el) => el.id === id))) return
      latest.onChange([...latest.elements.filter((el) => !ids.includes(el.id)), textEl])
    } catch (err) {
      if (err?.code === 'not_configured') {
        convertDisabledRef.current = true
        flashNote(rect, 'error', 'Text conversion isn’t set up — kept your ink')
      } else if (err?.code === 'quota_exceeded') {
        flashNote(rect, 'error', 'Too many conversions — kept your ink')
      } else {
        flashNote(rect, 'error', 'Couldn’t read that — kept your ink')
      }
    } finally {
      removeNote(busyKey)
    }
  }

  // Turning conversion back on (or off) gets a clean slate.
  useEffect(() => {
    if (neatWriting.mode !== 'type') {
      clearTimeout(idleTimerRef.current)
      pendingIdsRef.current = []
    } else {
      convertDisabledRef.current = false
    }
  }, [neatWriting.mode])

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

  function drawStroke(ctx, stroke, highlight, live = false) {
    const pts = stroke.points
    if (pts.length === 0) return

    // Decorative underlines (wave/zigzag/double/dash — see decorations.js)
    // render from the stroke's real points but as a distinct pattern
    // instead of a plain line. Only for the finished stroke: the live
    // incremental preview only ever gets a 2-point slice, too short for a
    // wave to mean anything, so it draws as a plain line while you're
    // still writing and "snaps" to the pattern the moment you lift the pen.
    if (stroke.tool === 'underline' && !live && pts.length >= 2) {
      drawDecoratedUnderline(ctx, stroke)
      if (highlight) drawSelectionBox(ctx, stroke)
      return
    }

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
        // Fountain strokes carry a precomputed width per point; everything
        // else (and every stroke drawn before this existed) uses pressure.
        ctx.lineWidth =
          stroke.style === 'fountain' && p1.w != null && p2.w != null
            ? (p1.w + p2.w) / 2
            : stroke.width * (0.5 + pressure)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }
    ctx.restore()

    if (highlight) drawSelectionBox(ctx, stroke)
  }

  // Extracted so the decorative-underline branch above (which returns
  // early, before the rest of this function runs) can draw the same
  // selection box as every other stroke type — copied verbatim from what
  // was inline here, not changed.
  function drawSelectionBox(ctx, stroke) {
    const pts = stroke.points
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

  // FreeNotes-inspired decorative underline styles. Draws from the
  // stroke's real hand-drawn points via decorations.js's pure geometry —
  // selecting/erasing still hit-tests the real points, unaffected by how
  // the pattern renders.
  function drawDecoratedUnderline(ctx, stroke) {
    const amplitude = Math.max(2, stroke.width)
    const style = stroke.decoration || 'wave'

    ctx.save()
    ctx.globalAlpha = stroke.opacity ?? 1
    ctx.strokeStyle = stroke.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(1.5, stroke.width / 2.5)

    function strokePath(pts) {
      if (pts.length < 2) return
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }

    if (style === 'wave') {
      strokePath(wavePath(stroke.points, amplitude))
    } else if (style === 'zigzag') {
      strokePath(zigzagPath(stroke.points, amplitude))
    } else if (style === 'double') {
      const [a, b] = doublePaths(stroke.points, amplitude * 0.7)
      strokePath(a)
      strokePath(b)
    } else if (style === 'dash') {
      ctx.setLineDash([amplitude * 1.5, amplitude])
      strokePath(stroke.points)
      ctx.setLineDash([])
    } else {
      strokePath(stroke.points)
    }
    ctx.restore()
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
    return { x, y, pressure: e.pressure > 0 ? e.pressure : 0.5, t: Math.round(e.timeStamp) }
  }

  function handlePointerDown(e) {
    const point = toPagePoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'underline') {
      // Still writing — hold off on converting until the pen has rested.
      clearTimeout(idleTimerRef.current)
      drawingRef.current = {
        id: newId('el'),
        type: 'stroke',
        tool,
        color: toolSettings.color,
        width: toolSettings.width,
        opacity: toolSettings.opacity,
        // Fountain-pen width applies to the pen only; pencil and highlighter
        // keep their own look.
        ...(tool === 'pen' && neatWriting.penStyle === 'fountain' ? { style: 'fountain' } : {}),
        ...(tool === 'underline' ? { decoration: toolSettings.decoration, opacity: 1 } : {}),
        points: [point]
      }
      if (drawingRef.current.style === 'fountain') {
        point.w = nextFountainWidth(null, toolSettings.width, point.pressure, NaN)
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
      const live = drawingRef.current
      if (live.style === 'fountain') {
        const prev = live.points[live.points.length - 1]
        const dt = point.t - prev.t
        const speed = dt > 0 ? Math.hypot(point.x - prev.x, point.y - prev.y) / dt : NaN
        point.w = nextFountainWidth(prev.w, live.width, point.pressure, speed)
      }
      drawingRef.current.points.push(point)
      // Incremental draw for responsive feedback without a full redraw.
      const ctx = canvasRef.current.getContext('2d')
      const pts = drawingRef.current.points
      const p1 = pts[pts.length - 2] || pts[0]
      const p2 = pts[pts.length - 1]
      drawStroke(ctx, { ...drawingRef.current, points: [p1, p2] }, false, true)
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
      let finished = drawingRef.current
      drawingRef.current = null
      if (finished.points.length > 0) {
        const isWriting = finished.tool === 'pen' || finished.tool === 'pencil'
        if (isWriting && neatWriting.mode !== 'off') {
          finished = { ...finished, points: smoothStroke(finished.points) }
        }
        // Underlines get the same jitter-smoothing for a cleaner baseline
        // to wave/zigzag from, but deliberately never go through
        // isWriting's AI-conversion path below — an underline isn't
        // handwriting to transcribe.
        if (finished.tool === 'underline') {
          finished = { ...finished, points: smoothStroke(finished.points) }
        }

        // Shape recognition (pen/pencil only), independent of neatWriting
        // .mode — someone might want mode 'off' (raw ink) but still want
        // circles/rectangles to snap. Runs before the fountain-width pass:
        // a recognized shape gets one clean uniform outline, not organic
        // hand-speed width variation, so fountain-width is skipped for it.
        let shapeMatched = false
        if (isWriting && neatWriting.shapeRecognition !== false) {
          const shape = recognizeShape(finished.points)
          const shapePoints = shape && shapeToPoints(shape)
          if (shapePoints) {
            finished = { ...finished, points: shapePoints }
            shapeMatched = true
          }
        }

        if (!shapeMatched && finished.style === 'fountain') {
          // Final pass over the (possibly smoothed) points: consistent
          // widths plus a pointed start and finish.
          finished = { ...finished, points: applyFountainWidths(finished.points, finished.width) }
        }
        onChange([...elements, finished])
        // A recognized shape isn't handwriting — never send it off to be
        // "read" as text.
        if (isWriting && neatWriting.mode === 'type' && !shapeMatched) queueConversion(finished.id)
      } else if (neatWriting.mode === 'type' && pendingIdsRef.current.length > 0) {
        scheduleConversion() // the pen-down cleared the timer; restart it
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
      {notes.map((n) => (
        <div
          key={n.key}
          role="status"
          className="pointer-events-none absolute"
          style={{ left: n.rect.x - 4, top: n.rect.y - 4, width: n.rect.w + 8, height: n.rect.h + 8 }}
        >
          <div
            className={`h-full w-full rounded border border-dashed ${
              n.kind === 'error' ? 'border-red-400' : 'border-accent'
            } ${n.kind === 'busy' ? 'animate-pulse' : ''}`}
          />
          <span
            className={`absolute left-0 top-full mt-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-white ${
              n.kind === 'error' ? 'bg-red-500' : 'bg-accent'
            }`}
          >
            {n.text}
          </span>
        </div>
      ))}
    </div>
  )
})

export default DrawingCanvas
