// ─── PROJEÇÃO DE RECEITA MENSAL ───────────────────────────────────────────────
// Cruza as sessões já classificadas em pacientesDashboard.ts (Multidisciplinar
// vs Processo Diagnóstico) com os valores cadastrados em
// cronograma_convenio_valores/cronograma_convenio_valores_paciente pra projetar
// receita semanal/mensal por convênio. Mesma separação MESMA separação do
// Dashboard de Pacientes (calcularDashboardPacientes): um paciente cuja agenda
// é feita só de Avaliação Neuropsicológica/Psiquiatra/Triagem só conta no
// segmento "Processo Diagnóstico", nunca no "Multidisciplinar" — por isso a
// projeção de receita também é separada em dois segmentos, senão os números
// de "pacientes" de cada convênio aqui não batem com os da aba Pacientes.
//
// A projeção mensal NÃO é "receita da semana de referência × 4,33" (isso erra
// pra mais ou pra menos dependendo de quantas segundas/terças/etc. o mês em
// questão realmente tem). Em vez disso, segue o mesmo padrão de "Dias
// trabalhados" já usado em relacionamento-prestador/analise
// (calcularAnaliseFutura, lib/remuneracao/calculo.ts): pra cada dia da semana,
// `Receita/mês = Receita/sem(daquele dia) × quantas vezes esse dia da semana
// ocorre no mês de referência` (getCalendario, lib/remuneracao/datas.ts) — e a
// receita mensal do convênio é a soma dos 5 dias úteis.

import { cleanTxt } from "./helpers"
import { normTxt, EXIB_ID } from "./constants"
import { isAgendadoAtivo, isTerapiaDiagnostico, semanasNoPeriodo } from "./pacientesDashboard"
import { getCalendario, type CalendarioResult } from "../remuneracao/datas"
import type { AgendaSalaRow } from "./salasTypes"
import { TERAPIAS_PACOTE, type ConvenioValor, type ConvenioValorPaciente, type ConvenioPacoteAvaliacao } from "./convenioValoresTypes"

const DOW_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" }

/** IDs das terapias de TERAPIAS_PACOTE (convenioValoresTypes.ts) — cobradas em BLOCO (pacote/consulta avulsa), não por sessão. */
const TERAPIAS_PACOTE_IDS = new Set(TERAPIAS_PACOTE.map(t => t.terapia_id))

export type OrigemValor = "paciente" | "criterio_aba" | "terapia" | "geral" | "pacote_avaliacao" | "sem_valor"

export interface ValorResolvido {
  valor: number | null
  origem: OrigemValor
}

function normEq(a: string, b: string): boolean {
  return normTxt(a) === normTxt(b)
}

/** Chave estável de paciente — por paciente_id quando disponível, nome normalizado como fallback. */
function pacienteKey(pacienteId: number | null, paciente: string): string {
  return pacienteId !== null ? `id:${pacienteId}` : `nome:${normTxt(paciente)}`
}

function valorDaRegra(regra: { valor_sessao: number | null }): number | null {
  return regra.valor_sessao
}

/**
 * Resolve o valor de uma sessão, na ordem de prioridade: exceção por paciente
 * > regra por critério ABA do convênio (vale pra QUALQUER terapia do paciente,
 * conforme o cronograma dele conter Psicologia ABA ou não — ex.: SEGUROS
 * UNIMED) > regra por terapia do convênio > regra geral do convênio.
 *
 * Toda sessão (inclusive Processo Diagnóstico) é precificada só por
 * valor_sessao — o sistema não trabalha mais com valor por hora.
 *
 * O casamento da exceção por paciente é por paciente_id, e o da regra por
 * terapia é por terapia_id — chaves estáveis (nome de paciente/terapia pode
 * ser renomeado ou digitado com pequenas diferenças de acento/pontuação sem o
 * id mudar). Só cai pra comparação por nome quando o lado cadastrado ainda não
 * tem id (registro antigo, cadastrado antes desses campos existirem, e ainda
 * não resalvo pelo formulário atual) ou quando a sessão em si não trouxe
 * nenhum id da fonte.
 */
