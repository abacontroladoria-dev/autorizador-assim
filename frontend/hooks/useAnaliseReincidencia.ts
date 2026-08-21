'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listarAuditoriaAssim,
  listarAutorizacoesAssimSemana,
  listarFaltasAuditoria,
} from '@/services/auditoria-assim.service'
import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  PlacarTuss,
} from '@/components/auditoria-assim/types'

/**
 * Análise de reincidência — a cota semanal de um paciente por TUSS.
 *
 * O QUE ESTE HOOK RECONCILIA, e por que não dava para ler de uma tela só:
 *
 * A glosa 1601 ("REINCIDENCIA NO ATENDIMENTO") diz que a autorização daquele
 * TUSS passou da cota semanal. A auditoria não mostra isso por duas razões
 * somadas: ela é diária, e é dirigida pela SESSÃO. `get_auditoria_assim` pareia
 * sessão <-> autorização por (carteirinha, dia, TUSS, ordinal) num LEFT JOIN com
 * a `agenda_tita` à esquerda, então a autorização EXCEDENTE — a de
 * `ordem_autorizacao = 3` onde só existem 2 sessões — não casa com nada e não
 * aparece em tela nenhuma. É exatamente ela que estoura a cota.
 *
 * Daí os dois lados vindo de fontes diferentes: as sessões pela RPC da auditoria
 * (que já traz TUSS pelo mapa único `tuss_da_sessao` e a situação de cada
 * bloco), e as autorizações direto de `autorizacoes_assim`, sem passar pelo
 * pareamento — que é o único jeito de a órfã aparecer.
 *
 * O pareamento em si NÃO é reimplementado aqui: a órfã é definida por diferença
 * de conjuntos sobre `guia`, usando as guias que a própria RPC casou. Se um dia
 * a regra de pareamento do banco mudar, esta tela acompanha sozinha.
 */

/** Cota = quantas sessões daquele TUSS o paciente tem na semana. Falta não conta. */
const SITUACOES_SEM_SESSAO = new Set(['FALTA', 'FALTA_TERAPEUTA'])

/**
 * Datas sempre em componentes locais.
 *
 * `new Date('2026-08-17')` é interpretado como UTC e, em UTC-3, `.getDay()`
 * devolve o dia ANTERIOR — a armadilha documentada em
 * `lib/cronograma/comparativoSessoes.ts`. Construir com (ano, mês-1, dia) e
 * formatar com padding manual mantém tudo no fuso do navegador.
 */
function comoData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1)
}

function comoIso(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** A segunda-feira da semana que contém `iso`. Domingo recua 6 dias, não avança. */
export function segundaDe(iso: string): string {
  const d = comoData(iso)
  const dow = d.getDay() // 0 = domingo
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return comoIso(d)
}

/** Os 5 dias úteis a partir de uma segunda. */
export function diasUteisDe(segunda: string): string[] {
  const base = comoData(segunda)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return comoIso(d)
  })
}

export function somarDias(iso: string, dias: number): string {
  const d = comoData(iso)
  d.setDate(d.getDate() + dias)
  return comoIso(d)
}

/** "Liberado" e "Liberado *" são o que consumiu cota; o resto é recusa. */
export function autorizacaoLiberada(status: string | null): boolean {
  return /^liberado/i.test((status ?? '').trim())
}

