'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listarResumoAuditoriaPeriodo } from '@/services/auditoria-assim.service'
import { acumularKpis, kpisVazios } from '@/components/auditoria-assim/kpisAuditoria'
import { mapearUnidade, UNIDADE_CONSERTAR } from '@/lib/cronograma/comparativoSessoes'
import type { KpisAuditoriaAssim, ResumoDiarioLinha } from '@/components/auditoria-assim/types'

/** A métrica que dirige o gráfico e as quebras. */
export type MetricaFoco = keyof KpisAuditoriaAssim

/** Um ponto da série temporal, ou uma fatia de uma quebra. */
export type FatiaKpis = {
  chave: string
  rotulo: string
  kpis: KpisAuditoriaAssim
}

/**
 * Acima deste tamanho a série passa a ser semanal.
 *
 * Não é gosto: um eixo com 90 colunas de um dia cada vira serragem — nenhuma
 * barra é legível e a tendência, que é a pergunta real de quem olha um
 * trimestre, fica escondida no ruído do dia a dia.
 */
const DIAS_ATE_SERIE_DIARIA = 45

/** Sem acento e sem caixa, para a busca por nome ser tolerante. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Primeiro dia do mês corrente, o recorte com que a tela nasce. */
function inicioDoMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * A segunda-feira da semana de uma data ISO, por aritmética de string + Date
 * local. Nunca `new Date('2026-08-10')` cru, que o JS lê como UTC e devolve o
 * dia anterior em São Paulo.
 */
function segundaDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  const d = new Date(ano, (mes ?? 1) - 1, dia ?? 1)
  const diaDaSemana = (d.getDay() + 6) % 7 // 0 = segunda
  d.setDate(d.getDate() - diaDaSemana)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split('-').map(Number)
  const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number)
  const inicio = new Date(a1!, (m1 ?? 1) - 1, d1 ?? 1)
  const fim = new Date(a2!, (m2 ?? 1) - 1, d2 ?? 1)
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000)
}

/**
 * Agrupa as linhas do resumo por uma chave e soma cada grupo com a MESMA regra
 * dos cards da tela diária.
 *
 * `peso = linha.sessoes` é o que faz o resumo pré-agregado dar o mesmo número
 * que somar sessão a sessão — a propriedade que o teste de `kpisAuditoria`
 * fixa.
 */
function agruparPorChave(
  linhas: readonly ResumoDiarioLinha[],
  chaveDe: (linha: ResumoDiarioLinha) => { chave: string; rotulo: string }
): FatiaKpis[] {
  const mapa = new Map<string, FatiaKpis>()

  for (const linha of linhas) {
    const { chave, rotulo } = chaveDe(linha)
    let fatia = mapa.get(chave)
    if (!fatia) {
      fatia = { chave, rotulo, kpis: kpisVazios() }
      mapa.set(chave, fatia)
    }
    acumularKpis(fatia.kpis, linha, linha.sessoes)
  }

  return [...mapa.values()]
}

