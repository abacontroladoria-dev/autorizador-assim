	'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import DayPulse from '@/components/central/DayPulse'
import FiltersBar from '@/components/central/FiltersBar'
import AttendanceList from '@/components/central/AttendanceList'
import SidePanel from '@/components/central/SidePanel'
import { useHeader } from '@/contexts/HeaderContext'
import {
  buscarCoberturaDasGlosas,
  listarCentralPacientes,
} from '@/services/central-pacientes.service'
import { getRowId } from '@/lib/central/rowId'
import { resolverStatus, houveSubstituicao } from '@/lib/central/severity'

// Unidades operacionais (mesma normalização de vw_central_terapeutica):
// reduz o sala_nome cru ("Unid. Realengo - Sala 3") a uma das três unidades.
const ORDEM_UNIDADES = ['Realengo', 'Padre Miguel', 'Fazendinha'] as const

function normalizarUnidade(raw?: string | null): string | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (s.includes('realengo')) return 'Realengo'
  if (s.includes('padre miguel')) return 'Padre Miguel'
  if (s.includes('fazendinha')) return 'Fazendinha'
  return null
}

export default function CentralTerapeuticaPage() {
  const { setHeader } = useHeader()
  const router = useRouter()
  const hoje = new Date().toLocaleDateString('en-CA')

  const [dados, setDados] = useState<any[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [busca, setBusca] = useState('')
  const [foco, setFoco] = useState('')
  const [horario, setHorario] = useState('')
  const [unidade, setUnidade] = useState('')
  const [terapia, setTerapia] = useState('')
  const [profissional, setProfissional] = useState('')

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

      // Qual guia externa cobriu cada glosa (aba Reconciliação). Sem glosa no
      // dia isto não vai à rede. O vínculo é ANEXADO — `status_operacional`
      // continua 'glosa', que é o que preserva o motivo da recusa na ficha.
      const coberturas = await buscarCoberturaDasGlosas(response || [])

      // Segundo guard: houve mais um await desde o primeiro.
      if (reqId !== reqIdRef.current) return

      const lista = coberturas.size
        ? (response || []).map((item) => {
            const vinculo = item?.id ? coberturas.get(String(item.id)) : undefined
            return vinculo ? { ...item, vinculo } : item
          })
        : response || []

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
      .channel(`central-terapeutica-${data}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fila_autorizacoes',
          // Escopa o gatilho à data visível: o worker sincroniza ~2 semanas à
          // frente + 10 dias atrás, e sem este filtro qualquer escrita de
          // qualquer data recarregava a RPC pesada listar_central_pacientes.
          filter: `data_atendimento=eq.${data}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            carregar({ silent: true })
          }, 400)
        }
      )
      // Vincular uma guia na aba Reconciliação resolve uma glosa desta lista.
      // Sem esta assinatura o operador voltava para cá e via a glosa ainda de
      // pé, e só um F5 desmentia a tela. Sem filtro de data: a tabela é um livro
      // de triagem manual (dezenas de linhas por mês) e o bloco coberto pode ser
      // de qualquer dia — a recarga silenciosa custa menos que o filtro errado.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autorizacoes_vinculos' },
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
  }, [supabase, carregar, data])

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

        if (!foco) return true

        if (foco === 'substituicao') return houveSubstituicao(a)

        const key = resolverStatus(a).key

        if (foco === 'resolvido') {
          return (
            key === 'autorizado' ||
            key === 'presenca_confirmada' ||
            key === 'glosa_resolvida'
          )
        }

        if (foco === 'andamento') {
          return (
            key === 'processando' ||
            key === 'pendente' ||
            key === 'concluido_sem_guia'
          )
        }

        return key === foco
      })

      .filter(a => {

        if (!horario) return true

        return (
          a.horario?.slice(0, 5) ||
          a.hora_inicial?.slice(0, 5)
        ) === horario
      })

      .filter(a => {

        if (!unidade) return true

        return normalizarUnidade(a.unidade || a.sala_nome) === unidade
      })

      .filter(a => {

        if (!terapia) return true

        return a.classificacao_terapia === terapia
      })

      .filter(a => {

        if (!profissional) return true

        return [
          a.profissional_nome,
          a.profissional_realizou_nome,
        ].includes(profissional)
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
    foco,
    horario,
    unidade,
    terapia,
    profissional,
    data
  ])

  const selecionado = useMemo(
    () => filtrados.find((i) => getRowId(i) === selecionadoId),
    [filtrados, selecionadoId]
  )

  const handleReverterFalta = async (atendimento: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    let nomeUsuario = user?.email ?? 'Desconhecido'
    const { data: perfil } = await supabase
      .from('usuarios')
      .select('nome')
      .eq('id', user!.id)
      .maybeSingle()
    if (perfil?.nome) nomeUsuario = perfil.nome

    const { error } = await supabase.from('fila_autorizacoes').update({
      status: 'pendente',
      tipo_falta: null,
      terapia_falta: null,
      justificativa_falta: null,
      falta_revertida_por_nome: nomeUsuario,
      falta_revertida_em: new Date().toISOString(),
    }).eq('id', atendimento.id)

    if (error) throw error

    router.push('/solicitar')
  }

  // KPIs refletem o cenário operacional COMPLETO da data selecionada (sobre `dados`),
  // não o subconjunto filtrado pela busca/filtros (`filtrados`). Assim os totais do dia
  // permanecem estáveis durante a busca e o DayPulse não re-renderiza a cada tecla.
  const indicadores = useMemo(() => {
    const acc = {
      total: dados.length,
      autorizados: 0,
      em_processo: 0,
      falta_paciente: 0,
      falta_terapeuta: 0,
      sem_autorizacao: 0,
      glosa: 0,
      substituicoes: 0,
    }

    for (const a of dados) {
      const key = resolverStatus(a).key

      // A glosa coberta soma com os autorizados, e não num chip próprio: existe
      // guia liberada, o desfecho é o mesmo. O que ela muda é o chip de Glosa,
      // que desce — é assim que a recuperação aparece como número na tela.
      if (
        key === 'autorizado' ||
        key === 'presenca_confirmada' ||
        key === 'glosa_resolvida'
      )
        acc.autorizados++
      else if (
        key === 'processando' ||
        key === 'pendente' ||
        key === 'concluido_sem_guia'
      )
        acc.em_processo++
      else if (key === 'falta_paciente') acc.falta_paciente++
      else if (key === 'falta_terapeuta') acc.falta_terapeuta++
      else if (key === 'erro') acc.sem_autorizacao++
      else if (key === 'glosa') acc.glosa++

      if (houveSubstituicao(a)) acc.substituicoes++
    }

    return acc
  }, [dados])

  // Opções distintas dos filtros, derivadas dos dados do dia.
  const opcoes = useMemo(() => {
    const horarios = new Set<string>()
    const unidadesPresentes = new Set<string>()
    const terapias = new Set<string>()
    const profissionais = new Set<string>()

    for (const a of dados) {
      const h = a.horario?.slice(0, 5) || a.hora_inicial?.slice(0, 5)
      if (h) horarios.add(h)

      const u = normalizarUnidade(a.unidade || a.sala_nome)
      if (u) unidadesPresentes.add(u)

      if (a.classificacao_terapia) terapias.add(a.classificacao_terapia)

      if (a.profissional_nome) profissionais.add(a.profissional_nome)
      if (a.profissional_realizou_nome)
        profissionais.add(a.profissional_realizou_nome)
    }

    const ordenar = (s: Set<string>) =>
      Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    return {
      horarios: Array.from(horarios).sort(),
      // só Realengo, Padre Miguel e Fazendinha, na ordem canônica
      unidades: ORDEM_UNIDADES.filter((u) => unidadesPresentes.has(u)),
      terapias: ordenar(terapias),
      profissionais: ordenar(profissionais),
    }
  }, [dados])

  return (

    <div className="flex flex-col gap-4">

        <DayPulse
          indicadores={indicadores}
          foco={foco}
          setFoco={setFoco}
        />

        <FiltersBar
          busca={busca}
          setBusca={setBusca}

          horario={horario}
          setHorario={setHorario}
          horarioOpcoes={opcoes.horarios}

          unidade={unidade}
          setUnidade={setUnidade}
          unidadeOpcoes={opcoes.unidades}

          terapia={terapia}
          setTerapia={setTerapia}
          terapiaOpcoes={opcoes.terapias}

          profissional={profissional}
          setProfissional={setProfissional}
          profissionalOpcoes={opcoes.profissionais}

          data={data}
          setData={setData}
        />

		<div className="grid grid-cols-[1fr_360px] gap-5">

			<div>
			  <AttendanceList
				dados={filtrados}
				selecionado={selecionadoId}
				setSelecionado={setSelecionadoId}
				loading={loading}
			  />
			</div>

			<div>
			  <SidePanel
				atendimento={selecionado}
				onReverterFalta={handleReverterFalta}
			  />
			</div>

        </div>

      </div>
  )
}