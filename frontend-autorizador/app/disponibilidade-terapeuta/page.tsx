'use client'

import { useEffect, useMemo, useState } from 'react'
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

function getHojeLocal() {
  const hoje = new Date()

  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')

  return `${ano}-${mes}-${dia}`
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

export default function RegistroDisponibilidadePage() {
  const hoje = getHojeLocal()

  const [dados, setDados] = useState<ControleTerapeuticoItem[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    async function carregar() {
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

    carregar()
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
			  'pendente',

			substituto:
			  substituicoes[terapeuta],
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

	function atualizarStatus(
	  terapeuta: string,
	  status: StatusDisponibilidade
	) {
	  setStatusProfissionais((prev) => ({
		...prev,
		[terapeuta]: status,
	  }))
	}

  function salvarSubstituto(
    terapeuta: string,
    substituto: string
  ) {
    setSubstituicoes((prev) => ({
      ...prev,
      [terapeuta]: substituto,
    }))

    setModalSubstituicao(null)
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
							{grupo.unidade}
						  </span>
						  <span>
							{grupo.sala}
						  </span>						  
						</div>
                    </div>

					<div
					  className={`min-w-[140px] text-center px-3 py-1 rounded-full text-xs font-semibold ${
						pendente
						  ? 'bg-amber-100 text-amber-700'
						  : indisponivel
						  ? 'bg-red-100 text-red-700'
						  : 'bg-green-100 text-green-700'
					  }`}
					>
					  {pendente
						? 'Aguardando status'
						: indisponivel
						? 'Indisponível'
						: 'Disponível'}
					</div>
					
                  </div>

                  {grupo.substituto && (
                    <div className="mt-2 text-xs text-[#3A8FB7] font-medium">
                      Substituto:{' '}
                      {grupo.substituto}
                    </div>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {grupo.atendimentos.map(
                    (item) => (
                      <div
                        key={`${grupo.terapeuta}_${getPaciente(
                          item
                        )}_${getHorarioInicial(
                          item
                        )}`}
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

				<div className="p-3 bg-slate-50 flex gap-2">

				  {pendente && (
					<>
					  <button
						onClick={() =>
						  atualizarStatus(
							grupo.terapeuta,
							'disponivel'
						  )
						}
						className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold"
					  >
						Disponível
					  </button>

					  <button
						onClick={() =>
						  atualizarStatus(
							grupo.terapeuta,
							'indisponivel'
						  )
						}
						className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold"
					  >
						Indisponível
					  </button>
					</>
				  )}

				  {disponivel && (
					<button
					  onClick={() =>
						atualizarStatus(
						  grupo.terapeuta,
						  'indisponivel'
						)
					  }
					  className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold"
					>
					  Encerrar disponibilidade
					</button>
				  )}

				  {indisponivel && (
					<>
					  <button
						onClick={() =>
						  atualizarStatus(
							grupo.terapeuta,
							'disponivel'
						  )
						}
						className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold"
					  >
						Disponível agora
					  </button>

					  <button
						onClick={() =>
						  setModalSubstituicao(grupo)
						}
						className="px-4 rounded-xl border border-[#3A8FB7] text-[#3A8FB7] text-sm font-semibold"
					  >
						Substituição
					  </button>
					</>
				  )}
				</div>
              </div>
            )
          })}
      </section>

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
                        modalSubstituicao.terapeuta,
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