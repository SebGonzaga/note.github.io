// Supabase Edge Function — batch text embeddings (Phase 6, RAG).
//
// Used two ways by the frontend:
//   1. Indexing a PDF: embed every chunk of every page, once, in a handful
//      of batched calls (not one call per chunk — see MAX_TEXTS_PER_CALL).
//   2. Answering a question: embed the selection/query text, then rank
//      stored chunks against it by cosine similarity (done client-side;
//      this function only ever returns vectors, never does the ranking).
//
// Deploy:  supabase functions deploy gemini-embed
// (Uses the same GEMINI_API_KEY secret as gemini-explain.)

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const EMBEDDING_MODEL = 'text-embedding-004'
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`

// Gemini's batchEmbedContents caps requests per call; chunking client-side
// into calls of this size keeps each request well under that limit while
// still turning a 50-page PDF into a handful of calls instead of fifty.
const MAX_TEXTS_PER_CALL = 100
const MAX_TEXT_CHARS = 2000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your Vercel domain before shipping
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => null)
    const texts = body?.texts

    if (!Array.isArray(texts) || texts.length === 0) {
      return jsonResponse({ error: 'texts (non-empty array) is required' }, 400)
    }
    if (texts.length > MAX_TEXTS_PER_CALL) {
      return jsonResponse(
        { error: `Too many texts in one call (max ${MAX_TEXTS_PER_CALL}). Batch on the client.` },
        400
      )
    }
    if (texts.some((t: any) => typeof t !== 'string' || t.length === 0)) {
      return jsonResponse({ error: 'Every text must be a non-empty string' }, 400)
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not configured on the server.' }, 500)
    }

    const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text: string) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, MAX_TEXT_CHARS) }] }
        }))
      })
    })

    if (!res.ok) {
      const detail = await res.text()
      const status = res.status === 429 ? 429 : 502
      return jsonResponse(
        {
          error:
            status === 429
              ? 'The AI service is rate limited right now. Please try again shortly.'
              : 'The embedding service could not be reached.',
          detail
        },
        status
      )
    }

    const data = await res.json()
    const embeddings = (data?.embeddings ?? []).map((e: any) => e.values)

    if (embeddings.length !== texts.length) {
      return jsonResponse({ error: 'Embedding count did not match input count.' }, 502)
    }

    return jsonResponse({ embeddings, model: EMBEDDING_MODEL })
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Unexpected error' }, 500)
  }
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
