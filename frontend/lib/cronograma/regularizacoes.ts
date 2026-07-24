// ─── REGULARIZAÇÕES: AGENDA REAL × CADASTRO ESTRUTURAL, POR PROFISSIONAL_ID ──
//
// Cruzamento por profissional_id (não por nome): o nome do profissional pode
// ser editado na TiTa, mas o ID nunca muda — comparar por nome geraria falso
// negativo/positivo sempre que o texto divergisse (acento, abreviação, nome
// atualizado). Compara, por profissional, os turnos (dia da semana × Manhã/
// Tarde) em que ele tem sessão real agendada em QUALQUER sala (agenda real,
// csv_grades_profissionais) contra os turnos em que ele tem AlocacaoSala
// cadastrada em QUALQUER sala (cronograma_salas_alocacoes) — não valida sala
// específica, só se o profissional está "regularizado" na semana como um todo.

import { dowDeDiaSemana } from "./salas"
import { turnoDoHorario } from "./ocupacaoProf"
import { DOW_PT } from "./ocupacaoConst"
import { pm, cleanTxt } from "./helpers"
import { normTxt, TERAPIA_ID } from "./constants"
import type { AgendaSalaRow, AlocacaoSala } from "./salasTypes"

// Sessão em "Aplicador ABA Casa"/"Aplicador ABA Escola" acontece na casa/escola
// do paciente (ambiente natural) — o profissional não ocupa sala nenhuma da
// clínica nesse horário, então não é uma pendência de cadastro de sala. Por
// exigência explícita: comparar por `terapia_id` (fonte de verdade — nomes
// podem mudar), NUNCA checar substring "casa"/"escola" no texto da terapia.
const TERAPIAS_AMBIENTE_NATURAL_IDS = new Set([TERAPIA_ID["Aplicador ABA Casa"], TERAPIA_ID["Aplicador ABA Escola"]])

export interface TurnoSemana {
  dow: number
  turno: "Manhã" | "Tarde"
}

export interface RegularizacaoProfissional {
  /** Null só quando nenhuma linha de agenda/alocação desse grupo tinha profissional_id — vira "sem ID" na tela, para revisão manual. */
  profissionalId: number | null
  profissionalNome: string
  turnosAgenda: TurnoSemana[]
  turnosCadastrados: TurnoSemana[]
  /** Tem sessão real, falta cadastrar em cronograma_salas_alocacoes. */
  turnosFaltantes: TurnoSemana[]
  /** Cadastrado em cronograma_salas_alocacoes, sem sessão real na semana. */
  turnosExtras: TurnoSemana[]
}

const ORDEM_TURNO: Record<"Manhã" | "Tarde", number> = { "Manhã": 0, "Tarde": 1 }

function chaveTurno(t: TurnoSemana): string {
  return `${t.dow}-${t.turno}`
}

function ordenarTurnos(turnos: TurnoSemana[]): TurnoSemana[] {
  return [...turnos].sort((a, b) => a.dow - b.dow || ORDEM_TURNO[a.turno] - ORDEM_TURNO[b.turno])
}

export function labelTurno(t: TurnoSemana): string {
  return `${DOW_PT[t.dow] ?? t.dow} · ${t.turno}`
}

interface GrupoProfissional {
  nome: string
  turnos: Map<string, TurnoSemana>
}

/**
 * Compara, por profissional_id, os turnos com sessão real (agenda) vs turnos
 * cadastrados (alocação) — retorna só quem tem alguma divergência (faltante
 * ou extra). Profissionais 100% regularizados não aparecem no resultado.
 */
export function calcularRegularizacoes(alocacoes: AlocacaoSala[], linhas: AgendaSalaRow[]): RegularizacaoProfissional[] {
  const agendaPorId = new Map<number, GrupoProfissional>()
  linhas.forEach(r => {
    if (r.profissional_id == null) return
    if (!normTxt(r.status_agendamento).includes("agendado")) return
    if (r.terapia_id != null && TERAPIAS_AMBIENTE_NATURAL_IDS.has(r.terapia_id)) return
    const dow = dowDeDiaSemana(r.dia_semana)
    if (!dow) return
    const minutos = pm(r.hora_inicial)
    if (minutos === null) return
    const turno = turnoDoHorario(minutos)
    const nome = cleanTxt(r.profissional_nome)
    if (!nome) return
    const grupo = agendaPorId.get(r.profissional_id) ?? { nome, turnos: new Map() }
    const t: TurnoSemana = { dow, turno }
    grupo.turnos.set(chaveTurno(t), t)
    agendaPorId.set(r.profissional_id, grupo)
  })

  const cadastroPorId = new Map<number, GrupoProfissional>()
  alocacoes.forEach(a => {
    if (a.profissional_id == null) return
    const grupo = cadastroPorId.get(a.profissional_id) ?? { nome: a.profissional_nome, turnos: new Map() }
    const t: TurnoSemana = { dow: a.dow, turno: a.turno }
    grupo.turnos.set(chaveTurno(t), t)
    cadastroPorId.set(a.profissional_id, grupo)
  })

  const ids = new Set([...agendaPorId.keys(), ...cadastroPorId.keys()])
  const resultado: RegularizacaoProfissional[] = []

  ids.forEach(id => {
    const agenda = agendaPorId.get(id)
    const cadastro = cadastroPorId.get(id)
    const turnosAgenda = ordenarTurnos([...(agenda?.turnos.values() ?? [])])
    const turnosCadastrados = ordenarTurnos([...(cadastro?.turnos.values() ?? [])])
    const chavesCadastro = new Set(turnosCadastrados.map(chaveTurno))
    const chavesAgenda = new Set(turnosAgenda.map(chaveTurno))
    const turnosFaltantes = turnosAgenda.filter(t => !chavesCadastro.has(chaveTurno(t)))
    const turnosExtras = turnosCadastrados.filter(t => !chavesAgenda.has(chaveTurno(t)))
    if (turnosFaltantes.length === 0 && turnosExtras.length === 0) return
    resultado.push({
      profissionalId: id,
      profissionalNome: agenda?.nome || cadastro?.nome || "",
      turnosAgenda,
      turnosCadastrados,
      turnosFaltantes,
      turnosExtras,
    })
  })

  return resultado.sort((a, b) => a.profissionalNome.localeCompare(b.profissionalNome))
}
