'use client'

import type { StatusDisponibilidade } from '@/hooks/useControleDisponibilidade'
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useHeader } from '@/contexts/HeaderContext'
import ControleFiltersBar from '@/components/central-terapeutas/ControleFiltersBar'
import ControleKpiCards from '@/components/central-terapeutas/ControleKpiCards'
import ControleTerapeutaMobileCard from '@/components/central-terapeutas/ControleTerapeutaMobileCard'
import {
  useControleDisponibilidade
} from '@/hooks/useControleDisponibilidade'

import StatusModal from '@/components/controle-disponibilidade/StatusModal'
import {
  getHorarioInicial,
  getPaciente,
  getTerapia,
  getTerapeuta,
  getUnidade,
  getStatus,
  normalizarStatus,
  terapiaDeveAparecer,
} from '@/components/central-terapeutas/helpers'
import type {
  ControleFilters,
  ControleTerapeuticoItem,
} from '@/components/central-terapeutas/types'
import { listarCentralTerapeutica } from '@/services/central-terapeutas.service'
import { sincronizarDados as sincronizar } from '@/services/controle-terapeutico.service'
import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

type GrupoTerapeutaMobile = {
  terapeuta: string
  terapia: string

  terapiaExibicao?: string

  unidade: string

  sala: string

  primeiroHorario: string

  status: StatusDisponibilidade

  substituto?: string

  atendimentos: ControleTerapeuticoItem[]
}

function getHojeLocal() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')

  return `${ano}-${mes}-${dia}`
}

