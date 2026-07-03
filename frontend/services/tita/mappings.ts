import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import type { GradeProfissionalRow } from "./types"

/**
 * Busca o registro completo de csv_grades_profissionais pelo seu UUID (coluna id)
 * — identificador único, sem ambiguidade (ver auditoria da página de Ocupação de
 * Paciente). É a partir desse registro que id_favorecido, id_terapia_clinica,
 * id_terapia_exibicao e id_sala são obtidos para montarPayloadAgendamento.
 */
export async function buscarGradePorId(
  csvGradeId: string,
  client?: SupabaseClient,
): Promise<GradeProfissionalRow | null> {
  const supabase = client ?? (await createClient())

  const { data, error } = await supabase
    .from("csv_grades_profissionais")
    .select("*")
    .eq("id", csvGradeId)
    .maybeSingle()

  if (error) throw error
  return (data as GradeProfissionalRow | null) ?? null
}

/** Dados da grade do terapeuta na TiTa necessários para montar o payload de agendamento. */
export interface GradeTerapeutaInfo {
  gradeTerapeutaId: number
  idSala: number | null
  terapiaExibicaoId: number | null
}

/**
 * Resolve a grade do terapeuta na TiTa a partir de grade_profissionais_tita.
 *
 * Chave validada com dados reais de produção (ver relatório de auditoria):
 * profissional_id + data + hora_inicial nunca produziu mais de uma correspondência
 * em ~21 mil linhas comparadas — não é preciso reforçar a chave com hora_final,
 * terapia_id, sala_id ou unidade_id.
 *
 * id_sala e terapia_exibicao_id vêm desta tabela (não de csv_grades_profissionais):
 * validado com dados reais que csv_grades_profissionais.terapia_exibicao_id é NULL em
 * 100% das linhas "Livre" (é a origem de todo csvGradeId — ver invariante em
 * OcupPacMode.tsx), e que terapia_id não mapeia 1:1 para terapia_exibicao_id (ex.:
 * "Psicologia" aparece com 3 terapia_exibicao_id distintos), então não é seguro
 * inferir. grade_profissionais_tita tem esses dois campos para ~9% das linhas
 * "Livre" — quando ausentes ali, retornam null e o chamador deve tratar como
 * "não é possível agendar esta grade", não adivinhar um valor.
 *
 * Retorna null (não lança) quando não encontrar correspondência: a causa mais
 * provável é o registro ainda não ter sido sincronizado por sync_tita_grade
 * (defasagem observada de poucos dias em relação a csv_grades_profissionais), não
 * um erro.
 */
export async function resolverGradeTerapeuta(
  profissionalId: number,
  data: string,
  horaInicial: string,
  client?: SupabaseClient,
): Promise<GradeTerapeutaInfo | null> {
  const supabase = client ?? (await createClient())

  const { data: row, error } = await supabase
    .from("grade_profissionais_tita")
    .select("grade_terapeuta_id, id_sala, terapia_exibicao_id")
    .eq("profissional_id", profissionalId)
    .eq("data", data)
    .eq("hora_inicial", horaInicial)
    .maybeSingle()

  if (error) throw error

  const gradeTerapeutaId = (row?.grade_terapeuta_id as number | null | undefined) ?? null

  if (gradeTerapeutaId == null) {
    console.warn(
      "[tita:resolverGradeTerapeuta] Nenhuma correspondência em grade_profissionais_tita",
      JSON.stringify({ profissionalId, data, horaInicial }),
    )
    return null
  }

  return {
    gradeTerapeutaId,
    idSala: (row?.id_sala as number | null | undefined) ?? null,
    terapiaExibicaoId: (row?.terapia_exibicao_id as number | null | undefined) ?? null,
  }
}

/**
 * Resolve id_favorecido (paciente na TiTa) a partir do nome do paciente no Pulsar.
 *
 * csvGradeId sempre aponta para uma linha "Livre" de csv_grades_profissionais (ver
 * invariante em OcupPacMode.tsx), e toda linha Livre tem paciente_id NULL — é um
 * horário vago, ninguém está agendado ali ainda. O paciente_id correto vem de
 * qualquer outra linha "Agendado" desse mesmo paciente: validado com dados reais
 * de produção que paciente_nome mapeia 1:1 para paciente_id (298 pacientes, 298
 * IDs distintos, nenhuma ambiguidade).
 *
 * Retorna null (não lança) quando o paciente não tem nenhuma linha Agendado ainda
 * — caso legítimo para um paciente novo que nunca foi agendado na TiTa.
 */
export async function resolverIdFavorecido(
  pacienteNome: string,
  client?: SupabaseClient,
): Promise<number | null> {
  const supabase = client ?? (await createClient())

  const { data: rows, error } = await supabase
    .from("csv_grades_profissionais")
    .select("paciente_id")
    .eq("paciente_nome", pacienteNome)
    .eq("status_agendamento", "Agendado")
    .limit(1)

  if (error) throw error

  const idFavorecido = (rows?.[0]?.paciente_id as number | null | undefined) ?? null

  if (idFavorecido == null) {
    console.warn(
      "[tita:resolverIdFavorecido] Paciente sem nenhuma linha Agendado em csv_grades_profissionais",
      JSON.stringify({ pacienteNome }),
    )
  }

  return idFavorecido
}
