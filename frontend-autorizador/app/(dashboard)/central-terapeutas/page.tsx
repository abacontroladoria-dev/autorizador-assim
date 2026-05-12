'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import ControleFiltersBar from '@/components/central-terapeutas/ControleFiltersBar'
import ControleKpiCards from '@/components/central-terapeutas/ControleKpiCards'
import ControleMobileCard from '@/components/central-terapeutas/ControleMobileCard'
import ControleSidePanel from '@/components/central-terapeutas/ControleSidePanel'
import ControleTable from '@/components/central-terapeutas/ControleTable'
import {
  getAtendimentoId,
  getHorarioInicial,
  getPaciente,
  getTerapeuta,
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

export default function ControleTerapeuticoPage() {
  const { setHeader } = useHeader()
  const hoje = getHojeLocal()

  const [dados, setDados] = useState<ControleTerapeuticoItem[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    async function carregar() {
      setLoading(true)

      const response = await listarCentralTerapeutica(filters.data)

      setDados(response || [])

      setSelecionadoId((atual) => {
        if (atual || !response?.length) return atual
        return getAtendimentoId(response[0])
      })

      setLoading(false)
    }

    carregar()
  }, [filters.data])

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

        return getAtendimentoId(a).localeCompare(getAtendimentoId(b))
      })
  }, [
    dados,
    filters.horario,
    filters.unidade,
    filters.terapeuta,
    filters.paciente,
  ])

  const selecionado = useMemo(() => {
    return filtrados.find((item) => getAtendimentoId(item) === selecionadoId)
  }, [filtrados, selecionadoId])

  function selecionarAtendimento(item: ControleTerapeuticoItem) {
    setSelecionadoId(getAtendimentoId(item))
  }

  return (
    <div className="bg-[#f7f9fc] rounded-2xl">
		<div className="flex flex-col gap-4 overflow-hidden">
			<ControleKpiCards
			  dados={filtrados}
			  loading={loading}
			/>

			<ControleFiltersBar
			  filters={filters}
			  horarios={horarios}
			  onChange={setFilters}
			/>

			<div className="lg:hidden space-y-3">
				{loading && (
					<div className="bg-white rounded-2xl p-10 text-center text-slate-400">
					  Carregando atendimentos...
					</div>
				)}

				{!loading && filtrados.length === 0 && (
					<div className="bg-white rounded-2xl p-10 text-center text-slate-400">
					  Nenhum atendimento encontrado
					</div>
				)}

				{!loading &&
				filtrados.map((item) => (
				  <ControleMobileCard
					key={getAtendimentoId(item)}
					item={item}
					onSelect={() => selecionarAtendimento(item)}
				  />
				))}
			</div>

				<div
				  className="
					hidden
					lg:grid
					lg:grid-cols-[1fr_360px]
					gap-5
					flex-1
					overflow-hidden
					min-h-0
				  "
				>
		
				<div className="overflow-y-auto min-h-0">
				  <ControleTable
					dados={filtrados}
					selecionadoId={selecionadoId}
					loading={loading}
					onSelect={selecionarAtendimento}
				  />
				</div>

				<div className="h-full overflow-y-auto">
				  <ControleSidePanel atendimento={selecionado} />
				</div>
				
			</div>
		</div>
    </div>
  )
}
