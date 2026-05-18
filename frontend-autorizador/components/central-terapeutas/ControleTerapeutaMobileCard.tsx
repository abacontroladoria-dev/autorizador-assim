'use client'

import {
  useEffect,
  useState,
} from 'react'

import {
  listarProfissionaisDisponiveis
} from '@/services/controle-terapeutico.service'

import {
  ChevronDown,
  ChevronUp,
  Search,
  UserRound,
  X,
} from 'lucide-react'

import {
  getHorario,
  getPaciente,
} from './helpers'

import type {
  ControleTerapeuticoItem,
} from './types'
import { atualizarStatusAtendimentosEmLote } from '@/services/controle-terapeutico.service'

type StatusDisponibilidade =
  | 'pendente'
  | 'disponivel'
  | 'indisponivel'

type GrupoTerapeutaMobile = {
  terapeuta: string
  terapia: string
  unidade: string
  primeiroHorario: string
  status: string
  substituto?: string
  atendimentos: ControleTerapeuticoItem[]
}

type ProfissionalDisponivel = {
  profissional_id: number

  nome_profissional: string

  terapia_exibicao?: string

  hora_inicial?: string

  hora_final?: string

  sala?: string
}

type Props = {
  grupo: GrupoTerapeutaMobile

  onStatusChanged?: () => void

	abrirModalStatus: (
	  grupo: GrupoTerapeutaMobile,
	  status: StatusDisponibilidade
	) => void

  atualizarStatusDireto: (
    grupo: GrupoTerapeutaMobile,
    status: StatusDisponibilidade
  ) => void

  salvandoStatus: boolean
}

