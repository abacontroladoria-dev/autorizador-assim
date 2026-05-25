import { createClient } from "@supabase/supabase-js";

type AnyClient = ReturnType<typeof createClient<any>>;

let client: AnyClient | null = null;

export function getSupabaseClient(): AnyClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          autoRefreshToken: true,
        },
      }
    ) as AnyClient;
  }

  return client;
}
