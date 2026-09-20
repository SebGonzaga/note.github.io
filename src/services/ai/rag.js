import { embedTexts, cosineSimilarity } from './embeddings.js'
import { getPageText } from './context.js'
import * as docStore from '../storage/documents.js'
import { newId } from '../storage/db.js'

// Character-based chunking with overlap. Word/sentence-aware chunking would
// be nicer, but for study material (prose-heavy, not code) a fixed window
// with overlap already avoids severing a definition mid-sentence often
// enough to be useful, and it's trivial to reason about and re-run.
const CHUNK_SIZE = 700
const CHUNK_OVERLAP = 120

export function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= CHUNK_SIZE) return [clean]

  const chunks = []
  let start = 0
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length)
    chunks.push(clean.slice(start, end))
    if (end === clean.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks
}

// Extracts, chunks, and embeds every page of a PDF, then replaces the
// document's chunk store in one shot. This is the expensive one-time cost
// per document — after this, retrieval is just local cosine similarity
// plus one small embedding call for the query.
//
// `onProgress(pagesDone, totalPages)` lets the caller show a progress bar;
// indexing a long PDF can take a while and happens in the background while
// the person keeps reading.
export async function indexDocument({ pdfDoc, documentId, onProgress }) {
  await docStore.setIndexStatus(documentId, { indexStatus: 'indexing', indexError: null })

  let saved = 0

  try {
    const pending = [] // { pageNumber, chunkIndex, text }

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const text = await getPageText(pdfDoc, p)
      chunkText(text).forEach((chunkText, chunkIndex) => {
        pending.push({ pageNumber: p, chunkIndex, text: chunkText })
      })
      onProgress?.(p, pdfDoc.numPages)
    }

    if (pending.length === 0) {
      await docStore.replaceDocumentChunks(documentId, [])
      await docStore.setIndexStatus(documentId, {
        indexStatus: 'ready',
        indexedAt: Date.now(),
        chunkCount: 0
      })
      return { chunkCount: 0 }
    }

    // Clear any previous index up front, then append as each batch of
    // embeddings comes back — if a request fails partway through a long
    // document (e.g. hitting the rate limit), the batches that already
    // succeeded are kept in storage rather than thrown away.
    await docStore.replaceDocumentChunks(documentId, [])

    await embedTexts(
      pending.map((c) => c.text),
      {
        onBatch: async (vectors, startIndex) => {
          const batchChunks = vectors.map((embedding, i) => {
            const source = pending[startIndex + i]
            return {
              id: newId('chunk'),
              documentId,
              pageNumber: source.pageNumber,
              chunkIndex: source.chunkIndex,
              text: source.text,
              embedding
            }
          })
          await docStore.appendDocumentChunks(documentId, batchChunks)
          saved += batchChunks.length
          await docStore.setIndexStatus(documentId, { chunkCount: saved })
        }
      }
    )

    await docStore.setIndexStatus(documentId, {
      indexStatus: 'ready',
      indexedAt: Date.now(),
      chunkCount: saved
    })
    return { chunkCount: saved }
  } catch (err) {
    // A partial index (some batches succeeded before the error — most
    // likely hitting the rate limit partway through a long document)
    // is still useful for retrieval, so it's kept and marked ready rather
    // than discarded. Only report failure (and only then throw) when
    // nothing was saved at all; a partial result resolves normally with a
    // `warning` the caller can surface without treating it as an error.
    await docStore.setIndexStatus(documentId, {
      indexStatus: saved > 0 ? 'ready' : 'error',
      indexedAt: saved > 0 ? Date.now() : null,
      indexError: saved > 0 ? null : err?.message || 'Indexing failed.',
      chunkCount: saved
    })
    if (saved === 0) throw err
    return { chunkCount: saved, warning: err?.message || 'Indexing stopped early.' }
  }
}

// Ranks stored chunks against a query by cosine similarity and returns the
// top K, each tagged with its page number so the caller can cite it. This
// is what lets "explain this" find a definition from 200 pages earlier —
// the thing adjacent-page context alone can never reach.
export async function retrieveRelevantChunks({ documentId, queryText, topK = 5 }) {
  const chunks = await docStore.getDocumentChunks(documentId)
  if (chunks.length === 0) return []

  const [queryVector] = await embedTexts([queryText])
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(chunk.embedding, queryVector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
