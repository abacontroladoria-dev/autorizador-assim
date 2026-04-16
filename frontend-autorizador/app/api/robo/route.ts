import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { id } = await req.json()

  console.log('Disparando autorização:', id)

  // 🟡 marca como pendente (ou executando, se preferir)
  await supabase
    .from('autorizacoes')
    .update({ status: 'pendente' })
    .eq('id', id)

  return Response.json({ ok: true })
}