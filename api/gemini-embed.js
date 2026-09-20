// Vercel serverless function — batch text embeddings (RAG indexing).
//
// Used two ways by the frontend:
//   1. Indexing a PDF: embed every chunk of every page, once, in a handful
//      of batched calls (not one call per chunk — see MAX_TEXTS_PER_CALL).
//   2. Answering a question: embed the selection/query text, then rank
//      stored chunks against it by cosine similarity (done client-side;
//      this function only ever returns vectors, never does the ranking).
//
// Same GEMINI_API_KEY as gemini-explain.js, and the same
// no-accounts/rate-limit-instead-of-quota approach — see that file's
// header comment for why.

import { checkRateLimit } from './_shared/rateLimit.js'

const EMBEDDING_MODEL = 'text-embedding-004'
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`

// Gemini's batchEmbedContents caps requests per call; chunking client-side
// into calls of this size keeps each request well under that limit while
// still turning a 50-page PDF into a handful of calls instead of fifty.
const MAX_TEXTS_PER_CALL = 100
const MAX_TEXT_CHARS = 2000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rate = checkRateLimit(req)
  if (!rate.allowed) {
    return res.status(429).json({ error: rate.reason })
  }

  try {
    const body = req.body
    const texts = body?.texts

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts (non-empty array) is required' })
    }
    if (texts.length > MAX_TEXTS_PER_CALL) {
      return res
        .status(400)
        .json({ error: `Too many texts in one call (max ${MAX_TEXTS_PER_CALL}). Batch on the client.` })
    }
    if (texts.some((t) => typeof t !== 'string' || t.length === 0)) {
      return res.status(400).json({ error: 'Every text must be a non-empty string' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
    }

    const geminiRes = await fetch(`${EMBED_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, MAX_TEXT_CHARS) }] }
        }))
      })
    })

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      const status = geminiRes.status === 429 ? 429 : 502
      return res.status(status).json({
        error:
          status === 429
            ? 'The AI service is rate limited right now. Please try again shortly.'
            : 'The embedding service could not be reached.',
        detail
      })
    }

    const data = await geminiRes.json()
    const embeddings = (data?.embeddings ?? []).map((e) => e.values)

    if (embeddings.length !== texts.length) {
      return res.status(502).json({ error: 'Embedding count did not match input count.' })
    }

    return res.status(200).json({ embeddings, model: EMBEDDING_MODEL })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' })
  }
}
