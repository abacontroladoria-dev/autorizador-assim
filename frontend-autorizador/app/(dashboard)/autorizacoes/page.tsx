'use client'

import { StatusBadge } from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
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
  const supabase = getSupabase()

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
      .from('fila_autorizacoes')
      .update({ status: 'pendente' })
      .eq('id', id)

    setMsg('Robô colocado na fila 🚀')
  }

  useEffect(() => {
    carregar()
    const interval = setInterval(carregar, 15000)
    return () => clearInterval(interval)
  }, [])

  // FILTROS
  const filtrados = dados
    .filter(a => {
      if (!a.data_atendimento) return false

      return (
        a.data_atendimento >= dataInicio &&
        a.data_atendimento <= dataFim
      )
    })
    .filter(a => (filtro ? a.status === filtro : true))
    .filter(a =>
      a.paciente_nome?.toLowerCase().includes(busca.toLowerCase())
    )

  function aplicarFiltroRapido(tipo: string) {
    const hoje = new Date()

    let inicio = new Date()
    let fim = new Date()

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

  const ordenados = [...filtrados].sort((a, b) => {
    const hA = a.horario || ''
    const hB = b.horario || ''

    return hA.localeCompare(hB)
  })

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            Fila de Autorizações
          </h1>
          <p className="text-sm text-slate-500">
            Gerencie solicitações e acompanhe execuções
          </p>
        </div>

        <button
          onClick={carregar}
          className="px-4 py-2 rounded-lg bg-[#3A8FB7] text-white text-sm hover:bg-[#2f7aa0] transition"
        >
          Atualizar
        </button>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-center">

        <div className="flex gap-2">
          <button onClick={() => aplicarFiltroRapido('hoje')} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Hoje
          </button>
          <button onClick={() => aplicarFiltroRapido('semana')} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Semana
          </button>
          <button onClick={() => aplicarFiltroRapido('mes')} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Mês
          </button>
        </div>

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="text"
          placeholder="Buscar paciente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-60"
        />

        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="concluido">Concluídos</option>
          <option value="executando">Executando</option>
          <option value="falta">Faltas</option>
          <option value="pendente">Pendentes</option>
          <option value="erro">Erro</option>
        </select>

        <button
          onClick={limparFiltros}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-red-50 hover:text-red-600"
        >
          Limpar
        </button>
      </div>

      {/* FEEDBACK */}
      {msg && (
        <div className="text-sm text-green-600">
          {msg}
        </div>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#3A8FB7] rounded-full animate-spin mb-3"></div>
          Carregando autorizações...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          Nenhuma autorização encontrada
        </div>
      ) : (
        <div className="flex flex-col gap-3">

          {ordenados.map((a) => {

            const statusColor =
              a.status === "erro"
                ? "border-l-red-500"
                : a.status === "executando"
                ? "border-l-blue-500"
                : a.status === "concluido"
                ? "border-l-green-500"
                : a.status === "falta"
                ? "border-l-orange-400"
                : "border-l-yellow-400"

            return (
<div
  key={a.id}
  onClick={() => router.push(`/autorizacoes/${a.id}`)}
  className={`w-full p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:bg-slate-50 transition cursor-pointer border-l-4 ${statusColor}
  
  grid grid-cols-[120px_90px_1fr_220px_140px] items-center gap-4`}
>

  {/* DATA */}
  <div className="text-sm text-slate-600 font-medium">
    {a.data_atendimento
      ? a.data_atendimento.split('-').reverse().join('/')
      : '--/--/----'}
  </div>

  {/* HORA */}
  <div className="font-semibold text-[#3A8FB7]">
    {a.horario ? a.horario.slice(0, 5) : '--:--'}
  </div>

  {/* PACIENTE */}
  <div className="font-semibold text-slate-900 truncate">
    {a.paciente_nome}
  </div>

  {/* TERAPIA */}
  <div className="text-sm text-slate-500 truncate">
    {a.agenda_orbita?.terapia || 'Sem terapia'}
  </div>

  {/* STATUS */}
  <div className="flex justify-center">
    <span className={`text-xs px-3 py-1 rounded-full font-medium
      ${a.status === 'concluido' && 'bg-green-100 text-green-700'}
      ${a.status === 'pendente' && 'bg-yellow-100 text-yellow-700'}
      ${a.status === 'executando' && 'bg-blue-100 text-blue-700'}
      ${a.status === 'erro' && 'bg-red-100 text-red-700'}
      ${a.status === 'falta' && 'bg-orange-100 text-orange-700'}
    `}>
      {a.status}
    </span>
  </div>

</div>
            )
          })}

        </div>
      )}

    </div>
  )
}