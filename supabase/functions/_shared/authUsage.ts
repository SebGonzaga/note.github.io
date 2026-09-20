// Shared by gemini-explain and gemini-embed. This is where "usage limits"
// stops being a client-side courtesy (Phases 5-6's localStorage counter,
// which anyone could clear) and becomes real: the caller's identity comes
// from a verified JWT, the quota check and the usage row both happen here,
// server-side, and RLS (supabase/migrations/0001_init.sql) is what
// actually stops one user from reading or inflating another user's usage
// — not any check in this file.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: 'Sign in to use AI features.', status: 401 as const }

  // Scoped to the caller's own JWT, not the service role — every query
  // this client makes is subject to RLS, so it can only ever see or write
  // this one user's rows. That's on purpose: it means a bug here can't
  // leak or corrupt another user's data, only misbehave within the
  // caller's own account.
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }
  })

  const {
    data: { user },
    error
  } = await client.auth.getUser()
  if (error || !user) return { error: 'Sign in to use AI features.', status: 401 as const }

  return { client, user }
}

export async function checkQuota(client: any, userId: string) {
  const { data: profile } = await client
    .from('profiles')
    .select('plan_id, plans(name, ai_requests_per_month)')
    .eq('id', userId)
    .single()

  // A missing profile/plan row shouldn't crash the request — fall back to
  // the free tier's numbers rather than letting an edge case become an
  // unlimited-usage bug.
  const limit = profile?.plans?.ai_requests_per_month ?? 100
  const planName = profile?.plans?.name ?? 'Free'

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count } = await client
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())

  const used = count ?? 0
  return { allowed: used < limit, used, limit, planName }
}

export async function recordUsage(
  client: any,
  userId: string,
  fields: {
    feature: string
    model?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    durationMs?: number
    success: boolean
  }
) {
  // Best-effort — a logging failure shouldn't turn a successful AI
  // response into a failed request from the caller's point of view.
  try {
    await client.from('ai_requests').insert({
      user_id: userId,
      feature: fields.feature,
      model: fields.model ?? null,
      input_tokens: fields.inputTokens ?? null,
      output_tokens: fields.outputTokens ?? null,
      duration_ms: fields.durationMs != null ? Math.round(fields.durationMs) : null,
      success: fields.success
    })
  } catch {
    // swallow
  }
}
