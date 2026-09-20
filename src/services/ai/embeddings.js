import { AiError, isAiConfigured } from './aiService.js'
import { supabase } from '../supabase/client.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const MAX_TEXTS_PER_CALL = 100

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

// Embeds an arbitrary number of texts, splitting into batches of
// MAX_TEXTS_PER_CALL so a large document only costs a handful of requests
// rather than one per chunk. Returns vectors in the same order as `texts`.
//
// Each batch requires a signed-in session and counts against the same
// monthly AI quota as explain/simplify/etc — both enforced server-side in
// the Edge Function, same as aiService.js (see that file's comment for why
// there's no client-side quota check here anymore). `onBatch(batchResult,
// batchStartIndex)` fires after each successful batch so a caller indexing
// a large document (rag.js) can persist progress incrementally — if quota
// runs out on batch 6 of 10, the first 5 batches' worth of embeddings were
// already paid for and shouldn't be thrown away.
export async function embedTexts(texts, { onBatch } = {}) {
  if (!isAiConfigured()) {
    throw new AiError('AI is not configured yet.', { code: 'not_configured' })
  }
  if (texts.length === 0) return []

  const token = await getAccessToken()
  if (!token) {
    throw new AiError('Sign in to use AI features.', { code: 'auth_required' })
  }

  const batches = []
  for (let i = 0; i < texts.length; i += MAX_TEXTS_PER_CALL) {
    batches.push(texts.slice(i, i + MAX_TEXTS_PER_CALL))
  }

  const results = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]

    let response
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY
        },
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
        code: response.status === 401 ? 'auth_required' : response.status === 429 ? 'quota_exceeded' : 'server'
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