export default function ControleTerapeutaMobileCard({
  grupo,
  onStatusChanged,

  abrirModalStatus,
  
  atualizarStatusDireto,

  salvandoStatus,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const salvando = salvandoStatus
  const [modalSubstituicao, setModalSubstituicao] = useState(false)
  const [buscaSubstituto, setBuscaSubstituto] = useState('')

  const status = normalizarStatusDisponibilidade(grupo.status)
  const pendente = status === 'pendente'
  const disponivel = status === 'disponivel'
  const indisponivel = status === 'indisponivel'
  const [
	  substitutosDisponiveis,
	  setSubstitutosDisponiveis,
	] = useState<
		  ProfissionalDisponivel[]
		>([])

	const horariosOrdenados =
	  [...grupo.atendimentos]
		.sort((a, b) =>
		  String(a.hora_inicial)
			.localeCompare(
			  String(b.hora_inicial)
			)
		)

	const horaInicialGrupo =
	  horariosOrdenados[0]
		?.hora_inicial

	const horaFinalGrupo =
	  horariosOrdenados[
		horariosOrdenados.length - 1
	  ]?.hora_final

	const unidadeGrupo = Number(
	  horariosOrdenados[0]
		?.id_unidade
	)

  async function salvarSubstituto(substituto: string) {
    const ids = grupo.atendimentos
      .map((item) => item.tita_agendamento_id)
      .filter(Boolean)

    if (ids.length === 0) {
      console.error('Nenhum tita_agendamento_id encontrado para salvar substituto')
      return
    }

    try {
      const resultado =
        await atualizarStatusAtendimentosEmLote({
          tita_agendamento_ids: ids,
          status: 'indisponivel',
          profissional_substituto_nome: substituto,
        })

      if (!resultado) {
        return
      }

      setModalSubstituicao(false)
      onStatusChanged?.()
    } catch (err) {

	  console.error(
		'Erro ao salvar substituto:',
		err
	  )

	}
  }

useEffect(() => {

  if (!modalSubstituicao) {
    return
  }
  
	let ativo = true
	
  const timeout = setTimeout(() => {

    async function carregar() {

      const response =
        await listarProfissionaisDisponiveis(

          new Date()
            .toISOString()
            .split('T')[0],

          grupo.terapia,

          horaInicialGrupo,

          horaFinalGrupo,

          unidadeGrupo
        )

      const filtrados =
        response.filter((item) => {

          if (
            item.profissional_nome ===
            grupo.terapeuta
          ) {
            return false
          }

          return item.nome_profissional
            ?.toLowerCase()
            .includes(
              buscaSubstituto.toLowerCase()
            )
        })

		if (ativo) {
		  setSubstitutosDisponiveis(
			filtrados
		  )
		}
    }

    carregar()

  }, 300)

  return () => {
	ativo = false
    clearTimeout(timeout)
  }

}, [
  modalSubstituicao,
  buscaSubstituto,
  grupo,
  horaInicialGrupo,
  horaFinalGrupo,
  unidadeGrupo,
])

useEffect(() => {

  if (modalSubstituicao) {
    document.body.style.overflow =
      'hidden'
  }

  return () => {
    document.body.style.overflow =
      'auto'
  }

}, [modalSubstituicao])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 leading-tight">
              {grupo.terapeuta}
            </h3>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{grupo.atendimentos.length} atendimentos</span>
              <span>{grupo.unidade}</span>
            </div>

            <p className="text-sm text-[#3A8FB7] font-medium mt-3">
              {grupo.terapia}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-xs font-bold text-violet-700">
              {grupo.primeiroHorario}
            </span>

            <span
              className={`min-w-[120px] text-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
                status === 'disponivel'
                  ? 'bg-green-100 text-green-700'
                  : status === 'indisponivel'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {status === 'disponivel'
                ? 'Disponível'
                : status === 'indisponivel'
                  ? 'Indisponível'
                  : 'Aguardando status'}
            </span>

            {aberto ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {aberto && (
        <>
          <div className="border-t border-slate-100 divide-y divide-slate-100">
			{grupo.atendimentos.map((item) => (
              <div
                key={item.tita_agendamento_id}
                className="p-4 flex items-center gap-3"
              >
                <div className="h-10 w-10 rounded-full bg-[#eef5fb] text-[#3A8FB7] flex items-center justify-center shrink-0">
                  <UserRound className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">
                      {getPaciente(item)}
                    </span>

                    <span className="text-xs text-[#3A8FB7] font-semibold">
                      {getHorario(item)}
                    </span>
					
					<span
					  className={`
						text-[11px]
						px-2
						py-0.5
						rounded-full
						font-semibold

						${
						  item.status === 'disponivel'
							? 'bg-green-100 text-green-700'
							: item.status === 'indisponivel'
							  ? 'bg-red-100 text-red-700'
							  : 'bg-amber-100 text-amber-700'
						}
					  `}
					>
					  {item.status === 'disponivel'
						? 'Disponível'
						: item.status === 'indisponivel'
						  ? 'Indisponível'
						  : 'Pendente'}
					</span>

                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 flex gap-2">
            {pendente && (
              <>
                <button
				  type="button"
				  disabled={salvando}
					onClick={() =>
					  abrirModalStatus(
						grupo,
						'disponivel'
					  )
					}
				 className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Disponível
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
					  abrirModalStatus(
						grupo,
						'indisponivel'
					  )
					}
                  className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Indisponível
                </button>
              </>
            )}

            {disponivel && (
              <button
                type="button"
                disabled={salvando}
                onClick={() =>
				  abrirModalStatus(
					grupo,
					'indisponivel'
				  )
				}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Encerrar disponibilidade
              </button>
            )}

            {indisponivel && (
              <>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
					  abrirModalStatus(grupo, 'disponivel')
					}
                  className="flex-1 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Disponível agora
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModalSubstituicao(true)}
                  className="px-4 rounded-xl border border-[#3A8FB7] text-[#3A8FB7] text-sm font-semibold disabled:opacity-50"
                >
                  Substituição
                </button>
              </>
            )}
          </div>
        </>
      )}

      {modalSubstituicao && (
			<div
			  onClick={() =>
				setModalSubstituicao(false)
			  }
			  className="
				fixed inset-0 z-50
				bg-black/40

				flex items-end
				md:items-center
				md:justify-center

				p-0
				md:p-6
			  "
			>         
			
			<div
			  onClick={(e) =>
				e.stopPropagation()
			  }
			  className="
				bg-white
				w-full
				md:w-[720px]

				rounded-t-3xl
				md:rounded-3xl

				p-4

				max-h-[85vh]
				overflow-auto

				shadow-2xl
			  "
			>
			
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">
                Selecionar substituto
              </h3>

              <button
                type="button"
                onClick={() => setModalSubstituicao(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />

              <input
                value={buscaSubstituto}
                onChange={(event) =>
                  setBuscaSubstituto(event.target.value)
                }
                placeholder="Buscar profissional..."
                className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4 space-y-2">
              {substitutosDisponiveis.map((item) => (
                <button
                  key={item.profissional_id}
                  type="button"
                  disabled={salvando}
                  onClick={() => salvarSubstituto(
					  item.nome_profissional
				    )
				  }
                  className="w-full text-left border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
					<div>

					  <div className="font-semibold text-slate-800">
						{item.nome_profissional}
					  </div>

					  <div className="text-xs text-slate-500 mt-1">
						{item.terapia_exibicao}
					  </div>

					  <div className="text-xs text-[#3A8FB7] mt-2 font-medium">
						{item.hora_inicial?.slice(0, 5)}
						{' às '}
						{item.hora_final?.slice(0, 5)}
					  </div>

					  <div className="text-xs text-slate-400 mt-1">
						{item.sala}
					  </div>

					</div>
                </button>
              ))}
				  {substitutosDisponiveis.length === 0 && (
					<div className="py-10 text-center text-sm text-slate-500">
					  Nenhum profissional disponível encontrado.
					</div>
				  )}			  
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function normalizarStatusDisponibilidade(
  status?: string | null
): StatusDisponibilidade {
  if (status === 'disponivel' || status === 'indisponivel') {
    return status
  }

  return 'pendente'
}