export function resolverValorSessao(
  regrasGerais: ConvenioValor[],
  excecoesPaciente: ConvenioValorPaciente[],
  params: { convenio: string; pacienteId: number | null; paciente: string; terapiaId: number | null; terapiaNome: string; temPsicologiaAba: boolean },
): ValorResolvido {
  const { convenio, pacienteId, paciente, terapiaId, terapiaNome, temPsicologiaAba } = params

  const excecao = excecoesPaciente.find(e => {
    if (!normEq(e.convenio_nome, convenio)) return false
    if (e.paciente_id !== null) return pacienteId !== null && e.paciente_id === pacienteId
    return normEq(e.paciente_nome, paciente)
  })
  if (excecao) {
    const valor = valorDaRegra(excecao)
    if (valor !== null) return { valor, origem: "paciente" }
  }

  const criterioEsperado = temPsicologiaAba ? "com_aba" : "sem_aba"
  const regraCriterioAba = regrasGerais.find(r => r.criterio_aba === criterioEsperado && normEq(r.convenio_nome, convenio))
  if (regraCriterioAba) {
    const valor = valorDaRegra(regraCriterioAba)
    if (valor !== null) return { valor, origem: "criterio_aba" }
  }

  const regraTerapia = regrasGerais.find(r => {
    if (!normEq(r.convenio_nome, convenio)) return false
    if (r.terapia_id !== null) return terapiaId !== null && r.terapia_id === terapiaId
    return !!r.terapia_nome && normEq(r.terapia_nome, terapiaNome)
  })
  if (regraTerapia) {
    const valor = valorDaRegra(regraTerapia)
    if (valor !== null) return { valor, origem: "terapia" }
  }

  const regraGeral = regrasGerais.find(r => r.terapia_id === null && !r.terapia_nome && r.criterio_aba === null && normEq(r.convenio_nome, convenio))
  if (regraGeral) {
    const valor = valorDaRegra(regraGeral)
    if (valor !== null) return { valor, origem: "geral" }
  }

  return { valor: null, origem: "sem_valor" }
}

export interface PrevisaoReceitaDia {
  dow: 1 | 2 | 3 | 4 | 5
  diaLabel: string
  /** Sessões observadas nesse dia da semana, normalizado pra 1 semana (se a janela buscada cobrisse mais de uma). */
  sessoesSemana: number
  /** Quantas vezes esse dia da semana ocorre no mês de referência (ex.: nº de segundas em agosto/2026). */
  ocorrenciasMes: number
  sessoesMesProjetadas: number
  receitaSemana: number
  receitaMesProjetada: number
}

export interface PrevisaoReceitaTerapia {
  terapiaId: number | null
  terapiaNome: string
  sessoesSemana: number
  sessoesSemValor: number
  receitaSemana: number
  /** Valor médio efetivamente cobrado por sessão dessa terapia (exclui sessões sem valor do denominador) — prova visual de que terapias diferentes (ou o mesmo paciente por critério ABA/exceção) podem gerar valores diferentes dentro do mesmo convênio. */
  valorMedioPorSessao: number | null
  /** De onde veio o valor de cada sessão dessa terapia — mais de um item aqui indica que sessões da MESMA terapia tiveram origem diferente (ex.: uma exceção por paciente ou critério ABA se sobrepôs à regra por terapia pra alguns casos). */
  origens: OrigemValor[]
}

export interface PrevisaoReceitaSessao {
  /** ID real do agendamento na fonte (tita_agendamento_id) — único de verdade, diferente de paciente+terapia+dia+hora, que podem colidir se o mesmo horário tiver mais de uma sessão idêntica cadastrada. */
  agendamentoId: number | null
  pacienteId: number | null
  pacienteNome: string
  terapiaId: number | null
  terapiaNome: string
  diaLabel: string
  data: string
  /** Hora de início (ex.: "08:00") — paciente pode ter 2 sessões da mesma terapia no mesmo dia (manhã/tarde), então isso entra na chave de unicidade da linha. */
  horaInicial: string | null
  valor: number | null
  origem: OrigemValor
}

