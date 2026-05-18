'use client'

import StatusActionButtons from '@/components/controle-disponibilidade/StatusActionButtons'

import StatusModal from '@/components/controle-disponibilidade/StatusModal'

import { useEffect, useMemo, useState } from 'react'

import {
  useControleDisponibilidade
} from '@/hooks/useControleDisponibilidade'

import {
  Check,
  ChevronDown,
  Clock3,
  Search,
  UserRound,
  X,
} from 'lucide-react'

import {
  getHorarioInicial,
  getSala,
  getPaciente,
  getTerapeuta,
  getTerapia,
  getUnidade,
  terapiaDeveAparecer,
} from '@/components/central-terapeutas/helpers'

import type {
  ControleFilters,
  ControleTerapeuticoItem,
} from '@/components/central-terapeutas/types'

import { listarCentralTerapeutica } from '@/services/central-terapeutas.service'
import { atualizarStatusAtendimentosEmLote } from '@/services/controle-terapeutico.service'
import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

const statusStyles = {
  pendente:
    'bg-amber-100 text-amber-700',

  disponivel:
    'bg-green-100 text-green-700',

  indisponivel:
    'bg-red-100 text-red-700',
}

const statusLabels = {
  pendente:
    'Aguardando status',

  disponivel:
    'Disponível',

  indisponivel:
    'Indisponível',
}

function getHojeLocal() {
  const hoje = new Date()

  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')

  return `${ano}-${mes}-${dia}`
}

function normalizarStatusDisponibilidade(
  status?: string | null
): StatusDisponibilidade {
  if (status === 'disponivel' || status === 'indisponivel') {
    return status
  }

  return 'pendente'
}

type Ordenacao =
  | 'alfabetica'
  | 'sala'
  | 'horario'

type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'

type GrupoTerapeuta = {
  terapeuta: string
  terapia: string
  terapiaExibicao?: string
  unidade: string
  sala: string
  atendimentos: ControleTerapeuticoItem[]

  status: StatusDisponibilidade

  substituto?: string
}

type HorarioEdicao = {
  id: number
  horario: string
  paciente: string
  statusAtual?: string | null
  selecionado: boolean
}

