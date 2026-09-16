import { useEffect, useRef, useState } from 'react'
import { PdfUtil } from '../../services/pdf/pdfjs.js'
import { newId } from '../../services/storage/db.js'

const HIGHLIGHT_COLORS = ['#ffe066', '#8ce99a', '#a5d8ff', '#eebefa']

// Renders the PDF's real text as invisible, selectable spans positioned to
// match the rendered page raster underneath, using pdf.js's own transform
// math (see pdf.js's text_layer.js — this is a simplified version of the
// same approach). This is what makes native text selection — and therefore
// "select text, then highlight it" — possible at all; it also doubles as
// the foundation Phase 5's "highlight → explain" will select against.
//
// Coordinates for everything here (spans and saved highlight rects) are in
// the page's base scale-1 space (`pageWidth`/`pageHeight`), exactly like
// ink strokes and typed elements — display zoom is a CSS transform applied
// by the parent, so nothing here needs to know the current zoom level.
export default function TextLayer({ page, tool, highlights, onChange, pageWidth, pageHeight }) {
  const [spans, setSpans] = useState([])
  const [pendingSelection, setPendingSelection] = useState(null) // { rects, text, anchorX, anchorY }
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setSpans([])
    page
      .getTextContent()
      .then((content) => {
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const built = content.items
          .filter((item) => item.str && item.str.trim().length > 0)
          .map((item, index) => buildSpan(item, baseViewport, index))
        setSpans(built)
      })
      .catch(() => {
        if (!cancelled) setSpans([])
      })
    return () => {
      cancelled = true
    }
  }, [page])

  useEffect(() => {
    if (tool !== 'select') {
      setPendingSelection(null)
      window.getSelection()?.removeAllRanges()
    }
  }, [tool])

  function handleMouseUp() {
    if (tool !== 'select') return
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (!selection || selection.isCollapsed || !text) {
      setPendingSelection(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      setPendingSelection(null)
      return
    }

    const containerRect = containerRef.current.getBoundingClientRect()
    const scaleX = pageWidth / containerRect.width
    const scaleY = pageHeight / containerRect.height
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x: (r.left - containerRect.left) * scaleX,
        y: (r.top - containerRect.top) * scaleY,
        width: r.width * scaleX,
        height: r.height * scaleY
      }))
    if (rects.length === 0) {
      setPendingSelection(null)
      return
    }

    const last = rects[rects.length - 1]
    setPendingSelection({ rects, text, anchorX: last.x + last.width, anchorY: last.y })
  }

  function saveHighlight(color) {
    if (!pendingSelection) return
    const highlight = {
      id: newId('el'),
      type: 'highlight',
      color,
      text: pendingSelection.text,
      rects: pendingSelection.rects
    }
    onChange([...highlights, highlight])
    setPendingSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const interactive = tool === 'select'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      onMouseUp={handleMouseUp}
    >
      {/* Saved highlights render first so selectable text paints on top of them. */}
      {highlights.map((h) =>
        h.rects.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            title={h.text}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              width: r.width,
              height: r.height,
              background: h.color,
              mixBlendMode: 'multiply',
              pointerEvents: 'none'
            }}
          />
        ))
      )}

      {spans.map((span) => (
        <span key={span.key} style={span.style}>
          {span.text}
        </span>
      ))}

      {pendingSelection && interactive && (
        <div
          className="absolute z-10 flex gap-1 rounded-card border border-border bg-surface p-1 shadow-lg"
          style={{ left: pendingSelection.anchorX + 6, top: Math.max(0, pendingSelection.anchorY - 4) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Highlight ${c}`}
              onClick={() => saveHighlight(c)}
              className="h-5 w-5 rounded-full border border-black/10"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function buildSpan(item, viewport, index) {
  const tx = PdfUtil.transform(viewport.transform, item.transform)
  const angle = Math.atan2(tx[1], tx[0])
  const fontHeight = Math.hypot(tx[2], tx[3])

  let left = tx[4]
  let top = tx[5] - fontHeight
  if (angle !== 0) {
    left = tx[4] + fontHeight * Math.sin(angle)
    top = tx[5] - fontHeight * Math.cos(angle)
  }

  return {
    key: `t${index}`,
    text: item.str,
    style: {
      position: 'absolute',
      left,
      top,
      fontSize: fontHeight,
      fontFamily: 'sans-serif',
      color: 'transparent',
      whiteSpace: 'pre',
      transformOrigin: '0% 0%',
      transform: angle !== 0 ? `rotate(${angle}rad)` : undefined,
      lineHeight: 1,
      cursor: 'text'
    }
  }
}
