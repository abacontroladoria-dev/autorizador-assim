'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listarAuditoriaAssim,
  listarAutorizacoesAssimSemana,
  listarFaltasAuditoria,
  listarUnidadesPorPaciente,
} from '@/services/auditoria-assim.service'
import { listarGuiasOrfas } from '@/services/reconciliacao-assim.service'
import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  ContagemPendencias,
  EstadoFiltro,
  GuiaOrfa,
  PacientePendencias,
  PlacarTuss,
} from '@/components/auditoria-assim/types'
import type { EstadoAutorizacao } from '@/components/auditoria-assim/reconciliacao/LinhaAutorizacao'

/**
 * Análise de reincidência — a cota semanal por TUSS, da clínica inteira.
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
 *    que alimenta a listagem. A diferença entre as duas não é acadêmica: aquela
 *    exclui guia já triada ANTES do `row_number()`, exclui guia capturada pelo
 *    próprio Pulsar e só considera `status = 'Liberado'`. Decidir isso aqui
 *    faria a tela oferecer vínculo para guia que a Conferência já casou — o erro
 *    que a migration 20260821040000 existe para não deixar acontecer.
 *
 * ── A SEMANA INTEIRA, E NÃO UM PACIENTE ────────────────────────────────────
 *
 * As autorizações passaram a ser carregadas para a clínica toda (2026-08-21),
 * não mais por carteirinha. É o que permite a pergunta que a tela agora abre —
 * "quais pacientes precisam da minha atenção nesta semana?" — sem uma requisição
 * por paciente. O recorte de um paciente virou `useMemo` sobre o que já está em
 * memória: abrir alguém na listagem não busca nada, e os números do modal são,
 * por construção, os mesmos da linha que foi clicada.
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

/** Hoje em componentes locais — o corte de "sessão já decorrida". */
function hojeIso(): string {
  return comoIso(new Date())
}

/**
 * O placar de um conjunto de sessões contra um conjunto de autorizações.
 *
 * Pura de propósito: a listagem chama isto uma vez por paciente da semana e o
 * modal chama de novo para o paciente aberto. Duas implementações fariam a
 * linha da tabela e o card do modal discordarem sobre o mesmo paciente — que é
 * exatamente o tipo de divergência que esta tela existe para caçar.
 *
 * `limiteDecorrido` é a data (inclusiva) até a qual uma sessão já aconteceu.
 * Ela separa `agendadas` de `decorridas`, e a diferença não é cosmética: numa
 * segunda-feira, contar como "autorização faltando" tudo que a clínica ainda vai
 * atender de terça a sexta transformaria a semana inteira em pendência e a tela
 * em ruído. Só sessão já ocorrida pode estar sem cobertura.
 */
export function calcularPlacar(
  sessoes: AuditoriaAssimItem[],
  autorizacoes: AutorizacaoAssimSemana[],
  limiteDecorrido: string
): PlacarTuss[] {
  const porTuss = new Map<string, PlacarTuss & { terapiasVistas: Set<string> }>()

  const entrada = (codigo: string | null) => {
    const chave = codigo ?? '—'
    let atual = porTuss.get(chave)
    if (!atual) {
      atual = {
        codigo_tuss: chave,
        terapias: '',
        agendadas: 0,
        decorridas: 0,
        autorizadas: 0,
        liberadas: 0,
        canceladas: 0,
        excedente: 0,
        faltante: 0,
        terapiasVistas: new Set<string>(),
      }
      porTuss.set(chave, atual)
    }
    return atual
  }

  for (const s of sessoes) {
    const item = entrada(s.codigo_tuss)
    if (s.terapias) item.terapiasVistas.add(s.terapias)
    // Sessão com falta não aconteceu, então não é cota — e autorizar em cima
    // dela é justamente um dos jeitos de estourar a semana.
    if (SITUACOES_SEM_SESSAO.has(s.situacao ?? '')) continue
    item.agendadas += 1
    if ((s.data_atendimento ?? '') <= limiteDecorrido) item.decorridas += 1
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
      faltante: Math.max(0, item.decorridas - item.liberadas),
    }))
    .sort((a, b) => b.excedente - a.excedente || a.codigo_tuss.localeCompare(b.codigo_tuss))
}

/**
 * Os três estados de guia que esta tela existe para vigiar.
 *
 * `ehOrfa` é injetado, e não decidido aqui, pelo motivo do cabeçalho: a
 * definição de órfã mora em `get_guias_orfas`.
 */
export function calcularLedger(
  autorizacoes: AutorizacaoAssimSemana[],
  ehOrfa: (guia: string) => boolean
) {
  let semVinculo = 0
  let glosas = 0
  let canceladas = 0
  for (const a of autorizacoes) {
    if (ehOrfa(a.guia)) semVinculo += 1
    if (autorizacaoCancelada(a.status)) canceladas += 1
    else if (!autorizacaoLiberada(a.status)) glosas += 1
  }
  return { semVinculo, glosas, canceladas }
}