export default function RegistroDisponibilidadePage() {
  const hoje = getHojeLocal()
  const [modalStatus, setModalStatus] =  useState<GrupoTerapeuta | null>(null)
  const [horariosEdicao, setHorariosEdicao] = useState<HorarioEdicao[]>([])
  const [dados, setDados] = useState<ControleTerapeuticoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [novoStatusModal, setNovoStatusModal] = useState<StatusDisponibilidade>('indisponivel')
  const [salvandoStatus, setSalvandoStatus] = useState<Record<string, boolean>>({})

  const [ordenacao, setOrdenacao] =
    useState<Ordenacao>('alfabetica')

  const [filtroStatus, setFiltroStatus] =
    useState<
      'todos' |
      StatusDisponibilidade
    >('todos')
  
  const [modalSubstituicao, setModalSubstituicao] =
    useState<GrupoTerapeuta | null>(null)

  const [buscaSubstituto, setBuscaSubstituto] =
    useState('')

  const [substituicoes, setSubstituicoes] = useState<
    Record<string, string>
  >({})

  const [statusProfissionais, setStatusProfissionais] =
    useState<
      Record<string, StatusDisponibilidade>
    >({})

  const [filters, setFilters] =
    useState<ControleFilters>({
      data: hoje,
      horario: '',
      unidade: '',
      terapeuta: '',
      paciente: '',
    })
	
	function abrirModalStatus(
	  grupo: GrupoTerapeuta
	) {

	  setModalStatus(grupo)

	  if (grupo.status === 'disponivel') {
		setNovoStatusModal('indisponivel')
	  } else {
		setNovoStatusModal('disponivel')
	  }
	}

function toggleHorario(
  id: number,
  checked: boolean
) {

  setHorariosEdicao((prev) =>
    prev.map((item) =>
      item.id === id
        ? {
            ...item,
            selecionado: checked,
          }
        : item
    )
  )
}

	function toggleCard(terapeuta: string) {

	  setCardsAbertos((prev) => ({
		...prev,
		[terapeuta]: !prev[terapeuta],
	  }))
	}

  const [cardsAbertos, setCardsAbertos] =
    useState<Record<string, boolean>>({})
  
  async function carregarDados() {
    try {
      setLoading(true)

      const response =
        await listarCentralTerapeutica(filters.data)

      setDados(response || [])
    } catch (error) {
      console.error(error)
      setDados([])
    } finally {
      setLoading(false)
    }
  }

	useEffect(() => {
	  if (!modalStatus) return

	  const agora = new Date()

	  const lista =
		modalStatus.atendimentos.map((item) => {

		  const dataHora = new Date(
			`${item.data_atendimento}T${item.hora_inicial}`
		  )

		  const futuro = dataHora >= agora

		  return {
			id: item.tita_agendamento_id,
			horario: item.hora_inicial,
			paciente: getPaciente(item),
			statusAtual: item.status,

			// futuros já vêm marcados
			selecionado: futuro,
		  }
		})

	  setHorariosEdicao(lista)

	}, [modalStatus])

  useEffect(() => {
    carregarDados()

    const channel = supabase
      .channel(`controle-terapeutico-disponibilidade-${filters.data}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'controle_terapeutico',
        },
        () => {
          carregarDados()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filters.data])

  const grupos = useMemo(() => {
    const base = dados
      .filter(terapiaDeveAparecer)
      .filter((item) => {
        if (!filters.unidade) return true

        return getUnidade(item)
          .toLowerCase()
          .includes(filters.unidade.toLowerCase())
      })
      .filter((item) => {
        if (!filters.terapeuta) return true

        return getTerapeuta(item)
          .toLowerCase()
          .includes(filters.terapeuta.toLowerCase())
      })
      .filter((item) => {
        if (!filters.paciente) return true

        return getPaciente(item)
          .toLowerCase()
          .includes(filters.paciente.toLowerCase())
      })

    const agrupado = base.reduce(
      (acc, item) => {
        const terapeuta = getTerapeuta(item)

		if (!acc[terapeuta]) {
		  acc[terapeuta] = {
			terapeuta,

			terapia: getTerapia(item),
			
			terapiaExibicao:
			  item.terapia_exibicao ||
			  item.terapia_exibicao_nome ||
			  '',

			unidade: getUnidade(item),

			sala: getSala(item),

			atendimentos: [],

			status:
			  statusProfissionais[terapeuta] ||
			  normalizarStatusDisponibilidade(
			    item.status_operacional ||
			    item.status
			  ),

			substituto:
			  substituicoes[terapeuta] ||
			  item.profissional_substituto_nome ||
			  undefined,
		  }
		}
        acc[terapeuta].atendimentos.push(item)

        return acc
      },
      {} as Record<string, GrupoTerapeuta>
    )

    let lista = Object.values(agrupado)

	if (filtroStatus !== 'todos') {
	  lista = lista.filter(
		(grupo) =>
		  grupo.status === filtroStatus
	  )
	}

    lista = lista.map((grupo) => ({
      ...grupo,
      atendimentos: grupo.atendimentos.sort((a, b) =>
        getHorarioInicial(a).localeCompare(
          getHorarioInicial(b)
        )
      ),
    }))

    if (ordenacao === 'alfabetica') {
      lista.sort((a, b) =>
        a.terapeuta.localeCompare(b.terapeuta)
      )
    }

    if (ordenacao === 'sala') {
      lista.sort((a, b) =>
        a.sala.localeCompare(b.sala)
      )
    }

    if (ordenacao === 'horario') {
      lista.sort((a, b) => {
        const horarioA = getHorarioInicial(
          a.atendimentos[0]
        )

        const horarioB = getHorarioInicial(
          b.atendimentos[0]
        )

        return horarioA.localeCompare(horarioB)
      })
    }

    return lista
  }, [
    dados,
    filters,
    ordenacao,
    statusProfissionais,
    substituicoes,
	filtroStatus,
  ])

async function atualizarStatusDireto(
  grupo: GrupoTerapeuta,
  status: StatusDisponibilidade
) {

  const ids =
    grupo.atendimentos
      .map((item) => item.tita_agendamento_id)
      .filter(Boolean)

  if (ids.length === 0) {
    return
  }

  setSalvandoStatus((prev) => ({
    ...prev,
    [grupo.terapeuta]: true,
  }))

  try {

    const resultado =
      await atualizarStatusAtendimentosEmLote({
        tita_agendamento_ids: ids,
        status,
      })

    if (!resultado) {
      return
    }

    setStatusProfissionais((prev) => ({
      ...prev,
      [grupo.terapeuta]: status,
    }))

    await carregarDados()

  } finally {

    setSalvandoStatus((prev) => ({
      ...prev,
      [grupo.terapeuta]: false,
    }))
  }
}

async function atualizarStatus(
  grupo: GrupoTerapeuta,
  status: StatusDisponibilidade
) {

  const idsSelecionados =
    horariosEdicao
      .filter((h) => h.selecionado)
      .map((h) => h.id)

  if (idsSelecionados.length === 0) {
    console.error(
      'Nenhum horário selecionado para atualizar status'
    )
    return
  }

  setSalvandoStatus((prev) => ({
    ...prev,
    [grupo.terapeuta]: true,
  }))

  try {

    const resultado =
      await atualizarStatusAtendimentosEmLote({
        tita_agendamento_ids: idsSelecionados,
        status,
      })

    if (!resultado) {
      return
    }

    setStatusProfissionais((prev) => ({
      ...prev,
      [grupo.terapeuta]: status,
    }))

    setModalStatus(null)

    await carregarDados()

  } finally {

    setSalvandoStatus((prev) => ({
      ...prev,
      [grupo.terapeuta]: false,
    }))
  }
}

  async function salvarSubstituto(
    grupo: GrupoTerapeuta,
    substituto: string
  ) {
    const ids = grupo.atendimentos
      .map((item) => item.tita_agendamento_id)
      .filter(Boolean)

    if (ids.length === 0) {
      console.error('Nenhum tita_agendamento_id encontrado para salvar substituto')
      return
    }

    const resultado =
      await atualizarStatusAtendimentosEmLote({
        tita_agendamento_ids: ids,
        status: 'indisponivel',
        profissional_substituto_nome: substituto,
      })

    if (!resultado) {
      return
    }

    setSubstituicoes((prev) => ({
      ...prev,
      [grupo.terapeuta]: substituto,
    }))

    setStatusProfissionais((prev) => ({
      ...prev,
      [grupo.terapeuta]: 'indisponivel',
    }))

    setModalSubstituicao(null)
    await carregarDados()
  }

const substitutosDisponiveis = useMemo(() => {

  if (!modalSubstituicao) return []

  return grupos
    .filter((grupo) => {

      // não pode ser o próprio terapeuta
      if (
        grupo.terapeuta ===
        modalSubstituicao.terapeuta
      ) {
        return false
      }

      // precisa estar disponível
      if (grupo.status !== 'disponivel') {
        return false
      }

      // mesma especialidade operacional
      if (
		grupo.terapiaExibicao?.trim() !==
		modalSubstituicao.terapiaExibicao?.trim()
      ) {
        return false
      }

      // mesma unidade
      if (
        grupo.unidade !==
        modalSubstituicao.unidade
      ) {
        return false
      }

      return true
    })
    .filter((grupo) =>
      grupo.terapeuta
        .toLowerCase()
        .includes(
          buscaSubstituto.toLowerCase()
        )
    )

}, [
  grupos,
  modalSubstituicao,
  buscaSubstituto,
])

  return (
    <main className="min-h-screen bg-[#f4f7fb] pb-28">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center">
            <img
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              className="h-9 w-9 object-contain"
            />
          </div>

          <div>
            <h1 className="text-sm font-bold text-slate-800">
              Clínica Universo ABA
            </h1>

            <p className="text-sm font-semibold text-[#3A8FB7]">
              Registro de Disponibilidade
            </p>
          </div>
        </div>
      </header>

      <section className="p-3 space-y-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 space-y-3">
          <input
            type="date"
            value={filters.data}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                data: e.target.value,
              }))
            }
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
          />

			<div className="relative">
				<select
				  value={ordenacao}
				  onChange={(e) =>
					setOrdenacao(
					  e.target.value as Ordenacao
					)
				  }
				  className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white"
				>
				  <option value="alfabetica">
					Ordem alfabética
				  </option>

				  <option value="sala">
					Número da sala
				  </option>

				  <option value="horario">
					Horário inicial
				  </option>
				</select>

				<ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" />
			</div>
			
			<div className="relative">
			  <select
				value={filtroStatus}
				onChange={(e) =>
				  setFiltroStatus(
					e.target.value as
					  | 'todos'
					  | StatusDisponibilidade
				  )
				}
				className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white"
			  >
				<option value="todos">
				  Todos os status
				</option>

				<option value="pendente">
				  Pendentes
				</option>

				<option value="disponivel">
				  Disponíveis
				</option>

				<option value="indisponivel">
				  Indisponíveis
				</option>
			  </select>

			  <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" />
			</div>

			<div className="relative">

			  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />

			  <input
				value={filters.terapeuta}
				onChange={(e) =>
				  setFilters((prev) => ({
					...prev,
					terapeuta: e.target.value,
				  }))
				}
				placeholder="Buscar terapeuta..."
				className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm"
			  />

			</div>

        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
            Carregando profissionais...
          </div>
        )}

        {!loading &&
          grupos.map((grupo) => {
            const primeiroHorario =
              getHorarioInicial(
                grupo.atendimentos[0]
              )

			const aberto =
			  cardsAbertos[grupo.terapeuta]
  
			const pendente =
			  grupo.status === 'pendente'

			const indisponivel =
			  grupo.status === 'indisponivel'

			const disponivel =
			  grupo.status === 'disponivel'

			return (
			  <div
				key={grupo.terapeuta}
				className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
			  >

				<button
				  onClick={() =>
					toggleCard(grupo.terapeuta)
				  }
				  className="w-full text-left"
				>

				  <div className="p-4 border-b border-slate-100">
					<div className="flex items-start justify-between gap-3">

					  <div>

						<h2 className="text-base font-bold text-slate-800">
						  {grupo.terapeuta}
						</h2>

						<p className="text-sm text-[#3A8FB7] font-medium mt-0.5">
						  {grupo.terapia}
						</p>

						<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">

						  <span>
							{grupo.atendimentos?.[0]?.horario}
						  </span>

						  <span>
							{grupo.unidade}
						  </span>

						  <span>
							{grupo.sala}
						  </span>

						</div>

					  </div>

					  <div className="flex flex-col items-end gap-2">

						<span
						  className={`min-w-[140px] text-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
							  statusStyles[
								grupo.status
							  ]
							}`}
						>
						  {
							statusLabels[
							  grupo.status
							]
						  }
						</span>

						<span className="text-[11px] text-slate-400">
						  {
							aberto
							  ? 'Ocultar'
							  : 'Expandir'
						  }
						</span>

					  </div>

					</div>
				  </div>
				</button>

			{aberto && (
			  <>				
                <div className="divide-y divide-slate-100">
                  {grupo.atendimentos.map(
                    (item) => (
                      <div
                        key={item.tita_agendamento_id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center font-semibold text-sm shrink-0">
                            <UserRound className="h-4 w-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {getPaciente(item)}
                              </span>

                              <span className="text-xs text-[#3A8FB7] font-semibold">
                                {getHorarioInicial(
                                  item
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

				<StatusActionButtons
				  grupo={grupo}
				  salvandoStatus={
					salvandoStatus[
					  grupo.terapeuta
					]
				  }
				  abrirModalStatus={
					abrirModalStatus
				  }
				  atualizarStatusDireto={
					atualizarStatusDireto
				  }
				  onSubstituicao={() =>
					setModalSubstituicao(grupo)
				  }
				/>
				</>
			  )}
              </div>
            )
		})}
      </section>

		<StatusModal
		  data={filters.data}
		  modalStatus={modalStatus}
		  horariosEdicao={horariosEdicao}
		  novoStatusModal={novoStatusModal}
		  salvandoStatus={
			modalStatus
			  ? salvandoStatus[
				  modalStatus.terapeuta
				]
			  : false
		  }
		  toggleHorario={toggleHorario}
		  atualizarStatusSelecionado={
			atualizarStatus
		  }
		  setModalStatus={setModalStatus}
		/>


      {modalSubstituicao && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">
                Selecionar substituto
              </h3>

              <button
                onClick={() =>
                  setModalSubstituicao(null)
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />

              <input
                value={buscaSubstituto}
                onChange={(e) =>
                  setBuscaSubstituto(
                    e.target.value
                  )
                }
                placeholder="Buscar profissional..."
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4 space-y-2">
              {substitutosDisponiveis.map(
                (grupo) => (
                  <button
                    key={grupo.terapeuta}
                    onClick={() =>
                      salvarSubstituto(
                        modalSubstituicao,
                        grupo.terapeuta
                      )
                    }
                    className="w-full text-left border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium hover:bg-slate-50"
                  >
                    <div>
					  <div className="font-semibold">
						{grupo.terapeuta}
					  </div>

					  <div className="text-xs text-slate-500 mt-1">
						{grupo.terapiaExibicao}
					  </div>
					</div>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
