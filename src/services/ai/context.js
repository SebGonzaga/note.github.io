// Builds the context sent alongside a selection, implementing the priority
// order from spec §3:
//
//   1. Selected text        (sent separately, always)
//   2. Nearby text          (the passage immediately around the selection)
//   3. Current page
//   4. Current PDF/document (retrieved chunks if indexed, else adjacent
//      pages — see below)
//   5. Notebook / other materials  → Phase 7 (notebooks aren't chunked yet)
//   6. General knowledge    → whatever the model already knows
//
// Step 4 has two implementations depending on whether the document has been
// indexed (Phase 6, rag.js): if it has, semantic retrieval finds the most
// relevant chunks anywhere in the document — this is what lets "explain
// this" reach a definition from 200 pages earlier. If it hasn't (indexing
// is optional, not automatic — see rag.js), this falls back to the simple
// adjacent-pages heuristic from Phase 5, which still catches the common
// case of a definition split across a page break. Nothing breaks if a
// document is never indexed; it just gets the coarser fallback.

import { retrieveRelevantChunks } from './rag.js'

const NEARBY_RADIUS = 1200 // characters either side of the selection
const MAX_PAGE_CHARS = 8000
const MAX_TOTAL_CHARS = 20000
const RETRIEVAL_TOP_K = 5
const RETRIEVAL_MIN_SCORE = 0.65 // discard weak matches rather than pad the prompt with noise

export const CONTEXT_MODES = [
  { id: 'page', label: 'This page' },
  { id: 'document', label: 'This PDF' },
  { id: 'general', label: 'General knowledge' }
]

export const DEFAULT_CONTEXT_MODE = 'document'

export async function getPageText(pdfDoc, pageNumber) {
  if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return ''
  const page = await pdfDoc.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
}

// Pulls the passage surrounding the selection out of the full page text, so
// the model sees the sentence the term sits in rather than a page dump.
//
// Both sides get whitespace-normalized before matching. This matters more
// than it looks: a selection spanning a line break arrives with newlines in
// it, while the page text has already been flattened to single spaces, so a
// naive indexOf misses most multi-word selections.
function nearbyText(pageText, selectedText) {
  if (!pageText || !selectedText) return ''
  const needle = selectedText.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!needle) return ''

  const index = pageText.toLowerCase().indexOf(needle)
  if (index === -1) return ''

  const start = Math.max(0, index - NEARBY_RADIUS)
  const end = Math.min(pageText.length, index + needle.length + NEARBY_RADIUS)
  return `${start > 0 ? '…' : ''}${pageText.slice(start, end)}${end < pageText.length ? '…' : ''}`
}

export async function buildPdfContext({
  pdfDoc,
  documentId,
  pageNumber,
  selectedText,
  documentTitle,
  contextMode = DEFAULT_CONTEXT_MODE,
  indexStatus
}) {
  if (contextMode === 'general') {
    return { context: '', sources: [] }
  }

  const sections = []
  const sources = []

  const pageText = await getPageText(pdfDoc, pageNumber)
  const nearby = nearbyText(pageText, selectedText)

  if (nearby) {
    sections.push(`PASSAGE SURROUNDING THE SELECTION (page ${pageNumber}):\n${nearby}`)
  }
  if (pageText) {
    sections.push(`FULL TEXT OF PAGE ${pageNumber}:\n${pageText.slice(0, MAX_PAGE_CHARS)}`)
    sources.push({ document: documentTitle, page: pageNumber })
  }

  if (contextMode === 'document') {
    let usedRetrieval = false

    if (indexStatus === 'ready') {
      // Semantic retrieval reaches anywhere in the document, not just next
      // door — this is the actual point of indexing.
      const matches = await retrieveRelevantChunks({
        documentId,
        queryText: selectedText,
        topK: RETRIEVAL_TOP_K
      })
      const relevant = matches.filter(
        (m) => m.score >= RETRIEVAL_MIN_SCORE && m.pageNumber !== pageNumber
      )
      if (relevant.length > 0) {
        sections.push(
          'RELEVANT PASSAGES FOUND ELSEWHERE IN THIS DOCUMENT (via semantic search):\n' +
            relevant.map((m) => `[page ${m.pageNumber}] ${m.text}`).join('\n\n')
        )
        relevant.forEach((m) => sources.push({ document: documentTitle, page: m.pageNumber }))
        usedRetrieval = true
      }
    }

    // Falls back to adjacent pages whenever retrieval isn't available *or*
    // didn't turn up anything above the confidence threshold — a document
    // that's indexed but has a weak/empty match should never end up with
    // less context than one that was never indexed at all. A definition is
    // also very often split across a page break from the term that
    // introduced it, so this still catches the common case either way.
    if (!usedRetrieval) {
      for (const offset of [-1, 1]) {
        const n = pageNumber + offset
        const text = await getPageText(pdfDoc, n)
        if (!text) continue
        sections.push(`TEXT OF PAGE ${n} (nearby page):\n${text.slice(0, MAX_PAGE_CHARS / 2)}`)
        sources.push({ document: documentTitle, page: n })
      }
    }
  }

  let context = sections.join('\n\n')
  if (context.length > MAX_TOTAL_CHARS) context = context.slice(0, MAX_TOTAL_CHARS)

  return { context, sources }
}
