'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  desvincularAutorizacao,
  listarCandidatasVinculo,
  listarGuiasOrfas,
  marcarGuiaSemSessao,
  vincularAutorizacao,
} from '@/services/reconciliacao-assim.service'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { CandidataVinculo, GuiaOrfa } from '@/components/auditoria-assim/types'

/** Janela retroativa de busca de candidatas. O 7 saiu da medição — ver o service. */
export const JANELA_PADRAO = 7

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAtras(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type PacienteComOrfas = {
  chave: string
  pacienteNome: string
  carteirinha: string | null
  guias: GuiaOrfa[]
}

/**
 * @param aoMudarExternamente chamado quando o realtime acusa mudança em
 * `autorizacoes_assim` / `autorizacoes_vinculos`. Serve para o painel semanal
 * envelhecer junto com a fila — sem ele, o robô importa um lote e a coluna de
 * autorizações continua mostrando o estado anterior, calada.
 */
export function useReconciliacaoAssim(aoMudarExternamente?: () => void) {
  // 30 dias: a tabela autorizacoes_assim só existe desde 21/07/2026, e o volume
  // medido é de ~18 órfãs/mês. Um mês cabe na tela sem paginação.
  const [de, setDe] = useState(() => diasAtras(30))
  const [ate, setAte] = useState(hojeLocal)

  const [orfas, setOrfas] = useState<GuiaOrfa[]>([])
  const [carregandoOrfas, setCarregandoOrfas] = useState(true)
  const [erroOrfas, setErroOrfas] = useState<string | null>(null)

  const [guiaSelecionada, setGuiaSelecionada] = useState<string | null>(null)
  const [candidatas, setCandidatas] = useState<CandidataVinculo[]>([])
  const [carregandoCandidatas, setCarregandoCandidatas] = useState(false)
  const [erroCandidatas, setErroCandidatas] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Guarda de corrida: o painel de candidatas leva alguns segundos (a RPC vai
  // dia a dia), então dois cliques rápidos em guias diferentes podem voltar fora
  // de ordem e pintar as candidatas da guia errada sob o cabeçalho certo.
  const requisicaoCandidatas = useRef(0)

  const recarregarOrfas = useCallback(async () => {
    setCarregandoOrfas(true)
    setErroOrfas(null)
    try {
      setOrfas(await listarGuiasOrfas(de, ate))
    } catch (e) {
      setErroOrfas(e instanceof Error ? e.message : 'Falha ao carregar as guias órfãs')
      setOrfas([])
    } finally {
      setCarregandoOrfas(false)
    }
  }, [de, ate])

  useEffect(() => { void recarregarOrfas() }, [recarregarOrfas])

  // Guardado num ref porque a identidade do callback muda a cada semana
  // navegada, e o canal do realtime não pode reassinar por causa disso.
  const aoMudarRef = useRef(aoMudarExternamente)
  useEffect(() => { aoMudarRef.current = aoMudarExternamente })

  // O robô do relatório importa a cada ~5 min. Sem isto a fila de trabalho fica
  // velha na tela justamente enquanto alguém trabalha nela.
  useEffect(() => {
    const supabase = getSupabaseClient()
    const aoMudar = () => {
      void recarregarOrfas()
      aoMudarRef.current?.()
    }
    const canal = supabase
      .channel('reconciliacao-assim')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_assim' }, aoMudar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_vinculos' }, aoMudar)
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [recarregarOrfas])

  const selecionarGuia = useCallback(async (guia: string | null) => {
    setGuiaSelecionada(guia)
    setCandidatas([])
    setErroCandidatas(null)
    if (!guia) return

    const meuTicket = ++requisicaoCandidatas.current
    setCarregandoCandidatas(true)
    try {
      const lista = await listarCandidatasVinculo(guia, JANELA_PADRAO)
      if (meuTicket !== requisicaoCandidatas.current) return
      setCandidatas(lista)
    } catch (e) {
      if (meuTicket !== requisicaoCandidatas.current) return
      setErroCandidatas(e instanceof Error ? e.message : 'Falha ao carregar as candidatas')
    } finally {
      if (meuTicket === requisicaoCandidatas.current) setCarregandoCandidatas(false)
    }
  }, [])

  /** Agrupa por paciente: é assim que o trabalho acontece — um paciente por vez. */
  const pacientes = useMemo<PacienteComOrfas[]>(() => {
    const termo = busca.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
    const mapa = new Map<string, PacienteComOrfas>()

    for (const g of orfas) {
      const nome = g.paciente_nome ?? '(sem nome)'
      if (termo) {
        const alvo = `${nome} ${g.guia} ${g.carteirinha ?? ''} ${g.codigo_tuss ?? ''}`
          .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
        if (!alvo.includes(termo)) continue
      }
      // Agrupa por carteirinha quando existe: dois pacientes homônimos são dois
      // beneficiários distintos, e juntá-los faria o operador vincular a guia de
      // um na sessão do outro.
      const chave = g.carteirinha ?? `nome:${nome}`
      const atual = mapa.get(chave)
      if (atual) atual.guias.push(g)
      else mapa.set(chave, { chave, pacienteNome: nome, carteirinha: g.carteirinha, guias: [g] })
    }

    return [...mapa.values()].sort((a, b) => a.pacienteNome.localeCompare(b.pacienteNome, 'pt-BR'))
  }, [orfas, busca])

  const guiaAtual = useMemo(
    () => orfas.find((g) => g.guia === guiaSelecionada) ?? null,
    [orfas, guiaSelecionada]
  )

  const confirmarVinculo = useCallback(async (candidata: CandidataVinculo, observacao: string) => {
    if (!guiaSelecionada) return
    setSalvando(true)
    try {
      await vincularAutorizacao({
        guia: guiaSelecionada,
        blocoId: candidata.bloco_id,
        filaId: candidata.fila_id,
        observacao,
        janelaDias: JANELA_PADRAO,
      })
      setGuiaSelecionada(null)
      setCandidatas([])
      await recarregarOrfas()
    } finally {
      setSalvando(false)
    }
  }, [guiaSelecionada, recarregarOrfas])

  const descartarGuia = useCallback(async (guia: string, observacao: string) => {
    setSalvando(true)
    try {
      await marcarGuiaSemSessao(guia, observacao)
      if (guia === guiaSelecionada) {
        setGuiaSelecionada(null)
        setCandidatas([])
      }
      await recarregarOrfas()
    } finally {
      setSalvando(false)
    }
  }, [guiaSelecionada, recarregarOrfas])

  return {
    de, ate, setDe, setAte,
    orfas, pacientes, carregandoOrfas, erroOrfas, recarregarOrfas,
    guiaSelecionada, guiaAtual, selecionarGuia,
    candidatas, carregandoCandidatas, erroCandidatas,
    busca, setBusca,
    salvando, confirmarVinculo, descartarGuia, desvincularAutorizacao,
  }
}
