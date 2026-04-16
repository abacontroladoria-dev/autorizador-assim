export async function POST(req: Request) {
  const { id } = await req.json()

  console.log('Cancelando execução:', id)

  const { data, error } = await supabase
    .from('autorizacoes')
    .update({
      status: 'erro',
      erro: 'Cancelado pelo usuário',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select() // 👈 ESSENCIAL PRA DEBUG

  console.log('RESULTADO UPDATE:', data)
  console.log('ERRO:', error)

  return Response.json({ ok: true })
}