/** As cinco espécies de pendência, somadas. O total é o que ordena a listagem. */
export function contarPendencias(
  placar: PlacarTuss[],
  ledger: { semVinculo: number; glosas: number; canceladas: number }
): ContagemPendencias {
  let sobrando = 0
  let faltando = 0
  for (const p of placar) {
    sobrando += Math.max(0, p.excedente)
    faltando += p.faltante
  }
  const contagem: ContagemPendencias = {
    glosa: ledger.glosas,
    cancelamento: ledger.canceladas,
    'sem-vinculo': ledger.semVinculo,
    faltando,
    sobrando,
    total: 0,
  }
  contagem.total =
    contagem.glosa + contagem.cancelamento + contagem['sem-vinculo'] + faltando + sobrando
  return contagem
}

export function useAnaliseReincidencia(dataInicial: string, pacienteInicial: string | null) {
  const [semanaInicio, setSemanaInicio] = useState(() => segundaDe(dataInicial))
  const [tussFiltro, setTussFiltro] = useState<string | null>(null)
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro | null>(null)

  /**
   * O paciente aberto no modal.
   *
   * Nome E carteirinhas juntos porque as duas chaves resolvem lados diferentes:
   * a sessão se acha pelo nome (é o que a RPC devolve), e a autorização se acha
   * pela carteirinha (é o que `autorizacoes_assim.matricula` guarda). As
   * carteirinhas vindas de fora são um ponto de partida — o recorte soma a elas
   * as que a própria semana descobrir.
   */
  const [selecionado, setSelecionado] = useState<{ nome: string; carteirinhas: string[] } | null>(
    pacienteInicial ? { nome: pacienteInicial, carteirinhas: [] } : null
  )

  const [sessoes, setSessoes] = useState<AuditoriaAssimItem[]>([])
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoAssimSemana[]>([])
  const [orfasDaSemana, setOrfasDaSemana] = useState<Map<string, GuiaOrfa>>(() => new Map())
  const [unidades, setUnidades] = useState<Map<string, string>>(() => new Map())
  const [carregandoSemana, setCarregandoSemana] = useState(false)
  const [carregandoAutorizacoes, setCarregandoAutorizacoes] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Cada carga carrega seu número de série: resposta de semana antiga que chega
  // atrasada não sobrescreve a atual.
  const geracaoSemana = useRef(0)
  const geracaoAutorizacoes = useRef(0)
  const geracaoOrfas = useRef(0)

  /** Reposiciona a análise — semana, paciente e carteirinha de uma vez. */
  const reabrirEm = useCallback((data: string, paciente: string | null, carteirinha: string | null) => {
    setSemanaInicio(segundaDe(data))
    setTussFiltro(null)
    setEstadoFiltro(null)
    setErro(null)
    setSelecionado(paciente ? { nome: paciente, carteirinhas: carteirinha ? [carteirinha] : [] } : null)
  }, [])

  const escolherPaciente = useCallback((nome: string | null, carteirinhas: string[] = []) => {
    setTussFiltro(null)
    setEstadoFiltro(null)
    setSelecionado(nome ? { nome, carteirinhas } : null)
  }, [])

  // ── As sessões da semana ───────────────────────────────────────────────────
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
  const carregarOrfasDaSemana = useCallback(async () => {
    const geracao = ++geracaoOrfas.current
    try {
      const lista = await listarGuiasOrfas(semanaInicio, somarDias(semanaInicio, 4))
      if (geracao !== geracaoOrfas.current) return
      setOrfasDaSemana(new Map(lista.map((g) => [g.guia, g])))
    } catch {
      // Silencioso de propósito: sem esta lista a tela ainda diz a verdade sobre
      // a cota — só deixa de oferecer o atalho de vincular. Derrubar a tela
      // inteira por causa do atalho seria pior que perdê-lo.
      if (geracao !== geracaoOrfas.current) return
      setOrfasDaSemana(new Map())
    }
  }, [semanaInicio])

  useEffect(() => {
    carregarOrfasDaSemana()
  }, [carregarOrfasDaSemana])

  // ── As autorizações da semana, da clínica inteira e sem pareamento ─────────
  const carregarAutorizacoes = useCallback(async () => {
    const geracao = ++geracaoAutorizacoes.current
    setCarregandoAutorizacoes(true)
    try {
      const fimExclusivo = somarDias(semanaInicio, 5)
      const [dados, mapaUnidades] = await Promise.all([
        listarAutorizacoesAssimSemana(null, semanaInicio, fimExclusivo),
        listarUnidadesPorPaciente(semanaInicio, somarDias(semanaInicio, 4)),
      ])
      if (geracao !== geracaoAutorizacoes.current) return
      setAutorizacoes(dados)
      setUnidades(mapaUnidades)
    } catch {
      if (geracao !== geracaoAutorizacoes.current) return
      setErro('Não foi possível carregar as autorizações desta semana.')
    } finally {
      if (geracao === geracaoAutorizacoes.current) setCarregandoAutorizacoes(false)
    }
  }, [semanaInicio])

  useEffect(() => {
    carregarAutorizacoes()
  }, [carregarAutorizacoes])

  // O corte de "já aconteceu". Fixo por semana, não por render: recalculá-lo a
  // cada render faria a virada da meia-noite mudar números no meio de uma leitura.
  const limiteDecorrido = useMemo(() => {
    const fimDaSemana = somarDias(semanaInicio, 4)
    const hoje = hojeIso()
    return hoje < fimDaSemana ? hoje : fimDaSemana
  }, [semanaInicio])

  const ehOrfa = useCallback((guia: string) => orfasDaSemana.has(guia), [orfasDaSemana])

  // ── A listagem: um paciente por linha, com as cinco pendências ─────────────
  const pacientesDaSemana = useMemo<PacientePendencias[]>(() => {
    type Acumulado = {
      chave: string
      nome: string
      carteirinhas: Set<string>
      pacienteIds: Set<string>
      plano: string | null
      sessoes: AuditoriaAssimItem[]
      autorizacoes: AutorizacaoAssimSemana[]
    }

    // A carteirinha é a identidade; o nome é só como se chega nela. Duas pessoas
    // homônimas são dois beneficiários, e juntá-las faria alguém vincular a guia
    // de uma na sessão da outra. Mas a linha de FALTA não traz carteirinha (a RPC
    // de faltas não a devolve), então o nome é a ponte — construída a partir das
    // sessões que TÊM carteirinha antes de qualquer agrupamento.
    const carteirinhaPorNome = new Map<string, string>()
    for (const s of sessoes) {
      if (s.paciente_nome && s.carteirinha && !carteirinhaPorNome.has(s.paciente_nome)) {
        carteirinhaPorNome.set(s.paciente_nome, s.carteirinha)
      }
    }

    const mapa = new Map<string, Acumulado>()
    const abrir = (chave: string, nome: string): Acumulado => {
      let atual = mapa.get(chave)
      if (!atual) {
        atual = {
          chave,
          nome,
          carteirinhas: new Set(),
          pacienteIds: new Set(),
          plano: null,
          sessoes: [],
          autorizacoes: [],
        }
        mapa.set(chave, atual)
      }
      return atual
    }

    for (const s of sessoes) {
      const nome = s.paciente_nome ?? '(sem nome)'
      const carteirinha = s.carteirinha ?? carteirinhaPorNome.get(nome) ?? null
      const item = abrir(carteirinha ?? `nome:${nome}`, nome)
      if (carteirinha) item.carteirinhas.add(carteirinha)
      if (s.paciente_id) item.pacienteIds.add(s.paciente_id)
      item.plano ??= s.convenio_nome
      item.sessoes.push(s)
    }

    // Índice de carteirinha -> linha, para as autorizações caírem no paciente
    // certo mesmo quando o nome da ASSIM difere do nome da agenda.
    const porCarteirinha = new Map<string, Acumulado>()
    for (const item of mapa.values()) {
      for (const c of item.carteirinhas) porCarteirinha.set(c, item)
    }

    for (const a of autorizacoes) {
      // Guia de paciente sem sessão nenhuma na semana abre linha própria: é
      // exatamente o caso de "autorização sobrando" que nenhuma tela mostrava.
      const alvo = a.matricula ? porCarteirinha.get(a.matricula) : undefined
      const item =
        alvo ?? abrir(a.matricula ?? `nome:${a.paciente_nome ?? '(sem nome)'}`, a.paciente_nome ?? '(sem nome)')
      if (!alvo && a.matricula) {
        item.carteirinhas.add(a.matricula)
        porCarteirinha.set(a.matricula, item)
      }
      item.autorizacoes.push(a)
    }

    const linhas: PacientePendencias[] = []
    for (const item of mapa.values()) {
      const placar = calcularPlacar(item.sessoes, item.autorizacoes, limiteDecorrido)
      const ledger = calcularLedger(item.autorizacoes, ehOrfa)
      let ultima: string | null = null
      for (const a of item.autorizacoes) {
        if (a.data_execucao && (!ultima || a.data_execucao > ultima)) ultima = a.data_execucao
      }
      const pacienteIds = [...item.pacienteIds]
      linhas.push({
        chave: item.chave,
        nome: item.nome,
        carteirinhas: [...item.carteirinhas],
        pacienteIds,
        plano: item.plano,
        unidade: pacienteIds.map((id) => unidades.get(id)).find(Boolean) ?? null,
        contagem: contarPendencias(placar, ledger),
        sessoes: item.sessoes.length,
        ultimaAutorizacao: ultima,
      })
    }

    return linhas.sort(
      (a, b) => b.contagem.total - a.contagem.total || a.nome.localeCompare(b.nome, 'pt-BR')
    )
  }, [sessoes, autorizacoes, unidades, ehOrfa, limiteDecorrido])

  /** As unidades que a semana de fato tem — a lista do filtro, sem inventar opção. */
  const unidadesDaSemana = useMemo(
    () =>
      [...new Set(pacientesDaSemana.map((p) => p.unidade).filter((u): u is string => !!u))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR')
      ),
    [pacientesDaSemana]
  )

  // ── O recorte do paciente aberto ──────────────────────────────────────────
  const pacienteNome = selecionado?.nome ?? null

  const linhaSelecionada = useMemo(
    () => (pacienteNome ? pacientesDaSemana.find((p) => p.nome === pacienteNome) ?? null : null),
    [pacientesDaSemana, pacienteNome]
  )

  const carteirinhas = useMemo(() => {
    const juntas = new Set(selecionado?.carteirinhas ?? [])
    for (const c of linhaSelecionada?.carteirinhas ?? []) juntas.add(c)
    return [...juntas]
  }, [selecionado, linhaSelecionada])

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

  const autorizacoesPaciente = useMemo(() => {
    if (!pacienteNome || carteirinhas.length === 0) return []
    const chaves = new Set(carteirinhas)
    return autorizacoes
      .filter((a) => !!a.matricula && chaves.has(a.matricula))
      .sort((a, b) => (a.data_execucao ?? '').localeCompare(b.data_execucao ?? ''))
  }, [autorizacoes, pacienteNome, carteirinhas])

  // Nome de paciente é a chave da busca, mas não é identidade. Se duas pessoas
  // dividem o nome, dizer isso é melhor que escolher uma em silêncio.
  const idsDoPaciente = useMemo(
    () => [...new Set(sessoesPaciente.map((s) => s.paciente_id).filter((id): id is string => !!id))],
    [sessoesPaciente]
  )

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

  const placar = useMemo(
    () => calcularPlacar(sessoesPaciente, autorizacoesPaciente, limiteDecorrido),
    [sessoesPaciente, autorizacoesPaciente, limiteDecorrido]
  )

  const sessoesVisiveis = useMemo(
    () => (tussFiltro ? sessoesPaciente.filter((s) => (s.codigo_tuss ?? '—') === tussFiltro) : sessoesPaciente),
    [sessoesPaciente, tussFiltro]
  )

  const autorizacoesDoTuss = useMemo(
    () =>
      tussFiltro
        ? autorizacoesPaciente.filter((a) => (a.codigo_tuss ?? '—') === tussFiltro)
        : autorizacoesPaciente,
    [autorizacoesPaciente, tussFiltro]
  )

  /**
   * Os três estados que esta tela existe para vigiar, contados ANTES do filtro
   * de estado — senão escolher "glosas" zeraria os outros dois contadores e a
   * pessoa perderia a única visão do que mais há para olhar na semana.
   */
  const ledger = useMemo(() => calcularLedger(autorizacoesDoTuss, ehOrfa), [autorizacoesDoTuss, ehOrfa])

  /** Guia liberada que casou com sessão da semana — a cobertura que de fato funcionou. */
  const utilizadas = useMemo(
    () =>
      autorizacoesDoTuss.filter((a) => autorizacaoLiberada(a.status) && estadoDaGuia(a.guia) === 'pareada')
        .length,
    [autorizacoesDoTuss, estadoDaGuia]
  )

  const liberadas = useMemo(
    () => autorizacoesDoTuss.filter((a) => autorizacaoLiberada(a.status)).length,
    [autorizacoesDoTuss]
  )

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
    irParaData: (data: string) => {
      setSemanaInicio(segundaDe(data))
      setTussFiltro(null)
      setEstadoFiltro(null)
    },
    /** A semana que contém hoje. Usada pelo botão "hoje" do cabeçalho. */
    semanaAtual: segundaDe(hojeIso()),
    pacienteNome,
    escolherPaciente,
    reabrirEm,
    pacientesDaSemana,
    unidadesDaSemana,
    /** A linha da listagem do paciente aberto — plano, unidade e contagens. */
    linhaSelecionada,
    idsDoPaciente,
    /** Para o cabeçalho de identidade. Nula até a semana carregar. */
    carteirinhaDoPaciente: carteirinhas[0] ?? null,
    tussFiltro,
    setTussFiltro,
    estadoFiltro,
    setEstadoFiltro,
    ledger,
    liberadas,
    utilizadas,
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
