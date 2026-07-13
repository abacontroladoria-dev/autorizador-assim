// ═══════════════════════════════════════════════════════════════════════════
// Resumo de Tratativas — visão "só contagens" para o escopo Terapêutico.
//
// SEGURANÇA (requisito do produto): esta tela NUNCA pode expor valores em R$.
// Em vez de calcular a remuneração e depois esconder os valores, reutilizamos a
// mesma lógica de classificação/contagem de calcularRemuneracaoReal, porém
// alimentada com TAXAS VAZIAS — logo nenhum valor monetário real é sequer
// calculado (todos os campos de R$ saem zerados). Em seguida sanitizamos o
// resultado para um tipo que só possui contagens: os campos monetários e de PE
// não existem no objeto entregue à UI, então não há como vazar valores nem via
// DevTools/rede. Ver hooks/useTratativas.ts (que também só carrega feriados,
// nunca as taxas).
// ═══════════════════════════════════════════════════════════════════════════

import { calcularRemuneracaoReal, type ProfRemunReal } from "./calculo"
import type { SessaoReal } from "./relatorio"
import type { FeriadoInfo } from "@/types/remuneracao"

/** Sessão sem QUALQUER campo monetário — só os campos de exibição/contagem. */
export type SessaoTratativa = Pick<
  SessaoReal,
  | "id" | "data" | "hora" | "profAgenda" | "paciente" | "convenio" | "unidade"
  | "especialidade" | "presencaOrbita" | "presencaTita" | "profCsv"
  | "possuiTratativa" | "statusCsv" | "statusFinal" | "motivo" | "_idx"
  | "classificacao" | "diaSemana" | "idFavorecido" | "criacaoTratativa"
> & { papel: string }

/** Profissional sem QUALQUER campo monetário (sem pe, valores, paBreakdown, diária, ETA). */
export type ProfTratativas = {
  prof: string
  agendadas: number
  evoluidasProprias: number
  substituicoesRealizadas: number
  substituidoPorOutro: number
  pendentes: number
  canceladas: number
  naoEvoluidas: number
  inconsistencias: number
  pacientesQtd: number
  pacientesCCQtd: number
  registrosNaoRealizados: number
  contratoNovo: string | null
  sessoes: SessaoTratativa[]
}

// Config vazia de taxas: garante que calcularRemuneracaoReal não produza nenhum
// valor real. `Object.freeze` deixa explícito que nada aqui deve ser preenchido.
const TAXAS_VAZIAS = Object.freeze({}) as Record<string, number>

/** Copia SÓ os campos não-monetários de cada sessão. */
function sanitizarSessao(s: ProfRemunReal["sessoes"][number]): SessaoTratativa {
  return {
    id: s.id,
    data: s.data,
    hora: s.hora,
    profAgenda: s.profAgenda,
    paciente: s.paciente,
    convenio: s.convenio,
    unidade: s.unidade,
    especialidade: s.especialidade,
    presencaOrbita: s.presencaOrbita,
    presencaTita: s.presencaTita,
    profCsv: s.profCsv,
    possuiTratativa: s.possuiTratativa,
    statusCsv: s.statusCsv,
    statusFinal: s.statusFinal,
    motivo: s.motivo,
    _idx: s._idx,
    classificacao: s.classificacao,
    diaSemana: s.diaSemana,
    idFavorecido: s.idFavorecido,
    criacaoTratativa: s.criacaoTratativa,
    papel: s.papel,
  }
}

/**
 * Produz o resumo de tratativas por profissional (só contagens), reutilizando a
 * classificação oficial de calcularRemuneracaoReal com taxas zeradas. Feriados
 * entram apenas para a classificação "Feriado/Ponto Fac." — não são monetários.
 */
export function resumirTratativas(
  evoRows: SessaoReal[],
  _feriados?: Record<string, FeriadoInfo>,
): ProfTratativas[] {
  // feriados já são aplicados na classificação das sessões (normalizarGradeParaSessao),
  // então não precisam ser repassados aqui; o parâmetro fica documentado para
  // deixar claro que esta função é ciente de feriados por construção.
  void _feriados

  const bruto = calcularRemuneracaoReal(evoRows, {
    taxasPA: TAXAS_VAZIAS,
    diarias: TAXAS_VAZIAS,
    etaBonus: 0,
    ccPA: 0,
    ccPE: 0,
    // PE/contratos/cadastro deliberadamente omitidos → PE inativo, sem valores.
  })

  return bruto
    .map((p): ProfTratativas => ({
      prof: p.prof,
      agendadas: p.agendadas,
      evoluidasProprias: p.evoluidasProprias,
      substituicoesRealizadas: p.substituicoesRealizadas,
      substituidoPorOutro: p.substituidoPorOutro,
      pendentes: p.pendentes,
      canceladas: p.canceladas,
      naoEvoluidas: p.naoEvoluidas,
      inconsistencias: p.inconsistencias,
      pacientesQtd: p.pacientesQtd,
      pacientesCCQtd: p.pacientesCCQtd,
      registrosNaoRealizados: p.registrosNaoRealizados,
      contratoNovo: p.contratoNovo,
      sessoes: p.sessoes.map(sanitizarSessao),
    }))
    // Ordena por profissional (a ordenação original era por valorConfirmado,
    // que aqui não existe) → alfabética estável.
    .sort((a, b) => a.prof.localeCompare(b.prof, "pt-BR"))
}