export function useAnaliseReincidencia(ativo: boolean, dataInicial: string, pacienteInicial: string | null) {
  const [semanaInicio, setSemanaInicio] = useState(() => segundaDe(dataInicial))
  const [pacienteNome, setPacienteNome] = useState<string | null>(pacienteInicial)
  const [tussFiltro, setTussFiltro] = useState<string | null>(null)

  const [sessoes, setSessoes] = useState<AuditoriaAssimItem[]>([])
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoAssimSemana[]>([])
  const [carregandoSemana, setCarregandoSemana] = useState(false)
  const [carregandoAutorizacoes, setCarregandoAutorizacoes] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // As carteirinhas sobrevivem à troca de semana: sem sessão numa semana, o
  // paciente ainda tem chave para buscar as autorizações dela — e semana sem
  // sessão com autorização em cima é justamente um caso a ver.
  const [carteirinhas, setCarteirinhas] = useState<string[]>([])

  // Cada carga carrega seu número de série: resposta de semana antiga que chega
  // atrasada não sobrescreve a atual.
  const geracaoSemana = useRef(0)
  const geracaoAutorizacoes = useRef(0)

  const reabrirEm = useCallback((data: string, paciente: string | null, carteirinha: string | null) => {
    setSemanaInicio(segundaDe(data))
    setPacienteNome(paciente)
    setTussFiltro(null)
    setSessoes([])
    setAutorizacoes([])
    setErro(null)
    setCarteirinhas(carteirinha ? [carteirinha] : [])
  }, [])

  // ── Lado esquerdo: as sessões da semana ────────────────────────────────────
  // 5 dias em paralelo em vez de uma chamada de `get_auditoria_assim_periodo`
  // sobre a semana: a semana inteira da clínica encosta no teto de linhas que o
  // PostgREST aplica por resposta, e um corte ali seria silencioso. Por dia, cada
  // resposta fica do tamanho que a página já exercita — e as faltas entram, que a
  // RPC de auditoria não traz e que importam para a contagem da cota.
  const carregarSemana = useCallback(async () => {
    const geracao = ++geracaoSemana.current
    setCarregandoSemana(true)
    setErro(null)
    try {
      const dias = diasUteisDe(semanaInicio)
      const respostas = await Promise.all(
        dias.map((dia) => Promise.all([listarAuditoriaAssim(dia), listarFaltasAuditoria(dia)]))
      )
      if (geracao !== geracaoSemana.current) return

      const vistos = new Set<string | null>()
      const unicos: AuditoriaAssimItem[] = []
      for (const item of respostas.flat(2)) {
        if (!vistos.has(item.bloco_id)) {
          vistos.add(item.bloco_id)
          unicos.push(item)
        }
      }
      setSessoes(unicos)
    } catch {
      if (geracao !== geracaoSemana.current) return
      setErro('Não foi possível carregar o cronograma desta semana.')
    } finally {
      if (geracao === geracaoSemana.current) setCarregandoSemana(false)
    }
  }, [semanaInicio])

  useEffect(() => {
    if (ativo) carregarSemana()
  }, [ativo, carregarSemana])

  // Pacientes com sessão ASSIM na semana — a lista que a busca oferece.
  const pacientesDaSemana = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const s of sessoes) {
      if (!s.paciente_nome) continue
      contagem.set(s.paciente_nome, (contagem.get(s.paciente_nome) ?? 0) + 1)
    }
    return [...contagem.entries()]
      .map(([nome, sessoesNaSemana]) => ({ nome, sessoesNaSemana }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [sessoes])

  const sessoesPaciente = useMemo(() => {
    if (!pacienteNome) return []
    return sessoes
      .filter((s) => s.paciente_nome === pacienteNome)
      .sort(
        (a, b) =>
          (a.data_atendimento ?? '').localeCompare(b.data_atendimento ?? '') ||
          (a.hora_inicial ?? '').localeCompare(b.hora_inicial ?? '')
      )
  }, [sessoes, pacienteNome])

  // Nome de paciente é a chave da busca, mas não é identidade. Se duas pessoas
  // dividem o nome, dizer isso é melhor que escolher uma em silêncio.
  const idsDoPaciente = useMemo(
    () => [...new Set(sessoesPaciente.map((s) => s.paciente_id).filter((id): id is string => !!id))],
    [sessoesPaciente]
  )

  // Carteirinha vem das sessões do paciente; só cresce, nunca se perde ao andar
  // para uma semana sem sessão.
  useEffect(() => {
    const daSemana = [...new Set(sessoesPaciente.map((s) => s.carteirinha).filter((c): c is string => !!c))]
    if (daSemana.length === 0) return
    setCarteirinhas((prev) => {
      const juntas = new Set([...prev, ...daSemana])
      return juntas.size === prev.length ? prev : [...juntas]
    })
  }, [sessoesPaciente])

  // ── Lado direito: as autorizações da semana, sem pareamento ────────────────
  const carregarAutorizacoes = useCallback(async () => {
    const chaves = carteirinhas
    if (!pacienteNome || chaves.length === 0) {
      setAutorizacoes([])
      return
    }
    const geracao = ++geracaoAutorizacoes.current
    setCarregandoAutorizacoes(true)
    try {
      const fimExclusivo = somarDias(semanaInicio, 5)
      const dados = await listarAutorizacoesAssimSemana(chaves, semanaInicio, fimExclusivo)
      if (geracao !== geracaoAutorizacoes.current) return
      setAutorizacoes(dados)
    } catch {
      if (geracao !== geracaoAutorizacoes.current) return
      setErro('Não foi possível carregar as autorizações desta semana.')
    } finally {
      if (geracao === geracaoAutorizacoes.current) setCarregandoAutorizacoes(false)
    }
  }, [pacienteNome, semanaInicio, carteirinhas])

  useEffect(() => {
    if (ativo) carregarAutorizacoes()
  }, [ativo, carregarAutorizacoes])

  /**
   * As guias que a própria RPC casou com uma sessão desta semana. É o pareamento
   * do banco, emprestado — não uma reimplementação dele.
   */
  const guiasPareadas = useMemo(
    () => new Set(sessoesPaciente.map((s) => s.guia).filter((g): g is string => !!g)),
    [sessoesPaciente]
  )

  const orfas = useMemo(
    () => new Set(autorizacoes.filter((a) => !guiasPareadas.has(a.guia)).map((a) => a.guia)),
    [autorizacoes, guiasPareadas]
  )

  const placar = useMemo<PlacarTuss[]>(() => {
    const porTuss = new Map<string, PlacarTuss & { terapiasVistas: Set<string> }>()

    const entrada = (codigo: string | null) => {
      const chave = codigo ?? '—'
      let atual = porTuss.get(chave)
      if (!atual) {
        atual = {
          codigo_tuss: chave,
          terapias: '',
          agendadas: 0,
          autorizadas: 0,
          liberadas: 0,
          excedente: 0,
          terapiasVistas: new Set<string>(),
        }
        porTuss.set(chave, atual)
      }
      return atual
    }

    for (const s of sessoesPaciente) {
      const item = entrada(s.codigo_tuss)
      if (s.terapias) item.terapiasVistas.add(s.terapias)
      // Sessão com falta não aconteceu, então não é cota — e autorizar em cima
      // dela é justamente um dos jeitos de estourar a semana.
      if (!SITUACOES_SEM_SESSAO.has(s.situacao ?? '')) item.agendadas += 1
    }

    for (const a of autorizacoes) {
      const item = entrada(a.codigo_tuss)
      item.autorizadas += 1
      if (autorizacaoLiberada(a.status)) item.liberadas += 1
    }

    return [...porTuss.values()]
      .map(({ terapiasVistas, ...item }) => ({
        ...item,
        terapias: [...terapiasVistas].join(' | '),
        excedente: item.liberadas - item.agendadas,
      }))
      .sort((a, b) => b.excedente - a.excedente || a.codigo_tuss.localeCompare(b.codigo_tuss))
  }, [sessoesPaciente, autorizacoes])

  const sessoesVisiveis = useMemo(
    () => (tussFiltro ? sessoesPaciente.filter((s) => (s.codigo_tuss ?? '—') === tussFiltro) : sessoesPaciente),
    [sessoesPaciente, tussFiltro]
  )

  const autorizacoesVisiveis = useMemo(
    () => (tussFiltro ? autorizacoes.filter((a) => (a.codigo_tuss ?? '—') === tussFiltro) : autorizacoes),
    [autorizacoes, tussFiltro]
  )

  const totalExcedente = useMemo(
    () => placar.reduce((soma, p) => soma + Math.max(0, p.excedente), 0),
    [placar]
  )

  return {
    semanaInicio,
    semanaFim: somarDias(semanaInicio, 4),
    irParaSemana: (delta: number) => {
      setSemanaInicio((atual) => somarDias(atual, delta * 7))
      setTussFiltro(null)
    },
    pacienteNome,
    escolherPaciente: (nome: string | null) => {
      setPacienteNome(nome)
      setTussFiltro(null)
      setCarteirinhas([])
    },
    reabrirEm,
    pacientesDaSemana,
    idsDoPaciente,
    tussFiltro,
    setTussFiltro,
    placar,
    totalExcedente,
    sessoesVisiveis,
    autorizacoesVisiveis,
    orfas,
    loading: carregandoSemana || carregandoAutorizacoes,
    carregandoSemana,
    erro,
    recarregar: () => {
      carregarSemana()
      carregarAutorizacoes()
    },
  }
}
