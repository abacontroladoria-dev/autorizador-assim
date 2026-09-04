// Elegibilidade de um paciente para o Controle de Prazos do PDI: tem um laudo
// EM USO (vigente OU vencido — tanto faz, decisão do usuário no plano) com
// Especialidade de Psicologia ABA.
//
// Módulo PURO — mesma fonte que lib/laudos/acompanhamento.ts usa
// (`orbita_laudos_relatorio`, via `buscarLaudosDoRelatorio()`), reaproveitando
// o tipo `LaudoRow` já existente em types/cronograma.ts. Não filtra por
// `situacao`: mesma decisão registrada no cabeçalho de
// services/laudos/relatorio.ts ("a renovação de laudo é controle
// administrativo PARALELO").
//
// ─── ACHADO DA VERIFICAÇÃO (2026-09-04) — desvio do desenho original do plano ──
//
// O plano supunha que a coluna "Especialidade" do relatório traria, para um
// paciente de Psicologia ABA, os nomes GRANULARES de `ESP_CLINICO["Psicologia
// ABA"]`/`ESP_EXTERNO["Psicologia ABA"]` (ex.: "Aplicador ABA (PS)",
// "Aplicador ABA Casa"). Medido contra o relatório real (`GET /api/laudos`,
// 1.864 linhas, 04/09/2026): a coluna "Especialidade" NUNCA contém esses
// nomes — os valores distintos observados incluem "Psicologia ABA" (258
// linhas), "Aplicador ABA" (1 linha, provavelmente erro de digitação no
// Órbita), "Habilidades Sociais (Psicologia ABA)" (2 linhas), entre outras
// especialidades. `ESP_CLINICO`/`ESP_EXTERNO` mapeiam nomes de TERAPIA da
// AGENDA (`csv_grades_profissionais.terapia_nome`, ver lib/pdi/agenda.ts) para
// o rótulo de especialidade do LAUDO — e "Psicologia ABA" é exatamente a
// CHAVE desses dois mapas, não um dos valores. A elegibilidade abaixo compara
// contra essa chave diretamente.
//
// Confirmado com paciente conhecido: "Adrian Araújo Nery" (ID Favorecido
// 11511, paciente da planilha de referência, Especialista "Amanda Ribeiro")
// tem uma linha com Especialidade "Psicologia ABA" no relatório real.
//
// Sobre `autorizadoAmbienteNatural`: o plano cogitava usar
// `ESP_EXTERNO["Psicologia ABA"]` contra "Especialidade" (que, pelo achado
// acima, não se aplica — esses nomes não aparecem ali) e desconfiava que a
// coluna "Ambiente natural" do relatório descrevesse diagnóstico, não
// autorização. Medido: dos pacientes com sessão real de "Aplicador ABA
// Casa"/"Aplicador ABA Escola" na agenda (`vw_grade_base`, 25 pacientes
// distintos, excluindo o placeholder "Ainda não selecionado"), 23 de 24 têm
// "Ambiente natural" = "Sim" na linha de Psicologia ABA do relatório (o único
// fora da curva, "Ismael De Souza Tardin", está "Não" — provável laudo
// desatualizado em relação à agenda, não um contra-exemplo da coluna). Por
// isso `autorizadoAmbienteNatural` aqui usa a coluna "Ambiente natural"
// diretamente, e NÃO as siglas de `ESP_EXTERNO`.

import type { LaudoRow } from "@/types/cronograma"
import { ESP_CLINICO } from "@/lib/cronograma/constants"

/**
 * A especialidade-alvo é a CHAVE de `ESP_CLINICO`/`ESP_EXTERNO` — ver o
 * cabeçalho. Tipada como `keyof typeof ESP_CLINICO` (em vez de `string` solto)
 * para que, se "Psicologia ABA" for renomeada em constants.ts, o TS aponte
 * aqui em vez de este módulo silenciosamente parar de achar elegível.
 */
const ESPECIALIDADE_ABA: keyof typeof ESP_CLINICO = "Psicologia ABA"

export interface ElegibilidadePdi {
  elegivel: boolean
  autorizadoAmbienteNatural: boolean
}

/** Lê uma coluna do relatório, tolerando ausência/tipo — mesma convenção de `ler()` em lib/laudos/acompanhamento.ts. */
function ler(row: LaudoRow, ...chaves: string[]): string {
  for (const k of chaves) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim()
  }
  return ""
}

function idFavorecidoDe(row: LaudoRow): number | null {
  const bruto = ler(row, "ID Favorecido", "Id Favorecido", "ID Paciente", "Id Paciente")
  return /^\d+$/.test(bruto) ? Number(bruto) : null
}

/**
 * Calcula a elegibilidade de CADA paciente presente no relatório, por
 * `tita_paciente_id` (= `ID Favorecido`).
 *
 * Linhas sem `ID Favorecido` legível são ignoradas (não há chave para
 * indexar) — mesmo critério de `agruparLaudos` em lib/laudos/acompanhamento.ts.
 */
export function calcularElegibilidadePdi(rows: LaudoRow[]): Map<number, ElegibilidadePdi> {
  const porPaciente = new Map<number, ElegibilidadePdi>()

  for (const row of rows) {
    if (ler(row, "Especialidade") !== ESPECIALIDADE_ABA) continue

    const idFavorecido = idFavorecidoDe(row)
    if (idFavorecido === null) continue

    const atual = porPaciente.get(idFavorecido) ?? { elegivel: false, autorizadoAmbienteNatural: false }
    atual.elegivel = true
    if (ler(row, "Ambiente natural").toLowerCase() === "sim") {
      atual.autorizadoAmbienteNatural = true
    }
    porPaciente.set(idFavorecido, atual)
  }

  return porPaciente
}
