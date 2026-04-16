import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  const response = await fetch("https://API_ORBITA/pacientes");
  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});