import { useEffect, useRef, useState } from 'react'
import DrawingCanvas from '../canvas/DrawingCanvas.jsx'
import ElementsLayer from '../canvas/ElementsLayer.jsx'
import TextLayer from './TextLayer.jsx'

// Composes the four layers that make up one interactive PDF page, bottom
// to top:
//
//   1. <canvas>  — the rendered PDF raster (read-only; the original file is
//                  never modified, per the spec)
//   2. TextLayer      — saved highlights + invisible selectable text
//   3. DrawingCanvas  — ink strokes (pen/pencil/highlighter/eraser)
//   4. ElementsLayer  — typed text boxes and images
//
// The order matters for pointer handling as much as for painting. With the
// Select tool active, each layer above takes precedence over the one below:
// dragging a text box wins over selecting PDF text, which in turn wins over
// the ink canvas (which steps aside entirely via `allowSelect={false}`, so
// drags select text instead of rubber-banding strokes). Painted result:
// highlights sit under your ink and notes, which is what you'd expect.
//
// Layers 2–4 all read and write the same `elements` array, which is stored
// per (documentId, pageNumber). That's the same element shape notebook
// pages use, so the Phase 2/3 components are reused here as-is.
//
// Rendering happens above 1x for sharpness; visual zoom is a CSS transform
// applied by the parent, matching how notebook pages work. This means
// changing zoom never re-renders the PDF — it just scales what's drawn.
export default function PdfPage({
  pdfDoc,
  pageNumber,
  zoom,
  tool,
  toolSettings,
  textDefaults,
  neatWriting,
  elements,
  onChange,
  onStrokeSelectionChange,
  onElementSelectionChange,
  canvasRef,
  elementsRef,
  isActive,
  onAskAi,
  aiDisabled
}) {
  const rasterRef = useRef(null)
  const [page, setPage] = useState(null)
  const [size, setSize] = useState(null) // { width, height } at scale 1

  useEffect(() => {
    let cancelled = false
    pdfDoc.getPage(pageNumber).then((loaded) => {
      if (cancelled) return
      const viewport = loaded.getViewport({ scale: 1 })
      setPage(loaded)
      setSize({ width: viewport.width, height: viewport.height })
    })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, pageNumber])

  useEffect(() => {
    if (!page || !size) return
    let renderTask = null
    const canvas = rasterRef.current
    if (!canvas) return

    // Render above 1x so the raster still looks sharp when zoomed in a bit,
    // without re-rendering on every zoom change.
    const dpr = window.devicePixelRatio || 1
    const renderScale = dpr * 1.5
    const viewport = page.getViewport({ scale: renderScale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport })
    renderTask.promise.catch(() => {})

    return () => renderTask?.cancel()
  }, [page, size])

  if (!size) {
    return (
      <div
        className="mx-auto animate-pulse rounded-card border border-border bg-surface"
        style={{ width: 612 * zoom, height: 792 * zoom }}
      />
    )
  }

  // Split the page's element list by which layer owns it. Each layer gets
  // only its own elements and hands back a full list on change, so the two
  // never clobber each other's edits.
  const drawables = elements.filter(
    (el) => el.type === 'stroke' || el.type === 'text' || el.type === 'image'
  )
  const highlights = elements.filter((el) => el.type === 'highlight')

  return (
    <div className="mx-auto" style={{ width: size.width * zoom, height: size.height * zoom }}>
      <div
        className="relative overflow-hidden rounded-card border border-border bg-white shadow-sm"
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left'
        }}
      >
        <canvas
          ref={rasterRef}
          className="absolute inset-0"
          style={{ width: size.width, height: size.height }}
        />

        {page && (
          <TextLayer
            page={page}
            tool={tool}
            highlights={highlights}
            onChange={(nextHighlights) => onChange([...drawables, ...nextHighlights])}
            pageWidth={size.width}
            pageHeight={size.height}
            onAskAi={onAskAi}
            aiDisabled={aiDisabled}
          />
        )}

        <div className="absolute inset-0">
          <DrawingCanvas
            ref={isActive ? canvasRef : undefined}
            elements={drawables}
            onChange={(next) => onChange([...next, ...highlights])}
            tool={tool}
            toolSettings={toolSettings}
            onSelectionChange={isActive ? onStrokeSelectionChange : undefined}
            width={size.width}
            height={size.height}
            allowSelect={false}
            neatWriting={neatWriting}
          />
        </div>

        <ElementsLayer
          ref={isActive ? elementsRef : undefined}
          elements={drawables}
          onChange={(next) => onChange([...next, ...highlights])}
          tool={tool}
          textDefaults={textDefaults}
          onSelectionChange={isActive ? onElementSelectionChange : undefined}
          pageWidth={size.width}
          pageHeight={size.height}
        />
      </div>
    </div>
  )
}
