import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// A single shared client. `null` when Supabase isn't configured, so the
// rest of the app can check `isSupabaseConfigured()` rather than every
// caller needing its own try/catch around a missing client.
//
// flowType: 'pkce' is not optional here. This app uses HashRouter
// (`/#/route` for client-side routing), but Supabase's default ("implicit")
// auth flow *also* puts its tokens in the URL hash (`#access_token=...`)
// after an email link or OAuth redirect — those two uses of the hash
// collide, and the recovery/OAuth tokens would never reach Supabase's
// client because HashRouter's own routing would consume the fragment
// first. PKCE instead passes its one-time code as a normal query string
// (`?code=...`), which sits happily alongside a `#/route` fragment in the
// same URL.
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }
    })
  : null

export function isSupabaseConfigured() {
  return supabase !== null
}