export interface PrevisaoReceitaConvenio {
  convenio: string
  pacientesUnicos: number
  sessoesTotal: number
  sessoesSemValor: number
  receitaSemanal: number
  receitaMensalProjetada: number
  /** Detalhe dia a dia (Seg a Sex) — a base do cálculo de receitaMensalProjetada, pra exibir "o que está sendo calculado". */
  porDia: PrevisaoReceitaDia[]
  /** Detalhe por terapia — prova visual de que a mesma terapia pode ter valores diferentes por regra (ex.: ASSIM Saúde: Fono/TO a R$120, demais a R$100). */
  porTerapia: PrevisaoReceitaTerapia[]
  /** Toda sessão individual da semana de referência, com paciente/terapia/valor/origem — pra auditoria linha a linha. */
  porSessao: PrevisaoReceitaSessao[]
  /**
   * Pacotes de terapias de TERAPIAS_PACOTE (Avaliação Neuropsicológica,
   * Psiquiatra/Neurologista) — só existe no segmento Processo Diagnóstico
   * (sempre vazio no Multidisciplinar). Cobrado UMA vez por paciente com
   * aquela terapia no cronograma, não por sessão — por isso não tem "por
   * semana": entra direto na receita mensal projetada, sem passar pela
   * lógica de ocorrências por dia da semana.
   */
  pacotesTerapia: PrevisaoReceitaPacote[]
}

export interface PrevisaoReceitaPacote {
  terapiaId: number
  terapiaNome: string
  pacientes: number
  valorAVista: number | null
  receita: number
}

export interface PrevisaoReceitaSegmento {
  sessoesTotal: number
  sessoesSemValor: number
  receitaSemanalTotal: number
  receitaMensalProjetadaTotal: number
  porConvenio: PrevisaoReceitaConvenio[]
}

export interface PrevisaoReceitaGeral {
  /** Mês/ano usado pra contar as ocorrências de cada dia da semana — derivado da menor data entre as sessões da semana de referência. Null se não houver nenhuma sessão. Compartilhado pelos dois segmentos (mesma janela de dados). */
  mesReferencia: { ano: number; mes: number; label: string } | null
  /** Toda sessão que NÃO é Processo Diagnóstico — mesma separação do Dashboard de Pacientes. */
  multidisciplinar: PrevisaoReceitaSegmento
  /** Só sessões de Avaliação Neuropsicológica / Psiquiatra-Neurologista / Triagem. */
  processoDiagnostico: PrevisaoReceitaSegmento
}

