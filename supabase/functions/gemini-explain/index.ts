// Supabase Edge Function — scaffolding for Phase 5 ("Explain Selection").
//
// This is not called by the app yet (Phase 1 has no AI). It exists now so the
// deployment shape is settled: the frontend never sees GEMINI_API_KEY, only
// this function does, as a Supabase secret.
//
// Deploy:   supabase functions deploy gemini-explain
// Set key:  supabase secrets set GEMINI_API_KEY=your-key-here
// Call:     POST https://<project-ref>.functions.supabase.co/gemini-explain

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your Vercel domain before shipping
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { selectedText, context, mode } = await req.json()

    if (!selectedText) {
      return jsonResponse({ error: 'selectedText is required' }, 400)
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not configured' }, 500)
    }

    const systemInstruction =
      'You are a study assistant. Explain the user\'s selected text using the ' +
      'supplied study material whenever possible. Prioritize the supplied ' +
      'material. Clearly distinguish between information found in the ' +
      'material and general knowledge. Do not invent information. If the ' +
      'material does not contain enough information, say so and provide a ' +
      'general explanation. Keep the answer appropriate for a student.'

    const prompt = [
      `SELECTED TEXT:\n${selectedText}`,
      context ? `CONTEXT FROM USER'S MATERIAL:\n${context}` : '',
      `MODE: ${mode || 'explain'}`
    ]
      .filter(Boolean)
      .join('\n\n')

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    })

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return jsonResponse({ error: 'Gemini request failed', detail }, 502)
    }

    const data = await geminiRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    return jsonResponse({ explanation: text })
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
