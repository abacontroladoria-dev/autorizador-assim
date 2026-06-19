import { pm } from "./helpers"
import { ABA_EXT, EXCLUIR_OCUP } from "./constants"
import type { CsvRow } from "@/types/cronograma"

/**
 * Valida se um paciente pode receber uma nova sessão clínica no slot (slotDia, slotHora),
 * aplicando as duas regras de negócio de sequenciamento:
 *
 *   R2.1 — Mínimo 2 sessões clínicas por dia
 *     O paciente já deve ter ≥ 1 sessão clínica nesse dia, para que a nova sessão
 *     não crie um "dia isolado" (responsáveis não vêm à clínica para uma só sessão).
 *
 *   R5.1 — Nunca intervalo entre sessões clínicas
 *     Após inserir a nova sessão, todas as sessões clínicas do paciente nesse dia
 *     devem estar consecutivas com exatamente 40 min de diferença.
 *
 * Esta função é a única fonte de verdade para essa validação no sistema.
 * É usada em dois contextos:
 *   - "Vagas Agora"              → runAlgorithm.ts, módulo Ocupação R2
 *   - "Hipótese: novo profissional" → SaidaProfMode.tsx, sugestoesPorSlot
 *
 * Se as regras R2.1 ou R5.1 mudarem, altere apenas aqui.
 *
 * @param pac            Nome exato do paciente (deve coincidir com "Nome Favorecido")
 * @param slotDia        Dia da semana do slot proposto ("Segunda-feira", etc.)
 * @param slotHora       Hora do slot no formato "HH:MM"
 * @param agendRows      Linhas com Status = "Agendado" usadas para obter sessões atuais
 * @param unidadeFiltro  Se fornecido, considera apenas sessões nessa unidade clínica
 */
export function slotValidoParaPaciente(
  pac: string,
  slotDia: string,
  slotHora: string,
  agendRows: CsvRow[],
  unidadeFiltro?: string | null,
): boolean {
  const slotPm = pm(slotHora)
  if (slotPm === null) return false

  const sessoesDia = agendRows.filter(r => {
    if (String(r["Nome Favorecido"] || "") !== pac) return false
    if (String(r["Dia da Semana"] || "") !== slotDia) return false
    if (EXCLUIR_OCUP.has(String(r.Terapia || ""))) return false
    if (ABA_EXT.has(String(r.Terapia || ""))) return false
    if (unidadeFiltro && String(r.Unidade || "") !== unidadeFiltro) return false
    return true
  })

  // R2.1 — o paciente precisa de ao menos 1 sessão no dia para não criar dia isolado
  if (sessoesDia.length === 0) return false

  // R5.1 — todas as sessões do dia (incluindo a nova) devem ser consecutivas de 40 em 40 min
  const horas = [
    ...new Set([
      ...sessoesDia
        .map(r => pm(String(r.HI_str || "")))
        .filter((h): h is number => h !== null),
      slotPm,
    ]),
  ].sort((a, b) => a - b)

  for (let i = 1; i < horas.length; i++) {
    if (horas[i] - horas[i - 1] !== 40) return false
  }

  return true
}