function mesReferenciaDeDatas(datas: string[]): { ano: number; mes: number; label: string } | null {
  const validas = datas.filter(Boolean).sort()
  if (!validas.length) return null
  const [ano, mes] = validas[0].split("-").map(Number)
  if (!ano || !mes) return null
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, mes - 1, 1))
  return { ano, mes, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

/** Agrega um segmento (Multidisciplinar OU Processo Diagnóstico) por convênio/dia/terapia/sessão. */
function agregarSegmento(
  rowsSegmento: AgendaSalaRow[],
  regrasGerais: ConvenioValor[],
  excecoesPaciente: ConvenioValorPaciente[],
  pacientesComAba: Set<string>,
  cal: CalendarioResult | null,
  pacotesAvaliacao: ConvenioPacoteAvaliacao[] = [],
): PrevisaoReceitaSegmento {
  const datas = rowsSegmento.map(r => cleanTxt(r.data)).filter(Boolean)
  const semanas = semanasNoPeriodo(datas)

  type Acc = { sessoes: number; semValor: number; receita: number }
  const porConvenioPorDia = new Map<string, Partial<Record<1 | 2 | 3 | 4 | 5, Acc>>>()

  type AccTerapia = { terapiaId: number | null; terapiaNome: string; sessoes: number; semValor: number; receita: number; origens: Set<OrigemValor> }
  const porConvenioPorTerapia = new Map<string, Map<string, AccTerapia>>()

  const porConvenioSessoes = new Map<string, PrevisaoReceitaSessao[]>()
  const porConvenioPacientes = new Map<string, Set<string>>()

  rowsSegmento.forEach(r => {
    const data = cleanTxt(r.data)
    const dow = data ? new Date(`${data}T12:00:00`).getDay() : NaN
    if (!Number.isFinite(dow) || dow < 1 || dow > 5) return // só seg-sex, mesmo critério de getCalendario/calcularAnaliseFutura

    const convenio = cleanTxt(r.convenio_nome) || "Não informado"
    const pacienteId = r.paciente_id ?? null
    const paciente = cleanTxt(r.paciente_nome)
    const terapiaId = r.terapia_id ?? r.terapia_exibicao_id ?? null
    const terapiaNome = cleanTxt(r.terapia_nome) || cleanTxt(r.terapia_exibicao_nome) || "Não informado"
    const temPsicologiaAba = pacientesComAba.has(pacienteKey(pacienteId, paciente))

    const resolvido = resolverValorSessao(regrasGerais, excecoesPaciente, { convenio, pacienteId, paciente, terapiaId, terapiaNome, temPsicologiaAba })
    const { valor } = resolvido
    // Terapias de TERAPIAS_PACOTE (Avaliação Neuropsicológica, Psiquiatra/
    // Neurologista) não têm valor POR SESSÃO de propósito — são cobradas em
    // bloco (pacote/consulta avulsa), uma vez por paciente (ver
    // enriquecerComPacotesTerapia/cronograma_convenio_pacote_avaliacao). Sem
    // essa origem específica, a sessão apareceria como "sem valor" na UI, o
    // que é enganoso — o valor existe, só não é por sessão individual.
    const origem: OrigemValor = terapiaId !== null && TERAPIAS_PACOTE_IDS.has(terapiaId) ? "pacote_avaliacao" : resolvido.origem
    // Uma sessão de pacote só "já tem receita" (via enriquecerComPacotesTerapia,
    // calculada à parte) se o convênio realmente tiver um valor à vista
    // cadastrado pra essa terapia — senão ela é "sem valor" de verdade, igual
    // qualquer outra sessão sem regra cadastrada.
    const pacoteSemRegistro = origem === "pacote_avaliacao" &&
      !pacotesAvaliacao.some(p => p.terapia_id === terapiaId && normEq(p.convenio_nome, convenio))

    if (!porConvenioPacientes.has(convenio)) porConvenioPacientes.set(convenio, new Set())
    porConvenioPacientes.get(convenio)!.add(pacienteKey(pacienteId, paciente))

    if (!porConvenioPorDia.has(convenio)) porConvenioPorDia.set(convenio, {})
    const porDia = porConvenioPorDia.get(convenio)!
    const dowKey = dow as 1 | 2 | 3 | 4 | 5
    if (!porDia[dowKey]) porDia[dowKey] = { sessoes: 0, semValor: 0, receita: 0 }
    const acc = porDia[dowKey]!
    acc.sessoes += 1
    // Pacote de sessões (Avaliação Neuropsicológica/Psiquiatra-Neurologista)
    // não é "sem valor" quando o convênio tem valor à vista cadastrado — só
    // não é precificado POR SESSÃO (a receita é somada à parte em
    // enriquecerComPacotesTerapia). Sem cadastro nenhum, conta como sem valor
    // igual a qualquer outra sessão.
    if ((valor === null && origem !== "pacote_avaliacao") || pacoteSemRegistro) acc.semValor += 1
    else if (valor !== null) acc.receita += valor

    if (!porConvenioPorTerapia.has(convenio)) porConvenioPorTerapia.set(convenio, new Map())
    const porTerapia = porConvenioPorTerapia.get(convenio)!
    const terapiaKey = terapiaId !== null ? `id:${terapiaId}` : `nome:${normTxt(terapiaNome)}`
    if (!porTerapia.has(terapiaKey)) porTerapia.set(terapiaKey, { terapiaId, terapiaNome, sessoes: 0, semValor: 0, receita: 0, origens: new Set() })
    const accT = porTerapia.get(terapiaKey)!
    accT.sessoes += 1
    accT.origens.add(origem)
    if ((valor === null && origem !== "pacote_avaliacao") || pacoteSemRegistro) accT.semValor += 1
    else if (valor !== null) accT.receita += valor

    if (!porConvenioSessoes.has(convenio)) porConvenioSessoes.set(convenio, [])
    porConvenioSessoes.get(convenio)!.push({
      agendamentoId: r.tita_agendamento_id ?? null,
      pacienteId, pacienteNome: paciente || "Não informado",
      terapiaId, terapiaNome,
      diaLabel: DOW_LABEL[dowKey], data,
      horaInicial: cleanTxt(r.hora_inicial) || null,
      valor, origem,
    })
  })

  const porConvenio: PrevisaoReceitaConvenio[] = [...porConvenioPorDia.entries()]
    .map(([convenio, porDiaAcc]) => {
      let sessoesTotal = 0
      let semValorTotal = 0
      let receitaSemanalTotal = 0
      let receitaMensalProjetada = 0

      const porDia: PrevisaoReceitaDia[] = ([1, 2, 3, 4, 5] as const)
        .filter(dow => porDiaAcc[dow])
        .map(dow => {
          const acc = porDiaAcc[dow]!
          sessoesTotal += acc.sessoes
          semValorTotal += acc.semValor

          const ocorrenciasMes = cal?.counts[dow] ?? 0
          const sessoesSemana = acc.sessoes / semanas
          const receitaSemana = acc.receita / semanas
          const receitaMes = receitaSemana * ocorrenciasMes

          receitaSemanalTotal += receitaSemana
          receitaMensalProjetada += receitaMes

          return {
            dow,
            diaLabel: DOW_LABEL[dow],
            sessoesSemana,
            ocorrenciasMes,
            sessoesMesProjetadas: sessoesSemana * ocorrenciasMes,
            receitaSemana,
            receitaMesProjetada: receitaMes,
          }
        })

      const porTerapia: PrevisaoReceitaTerapia[] = [...(porConvenioPorTerapia.get(convenio)?.values() ?? [])]
        .map(t => ({
          terapiaId: t.terapiaId,
          terapiaNome: t.terapiaNome,
          sessoesSemana: t.sessoes / semanas,
          sessoesSemValor: t.semValor,
          receitaSemana: t.receita / semanas,
          valorMedioPorSessao: t.sessoes - t.semValor > 0 ? t.receita / (t.sessoes - t.semValor) : null,
          origens: [...t.origens],
        }))
        .sort((a, b) => b.receitaSemana - a.receitaSemana)

      const porSessao = [...(porConvenioSessoes.get(convenio) ?? [])]
        .sort((a, b) => a.pacienteNome.localeCompare(b.pacienteNome) || a.data.localeCompare(b.data))

      return {
        convenio,
        pacientesUnicos: porConvenioPacientes.get(convenio)?.size ?? 0,
        sessoesTotal,
        sessoesSemValor: semValorTotal,
        receitaSemanal: receitaSemanalTotal,
        receitaMensalProjetada,
        porDia,
        porTerapia,
        porSessao,
        // Preenchido só pra Processo Diagnóstico, depois de agregarSegmento
        // (calcularPrevisaoReceita chama enriquecerComPacotesTerapia) — aqui
        // fica sempre vazio.
        pacotesTerapia: [],
      }
    })
    .sort((a, b) => b.receitaMensalProjetada - a.receitaMensalProjetada)

  return {
    sessoesTotal: porConvenio.reduce((s, c) => s + c.sessoesTotal, 0),
    sessoesSemValor: porConvenio.reduce((s, c) => s + c.sessoesSemValor, 0),
    receitaSemanalTotal: porConvenio.reduce((s, c) => s + c.receitaSemanal, 0),
    receitaMensalProjetadaTotal: porConvenio.reduce((s, c) => s + c.receitaMensalProjetada, 0),
    porConvenio,
  }
}

/**
 * Soma os pacotes de terapia (TERAPIAS_PACOTE) na receita mensal de cada
 * convênio do segmento (só faz sentido pro Processo Diagnóstico). Cada pacote
 * é cobrado UMA vez por paciente com aquela terapia no cronograma — não
 * entra na receitaSemanal (não é recorrente toda semana) nem passa pela
 * lógica de "ocorrências por dia da semana" usada pra sessão normal.
 */
function enriquecerComPacotesTerapia(
  segmento: PrevisaoReceitaSegmento,
  pacotesPorConvenioTerapia: Map<string, Map<number, Set<string>>>,
  pacotesAvaliacao: ConvenioPacoteAvaliacao[],
): PrevisaoReceitaSegmento {
  const porConvenio = segmento.porConvenio.map(c => {
    const porTerapia = pacotesPorConvenioTerapia.get(c.convenio)
    const pacotesTerapia: PrevisaoReceitaPacote[] = TERAPIAS_PACOTE
      .map(t => {
        const pacientes = porTerapia?.get(t.terapia_id)?.size ?? 0
        if (!pacientes) return null
        const regra = pacotesAvaliacao.find(p => p.terapia_id === t.terapia_id && normEq(p.convenio_nome, c.convenio))
        const valorAVista = regra?.valor_a_vista ?? null
        const receita = valorAVista !== null ? pacientes * valorAVista : 0
        return { terapiaId: t.terapia_id, terapiaNome: t.terapia_nome, pacientes, valorAVista, receita }
      })
      .filter((x): x is PrevisaoReceitaPacote => x !== null)

    const receitaPacoteTotal = pacotesTerapia.reduce((s, p) => s + p.receita, 0)

    return {
      ...c,
      pacotesTerapia,
      receitaMensalProjetada: c.receitaMensalProjetada + receitaPacoteTotal,
    }
  })

  return {
    ...segmento,
    porConvenio,
    receitaMensalProjetadaTotal: porConvenio.reduce((s, c) => s + c.receitaMensalProjetada, 0),
  }
}

export function calcularPrevisaoReceita(
  rows: AgendaSalaRow[],
  regrasGerais: ConvenioValor[],
  excecoesPaciente: ConvenioValorPaciente[],
  pacotesAvaliacao: ConvenioPacoteAvaliacao[] = [],
): PrevisaoReceitaGeral {
  const ativos = (rows || []).filter(isAgendadoAtivo)
  const mesReferencia = mesReferenciaDeDatas(ativos.map(r => cleanTxt(r.data)).filter(Boolean))
  // Sem feriados cadastrados aqui (diferente de calcularAnaliseFutura, que usa
  // remuneracao_config.feriados) — a projeção conta TODOS os dias úteis do mês,
  // sem descontar feriado. Simplificação consciente: dá pra evoluir depois
  // passando os mesmos feriados usados em Relacionamento Prestador, se preciso.
  const cal = mesReferencia ? getCalendario(mesReferencia.ano, mesReferencia.mes, {}) : null

  // Pré-passo: quais pacientes têm Psicologia ABA em algum lugar do cronograma
  // (semana de referência INTEIRA, dos dois segmentos juntos) — determina a
  // regra por "critério ABA" (ex.: SEGUROS UNIMED), que vale pra TODAS as
  // sessões do paciente, não só a que efetivamente é ABA.
  const pacientesComAba = new Set<string>()
  ativos.forEach(r => {
    if (r.terapia_exibicao_id !== EXIB_ID.PSICOLOGIA_ABA) return
    pacientesComAba.add(pacienteKey(r.paciente_id ?? null, cleanTxt(r.paciente_nome)))
  })

  // Mesma separação do Dashboard de Pacientes (calcularDashboardPacientes,
  // pacientesDashboard.ts) — replicada aqui pra a Previsão de Receitas bater
  // com os números de "pacientes" já mostrados na aba Pacientes.
  const rowsMultidisciplinar = ativos.filter(r => !isTerapiaDiagnostico(r))
  const rowsDiagnostico = ativos.filter(isTerapiaDiagnostico)

  // Quais pacientes têm alguma terapia de TERAPIAS_PACOTE no cronograma, por
  // convênio e por terapia — cobrança em BLOCO (uma vez por paciente),
  // independente de quantas sessões/consultas dessa terapia caem na semana
  // de referência.
  const pacotesPorConvenioTerapia = new Map<string, Map<number, Set<string>>>()
  ativos.forEach(r => {
    const terapiaIdReal = r.terapia_id ?? r.terapia_exibicao_id ?? null
    if (terapiaIdReal === null || !TERAPIAS_PACOTE_IDS.has(terapiaIdReal)) return
    const convenio = cleanTxt(r.convenio_nome) || "Não informado"
    if (!pacotesPorConvenioTerapia.has(convenio)) pacotesPorConvenioTerapia.set(convenio, new Map())
    const porTerapia = pacotesPorConvenioTerapia.get(convenio)!
    if (!porTerapia.has(terapiaIdReal)) porTerapia.set(terapiaIdReal, new Set())
    porTerapia.get(terapiaIdReal)!.add(pacienteKey(r.paciente_id ?? null, cleanTxt(r.paciente_nome)))
  })

  const processoDiagnostico = agregarSegmento(rowsDiagnostico, [], [], pacientesComAba, cal, pacotesAvaliacao)

  return {
    mesReferencia,
    multidisciplinar: agregarSegmento(rowsMultidisciplinar, regrasGerais, excecoesPaciente, pacientesComAba, cal),
    // Processo Diagnóstico (Avaliação Neuropsicológica/Psiquiatra/Triagem) NÃO
    // usa as regras de valor_sessao cadastradas em Cadastro de Valores — essas
    // foram desenhadas pra sessão fixa de 40min (Multidisciplinar). A exceção
    // são as terapias de TERAPIAS_PACOTE (enriquecerComPacotesTerapia acima),
    // cobradas uma vez por paciente. Triagem continua "sem valor" até existir
    // cadastro próprio pra ela também.
    processoDiagnostico: enriquecerComPacotesTerapia(processoDiagnostico, pacotesPorConvenioTerapia, pacotesAvaliacao),
  }
}
