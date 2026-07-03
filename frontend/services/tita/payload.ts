import type { GradeTerapeutaInfo } from "./mappings"
import type { AgendamentoTitaPayload, GradeProfissionalRow } from "./types"

/** Fixo hoje: todo agendamento criado por este fluxo usa o mesmo tipo de agenda. */
export const ID_TIPO_AGENDA = 92

/** 4 = Semanal (todas as ocorrências do dia da semana) — ver PDF de integração, seção 11. */
export const FREQUENCIA_SEMANAL = 4

/** Regra fixa do projeto — não deriva de data_inicial nem do ano corrente. */
export const DATA_FINAL_FIXA = "2026-12-31"

/**
 * Regra: primeira ocorrência do mesmo dia da semana da sugestão, no mês seguinte.
 * Cálculo em UTC puro a partir dos componentes Y-M-D da string (evita depender do
 * fuso horário local do processo, o que deslocaria o dia da semana perto da meia-noite).
 */
export function calcularDataInicial(dataSugestao: string): string {
  const [anoStr, mesStr, diaStr] = dataSugestao.split("-")
  const ano = Number(anoStr)
  const mes = Number(mesStr)
  const dia = Number(diaStr)

  const diaSemanaAlvo = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()

  const proximoMes    = mes === 12 ? 1 : mes + 1
  const anoProximoMes = mes === 12 ? ano + 1 : ano

  for (let d = 1; d <= 7; d++) {
    const candidato = new Date(Date.UTC(anoProximoMes, proximoMes - 1, d))
    if (candidato.getUTCDay() === diaSemanaAlvo) {
      return candidato.toISOString().slice(0, 10)
    }
  }
  // Inatingível: os 7 dias da semana sempre aparecem nos primeiros 7 dias de um mês.
  throw new Error(`Não foi possível calcular data_inicial para "${dataSugestao}"`)
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
