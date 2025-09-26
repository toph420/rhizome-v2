import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async () => {
  const env = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? '***exists***' : 'missing',
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ? '***exists***' : 'missing',
    GOOGLE_AI_API_KEY: Deno.env.get('GOOGLE_AI_API_KEY') ? '***exists***' : 'missing',
  }
  
  return new Response(JSON.stringify(env, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
