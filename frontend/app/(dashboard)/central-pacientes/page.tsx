	'use client'

import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { getSupabaseClient } from '@/lib/supabase/client'
import KpiCards from '@/components/central/KpiCards'
import FiltersBar from '@/components/central/FiltersBar'
import AttendanceList from '@/components/central/AttendanceList'
import SidePanel from '@/components/central/SidePanel'
import { useHeader } from '@/contexts/HeaderContext'
import {listarCentralPacientes} from '@/services/central-pacientes.service'

export default function CentralTerapeuticaPage() {
  const { setHeader } = useHeader()
  const hoje = new Date().toLocaleDateString('en-CA')

  const [dados, setDados] = useState<any[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [unidade, setUnidade] = useState('')
  const [convenio, setConvenio] = useState('')

  const [data, setData] = useState(hoje)

  const supabase = getSupabaseClient()

  async function carregar() {

    setLoading(true)

    const response: Record<string, any>[] =
      await listarCentralPacientes(data)

    setDados(response || [])

	if (!selecionadoId && response?.length) {

	  const primeiro = response[0]

	  const id =
		primeiro.id ??
		`${primeiro.paciente_id}_${primeiro.data_atendimento}_${primeiro.horario}_${primeiro.terapia_exibicao_id}`

	  setSelecionadoId(id)
	}

    setLoading(false)
  }

useEffect(() => {

  setHeader(
    'Controle de Pacientes',
    'Monitoramento operacional em tempo real'
  )

}, [])

  useEffect(() => {

    carregar()

  }, [data])

  useEffect(() => {

    const channel = supabase

      .channel('central-terapeutica')

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fila_autorizacoes',
        },
        () => {
          carregar()
        }
      )

      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }

  }, [])

  const filtrados = useMemo(() => {

    return (dados || [])

      .filter(a => {

        if (!a.data_atendimento) {
          return false
        }

        return a.data_atendimento === data
      })

      .filter(a => {

        if (!busca) return true

        const q = busca.toLowerCase()

        return (
          (a.paciente_nome || '').toLowerCase().includes(q) ||
          (a.profissional_nome || '').toLowerCase().includes(q)
        )
      })

       .filter(a => {

         if (!status) return true

         return (
          a.status_assim ||
           a.status
        ) === status
      })

      .filter(a => {

        if (!unidade) return true

        return (
          a.unidade ||
          a.sala_nome
        ) === unidade
      })

      .filter(a => {

        if (!convenio) return true

        return (
          a.convenio ||
          a.convenio_nome
        ) === convenio
      })

.sort((a, b) => {

  const horarioA =
    a.horario || a.hora_inicial || ''

  const horarioB =
    b.horario || b.hora_inicial || ''

  // 1. ordena por horário
  const compareHorario =
    horarioA.localeCompare(horarioB)

  if (compareHorario !== 0) {
    return compareHorario
  }

  // 2. ordena alfabeticamente
  return (a.paciente_nome || '').localeCompare(
    b.paciente_nome || '',
    'pt-BR'
  )

})

  }, [
    dados,
    busca,
    status,
    unidade,
    convenio,
    data
  ])

  const selecionado = useMemo(() => {

  return filtrados.find((i) => {

    const id =
      i.id ??
      `${i.paciente_id}_${i.data_atendimento}_${i.horario}_${i.terapia_exibicao_id}`

    return id === selecionadoId
  })

}, [filtrados, selecionadoId])

  const indicadores = {

    autorizados:
      filtrados.filter(
        a => a.status_operacional === 'autorizado'
      ).length,

    pendentes:
      filtrados.filter(
        a => a.status_operacional === 'pendente'
      ).length,

    processando:
      filtrados.filter(
        a => a.status_operacional === 'processando'
      ).length,

    erros:
      filtrados.filter(
        a => a.status_operacional === 'erro'
      ).length,

    falta_terapeuta:
      filtrados.filter(
        a => a.status_operacional === 'falta_terapeuta'
      ).length,
  }

  const conveniOpcoes = useMemo(() => {
    const set = new Set<string>()
    for (const a of dados) {
      const v = a.convenio || a.convenio_nome
      if (v) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [dados])

  return (

	<div className="bg-card rounded-2xl">
      <div className="flex flex-col gap-4 overflow-hidden">

        <KpiCards
          indicadores={indicadores}
        />

        <FiltersBar
          busca={busca}
          setBusca={setBusca}

          status={status}
          setStatus={setStatus}

          unidade={unidade}
          setUnidade={setUnidade}

          convenio={convenio}
          setConvenio={setConvenio}
          conveniOpcoes={conveniOpcoes}

          data={data}
          setData={setData}
        />

		<div
		  className="
			grid
			grid-cols-[1fr_360px]
			gap-5
			flex-1
			overflow-hidden
			min-h-0
		  "
		>

			<div className="overflow-y-auto min-h-0">
			  <AttendanceList
				dados={filtrados}
				selecionado={selecionadoId}
				setSelecionado={setSelecionadoId}
				loading={loading}
			  />
			</div>

			<div className="self-start">
			  <SidePanel
				atendimento={selecionado}
			  />
			</div>

        </div>

      </div>

    </div>
  )
}