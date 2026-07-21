// ─── PROJEÇÃO DE RECEITA MENSAL ───────────────────────────────────────────────
// Cruza as sessões já classificadas em pacientesDashboard.ts (Multidisciplinar
// vs Processo Diagnóstico) com os valores cadastrados em
// cronograma_convenio_valores/cronograma_convenio_valores_paciente pra projetar
// receita semanal/mensal por convênio.

import { cleanTxt } from "./helpers"
import { normTxt } from "./constants"
import { chDaLinha, isAgendadoAtivo, isTerapiaDiagnostico, semanasNoPeriodo } from "./pacientesDashboard"
import type { AgendaSalaRow } from "./salasTypes"
import type { ConvenioValor, ConvenioValorPaciente } from "./convenioValoresTypes"

/** Duração de uma sessão padrão de 40min, em horas — usada só como fallback quando não há valor_sessao cadastrado. */
const SESSAO_HORAS = 40 / 60
const SEMANAS_POR_MES = 4.33

export type OrigemValor = "paciente" | "terapia" | "geral" | "sem_valor"

export interface ValorResolvido {
  valor: number | null
  origem: OrigemValor
}

function normEq(a: string, b: string): boolean {
  return normTxt(a) === normTxt(b)
}

function valorDaRegra(
  regra: { valor_hora: number | null; valor_sessao: number | null },
  ehDiagnostico: boolean,
  duracaoHoras: number,
): number | null {
  // Processo Diagnóstico: duração variável, sempre horas reais × valor_hora —
  // sem fallback proporcional, porque sem valor_hora cadastrado não dá pra
  // estimar (a sessão não tem 40min fixo pra usar valor_sessao no lugar).
  if (ehDiagnostico) {
    return regra.valor_hora !== null ? regra.valor_hora * duracaoHoras : null
  }
  // Sessão padrão de 40min: valor_sessao tem prioridade (é o valor negociado
  // de fato); só cai pra valor_hora × (40/60) quando valor_sessao não existe —
  // os dois nunca são derivados um do outro quando ambos estão cadastrados.
  if (regra.valor_sessao !== null) return regra.valor_sessao
  if (regra.valor_hora !== null) return regra.valor_hora * SESSAO_HORAS
  return null
}

/**
 * Resolve o valor de uma sessão, na ordem de prioridade: exceção por paciente
 * > regra por terapia do convênio > regra geral do convênio (terapia_id null).
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
  params: { convenio: string; pacienteId: number | null; paciente: string; terapiaId: number | null; terapiaNome: string; ehDiagnostico: boolean; duracaoHoras: number },
): ValorResolvido {
  const { convenio, pacienteId, paciente, terapiaId, terapiaNome, ehDiagnostico, duracaoHoras } = params

  const excecao = excecoesPaciente.find(e => {
    if (!normEq(e.convenio_nome, convenio)) return false
    if (e.paciente_id !== null) return pacienteId !== null && e.paciente_id === pacienteId
    return normEq(e.paciente_nome, paciente)
  })
  if (excecao) {
    const valor = valorDaRegra(excecao, ehDiagnostico, duracaoHoras)
    if (valor !== null) return { valor, origem: "paciente" }
  }

  const regraTerapia = regrasGerais.find(r => {
    if (!normEq(r.convenio_nome, convenio)) return false
    if (r.terapia_id !== null) return terapiaId !== null && r.terapia_id === terapiaId
    return !!r.terapia_nome && normEq(r.terapia_nome, terapiaNome)
  })
  if (regraTerapia) {
    const valor = valorDaRegra(regraTerapia, ehDiagnostico, duracaoHoras)
    if (valor !== null) return { valor, origem: "terapia" }
  }

  const regraGeral = regrasGerais.find(r => r.terapia_id === null && !r.terapia_nome && normEq(r.convenio_nome, convenio))
  if (regraGeral) {
    const valor = valorDaRegra(regraGeral, ehDiagnostico, duracaoHoras)
    if (valor !== null) return { valor, origem: "geral" }
  }

  return { valor: null, origem: "sem_valor" }
}

export interface PrevisaoReceitaConvenio {
  convenio: string
  sessoesTotal: number
  sessoesSemValor: number
  receitaSemanal: number
  receitaMensalProjetada: number
}

export interface PrevisaoReceitaGeral {
  sessoesTotal: number
  sessoesSemValor: number
  receitaSemanalTotal: number
  receitaMensalProjetadaTotal: number
  porConvenio: PrevisaoReceitaConvenio[]
}

export function calcularPrevisaoReceita(
  rows: AgendaSalaRow[],
  regrasGerais: ConvenioValor[],
  excecoesPaciente: ConvenioValorPaciente[],
): PrevisaoReceitaGeral {
  const ativos = (rows || []).filter(isAgendadoAtivo)
  const semanas = semanasNoPeriodo(ativos.map(r => cleanTxt(r.data)).filter(Boolean))

  const porConvenioMap = new Map<string, { sessoes: number; semValor: number; receita: number }>()

  ativos.forEach(r => {
    const convenio = cleanTxt(r.convenio_nome) || "Não informado"
    const pacienteId = r.paciente_id ?? null
    const paciente = cleanTxt(r.paciente_nome)
    const terapiaId = r.terapia_id ?? r.terapia_exibicao_id ?? null
    const terapiaNome = cleanTxt(r.terapia_nome) || cleanTxt(r.terapia_exibicao_nome)
    const ehDiagnostico = isTerapiaDiagnostico(r)
    const duracaoHoras = chDaLinha(r)

    const { valor } = resolverValorSessao(regrasGerais, excecoesPaciente, { convenio, pacienteId, paciente, terapiaId, terapiaNome, ehDiagnostico, duracaoHoras })

    if (!porConvenioMap.has(convenio)) porConvenioMap.set(convenio, { sessoes: 0, semValor: 0, receita: 0 })
    const acc = porConvenioMap.get(convenio)!
    acc.sessoes += 1
    if (valor === null) acc.semValor += 1
    else acc.receita += valor
  })

  const porConvenio: PrevisaoReceitaConvenio[] = [...porConvenioMap.entries()]
    .map(([convenio, acc]) => ({
      convenio,
      sessoesTotal: acc.sessoes,
      sessoesSemValor: acc.semValor,
      receitaSemanal: acc.receita / semanas,
      receitaMensalProjetada: (acc.receita / semanas) * SEMANAS_POR_MES,
    }))
    .sort((a, b) => b.receitaMensalProjetada - a.receitaMensalProjetada)

  const sessoesSemValor = porConvenio.reduce((s, c) => s + c.sessoesSemValor, 0)
  const receitaSemanalTotal = porConvenio.reduce((s, c) => s + c.receitaSemanal, 0)

  return {
    sessoesTotal: ativos.length,
    sessoesSemValor,
    receitaSemanalTotal,
    receitaMensalProjetadaTotal: receitaSemanalTotal * SEMANAS_POR_MES,
    porConvenio,
  }
}