export function useResumoGerencial(aberto: boolean) {
  const [de, setDe] = useState(inicioDoMes)
  const [ate, setAte] = useState(hojeLocal)
  const [linhas, setLinhas] = useState<ResumoDiarioLinha[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [metrica, setMetrica] = useState<MetricaFoco>('glosas')
  const [busca, setBusca] = useState('')

  // Cada carga recebe um número; só a última pode escrever no estado. Sem isso,
  // trocar a data duas vezes rápido deixa a resposta mais LENTA sobrescrever a
  // mais nova — a tela se corrige sozinha na frente do operador, que é o
  // sintoma que já mordeu esta base antes.
  const cargaRef = useRef(0)

  const carregar = useCallback(async (dataDe: string, dataAte: string) => {
    if (!dataDe || !dataAte || dataDe > dataAte) return
    const carga = ++cargaRef.current
    setCarregando(true)
    setErro(null)
    try {
      const resultado = await listarResumoAuditoriaPeriodo(dataDe, dataAte)
      if (carga !== cargaRef.current) return
      setLinhas(resultado)
    } catch (e) {
      if (carga !== cargaRef.current) return
      // Lista vazia depois de uma falha desenharia "zero glosas no período",
      // que é uma resposta — e errada. O erro tem de aparecer.
      setLinhas([])
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o resumo do período.')
    } finally {
      if (carga === cargaRef.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!aberto) return
    carregar(de, ate)
  }, [aberto, de, ate, carregar])

  /**
   * A busca por nome filtra as linhas ANTES de qualquer soma — por isso os
   * totais, o gráfico e as três quebras passam a falar do paciente buscado sem
   * nenhum código a mais. É o mesmo motivo de a busca ser client-side: as
   * linhas do período já estão em memória, então filtrar não custa requisição
   * nenhuma e responde a cada tecla.
   *
   * Sem acento e sem caixa: quem digita "jose" tem de achar "JOSÉ".
   */
  const linhasVisiveis = useMemo(() => {
    const alvo = normalizar(busca)
    if (!alvo) return linhas
    return linhas.filter((l) => normalizar(l.paciente_nome).includes(alvo))
  }, [linhas, busca])

  const totais = useMemo(() => {
    const acc = kpisVazios()
    for (const linha of linhasVisiveis) acumularKpis(acc, linha, linha.sessoes)
    return acc
  }, [linhasVisiveis])

  /** Quantos pacientes distintos a busca alcançou — some quando não há busca. */
  const pacientesEncontrados = useMemo(() => {
    if (!busca.trim()) return 0
    return new Set(linhasVisiveis.map((l) => l.paciente_id)).size
  }, [linhasVisiveis, busca])

  const serieDiaria = diasEntre(de, ate) <= DIAS_ATE_SERIE_DIARIA

  const serie = useMemo(() => {
    const fatias = agruparPorChave(linhasVisiveis, (linha) =>
      serieDiaria
        ? { chave: linha.data, rotulo: linha.data }
        : { chave: segundaDaSemana(linha.data), rotulo: segundaDaSemana(linha.data) }
    )
    return fatias.sort((a, b) => a.chave.localeCompare(b.chave))
  }, [linhasVisiveis, serieDiaria])

  /** Ordena a quebra pela métrica em foco — o maior ofensor primeiro. */
  const ordenarPorFoco = useCallback(
    (fatias: FatiaKpis[]) =>
      fatias
        .filter((f) => f.kpis[metrica] > 0)
        .sort((a, b) => b.kpis[metrica] - a.kpis[metrica] || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [metrica]
  )

  const porTerapia = useMemo(
    () => ordenarPorFoco(agruparPorChave(linhasVisiveis, (l) => ({ chave: l.codigo_tuss, rotulo: l.terapia }))),
    [linhasVisiveis, ordenarPorFoco]
  )

  const porMotivo = useMemo(
    () =>
      ordenarPorFoco(
        agruparPorChave(linhasVisiveis, (l) => ({ chave: l.codigo_glosa, rotulo: l.codigo_glosa }))
      ),
    [linhasVisiveis, ordenarPorFoco]
  )

  const porUnidade = useMemo(
    () =>
      ordenarPorFoco(
        agruparPorChave(linhasVisiveis, (l) => {
          // A sala chega crua de propósito: o de-para mora aqui, no mesmo
          // helper que o resto do sistema usa. `'—'` é o sentinela que o
          // resumo grava no lugar de NULL, e `mapearUnidade` já devolve
          // "Consertar Unidade no Sistema" para sala vazia ou desconhecida.
          const unidade = l.sala_nome === '—' ? UNIDADE_CONSERTAR : mapearUnidade(l.sala_nome)
          return { chave: unidade, rotulo: unidade }
        })
      ),
    [linhasVisiveis, ordenarPorFoco]
  )

  /**
   * Quem mais gera o indicador em foco. É a quebra que a busca por nome
   * naturalmente pede: primeiro se vê quem são, depois se digita um nome.
   */
  const porPaciente = useMemo(
    () =>
      ordenarPorFoco(
        agruparPorChave(linhasVisiveis, (l) => ({ chave: l.paciente_id, rotulo: l.paciente_nome }))
      ),
    [linhasVisiveis, ordenarPorFoco]
  )

  /** O instante em que o cron recalculou o dia mais recentemente tocado. */
  const atualizadoEm = useMemo(() => {
    let maior: string | null = null
    for (const linha of linhasVisiveis) {
      if (!maior || linha.atualizado_em > maior) maior = linha.atualizado_em
    }
    return maior
  }, [linhasVisiveis])

  const diasComDados = useMemo(
    () => new Set(linhasVisiveis.map((l) => l.data)).size,
    [linhasVisiveis]
  )

  return {
    de, ate, setDe, setAte,
    metrica, setMetrica,
    busca, setBusca, pacientesEncontrados,
    linhas: linhasVisiveis, carregando, erro,
    totais, serie, serieDiaria,
    porTerapia, porMotivo, porUnidade, porPaciente,
    atualizadoEm, diasComDados,
    recarregar: () => carregar(de, ate),
  }
}
