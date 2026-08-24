'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  desvincularAutorizacao,
  listarCandidatasVinculo,
  marcarGuiaSemSessao,
  vincularAutorizacao,
} from '@/services/reconciliacao-assim.service'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { CandidataVinculo } from '@/components/auditoria-assim/types'

/** Janela retroativa de busca de candidatas. O 7 saiu da medição — ver o service. */
export const JANELA_PADRAO = 7

/**
 * O ato de vincular uma guia a uma sessão — e só ele.
 *
 * Este hook já teve uma segunda responsabilidade: manter a fila de 30 dias de
 * guias órfãs que ocupava a coluna esquerda da tela. Ela saiu quando a tela
 * passou a ser dirigida pela SEMANA (2026-08-21): a listagem de pacientes com
 * pendências recorta as órfãs da própria semana exibida, vindas do mesmo
 * `get_guias_orfas` que a fila usava. Manter as duas cargas faria a mesma RPC
 * rodar duas vezes por navegação, com dois recortes diferentes, e o número da
 * fila discordaria do número da linha em silêncio.
 *
 * O que ficou é o que só existia aqui: as candidatas de uma guia, a escrita do
 * vínculo, o descarte da guia extra, e a assinatura de realtime que faz a tela
 * envelhecer junto com o robô.
 *
 * @param aoMudarExternamente chamado quando o realtime acusa mudança em
 * `autorizacoes_assim` / `autorizacoes_vinculos`. Sem ele o robô importa um lote
 * e a semana continua mostrando o estado anterior, calada.
 */
export function useReconciliacaoAssim(aoMudarExternamente?: () => void) {
  const [guiaSelecionada, setGuiaSelecionada] = useState<string | null>(null)
  const [candidatas, setCandidatas] = useState<CandidataVinculo[]>([])
  const [carregandoCandidatas, setCarregandoCandidatas] = useState(false)
  const [erroCandidatas, setErroCandidatas] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Guarda de corrida: o painel de candidatas leva alguns segundos (a RPC vai
  // dia a dia), então dois cliques rápidos em guias diferentes podem voltar fora
  // de ordem e pintar as candidatas da guia errada sob o cabeçalho certo.
  const requisicaoCandidatas = useRef(0)

  // Guardado num ref porque a identidade do callback muda a cada semana
  // navegada, e o canal do realtime não pode reassinar por causa disso.
  const aoMudarRef = useRef(aoMudarExternamente)
  useEffect(() => { aoMudarRef.current = aoMudarExternamente })

  // O robô do relatório importa a cada ~5 min. Sem isto a tela de trabalho fica
  // velha justamente enquanto alguém trabalha nela.
  useEffect(() => {
    const supabase = getSupabaseClient()
    const aoMudar = () => aoMudarRef.current?.()
    const canal = supabase
      .channel('reconciliacao-assim')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_assim' }, aoMudar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_vinculos' }, aoMudar)
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [])

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
    } finally {
      setSalvando(false)
    }
  }, [guiaSelecionada])

  const descartarGuia = useCallback(async (guia: string, observacao: string) => {
    setSalvando(true)
    try {
      await marcarGuiaSemSessao(guia, observacao)
      if (guia === guiaSelecionada) {
        setGuiaSelecionada(null)
        setCandidatas([])
      }
    } finally {
      setSalvando(false)
    }
  }, [guiaSelecionada])

  return {
    guiaSelecionada, selecionarGuia,
    candidatas, carregandoCandidatas, erroCandidatas,
    salvando, confirmarVinculo, descartarGuia, desvincularAutorizacao,
  }
}
