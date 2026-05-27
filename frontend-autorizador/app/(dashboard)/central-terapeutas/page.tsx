'use client'

import type { GrupoTerapeutaMobile } from '@/components/central-terapeutas/types'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useHeader } from '@/contexts/HeaderContext'
import ControleFiltersBar from '@/components/central-terapeutas/ControleFiltersBar'
import ControleTerapeutaMobileCard from '@/components/central-terapeutas/ControleTerapeutaMobileCard'
import CoberturaModal from '@/components/central-terapeutas/CoberturaModal'
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
  const [grupoCobertura, setGrupoCobertura] = useState<GrupoTerapeutaMobile | null>(null)

  const [filters, setFilters] = useState<ControleFilters>({
    data: hoje,
    busca: '',
    horario: '',
    unidade: '',
    terapia: '',
    statusFiltro: [],
  })

  useEffect(() => {
    setHeader(
      'Operação Clínica',
      'Gerencie disponibilidade, indisponibilidade e cobertura dos terapeutas.'
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
	  _status: 'disponivel' | 'indisponivel'
	) => {
	  setGrupoCobertura(grupo)
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

  const terapias = useMemo(() => {
    return Array.from(
      new Set(
        dados
          .filter(terapiaDeveAparecer)
          .map((item) => item.terapia_exibicao || item.terapia_exibicao_nome || getTerapia(item))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [dados])

  const filtrados = useMemo(() => {
    return dados
      .filter(terapiaDeveAparecer)
      .filter((item) => {
        if (!filters.busca) return true
        const q = filters.busca.toLowerCase()
        return (
          getTerapeuta(item).toLowerCase().includes(q) ||
          getPaciente(item).toLowerCase().includes(q)
        )
      })
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
        if (!filters.terapia) return true
        const t = item.terapia_exibicao || item.terapia_exibicao_nome || getTerapia(item)
        return t === filters.terapia
      })
      .sort((a, b) => {
        const horario = getHorarioInicial(a).localeCompare(getHorarioInicial(b))
        if (horario !== 0) return horario
        return getPaciente(a).localeCompare(getPaciente(b))
      })
  }, [
    dados,
    filters.busca,
    filters.horario,
    filters.unidade,
    filters.terapia,
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
  const statuses = atendimentos.map((a) => normalizarStatus(a.status))

  const temDisponivel   = statuses.some((s) => s === 'disponivel')
  const temIndisponivel = statuses.some((s) => s === 'indisponivel')
  const temSubstituido  = statuses.some((s) => s === 'substituido')
  const todosPendente   = statuses.every((s) => s === 'pendente')

  if (temDisponivel && temIndisponivel) return 'parcial'
  if (temIndisponivel && !temDisponivel) return 'indisponivel'
  if (temSubstituido && !temIndisponivel && !temDisponivel) return 'substituido'
  if (temDisponivel && !temIndisponivel) return 'disponivel'
  if (todosPendente) return 'pendente'

  return normalizarStatus(
    [...atendimentos].sort((a, b) =>
      String(a.hora_inicial).localeCompare(String(b.hora_inicial))
    ).at(-1)?.status
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
        | 'parcial'
        | 'substituido'
  }
)

    return Object.values(grupos).sort((a, b) =>
	  a.terapeuta.localeCompare(b.terapeuta, 'pt-BR')
	)
  }, [filtrados])

  const statusContagem = useMemo(() => {
    const contagem = { disponivel: 0, indisponivel: 0, substituido: 0, parcial: 0, pendente: 0 }
    for (const g of gruposPorTerapeuta) {
      const statuses = new Set(g.atendimentos.map((a) => String(a.status ?? '').toLowerCase()))
      if (statuses.has('disponivel'))   contagem.disponivel++
      if (statuses.has('indisponivel')) contagem.indisponivel++
      if (statuses.has('substituido'))  contagem.substituido++
      if (g.status === 'parcial')       contagem.parcial++
      if (statuses.has('pendente'))     contagem.pendente++
    }
    return contagem
  }, [gruposPorTerapeuta])

  const gruposFiltradosPorStatus = useMemo(() => {
    if (!filters.statusFiltro || filters.statusFiltro.length === 0) return gruposPorTerapeuta
    return gruposPorTerapeuta.filter((g) =>
      g.atendimentos.some((a) =>
        filters.statusFiltro.includes(String(a.status ?? '').toLowerCase())
      )
    )
  }, [gruposPorTerapeuta, filters.statusFiltro])

return (
  <div className="bg-[#f7f9fc] rounded-2xl">

    <div className="flex flex-col gap-4 overflow-hidden">

      <ControleFiltersBar
        filters={filters}
        horarios={horarios}
        terapias={terapias}
        totalGrupos={gruposPorTerapeuta.length}
        statusContagem={statusContagem}
        onChange={setFilters}
        onSincronizar={handleSincronizar}
        sincronizando={sincronizando}
        loading={loading}
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
          gruposFiltradosPorStatus.map((grupo) => (

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
					status as any
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

	<CoberturaModal
	  grupo={grupoCobertura}
	  data={filters.data}
	  onClose={() => setGrupoCobertura(null)}
	  onSuccess={carregarDados}
	/>

  </div>
)

}
