// Thin wrapper around pdf.js so the rest of the app never imports it
// directly — keeps the dependency in one place if it's ever swapped out.
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export const PdfUtil = pdfjsLib.Util

// `source` is a Blob/File (the PDF as uploaded, untouched — we never
// rewrite the original bytes, only store annotations separately).
export async function loadPdf(source) {
  const buffer = await source.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  return loadingTask.promise
}

export async function renderPageToCanvas(page, canvas, scale) {
  const viewport = page.getViewport({ scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return viewport
}

export async function getPageTextContent(page) {
  return page.getTextContent()
}
