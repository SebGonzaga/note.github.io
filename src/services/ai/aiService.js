import { supabase, isSupabaseConfigured } from '../supabase/client.js'

// AI service abstraction (spec §10). The rest of the app calls these named
// functions and never knows which provider is behind them — swapping or
// adding a provider later means changing this file and the Edge Function,
// not the UI.
//
// Every call goes to our own Supabase Edge Function, never to Gemini
// directly. The Gemini key lives only on the server; there is deliberately
// no VITE_GEMINI_* variable anywhere in this project, because anything
// prefixed VITE_ is compiled into the browser bundle and is therefore
// public.
//
// Phase 7 change: calls now require a real signed-in session and send the
// user's own access token, not just the anon key. Usage quota is checked
// and recorded *server-side* inside the Edge Function (authUsage.ts) using
// that token's identity — this file no longer does any client-side quota
// tracking, because Phases 5-6's localStorage-based version was never a
// real security control (anyone could clear it) and keeping two sources of
// truth around would just invite them to disagree. Settings reads the real
// number from `serverUsage.js`, which queries Postgres with the same
// verified identity.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export class AiError extends Error {
  constructor(message, { code } = {}) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

export function isAiConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function callFunction(payload) {
  if (!isAiConfigured()) {
    throw new AiError(
      'AI is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env, then deploy the gemini-explain function.',
      { code: 'not_configured' }
    )
  }

  const token = await getAccessToken()
  if (!token) {
    throw new AiError('Sign in to use AI features.', { code: 'auth_required' })
  }

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The user's own token, not the anon key — this is what the Edge
        // Function verifies to know who's asking and whose quota to check.
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    })
  } catch {
    throw new AiError('Couldn’t reach the AI service. Check your connection and try again.', {
      code: 'network'
    })
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new AiError(data?.error || 'The AI request failed.', {
      code: response.status === 401 ? 'auth_required' : response.status === 429 ? 'quota_exceeded' : 'server'
    })
  }

  return data
}

// --- Public interface (spec §10) -----------------------------------------

export function explainSelection(request) {
  return callFunction({ ...request, mode: 'explain' })
}

export function simplifySelection(request) {
  return callFunction({ ...request, mode: 'simplify' })
}

export function explainInContext(request) {
  return callFunction({ ...request, mode: 'inContext' })
}

export function makeNotes(request) {
  return callFunction({ ...request, mode: 'notes' })
}

export function translate(request, targetLanguage) {
  return callFunction({ ...request, mode: 'translate', targetLanguage })
}

export function askQuestion(request, followUp) {
  return callFunction({ ...request, mode: request.mode || 'explain', followUp })
}

export function generateFlashcards(request, count = 5) {
  return callFunction({ ...request, mode: 'flashcards', count })
}

export function generateQuiz(request, { count = 10, questionTypes } = {}) {
  return callFunction({ ...request, mode: 'quiz', count, questionTypes })
}
