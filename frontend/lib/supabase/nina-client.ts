import { createBrowserClient } from "@supabase/ssr";

type AnyClient = ReturnType<typeof createBrowserClient<any>>;

let ninaClient: AnyClient | null = null;

export function getNinaSupabaseClient(): AnyClient {
  if (!ninaClient) {
    ninaClient = createBrowserClient(
      process.env.NEXT_PUBLIC_NINA_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_NINA_SUPABASE_ANON_KEY!
    ) as AnyClient;
  }
  return ninaClient;
}
