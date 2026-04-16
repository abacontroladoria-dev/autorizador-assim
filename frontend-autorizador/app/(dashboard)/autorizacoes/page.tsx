'use client'

import { StatusBadge } from '@/components/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { listarAutorizacoes } from '@/services/autorizacoes.service'
import { useRouter } from 'next/navigation'

export default function AutorizacoesPage() {
  const router = useRouter()
  const hoje = new Date().toISOString().split('T')[0]

  const [dados, setDados] = useState<any[]>([])
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [dataInicio, setDataInicio] = useState(hoje)
  
  const [dataFim, setDataFim] = useState(hoje)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setLoading(true)
    const res = await listarAutorizacoes()
    setDados(res)
    setLoading(false)
  }

  async function cancelarExecucao(id: string) {
    await fetch('/api/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    setMsg('Execução cancelada')
  }

  async function executarRobo(id: string) {
    await supabase
      .from('autorizacoes')
      .update({ status: 'pendente' })
      .eq('id', id)

    setMsg('Robô colocado na fila 🚀')
  }

  useEffect(() => {
    carregar()
    const interval = setInterval(carregar, 15000)
    return () => clearInterval(interval)
  }, [])

  // 🔥 FILTROS
  const filtrados = dados
  .filter(a => {
    if (!a.data_atendimento) return false

    return (
      a.data_atendimento >= dataInicio &&
      a.data_atendimento <= dataFim
     )
   })
  .filter(a => filtro ? a.status === filtro : true)
  .filter(a =>
    a.paciente_nome?.toLowerCase().includes(busca.toLowerCase())
  )

function aplicarFiltroRapido(tipo: string) {
  const hoje = new Date()

  let inicio = new Date()
  let fim = new Date()

  if (tipo === 'hoje') {
    // hoje mesmo
  }

  if (tipo === 'semana') {
    const dia = hoje.getDay() || 7
    inicio.setDate(hoje.getDate() - dia + 1)
  }

  if (tipo === 'mes') {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  }

  const formatar = (data: Date) =>
    data.toISOString().split('T')[0]

  setDataInicio(formatar(inicio))
  setDataFim(formatar(fim))
}

function limparFiltros() {
  const hoje = new Date().toISOString().split('T')[0]

  setDataInicio(hoje)
  setDataFim(hoje)
  setBusca('')
  setFiltro('')
}

  return (
    <div className="p-5 bg-slate-50 min-h-screen">

      {/* FEEDBACK */}
      {msg && (
        <div className="mb-4 text-sm text-green-600">
          {msg}
        </div>
      )}

      {/* HEADER */}
      <div className="mb-6 px-5 py-3 bg-white/80 backdrop-blur-sm border border-slate-200/70 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-800">
          Autorizações
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Agenda de autorizações do dia
        </p>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 mb-4">

  {/* INTERVALO DE DATA */}
  <div className="flex items-center gap-2">

<div className="flex gap-2">

  <button
    onClick={() => aplicarFiltroRapido('hoje')}
    className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 hover:bg-slate-300"
  >
    Hoje
  </button>

  <button
    onClick={() => aplicarFiltroRapido('semana')}
    className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 hover:bg-slate-300"
  >
    Semana
  </button>

  <button
    onClick={() => aplicarFiltroRapido('mes')}
    className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 hover:bg-slate-300"
  >
    Mês
  </button>

</div>

    <input
      type="date"
      value={dataInicio}
      onChange={(e) => setDataInicio(e.target.value)}
      className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
    />

    <span className="text-slate-400 text-sm">até</span>

    <input
      type="date"
      value={dataFim}
      onChange={(e) => setDataFim(e.target.value)}
      className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
    />

  </div>

  {/* BUSCA */}
  <input
    type="text"
    placeholder="Buscar paciente..."
    value={busca}
    onChange={(e) => setBusca(e.target.value)}
    className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-60"
  />

  {/* STATUS */}
  <select
    value={filtro}
    onChange={(e) => setFiltro(e.target.value)}
    className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
  >
    <option value="">Todos</option>
    <option value="pendente">Pendentes</option>
    <option value="executando">Executando</option>
    <option value="concluido">Concluídos</option>
    <option value="erro">Erro</option>
  </select>

  {/* BOTÃO */}
  <button
    onClick={carregar}
    className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
  >
    Atualizar
  </button>

	<button
	  onClick={limparFiltros}
	  className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 transition"
	>
	  Limpar
	</button>
</div>

      {/* GRID */}
      {loading ? (
        <div className="text-slate-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          Nenhuma autorização encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

          {filtrados.map((a) => (
            <div
              key={a.id}
              onClick={() => router.push(`/autorizacoes/${a.id}`)}
              className={`p-4 rounded-xl border transition shadow-sm hover:shadow-md cursor-pointer ${
                a.status === 'executando'
                  ? 'bg-blue-50 border-[#3A8FB7]'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex justify-between items-start">

                <div className="space-y-1">

                  <div className="text-sm font-semibold text-[#3A8FB7]">
                    {a.horario || '--:--'}
                  </div>

                  <div className="font-semibold text-slate-800">
                    {a.paciente_nome}
                  </div>

                  {/* <div className="text-xs text-slate-500"> //
                  //  {a.empresa}.{a.matricula}-{a.dep}//
                  // </div>//*/}
                  
				  <div className="text-xs text-slate-500">
                    {a.terapia || '---'}
                  </div>
				  
				  <div className="text-xs text-slate-500">
                    {a.nome_medico && `Dr(a) ${a.nome_medico}`}
                  </div>
				  
					<div className="text-xs text-slate-400">
					  {a.data_atendimento
						  ? a.data_atendimento.split('-').reverse().join('/')
						  : '--/--/----'}
					</div>

                </div>

                <StatusBadge status={a.status} />

              </div>

              {/* AÇÕES */}
	{/*
				  <div className="flex gap-2 mt-4">

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    executarRobo(a.id)
                  }}
                  disabled={['executando', 'concluido'].includes(a.status)}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-500 text-white disabled:opacity-50"
                >
                  Executar
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    cancelarExecucao(a.id)
                  }}
                  disabled={a.status === 'concluido'}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white disabled:opacity-50"
                >
                  Cancelar
                </button>

              </div>
	*/}
            </div>
          ))}

        </div>
      )}

    </div>
  )
}