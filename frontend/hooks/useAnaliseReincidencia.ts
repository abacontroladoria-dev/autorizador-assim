'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listarAuditoriaAssim,
  listarAutorizacoesAssimSemana,
  listarFaltasAuditoria,
} from '@/services/auditoria-assim.service'
import { listarGuiasOrfas } from '@/services/reconciliacao-assim.service'
import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  EstadoFiltro,
  GuiaOrfa,
  PlacarTuss,
} from '@/components/auditoria-assim/types'
import type { EstadoAutorizacao } from '@/components/auditoria-assim/reconciliacao/LinhaAutorizacao'

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
 * O pareamento em si NÃO é reimplementado aqui, em duas camadas:
 *
 * 1. quais guias casaram com sessão desta semana sai das próprias linhas da RPC;
 * 2. quais guias PRECISAM de vínculo sai de `get_guias_orfas` — a mesma função
 *    que alimenta a fila ao lado. A diferença entre as duas não é acadêmica: a
 *    fila exclui guia já triada ANTES do `row_number()`, exclui guia capturada
 *    pelo próprio Pulsar e só considera `status = 'Liberado'`. Decidir isso aqui
 *    faria a tela oferecer vínculo para guia que a Conferência já casou — o erro
 *    que a migration 20260821040000 existe para não deixar acontecer.
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

/**
 * Só `Liberado` cru consumiu cota.
 *
 * Comparação EXATA, e não por prefixo: `Liberado *` é o rótulo que a ASSIM usa
 * para autorização **cancelada** — é assim que a migration 20260528120000 a
 * traduz para a situação CANCELADA, e é por isso que `get_guias_orfas` filtra
 * `status = 'Liberado'` e não `like 'Liberado%'`. Casar por prefixo contava
 * cancelada como cota gasta e inventava excedente onde não havia.
 */
export function autorizacaoLiberada(status: string | null): boolean {
  return (status ?? '').trim() === 'Liberado'
}

/** A autorização saiu e foi desfeita. Não consumiu cota e não pede nada. */
export function autorizacaoCancelada(status: string | null): boolean {
  return (status ?? '').trim() === 'Liberado *'
}

