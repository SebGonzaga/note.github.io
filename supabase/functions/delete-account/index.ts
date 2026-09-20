// Supabase Edge Function — delete the calling user's own account.
//
// This exists ONLY because deleting an auth.users row requires the
// service-role key, which must never be shipped to the browser. Every
// other table cascades automatically via `on delete cascade` in the
// schema (supabase/migrations/0001_init.sql) once the auth user is gone.
//
// Deploy: supabase functions deploy delete-account
// (Uses Supabase's built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// secrets — these are provided automatically, no `secrets set` needed.)

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Not signed in.' }, 401)

    // A client scoped to the caller's own JWT — used only to find out who
    // is asking, never to perform the deletion itself.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const {
      data: { user },
      error: userError
    } = await callerClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Not signed in.' }, 401)

    // The service-role client is what can actually delete an auth user —
    // it bypasses RLS entirely, which is exactly why it never leaves this
    // server-side function.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Storage files aren't covered by the cascade (Storage isn't a normal
    // FK relationship), so they're removed explicitly first.
    const { data: files } = await adminClient.storage.from('documents').list(user.id)
    if (files && files.length > 0) {
      await adminClient.storage.from('documents').remove(files.map((f) => `${user.id}/${f.name}`))
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) return jsonResponse({ error: deleteError.message }, 500)

    return jsonResponse({ deleted: true })
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Unexpected error' }, 500)
  }
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
