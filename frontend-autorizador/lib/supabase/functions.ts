import { getSupabaseClient } from "./client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must be defined");
}

const FUNCTIONS_BASE_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;

export function getFunctionUrl(path: string) {
  return `${FUNCTIONS_BASE_URL}/${path}`;
}

export async function getFunctionHeaders(options?: { contentType?: string | null; additionalHeaders?: HeadersInit }) {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const headers = new Headers();
  const contentType = options?.contentType ?? "application/json";

  if (contentType !== null) {
    headers.set("Content-Type", contentType);
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options?.additionalHeaders) {
    const extra = new Headers(options.additionalHeaders);
    for (const [key, value] of extra.entries()) {
      if (value === null) {
        headers.delete(key);
      } else {
        headers.set(key, value);
      }
    }
  }

  return headers;
}