export function useAnaliseReincidencia(dataInicial: string, pacienteInicial: string | null) {
  const [semanaInicio, setSemanaInicio] = useState(() => segundaDe(dataInicial))
  const [pacienteNome, setPacienteNome] = useState<string | null>(pacienteInicial)
  const [tussFiltro, setTussFiltro] = useState<string | null>(null)
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro | null>(null)

  const [sessoes, setSessoes] = useState<AuditoriaAssimItem[]>([])
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoAssimSemana[]>([])
  const [orfasDaSemana, setOrfasDaSemana] = useState<Map<string, GuiaOrfa>>(() => new Map())
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
  const geracaoOrfas = useRef(0)

  /**
   * Reposiciona a análise — semana, paciente e carteirinha de uma vez.
   *
   * NÃO limpa `sessoes` aqui, e isso é deliberado: as buscas são disparadas por
   * mudança de dependência, então reposicionar para a MESMA semana esvaziaria o
   * cronograma sem nada para reenchê-lo. E não há o que limpar — a carga da
   * semana é da clínica inteira, independente de paciente; quem recorta é o
   * `sessoesPaciente`.
   */
  const reabrirEm = useCallback((data: string, paciente: string | null, carteirinha: string | null) => {
    setSemanaInicio(segundaDe(data))
    setPacienteNome(paciente)
    setTussFiltro(null)
    setEstadoFiltro(null)
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
    carregarSemana()
  }, [carregarSemana])

  // ── A fila de órfãs recortada nesta semana ─────────────────────────────────
  // Chamada própria, de 5 dias, independente do intervalo de 30 dias da fila ao
  // lado: navegar para uma semana fora daquele intervalo deixaria a
  // classificação cega, e "sem vínculo" viraria silêncio em vez de âmbar.
  const carregarOrfasDaSemana = useCallback(async () => {
    const geracao = ++geracaoOrfas.current
    try {
      const lista = await listarGuiasOrfas(semanaInicio, somarDias(semanaInicio, 4))
      if (geracao !== geracaoOrfas.current) return
      setOrfasDaSemana(new Map(lista.map((g) => [g.guia, g])))
    } catch {
      // Silencioso de propósito: sem esta lista o painel ainda diz a verdade
      // sobre a cota — só deixa de oferecer o atalho de vincular. Derrubar a
      // tela inteira por causa do atalho seria pior que perdê-lo.
      if (geracao !== geracaoOrfas.current) return
      setOrfasDaSemana(new Map())
    }
  }, [semanaInicio])

  useEffect(() => {
    carregarOrfasDaSemana()
  }, [carregarOrfasDaSemana])

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
    carregarAutorizacoes()
  }, [carregarAutorizacoes])

  /**
   * As guias que a própria RPC casou com uma sessão desta semana. É o pareamento
   * do banco, emprestado — não uma reimplementação dele.
   */
  const guiasPareadas = useMemo(
    () => new Set(sessoesPaciente.map((s) => s.guia).filter((g): g is string => !!g)),
    [sessoesPaciente]
  )

  /**
   * O destino de uma autorização, em três estados. Ver `EstadoAutorizacao`.
   *
   * A ordem importa: estar na fila de órfãs vence tudo, porque é a única
   * afirmação que autoriza ação. Só depois se pergunta se a guia encosta em
   * alguma sessão que a pessoa está vendo.
   */
  const estadoDaGuia = useCallback(
    (guia: string): EstadoAutorizacao => {
      if (orfasDaSemana.has(guia)) return 'sem-vinculo'
      return guiasPareadas.has(guia) ? 'pareada' : 'fora-da-semana'
    },
    [orfasDaSemana, guiasPareadas]
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
          canceladas: 0,
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
      else if (autorizacaoCancelada(a.status)) item.canceladas += 1
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

  const autorizacoesDoTuss = useMemo(
    () => (tussFiltro ? autorizacoes.filter((a) => (a.codigo_tuss ?? '—') === tussFiltro) : autorizacoes),
    [autorizacoes, tussFiltro]
  )

  /**
   * Os três estados que esta tela existe para vigiar, contados ANTES do filtro
   * de estado — senão escolher "glosas" zeraria os outros dois contadores e a
   * pessoa perderia a única visão do que mais há para olhar na semana.
   */
  const ledger = useMemo(() => {
    let semVinculo = 0
    let glosas = 0
    let canceladas = 0
    for (const a of autorizacoesDoTuss) {
      if (estadoDaGuia(a.guia) === 'sem-vinculo') semVinculo += 1
      if (autorizacaoCancelada(a.status)) canceladas += 1
      else if (!autorizacaoLiberada(a.status)) glosas += 1
    }
    return { semVinculo, glosas, canceladas }
  }, [autorizacoesDoTuss, estadoDaGuia])

  const autorizacoesVisiveis = useMemo(() => {
    if (!estadoFiltro) return autorizacoesDoTuss
    return autorizacoesDoTuss.filter((a) => {
      if (estadoFiltro === 'sem-vinculo') return estadoDaGuia(a.guia) === 'sem-vinculo'
      if (estadoFiltro === 'cancelada') return autorizacaoCancelada(a.status)
      return !autorizacaoLiberada(a.status) && !autorizacaoCancelada(a.status)
    })
  }, [autorizacoesDoTuss, estadoFiltro, estadoDaGuia])

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
      setEstadoFiltro(null)
    },
    pacienteNome,
    escolherPaciente: (nome: string | null) => {
      setPacienteNome(nome)
      setTussFiltro(null)
      setEstadoFiltro(null)
      setCarteirinhas([])
    },
    reabrirEm,
    pacientesDaSemana,
    idsDoPaciente,
    /** Para o cabeçalho de identidade. Nula até a semana carregar. */
    carteirinhaDoPaciente: carteirinhas[0] ?? null,
    tussFiltro,
    setTussFiltro,
    estadoFiltro,
    setEstadoFiltro,
    ledger,
    placar,
    totalExcedente,
    sessoesVisiveis,
    autorizacoesVisiveis,
    estadoDaGuia,
    orfasDaSemana,
    loading: carregandoSemana || carregandoAutorizacoes,
    carregandoSemana,
    erro,
    recarregar: useCallback(() => {
      carregarSemana()
      carregarAutorizacoes()
      carregarOrfasDaSemana()
    }, [carregarSemana, carregarAutorizacoes, carregarOrfasDaSemana]),
  }
}