export default function ControleTerapeuticoPage() {
  const { setHeader } = useHeader()
  const hoje = getHojeLocal()

  const [dados, setDados] = useState<ControleTerapeuticoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  const [filters, setFilters] = useState<ControleFilters>({
    data: hoje,
    horario: '',
    unidade: '',
    terapeuta: '',
    paciente: '',
  })

  useEffect(() => {
    setHeader(
      'Controle Terapêutico',
      'Presença, faltas e acompanhamento operacional'
    )
  }, [setHeader])

  async function carregarDados() {
    setLoading(true)

    const response = await listarCentralTerapeutica(filters.data)

    setDados(response || [])
    setLoading(false)
  }

  const {
	  modalStatus,
	  setModalStatus,

	  horariosEdicao,

	  novoStatusModal,

	  salvandoStatus,

	  erroStatus,

	  abrirModalStatus:
			abrirModalStatusOriginal,

	  atualizarStatusDireto,

	  atualizarStatusSelecionado,

	  toggleHorario,

	} = useControleDisponibilidade({
	  getPaciente,
	  onSuccess: carregarDados,
	})

	const abrirModalStatus = (
	  grupo: GrupoTerapeutaMobile,
	  status:
		| 'disponivel'
		| 'indisponivel'
	) => {

	  abrirModalStatusOriginal(
		grupo,
		status
	  )
	}

  useEffect(() => {
    carregarDados()

    const channel = supabase
      .channel(`controle-terapeutico-central-${filters.data}`)
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

  const handleSincronizar = async () => {
    setSincronizando(true)
    try {
      const resultado = await sincronizar()
      toast.success('✓ Sincronização concluída com sucesso')
      
      // Recarregar dados após sincronização
      const response = await listarCentralTerapeutica(filters.data)
      setDados(response || [])
    } catch (err) {
      console.error('Erro ao sincronizar:', err)
      toast.error('Erro ao sincronizar dados operacionais')
    } finally {
      setSincronizando(false)
    }
  }

  const horarios = useMemo(() => {
    return Array.from(
      new Set(
        dados
          .filter(terapiaDeveAparecer)
          .map(getHorarioInicial)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [dados])

  const filtrados = useMemo(() => {
    return dados
      .filter(terapiaDeveAparecer)
      .filter((item) => {
        if (!filters.horario) return true
        return getHorarioInicial(item) === filters.horario
      })
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
      .sort((a, b) => {
        const horario = getHorarioInicial(a).localeCompare(getHorarioInicial(b))

        if (horario !== 0) return horario

        return getPaciente(a).localeCompare(getPaciente(b))
      })
  }, [
    dados,
    filters.horario,
    filters.unidade,
    filters.terapeuta,
    filters.paciente,
  ])
  
function obterTodosAtendimentosDoTerapeuta(
  terapeuta: string
) {

  return dados.filter(
    (item) =>
      getTerapeuta(item) === terapeuta
  )
}

function calcularStatusAtual(
  atendimentos: ControleTerapeuticoItem[]
) {

  const agora = new Date()

  const ordenados =
    [...atendimentos].sort(
      (a, b) =>
        String(a.hora_inicial)
          .localeCompare(
            String(b.hora_inicial)
          )
    )

  const atual =
    ordenados.find((item) => {

      const inicio =
        new Date(
          `${item.data_atendimento}T${item.hora_inicial}`
        )

      const fim =
        new Date(
          `${item.data_atendimento}T${item.hora_final}`
        )

      return (
        agora >= inicio &&
        agora <= fim
      )
    })

  if (atual?.status) {
    return normalizarStatus(
      atual.status
    )
  }

  const proximo =
    ordenados.find((item) => {

      const inicio =
        new Date(
          `${item.data_atendimento}T${item.hora_inicial}`
        )

      return inicio >= agora
    })

  if (proximo?.status) {
    return normalizarStatus(
      proximo.status
    )
  }

  return normalizarStatus(
    ordenados[
      ordenados.length - 1
    ]?.status
  ) || 'pendente'
}

  const gruposPorTerapeuta = useMemo(() => {
    const grupos: Record<string, GrupoTerapeutaMobile> = {}

    filtrados.forEach((item) => {
      const terapeuta = getTerapeuta(item)

      if (!grupos[terapeuta]) {
        grupos[terapeuta] = {
		  terapeuta,

		  terapia:
			item.terapia_exibicao ||
			item.terapia_exibicao_nome ||
			getTerapia(item),

		  terapiaExibicao:
			item.terapia_exibicao ||
			item.terapia_exibicao_nome ||
			'',

		  unidade: getUnidade(item),

		  sala:
			item.sala ||
			item.numero_sala ||
			'',

		  atendimentos: [],

		  primeiroHorario:
			getHorarioInicial(item),

		  status: 'pendente',

		  substituto:
			item.profissional_substituto_nome ||
			undefined,
		}
      }

      grupos[terapeuta].atendimentos.push(item)

      if (!grupos[terapeuta].substituto && item.profissional_substituto_nome) {
        grupos[terapeuta].substituto = item.profissional_substituto_nome
      }
    })

Object.values(grupos).forEach(
  (grupo) => {

    grupo.status =
      calcularStatusAtual(
        grupo.atendimentos
      ) as
        | 'pendente'
        | 'disponivel'
        | 'indisponivel'
        | 'substituido'
  }
)

    return Object.values(grupos).sort((a, b) =>
	  a.terapeuta.localeCompare(b.terapeuta, 'pt-BR')
	)
  }, [filtrados])

return (
  <div className="bg-[#f7f9fc] rounded-2xl">

    <div className="flex flex-col gap-4 overflow-hidden">

      <div className="flex items-center justify-between">

        <ControleKpiCards
          dados={filtrados}
          loading={loading}
        />

        <button
          type="button"
          onClick={handleSincronizar}
          disabled={sincronizando || loading}
          title="Sincronizar dados operacionais"
          className="
            flex-shrink-0
            h-12
            w-12
            rounded-xl
            bg-white
            border border-slate-200
            text-slate-600
            flex items-center justify-center
            hover:bg-slate-50
            disabled:opacity-50
            disabled:cursor-not-allowed
            transition
          "
        >

          <RefreshCw
            size={20}
            className={
              sincronizando
                ? 'animate-spin'
                : ''
            }
          />

        </button>

      </div>

      <ControleFiltersBar
        filters={filters}
        horarios={horarios}
        onChange={setFilters}
      />

      <div className="space-y-3">

        {loading && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
            Carregando atendimentos...
          </div>
        )}

        {!loading &&
          filtrados.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
              Nenhum atendimento encontrado
            </div>
          )}

        {!loading &&
          gruposPorTerapeuta.map((grupo) => (

			  <ControleTerapeutaMobileCard
				key={grupo.terapeuta}

				grupo={grupo}
				onStatusChanged={carregarDados}

				abrirModalStatus={(
				  grupo,
				  status
				) => {

				  const grupoCompleto = {
					  ...grupo,

					  status: grupo.status as
						| 'pendente'
						| 'disponivel'
						| 'indisponivel',

					  atendimentos:
						obterTodosAtendimentosDoTerapeuta(
						  grupo.terapeuta
						),
					} as GrupoTerapeutaMobile

				  if (
					  status === 'disponivel' ||
					  status === 'indisponivel'
					) {
					  abrirModalStatus(
						grupoCompleto,
						status
					  )
					}
				}}

				atualizarStatusDireto={(
				  grupo,
				  status
				) => {
				  void atualizarStatusDireto(
					grupo as any,
					status
				  )
				}}

				salvandoStatus={
				  salvandoStatus
				}
			  />

			))}

      </div>

    </div>

	<StatusModal
	  data={filters.data}
	  modalStatus={modalStatus}
	  horariosEdicao={horariosEdicao}
	  novoStatusModal={novoStatusModal}
	  salvandoStatus={salvandoStatus}
	  erroStatus={erroStatus}
	  toggleHorario={toggleHorario}
	  atualizarStatusSelecionado={
		atualizarStatusSelecionado
	  }
	  setModalStatus={setModalStatus}
	/>

  </div>
)

}
