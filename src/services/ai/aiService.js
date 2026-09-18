import { getUsage, hasQuotaRemaining, recordRequest } from './usage.js'

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

async function callFunction(payload, feature) {
  if (!isAiConfigured()) {
    throw new AiError(
      'AI is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env, then deploy the gemini-explain function.',
      { code: 'not_configured' }
    )
  }

  if (!hasQuotaRemaining()) {
    const { limit, planName } = getUsage()
    throw new AiError(
      `You've used all ${limit} AI requests included in the ${planName} plan this month.`,
      { code: 'quota_exceeded' }
    )
  }

  const started = performance.now()
  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    })
  } catch {
    recordRequest({ feature, success: false, durationMs: performance.now() - started })
    throw new AiError('Couldn’t reach the AI service. Check your connection and try again.', {
      code: 'network'
    })
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    recordRequest({ feature, success: false, durationMs: performance.now() - started })
    throw new AiError(data?.error || 'The AI request failed.', {
      code: response.status === 429 ? 'rate_limited' : 'server'
    })
  }

  recordRequest({
    feature,
    model: data?.usage?.model,
    inputTokens: data?.usage?.inputTokens,
    outputTokens: data?.usage?.outputTokens,
    durationMs: performance.now() - started,
    success: true
  })

  return data
}

// --- Public interface (spec §10) -----------------------------------------

export function explainSelection(request) {
  return callFunction({ ...request, mode: 'explain' }, 'explain')
}

export function simplifySelection(request) {
  return callFunction({ ...request, mode: 'simplify' }, 'simplify')
}

export function explainInContext(request) {
  return callFunction({ ...request, mode: 'inContext' }, 'inContext')
}

export function makeNotes(request) {
  return callFunction({ ...request, mode: 'notes' }, 'notes')
}

export function translate(request, targetLanguage) {
  return callFunction({ ...request, mode: 'translate', targetLanguage }, 'translate')
}

export function askQuestion(request, followUp) {
  return callFunction({ ...request, mode: request.mode || 'explain', followUp }, 'followUp')
}

export function generateFlashcards(request, count = 5) {
  return callFunction({ ...request, mode: 'flashcards', count }, 'flashcards')
}

// generateQuiz() arrives in the next study-tools pass and will call the
// same Edge Function with its own mode.
