// ─── Mapeamento — agendamento-terapia-tita ─────────────────────────────────────
// id_favorecido, id_terapia_clinica, id_terapia_exibicao e id_sala vêm prontos no
// registro de csv_grades_profissionais buscado em index.ts (paciente_id,
// terapia_id, terapia_exibicao_id, sala_id). id_tipo_agenda é uma constante fixa
// (ID_TIPO_AGENDA em payload.ts).
//
// id_grade_terapeuta é diferente: NÃO existe em csv_grades_profissionais.
// tita_agendamento_id (dessa tabela) identifica um agendamento já concretizado;
// grade_terapeuta_id é um conceito distinto da API TiTa (endpoint
// /integracao/grade_profissionais), sincronizado separadamente pela função
// sync_tita_grade na tabela grade_profissionais_tita — colunas profissional_id,
// data, hora_inicial, hora_final, grade_terapeuta_id (índice único:
// grade_terapeuta_id + data + hora_inicial).
// Stub — a resolução ainda não foi implementada.

import type { SupabaseClient, GradeProfissionalRow } from "./types.ts"

export async function resolverIdGradeTerapeuta(
  supabase: SupabaseClient,
  grade: GradeProfissionalRow,
): Promise<number | null> {
  throw new Error("not_implemented")
}
