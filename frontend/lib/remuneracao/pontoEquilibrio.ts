// ─── Ponto de Equilíbrio (Break Even) ───────────────────────────────────────────
// Dois modelos, conforme como o profissional é remunerado:
// 1) PJ, custo mensal fixo (Fonoaudiologia/Terapia Ocupacional/Musicoterapia) —
//    especificação "Regra de alocação mínima — Fono e TO", Bernardo Salotto,
//    Clínica Universo ABA, 12/08/2026 v2.
// 2) Por atendimento, custo variável por sessão (todas as demais).
//
// Em ambos os casos é margem de CONTRIBUIÇÃO, não resultado: só o custo direto
// do profissional entra na conta (sem rateio de sala/recepção/supervisão/
// sistema — ver limitação 1 da especificação do modelo PJ).

export const SEMANAS_POR_MES = 4.33

/** Cenários de perda (falta + ociosidade) aprovados por decisão de negócio —
 *  35% foi excluído da regra e tratado só como cauda, não entra aqui. */
export const CENARIOS_PERDA_PCT = [20, 25, 30] as const
export type CenarioPerdaPct = typeof CENARIOS_PERDA_PCT[number]

export const ESPECIALIDADES_BREAK_EVEN_PJ = new Set(["Fonoaudiologia", "Terapia Ocupacional", "Musicoterapia"])

export interface ParametrosBreakEvenPJ {
  /** Valor bruto da sessão (faturamento, antes do imposto). */
  valorSessaoBruto: number
  /** Alíquota de imposto sobre faturamento, em pontos percentuais (20 = 20%) — incide só sobre sessão realizada. */
  impostoFaturamentoPct: number
  /** Custo mensal fixo do profissional, cadastrado para 1 dia/semana COMPLETO (manhã+tarde). */
  custoMensalDiaCompleto: number
  /** Sessões que o profissional atende de manhã, num dia completo. */
  capacidadeManha: number
  /** Sessões que o profissional atende de tarde, num dia completo. */
  capacidadeTarde: number
  /** Cenário de perda escolhido, em pontos percentuais. */
  perdaPct: number
  /**
   * Quantas manhãs/tardes a simulação marcou na semana ("Dias e turnos
   * afetados"). O custo cadastrado vale pro dia COMPLETO — se só um turno for
   * marcado num dia, custo e capacidade daquele dia entram só na proporção
   * do turno (ex.: TO com 6 manhã + 7 tarde = 13 dia completo por R$2.600;
   * marcar só manhã nesse dia vale (2600÷13)×6 = R$1.200, não R$2.600).
   */
  periodosManha: number
  periodosTarde: number
}

export interface ResultadoBreakEvenPJ {
  receitaLiquidaSessao: number
  /** Custo mensal já escalado pelos turnos/dias simulados. */
  custoMensalTotal: number
  /** Sessões efetivas/mês que cobrem exatamente o custo (sem perda). */
  sessoesEfetivasBreakEven: number
  /** Sessões que precisam estar alocadas na agenda/mês, já considerando a perda. */
  sessoesAlocarMes: number
  capacidadeMensal: number
  alocacaoPercentual: number
  /** Piso de contratação — o que de fato se cadastra (nunca o percentual). */
  slotsSemanaMinimo: number
}

/** Fórmula exata da especificação — a perda incide sobre a AGENDA ALOCADA,
 *  não sobre a receita: sessão não realizada não fatura, mas o custo fixo
 *  do profissional continua integral. Custo e capacidade escalam juntos pela
 *  MESMA proporção de turnos selecionados, então o % da capacidade não muda
 *  com o mix manhã/tarde/dia completo — só os valores absolutos (R$ e
 *  slots/semana) refletem exatamente o que foi marcado na simulação. */
export function calcularBreakEvenPJ(p: ParametrosBreakEvenPJ): ResultadoBreakEvenPJ {
  const imposto = p.impostoFaturamentoPct / 100
  const perda = p.perdaPct / 100
  const capacidadeDiaCompleto = p.capacidadeManha + p.capacidadeTarde
  const custoPorUnidadeCapacidade = capacidadeDiaCompleto > 0 ? p.custoMensalDiaCompleto / capacidadeDiaCompleto : 0
  const capacidadeSemanalSelecionada = p.periodosManha * p.capacidadeManha + p.periodosTarde * p.capacidadeTarde
  const custoMensalTotal = custoPorUnidadeCapacidade * capacidadeSemanalSelecionada

  const receitaLiquidaSessao = p.valorSessaoBruto * (1 - imposto)
  const sessoesEfetivasBreakEven = receitaLiquidaSessao > 0 ? custoMensalTotal / receitaLiquidaSessao : 0
  const sessoesAlocarMes = perda < 1 ? sessoesEfetivasBreakEven / (1 - perda) : Infinity
  const capacidadeMensal = capacidadeSemanalSelecionada * SEMANAS_POR_MES
  const alocacaoPercentual = capacidadeMensal > 0 ? sessoesAlocarMes / capacidadeMensal : 0
  const slotsSemanaMinimo = Math.ceil(sessoesAlocarMes / SEMANAS_POR_MES)
  return { receitaLiquidaSessao, custoMensalTotal, sessoesEfetivasBreakEven, sessoesAlocarMes, capacidadeMensal, alocacaoPercentual, slotsSemanaMinimo }
}

