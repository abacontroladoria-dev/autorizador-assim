import { createBrowserClient } from "@supabase/ssr";

type AnyClient = ReturnType<typeof createBrowserClient<any>>;

let client: AnyClient | null = null;

export function getSupabaseClient(): AnyClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ) as AnyClient;
  }

  return client;
}
