//AUTORIZACOES//

'use client'

import { StatusBadge } from '@/components/StatusBadge'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { listarAutorizacoes } from '@/services/autorizacoes.service'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useMemo } from 'react'
import { getStatusConfig } from '@/utils/statusAutorizacao'


const ItemAutorizacao = React.memo(
  ({ a, router, setSelecionado }: any) => {
	
	const status = getStatusConfig(a)
	
    const statusColor =
	  a.is_manual
		? "border-l-blue-400"
		: a.status_assim === 'autorizado'
		? "border-l-green-500"
		: a.status_assim === 'pendencia_adm'
		? "border-l-red-500"
		: a.status === "erro"
		? "border-l-red-500"
		: a.status === "executando"
		? "border-l-blue-500"
		: a.status === "concluido"
		? "border-l-yellow-400"
		: a.status === "falta"
		? "border-l-orange-400"
		: "border-l-yellow-400"

    return (
      <div
        onClick={() => setSelecionado(a)}
        className={`w-full p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:bg-slate-50 transition cursor-pointer border-l-4 ${statusColor}
        grid grid-cols-[120px_90px_1fr_220px_140px_120px] items-center gap-4`}
      >

        <div className="text-sm text-slate-600 font-medium">
          {a.data_atendimento
            ? a.data_atendimento.split('-').reverse().join('/')
            : '--/--/----'}
        </div>

        <div className="font-semibold text-[#3A8FB7]">
          {a.horario ? a.horario.slice(0, 5) : '--:--'}
        </div>

        <div className="font-semibold text-slate-900 truncate">
          {a.paciente_nome}
        </div>

        <div className="text-sm text-slate-500 truncate">
			{
			  a.classificacao_terapia ||
			  a.terapia_falta ||
			  a.agenda_orbita?.terapia ||
			  'Sem terapia'
			}
        </div>

<div className="flex items-center justify-center">
  <span
    className={`
      min-w-[140px]
      text-center text-xs
      px-3 py-1.5 rounded-full
      font-medium leading-tight
      ${status.className}
    `}
  >
    {status.label}
  </span>
</div>

<div className="flex items-center justify-center">
<span
  className={`
    text-xs text-center leading-tight
    px-3 py-1.5 rounded-lg font-medium
    ${a.is_manual
      ? 'bg-blue-100 text-blue-700'
      : 'bg-green-100 text-green-700'}
  `}
>
  Solicitação<br />
  {a.is_manual ? 'manual' : 'via sistema'}
</span>
</div>

      </div>
    )
  }
)

