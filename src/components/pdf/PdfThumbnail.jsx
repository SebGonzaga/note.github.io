import { useEffect, useRef } from 'react'

const THUMB_WIDTH = 120

// Renders a low-resolution raster of one page for the page-list sidebar.
// Kept intentionally separate from the main page canvas — thumbnails render
// once at a fixed small scale and never need to redraw for zoom/annotation
// changes, so they're cheap even for long documents.
export default function PdfThumbnail({ pdfDoc, pageNumber }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let renderTask = null

    pdfDoc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = THUMB_WIDTH / baseViewport.width
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport })
      renderTask.promise.catch(() => {})
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdfDoc, pageNumber])

  return <canvas ref={canvasRef} className="w-full rounded-[4px]" />
}
