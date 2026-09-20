import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase/client.js'

// Single source of truth for "who's signed in", kept live via Supabase's
// own auth state listener rather than polled. Returns `loading: true` only
// for the very first check, so a page that doesn't care about auth never
// has to render a spinner for it.
export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured())

  useEffect(() => {
    if (!isSupabaseConfigured()) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => subscription.unsubscribe()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    isSignedIn: !!session
  }
}
