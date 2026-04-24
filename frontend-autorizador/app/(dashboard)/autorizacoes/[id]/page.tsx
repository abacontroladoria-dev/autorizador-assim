import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function Detalhe({ params,}: { params: { id: string } }) {
  const { id } = params
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fila_autorizacoes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return (
      <div className="p-6 text-red-500">
        Não encontrado
      </div>
    )
  }

  const statusStyle = {
    pendente: 'bg-yellow-100 text-yellow-700',
    executando: 'bg-blue-100 text-blue-700',
    concluido: 'bg-green-100 text-green-700',
    erro: 'bg-red-100 text-red-700'
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">

<Link
  href="/autorizacoes"
  className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
>
  ← Voltar para fila
</Link>

      {/* HEADER */}
      <div className="flex justify-between items-start">

        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            Detalhe da Autorização
          </h1>
          <p className="text-sm text-slate-500">
            Informações completas e ações disponíveis
          </p>
        </div>

        <span className={`px-3 py-1 text-xs rounded-full font-medium ${statusStyle[data.status as keyof typeof statusStyle]}`}>
          {data.status}
        </span>

      </div>

      {/* CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow p-6 space-y-6">

        <div className="text-lg font-semibold text-[#3A8FB7]">
          {data.horario || '--:--'}
        </div>

        <div>
          <p className="text-sm text-slate-400">Paciente</p>
          <p className="text-lg font-semibold text-slate-800">
            {data.paciente_nome}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-400">Carteirinha</p>
          <p className="text-slate-700">
            {data.empresa}.{data.matricula}-{data.dep}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-400">Atendimento</p>
          <p className="text-slate-700">
            {data.terapia || '---'}
            {data.nome_medico && ` • ${data.nome_medico}`}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-400">Data</p>
          <p className="text-slate-700">
            {data.data_atendimento
              ? data.data_atendimento.split('-').reverse().join('/')
              : '--/--/----'}
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100 text-xs text-slate-400">
          Criado em: {new Date(data.created_at).toLocaleString('pt-BR')}
        </div>

      </div>

      {/* AÇÕES */}
      <div className="flex gap-3">

        <button className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition">
          Autorizar
        </button>

        <button className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium transition">
          Cancelar
        </button>

      </div>

      {/* VOLTAR */}
      <Link
        href="/autorizacoes"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
      >
        ← Voltar
      </Link>

    </div>
  )
}