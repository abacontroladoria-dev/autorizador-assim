import type { GradeTerapeutaInfo } from "./mappings"
import type { AgendamentoTitaPayload, GradeProfissionalRow } from "./types"

/** Fixo hoje: todo agendamento criado por este fluxo usa o mesmo tipo de agenda. */
export const ID_TIPO_AGENDA = 92

/** 4 = Semanal (todas as ocorrências do dia da semana) — ver PDF de integração, seção 11. */
export const FREQUENCIA_SEMANAL = 4

/** Regra fixa do projeto — não deriva de data_inicial nem do ano corrente. */
export const DATA_FINAL_FIXA = "2026-12-31"

/**
 * data_inicial é a própria data do slot consultado (grade.data). A página de
 * Ocupação de Paciente já escopa as sugestões para a primeira semana do mês
 * seguinte, então a data do slot já é o início desejado da série; a frequência
 * semanal (FREQUENCIA_SEMANAL) cobre as ocorrências seguintes do mesmo dia da
 * semana até data_final.
 *
 * Correção 2026-07-03: antes esta função pulava para o mês seguinte ao da
 * sugestão, o que causava um duplo salto (sugestão de agosto → série começando em
 * setembro), já que a própria página projeta as sugestões para o próximo mês. O
 * início deve ser exatamente o slot consultado. Normaliza para YYYY-MM-DD.
 */
export function calcularDataInicial(dataSugestao: string): string {
  return dataSugestao.slice(0, 10)
}

/** data_final é uma regra fixa do projeto — sempre DATA_FINAL_FIXA. */
export function calcularDataFinal(): string {
  return DATA_FINAL_FIXA
}

/**
 * id_sala e id_terapia_exibicao vêm de gradeTerapeuta (grade_profissionais_tita), não
 * de grade (csv_grades_profissionais) — ver comentário em resolverGradeTerapeuta
 * sobre por que csv_grades_profissionais não é uma fonte confiável para esses dois
 * campos em linhas "Livre".
 */
export function montarPayloadAgendamento(
  grade: GradeProfissionalRow,
  idFavorecido: number,
  gradeTerapeuta: GradeTerapeutaInfo,
): AgendamentoTitaPayload {
  if (grade.terapia_id == null) throw new Error("grade.terapia_id ausente")
  if (gradeTerapeuta.idSala == null) throw new Error("gradeTerapeuta.idSala ausente")
  if (gradeTerapeuta.terapiaExibicaoId == null) throw new Error("gradeTerapeuta.terapiaExibicaoId ausente")

  const dataInicial = calcularDataInicial(grade.data)
  const dataFinal    = calcularDataFinal()

  return {
    data_inicial: dataInicial,
    data_final: dataFinal,
    id_grade_terapeuta: gradeTerapeuta.gradeTerapeutaId,
    ids_favorecidos: [idFavorecido],
    id_sala: gradeTerapeuta.idSala,
    frequencia: FREQUENCIA_SEMANAL,
    id_tipo_agenda: ID_TIPO_AGENDA,
    id_terapia_clinica: grade.terapia_id,
    id_terapia_exibicao: gradeTerapeuta.terapiaExibicaoId,
  }
}
