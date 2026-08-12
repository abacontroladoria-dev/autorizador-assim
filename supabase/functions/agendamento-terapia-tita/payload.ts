// ─── Construção do payload — agendamento-terapia-tita ─────────────────────────
// Monta o corpo da requisição para POST /integracao/agendamento/create a partir
// do registro de grade já buscado (id_favorecido, id_terapia_clinica,
// id_terapia_exibicao e id_sala vêm prontos dele) mais o id_grade_terapeuta
// resolvido separadamente (ver mappings.ts — NÃO vem de csv_grades_profissionais).
// Stub — regras de negócio (cálculo de data_inicial/data_final, frequencia, etc.)
// ainda não foram implementadas.

import type { GradeProfissionalRow, AgendamentoTitaPayload } from "./types.ts"

// Regra fixa hoje: todo agendamento criado por este fluxo usa o mesmo tipo de agenda.
const ID_TIPO_AGENDA = 92

export function montarPayloadAgendamento(
  grade: GradeProfissionalRow,
  idGradeTerapeuta: number,
): AgendamentoTitaPayload {
  throw new Error("not_implemented")
}