export interface ProjecaoBreakEvenPJ {
  sessoesEfetivasMes: number
  receitaLiquidaMes: number
  /** Receita líquida do mês menos o custo fixo PJ (já escalado pelos turnos/dias selecionados) — negativa = fica devendo o custo do profissional. */
  margemMensal: number
  atingiuBreakEven: boolean
}

/** Aplica o mesmo cenário de perda sobre a alocação REAL simulada (slots/semana
 *  vindos de "Agenda do novo profissional"), pra saber se essa contratação
 *  hipotética atinge o Break Even ou fica no vermelho. */
export function projetarMargemBreakEvenPJ(
  resultado: ResultadoBreakEvenPJ,
  perdaPct: number,
  slotsAlocadosSemana: number,
): ProjecaoBreakEvenPJ {
  const perda = perdaPct / 100
  const sessoesEfetivasMes = slotsAlocadosSemana * SEMANAS_POR_MES * (1 - perda)
  const receitaLiquidaMes = sessoesEfetivasMes * resultado.receitaLiquidaSessao
  const margemMensal = receitaLiquidaMes - resultado.custoMensalTotal
  return { sessoesEfetivasMes, receitaLiquidaMes, margemMensal, atingiuBreakEven: margemMensal >= 0 }
}

// ─── Ponto de Equilíbrio — especialidades "por atendimento" ────────────────────
// Todas as especialidades fora de ESPECIALIDADES_BREAK_EVEN_PJ pagam o
// profissional POR SESSÃO (taxa PA já cadastrada em Taxas por Especialidade),
// não um custo mensal fixo — é custo VARIÁVEL: cresce junto com o volume, na
// mesma proporção da receita. Por isso não existe "piso de slots/semana" (mais
// volume nunca piora nem melhora o resultado por sessão): o que decide é só a
// margem de UMA sessão isolada. A capacidade manhã/tarde aqui é um padrão
// único e geral (não por especialidade, ao contrário do modelo PJ), cadastrado
// em Variáveis & Taxas — usada só como referência de "% da capacidade", nunca
// como piso mínimo.

export interface ParametrosBreakEvenAtendimento {
  /** Valor bruto da sessão (faturamento, antes do imposto) — mesma origem do modelo PJ (Projeção Financeira). */
  valorSessaoBruto: number
  /** Alíquota de imposto sobre faturamento, em pontos percentuais. */
  impostoFaturamentoPct: number
  /** Taxa PA — quanto a clínica paga ao profissional por sessão realizada. */
  taxaPA: number
  /** Capacidade padrão (geral, não por especialidade) de manhã/tarde, num dia completo. */
  capacidadeManha: number
  capacidadeTarde: number
  /** Quantas manhãs/tardes a simulação marcou na semana. */
  periodosManha: number
  periodosTarde: number
}

export interface ResultadoBreakEvenAtendimento {
  receitaLiquidaSessao: number
  /** Receita líquida da sessão menos a taxa PA — decide o Break Even sozinha, sem depender de volume ou perda. */
  margemPorSessao: number
  atingiuBreakEven: boolean
  /** Só como referência de "% da capacidade" — nunca um piso mínimo aqui. */
  capacidadeMensal: number
}

export function calcularBreakEvenAtendimento(p: ParametrosBreakEvenAtendimento): ResultadoBreakEvenAtendimento {
  const imposto = p.impostoFaturamentoPct / 100
  const receitaLiquidaSessao = p.valorSessaoBruto * (1 - imposto)
  const margemPorSessao = receitaLiquidaSessao - p.taxaPA
  const capacidadeSemanalSelecionada = p.periodosManha * p.capacidadeManha + p.periodosTarde * p.capacidadeTarde
  const capacidadeMensal = capacidadeSemanalSelecionada * SEMANAS_POR_MES
  return { receitaLiquidaSessao, margemPorSessao, atingiuBreakEven: margemPorSessao >= 0, capacidadeMensal }
}

export interface ProjecaoBreakEvenAtendimento {
  sessoesEfetivasMes: number
  receitaLiquidaMes: number
  custoVariavelMes: number
  margemMensal: number
}

/** Projeta receita/custo/margem no volume REAL simulado — a perda reduz
 *  receita e custo na MESMA proporção (sessão que não acontece não fatura
 *  nem gera custo), então ela muda o valor absoluto da margem mensal, mas
 *  nunca o veredito de Break Even (esse já foi decidido por sessão). */
export function projetarMargemBreakEvenAtendimento(
  resultado: ResultadoBreakEvenAtendimento,
  taxaPA: number,
  perdaPct: number,
  slotsAlocadosSemana: number,
): ProjecaoBreakEvenAtendimento {
  const perda = perdaPct / 100
  const sessoesEfetivasMes = slotsAlocadosSemana * SEMANAS_POR_MES * (1 - perda)
  const receitaLiquidaMes = sessoesEfetivasMes * resultado.receitaLiquidaSessao
  const custoVariavelMes = sessoesEfetivasMes * taxaPA
  const margemMensal = receitaLiquidaMes - custoVariavelMes
  return { sessoesEfetivasMes, receitaLiquidaMes, custoVariavelMes, margemMensal }
}
