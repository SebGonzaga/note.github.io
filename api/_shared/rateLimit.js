// Best-effort per-IP rate limiting, kept entirely in the function's own
// memory. There are no user accounts anymore (see README), so there is no
// identity to attach a real per-user quota to — this is the replacement:
// crude, resets whenever the serverless instance recycles, and easy to
// route around with a VPN, but it stops a casual loop or a stray bug from
// quietly spending your whole Gemini budget, which is the actual goal.
//
// Two independent windows: a short burst limit (catches a runaway retry
// loop within seconds) and a daily limit (caps a single IP's total cost
// per day). Both are intentionally simple — no Redis, no KV, no database —
// because the whole point of this pass was removing infrastructure, not
// adding a new piece of it just to rate-limit the AI calls.

const buckets = new Map() // ip -> { burst: number[], day: { count, resetAt } }

const BURST_WINDOW_MS = 10_000
const BURST_MAX = 5
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_MAX = 60 // total AI calls (explain + embed) per IP per day

function getIp(req) {
  // Vercel sets x-forwarded-for; fall back for local/other hosts.
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return String(forwarded).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

export function checkRateLimit(req) {
  const ip = getIp(req)
  const now = Date.now()
  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { burst: [], day: { count: 0, resetAt: now + DAY_MS } }
    buckets.set(ip, bucket)
  }

  if (now > bucket.day.resetAt) {
    bucket.day = { count: 0, resetAt: now + DAY_MS }
  }

  bucket.burst = bucket.burst.filter((t) => now - t < BURST_WINDOW_MS)

  if (bucket.burst.length >= BURST_MAX) {
    return { allowed: false, reason: 'Too many requests in a short time. Wait a few seconds and try again.' }
  }
  if (bucket.day.count >= DAY_MAX) {
    return { allowed: false, reason: 'Daily AI request limit reached for this connection. Try again tomorrow.' }
  }

  bucket.burst.push(now)
  bucket.day.count += 1

  // Keep the map from growing forever on a long-lived instance.
  if (buckets.size > 5000) {
    const oldestKey = buckets.keys().next().value
    buckets.delete(oldestKey)
  }

  return { allowed: true }
}
