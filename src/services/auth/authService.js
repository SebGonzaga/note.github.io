import { supabase, isSupabaseConfigured } from '../supabase/client.js'

export class AuthError extends Error {
  constructor(message, { code } = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

function assertConfigured() {
  if (!isSupabaseConfigured()) {
    throw new AuthError(
      'Accounts aren’t configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.',
      { code: 'not_configured' }
    )
  }
}

export async function signUp(email, password) {
  assertConfigured()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new AuthError(error.message, { code: error.code })
  return data
}

export async function signIn(email, password) {
  assertConfigured()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new AuthError(error.message, { code: error.code })
  return data
}

export async function signInWithGoogle() {
  assertConfigured()
  // No specific landing page needed — useAuth() picks up the new session
  // on whatever route the person returns to.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/#/` }
  })
  if (error) throw new AuthError(error.message, { code: error.code })
  return data
}

export async function signOut() {
  assertConfigured()
  const { error } = await supabase.auth.signOut()
  if (error) throw new AuthError(error.message, { code: error.code })
}

export async function requestPasswordReset(email) {
  assertConfigured()
  // The #/ before the route matters — see the flowType comment in
  // supabase/client.js for why (HashRouter vs. Supabase's URL tokens).
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#/reset-password`
  })
  if (error) throw new AuthError(error.message, { code: error.code })
}

// Called on the /reset-password page after the person follows the email
// link, which signs them into a temporary recovery session automatically.
export async function updatePassword(newPassword) {
  assertConfigured()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new AuthError(error.message, { code: error.code })
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Account deletion (spec §18). Supabase's client SDK has no self-service
// "delete my own account" call — deleting an auth.users row requires the
// service-role key, which must never reach the browser. This is why it's
// implemented as an Edge Function (delete-account) rather than here: the
// function runs server-side with that key, verifies the request came from
// the account being deleted (via the caller's own JWT), deletes their
// Storage files, then the auth user (which cascades through every table
// via `on delete cascade` in the schema).
export async function deleteAccount() {
  assertConfigured()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new AuthError('Not signed in.', { code: 'not_authenticated' })

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new AuthError(data?.error || 'Account deletion failed.', { code: 'server' })
  await supabase.auth.signOut()
}
