	'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import KpiCards from '@/components/central/KpiCards'
import FiltersBar from '@/components/central/FiltersBar'
import AttendanceList from '@/components/central/AttendanceList'
import SidePanel from '@/components/central/SidePanel'
import { useHeader } from '@/contexts/HeaderContext'
import { listarCentralPacientes } from '@/services/central-pacientes.service'
import { getRowId } from '@/lib/central/rowId'

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

  // Modelo A: estado atual lido por refs dentro de callbacks estáveis,
  // evitando stale closure no realtime.
  const dataRef = useRef(data)
  const selecionadoIdRef = useRef(selecionadoId)
  const reqIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    selecionadoIdRef.current = selecionadoId
  }, [selecionadoId])

  // Callback estável ([]). Lê data/seleção atuais via ref.
  // - silent: refetch sem flash de loading (usado pelo realtime).
  // - autoSelect: seleciona o primeiro item quando não há seleção válida
  //   (usado no carregamento inicial e na troca de data, nunca pelo realtime).
  const carregar = useCallback(
    async (opts?: { silent?: boolean; autoSelect?: boolean }) => {
      const reqId = ++reqIdRef.current

      if (!opts?.silent) setLoading(true)

      const response: Record<string, any>[] =
        await listarCentralPacientes(dataRef.current)

      // Request guard: só a última requisição disparada escreve no estado.
      if (reqId !== reqIdRef.current) return

      const lista = response || []
      setDados(lista)

      // Validação 2: seleção órfã. Se o item selecionado sumiu, limpa.
      const selAtual = selecionadoIdRef.current
      const aindaExiste =
        !!selAtual && lista.some((item) => getRowId(item) === selAtual)

      if (opts?.autoSelect && !aindaExiste && lista.length) {
        setSelecionadoId(getRowId(lista[0]))
      } else if (selAtual && !aindaExiste) {
        setSelecionadoId(null)
      }

      if (!opts?.silent) setLoading(false)
    },
    []
  )

  useEffect(() => {
    setHeader(
      'Controle de Pacientes',
      'Monitoramento operacional em tempo real'
    )
  }, [setHeader])

  // Troca de data (e carga inicial): atualiza a ref antes de carregar
  // e auto-seleciona o primeiro item da nova data.
  useEffect(() => {
    dataRef.current = data
    carregar({ autoSelect: true })
  }, [data, carregar])

  // Realtime: subscription criada UMA vez. Coalesce a rajada de eventos
  // do TiTa em uma única recarga silenciosa (debounce), sem mexer na seleção.
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
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            carregar({ silent: true })
          }, 400)
        }
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [supabase, carregar])

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

  const selecionado = useMemo(
    () => filtrados.find((i) => getRowId(i) === selecionadoId),
    [filtrados, selecionadoId]
  )

  // KPIs refletem o cenário operacional COMPLETO da data selecionada (sobre `dados`),
  // não o subconjunto filtrado pela busca/filtros (`filtrados`). Assim os totais do dia
  // permanecem estáveis durante a busca e KpiCards não re-renderiza a cada tecla.
  const indicadores = useMemo(
    () => ({
      autorizados: dados.filter(
        (a) => a.status_operacional === 'autorizado'
      ).length,

      pendentes: dados.filter(
        (a) => a.status_operacional === 'pendente'
      ).length,

      processando: dados.filter(
        (a) => a.status_operacional === 'processando'
      ).length,

      erros: dados.filter((a) => a.status_operacional === 'erro').length,

      falta_terapeuta: dados.filter(
        (a) => a.status_operacional === 'falta_terapeuta'
      ).length,
    }),
    [dados]
  )

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