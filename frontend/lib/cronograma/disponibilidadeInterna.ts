// ─── Disponibilidade interna (Tarefa 4) ────────────────────────────────────────
// Um profissional já contratado pode estar livre exatamente no horário que se
// cogitaria abrir vaga de contratação. Mesmo padrão de detecção de "livre" já
// usado em saida.ts (Status do Agendamento === "Livre").

import { TERAPIA_TO_ESP } from "./constants"
import type { CsvRow } from "@/types/cronograma"

export interface SlotLivre {
  profissional: string
  dia: string
  hora: string
  terapia: string
  especialidade: string | null
  unidade: string
}

export function listarSlotsLivres(cRows: CsvRow[]): SlotLivre[] {
  return cRows
    .filter(r => r["Status do Agendamento"] === "Livre" && r["Profissional"])
    .map(r => ({
      profissional: r["Profissional"],
      dia: r["Dia da Semana"],
      hora: String(r.HI_str || ""),
      terapia: r.Terapia,
      especialidade: TERAPIA_TO_ESP[r.Terapia] ?? null,
      unidade: String(r.Unidade || "Desconhecida"),
    }))
}

/** Quantos profissionais internos distintos já estão livres nesse exato
 *  dia/hora/unidade/especialidade — não é sim/não: um profissional livre
 *  cobre UM paciente da fila de candidatos daquela vaga, não a vaga inteira
 *  (ver filtrarPorDisponibilidadeInterna em sugestaoContratacao.ts). */
export function contarProfissionaisLivres(
  slotsLivres: SlotLivre[], dia: string, hora: string, unidade: string, especialidade: string,
): number {
  return new Set(
    slotsLivres
      .filter(s => s.dia === dia && s.hora === hora && s.unidade === unidade && s.especialidade === especialidade)
      .map(s => s.profissional),
  ).size
}
