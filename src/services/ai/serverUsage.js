import { supabase, isSupabaseConfigured } from '../supabase/client.js'

// Real usage (Phase 7), read from the same `ai_requests` table the Edge
// Functions write to — via the signed-in user's own JWT, so RLS
// (supabase/migrations/0001_init.sql) guarantees this can only ever return
// their own count, the same way it guarantees the Edge Function's
// enforcement can't be tricked into checking someone else's usage.
//
// Returns null when signed out or unconfigured — callers should treat that
// as "nothing to show" rather than "zero used", since it isn't a real
// answer either way.
export async function getUsage() {
  if (!isSupabaseConfigured()) return null

  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_id, plans(name, ai_requests_per_month)')
    .eq('id', user.id)
    .single()

  const limit = profile?.plans?.ai_requests_per_month ?? 100
  const planName = profile?.plans?.name ?? 'Free'

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())

  const used = count ?? 0
  return { used, limit, remaining: Math.max(0, limit - used), planName }
}
