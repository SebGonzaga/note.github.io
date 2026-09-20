// AI service abstraction. The rest of the app calls these named functions
// and never knows which provider is behind them — swapping or adding a
// provider later means changing this file and /api/gemini-explain.js, not
// the UI.
//
// There are no accounts in this build: every call is a plain, same-origin
// POST to our own /api/gemini-explain function, which holds the Gemini key
// server-side and forwards the request. No token, no sign-in, no
// client-side quota tracking — the function does its own best-effort
// IP rate limiting instead (see api/_shared/rateLimit.js). Notebooks,
// PDFs, and annotations never touch this file or any server at all; only
// the AI features (this file + rag.js/embeddings.js) make network calls.

const AI_EXPLAIN_ENDPOINT = '/api/gemini-explain'
const AI_TRANSCRIBE_ENDPOINT = '/api/gemini-transcribe'

export class AiError extends Error {
  constructor(message, { code } = {}) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

async function callFunction(payload, endpoint = AI_EXPLAIN_ENDPOINT) {
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      code: response.status === 429 ? 'quota_exceeded' : response.status === 500 ? 'not_configured' : 'server'
    })
  }

  return data
}

// --- Public interface ------------------------------------------------------

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

// Reads handwriting from a PNG data URL of the strokes. Resolves to
// { isText, text, confidence }. Used by the canvas's "convert to text" mode.
export function transcribeHandwriting(image) {
  return callFunction({ image }, AI_TRANSCRIBE_ENDPOINT)
}
