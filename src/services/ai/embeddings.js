import { AiError } from './aiService.js'

const AI_EMBED_ENDPOINT = '/api/gemini-embed'
const MAX_TEXTS_PER_CALL = 100

// Embeds an arbitrary number of texts, splitting into batches of
// MAX_TEXTS_PER_CALL so a large document only costs a handful of requests
// rather than one per chunk. Returns vectors in the same order as `texts`.
//
// Same-origin call, no token, no accounts — see aiService.js's header
// comment. `onBatch(batchResult, batchStartIndex)` fires after each
// successful batch so a caller indexing a large document (rag.js) can
// persist progress incrementally — if a batch fails partway through a long
// document, the earlier batches' embeddings are kept and saved, not
// discarded.
export async function embedTexts(texts, { onBatch } = {}) {
  if (texts.length === 0) return []

  const batches = []
  for (let i = 0; i < texts.length; i += MAX_TEXTS_PER_CALL) {
    batches.push(texts.slice(i, i + MAX_TEXTS_PER_CALL))
  }

  const results = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]

    let response
    try {
      response = await fetch(AI_EMBED_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch })
      })
    } catch {
      throw new AiError('Couldn’t reach the AI service. Check your connection and try again.', {
        code: 'network'
      })
    }

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new AiError(data?.error || 'Embedding request failed.', {
        code: response.status === 429 ? 'quota_exceeded' : response.status === 500 ? 'not_configured' : 'server'
      })
    }

    results.push(...data.embeddings)
    onBatch?.(data.embeddings, b * MAX_TEXTS_PER_CALL)
  }
  return results
}

export function cosineSimilarity(a, b) {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