export default function AutorizacoesPage() {
  const router = useRouter()
  const hoje = new Date().toISOString().split('T')[0]
  const [filtroHorario, setFiltroHorario] = useState('')
  const [dados, setDados] = useState<any[]>([])
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const supabase = getSupabaseClient()
  const [firstLoad, setFirstLoad] = useState(true)
  const [selecionado, setSelecionado] = useState<any>(null)
  const statusColor =
  selecionado?.status_assim === 'autorizado'
    ? 'bg-green-100 text-green-700'
    : selecionado?.status_assim === 'pendencia_adm'
    ? 'bg-red-100 text-red-700'
    : selecionado?.status_assim === 'estornado'
    ? 'bg-gray-200 text-gray-700'
    : 'bg-yellow-100 text-yellow-700'

  const statusLabel =
  selecionado?.status_assim === 'autorizado'
    ? 'Autorizado'
    : selecionado?.status_assim === 'pendencia_adm'
    ? 'Glosa'
    : selecionado?.status_assim === 'estornado'
    ? 'Estornado'
    : 'Em análise'

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
	  setFiltroHorario('')
	}

	const filtrados = useMemo(() => {
	  return dados
		.filter(a => {
		  if (!a.data_atendimento) return false

		  return (
			a.data_atendimento >= dataInicio &&
			a.data_atendimento <= dataFim
		  )
		})
		.filter(a => (filtro ? (a.status_assim || a.status) === filtro : true))
		.filter(a =>
		  a.paciente_nome?.toLowerCase().includes(busca.toLowerCase())
		)
		.filter(a =>
		  !filtroHorario || a.horario?.slice(0, 5) === filtroHorario
		)
	}, [dados, dataInicio, dataFim, filtro, busca, filtroHorario])


	const ordenados = useMemo(() => {
	  return [...filtrados].sort((a, b) => {
		const hA = a.horario || ''
		const hB = b.horario || ''
		return hA.localeCompare(hB)
	  })
	}, [filtrados])


	async function carregar() {
	  if (firstLoad && dados.length === 0) setLoading(true)

	  const res = await listarAutorizacoes()

		setDados(prev => {
		  if (prev.length !== res.length) return res

		  const prevMap = new Map(prev.map(p => [p.id, p.updated_at]))

		  for (const item of res) {
			if (prevMap.get(item.id) !== item.updated_at) {
			  return res
			}
		  }

		  return prev
		})

	  setLoading(false)
	  setFirstLoad(false)
	}

  async function chamarResponsavel(paciente: any) {
    try {
      const { error } = await supabase
        .from('chamada_paciente')
        .insert([
          {
            nome: paciente.paciente_nome,
            sala: paciente.sala || 'Recepção 1',
            agenda_id: paciente.id,
          },
        ])
  
      if (error) {
          alert('Erro ao chamar paciente')
        return
      }
  
      console.log('✅ CHAMADA INSERIDA')
    } catch (err) {
      console.error(err)
    }
  }

  async function cancelarExecucao(id: string) {
    const { error } = await supabase
      .from('fila_autorizacoes')
      .update({
        status: 'cancelado',
        erro: 'Cancelado pelo usuário',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

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
  document.body.style.overflow = selecionado ? 'hidden' : 'auto'
}, [selecionado])

useEffect(() => {
  carregar()

  const interval = setInterval(() => {
    console.log('🔄 sync...')
    carregar()
  }, 15000)

  return () => clearInterval(interval)
}, [])

  return (
	<>
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            Histórico de Autorizações
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
          <button onClick={() => aplicarFiltroRapido('hoje')} className="flex gap-2 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Hoje
          </button>
          <button onClick={() => aplicarFiltroRapido('semana')} className="flex gap-2 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Semana
          </button>
          <button onClick={() => aplicarFiltroRapido('mes')} className="flex gap-2 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200">
            Mês
          </button>
        </div>

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="flex gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="flex gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="text"
          placeholder="Buscar paciente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[250px] border border-slate-200 rounded-lg px-3 py-2 text-sm w-60"
        />

		<select
		  value={filtroHorario}
		  onChange={(e) => setFiltroHorario(e.target.value)}
		  className="flex gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
		>
		  <option value="">Horário</option>

		  {/* você pode ajustar os horários depois */}
		  <option value="08:00">08:00</option>
		  <option value="08:40">08:40</option>
		  <option value="09:20">09:20</option>
		  <option value="10:00">10:00</option>
		  <option value="10:40">10:40</option>
		  <option value="13:00">13:00</option>
		  <option value="13:40">13:40</option>
		  <option value="14:20">14:20</option>
		  <option value="15:00">15:00</option>
		  <option value="15:40">15:40</option>
		  <option value="16:20">16:20</option>
		  <option value="17:00">17:00</option>
		</select>

        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="flex gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="autorizado">Autorizados</option>
		  <option value="pendencia_adm">Glosa</option>
		  <option value="estornado">Estornados</option>
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

		{ordenados.map((a) => (
		  <ItemAutorizacao
			key={a.id}
			a={a}
			setSelecionado={setSelecionado}
		  />
		))}
        </div>
      )}
	</div>
{selecionado && (
  <div
    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
    onClick={() => setSelecionado(null)}
  >

    <div
      className="bg-white w-[720px] max-w-[95%] p-6 rounded-2xl shadow-xl space-y-6"
      onClick={(e) => e.stopPropagation()}
    >

      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
		<h2 className="text-xl font-semibold text-slate-800">
		  {selecionado.paciente_nome}
		</h2>

          <p className="text-sm text-slate-500">
            Matrícula: {selecionado.matricula || '—'}
          </p>
        </div>

        <button
          onClick={() => setSelecionado(null)}
          className="text-slate-400 hover:text-slate-700 text-lg"
        >
          ✕
        </button>
      </div>

      {/* STATUS + ORIGEM */}
      <div className="flex items-center gap-3">
        <span
		  className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusColor}`}
		>
		  {statusLabel}
		</span>

        <span
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium
            ${selecionado.is_manual
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'}
          `}
        >
          Solicitação<br />
          {selecionado.is_manual ? 'manual' : 'via sistema'}
        </span>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-2 gap-6">

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase">
            Atendimento
          </p>

          <div>
            <p className="text-xs text-slate-400">Data</p>
            <p className="font-medium">
              {new Date(selecionado.data_atendimento).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Horário do Agendamento</p>
            <p className="font-medium">
              {selecionado.horario?.slice(0, 5)}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Terapia</p>
            <p className="font-medium">
              {selecionado.classificacao_terapia || 'Não informada'}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">TUSS</p>
            <p className="font-medium">
              {selecionado.tuss || '—'}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase">
            Autorização
          </p>

          <div>
            <p className="text-xs text-slate-400">Status</p>
            <p className="font-medium">
              {selecionado.status_assim || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Número</p>
            <p className="font-medium">
              {selecionado.numero_autorizacao || '—'}
            </p>
          </div>
        </div>

      </div>

      {/* FOOTER */}
		<div className="flex items-center justify-between pt-4 border-t">

		  {/* ESQUERDA */}
		  <div className="text-sm text-slate-500 flex items-center gap-2">
			Solicitado por:{" "}
			<span className="font-medium text-slate-700">
			  {selecionado?.atendente_nome || '—'}
			</span>
		  </div>

		  {/* DIREITA */}
		  <button
			onClick={() => setSelecionado(null)}
			className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm"
		  >
			Fechar
		  </button>

		</div>

    </div>
  </div>
)}
</>
  )
}