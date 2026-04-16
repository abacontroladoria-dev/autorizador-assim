import { createClient } from '@/lib/supabase/server'

export default async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('autorizacoes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.log('ERRO DETALHE:', error)
    console.log('ID RECEBIDO:', id)

    return (
      <div className="p-6 text-red-500">
        Não encontrado
      </div>
    )
  }

return (
  <div className="p-6 bg-slate-50 min-h-screen">

    {/* HEADER */}
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-800">
        Detalhe da Autorização
      </h1>
      <p className="text-sm text-slate-500">
        Informações completas da solicitação
      </p>
    </div>

    {/* CARD */}
    <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl shadow p-6 space-y-6">

      {/* TOPO */}
      <div className="flex justify-between items-center">
        <div className="text-lg font-semibold text-[#3A8FB7]">
          {data.horario || '--:--'}
        </div>

        <span className="px-3 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">
          {data.status}
        </span>
      </div>

      {/* PACIENTE */}
      <div>
        <p className="text-sm text-slate-400">Paciente</p>
        <p className="text-lg font-semibold text-slate-800">
          {data.paciente_nome}
        </p>
      </div>

      {/* CARTEIRINHA */}
      <div>
        <p className="text-sm text-slate-400">Carteirinha</p>
        <p className="text-slate-700">
          {data.empresa}.{data.matricula}-{data.dep}
        </p>
      </div>

      {/* TERAPIA + MÉDICO */}
      <div>
        <p className="text-sm text-slate-400">Atendimento</p>
        <p className="text-slate-700">
          {data.terapia || '---'}
          {data.nome_medico && ` • ${data.nome_medico}`}
        </p>
      </div>

      {/* DATA */}
      <div>
        <p className="text-sm text-slate-400">Data do Atendimento</p>
        <p className="text-slate-700">
          {data.data_atendimento
            ? data.data_atendimento.split('-').reverse().join('/')
            : '--/--/----'}
        </p>
      </div>

      {/* INFO TÉCNICA */}
      <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
        Criado em: {new Date(data.created_at).toLocaleString('pt-BR')}
      </div>

    </div>
	<div className="mt-6">
	  <a
		href="/autorizacoes"
		className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
	  >
		← Voltar
	  </a>
	</div>
  </div>
)
}