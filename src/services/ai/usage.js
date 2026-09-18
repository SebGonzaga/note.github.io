import { getCurrentPlan } from '../../config/plans.js'

const STORAGE_KEY = 'inkwell.aiUsage'

// Local AI usage tracking.
//
// IMPORTANT: this is a cost-shaping and UX affordance, not a security
// control. Anyone can clear localStorage and reset their own counter. Real
// enforcement has to happen server-side in the Edge Function once auth
// exists (Phase 7) — this exists now so the limit UI, the usage meter, and
// the "you've hit your limit" path are all built and testable before the
// server half arrives, and so the recorded fields already match the
// `ai_requests` table the spec describes.

function currentPeriod() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { period: currentPeriod(), requests: [] }
    const parsed = JSON.parse(raw)
    // Rolls over automatically at the start of each month.
    if (parsed.period !== currentPeriod()) return { period: currentPeriod(), requests: [] }
    return parsed
  } catch {
    return { period: currentPeriod(), requests: [] }
  }
}

function write(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private browsing) — usage tracking degrades
    // silently rather than breaking the feature.
  }
}

export function getUsage() {
  const state = read()
  const plan = getCurrentPlan()
  const used = state.requests.length
  const limit = plan.aiRequestsPerMonth
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    period: state.period,
    planName: plan.name
  }
}

export function hasQuotaRemaining() {
  const { remaining } = getUsage()
  return remaining > 0
}

// Mirrors the `ai_requests` columns from the spec so the shape doesn't have
// to change when this moves server-side.
export function recordRequest({ feature, model, inputTokens, outputTokens, durationMs, success }) {
  const state = read()
  state.requests.push({
    feature,
    model: model ?? null,
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    durationMs: durationMs ?? null,
    success: success !== false,
    createdAt: Date.now()
  })
  write(state)
}

export function resetUsage() {
  write({ period: currentPeriod(), requests: [] })
}
