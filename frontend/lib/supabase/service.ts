import 'server-only'

import { createClient, SupabaseClient } from "@supabase/supabase-js"

function createServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase service client requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
}

let _client: SupabaseClient | null = null

// Lazy proxy: client is only instantiated on first property access (at request time),
// not at module load time. This allows next build to complete without runtime env vars.
export const supabaseService = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_client) {
      _client = createServiceClient()
    }
    const value = (_client as any)[prop]
    return typeof value === 'function' ? value.bind(_client) : value
  },
})
