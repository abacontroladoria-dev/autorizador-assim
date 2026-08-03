// ─── Motor de cálculo — Simulação de Novo Prestador ────────────────────────────
// Extraído de PreencherProfTab.tsx (modo "sim"), que era a única forma
// alcançável de rodar esse código (a rota /cronograma/solicitacoes só usava
// esse modo). Diferente da versão anterior, a validação de sequenciamento
// (mínimo 1 sessão no dia + blocos consecutivos de 40min) usa a MESMA fonte de
// verdade que "Vagas Agora" e "Saída de Profissional": slotValidoParaPaciente.

import { pm, turnoFromHora } from "./helpers"
import { DIAS_UTIL, HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP } from "./constants"
import { slotValidoParaPaciente } from "./candidatos"
import type { CsvRow, LaudoRow } from "@/types/cronograma"

export type Turno = "manha" | "tarde"

/** Unidades candidatas a receber um novo prestador. Fisioterapia Aquática/AT
 *  domiciliar (Ambiente Natural) não entra: não tem grade de horário fixo por
 *  unidade, então não faz sentido simular turno/dia para ela aqui. */
export const UNIDADES_SIMULACAO = ["Realengo", "Padre Miguel", "Fazendinha"] as const

/** Padre Miguel tem restrição geográfica real: pacientes de lá não se deslocam
 *  para outra unidade no mesmo dia. Por isso, se o plano recomendado escolher
 *  Padre Miguel para um turno de um dia, os demais turnos daquele mesmo dia são
 *  refeitos fixando uma única unidade para o dia inteiro — nunca misturando
 *  Padre Miguel com outra unidade dentro do mesmo dia. */
export const UNIDADE_COM_RESTRICAO_GEOGRAFICA = "Padre Miguel"

const EXCLUIR_GAPS = new Set([
  "Coordenador de Caso", "Supervisão ABA",
  "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa",
])

// Diferente de EXCLUIR_GAPS (que rege só a contagem de "ofertado" no cálculo
// de gap, em calcularGaps): "Coordenador de Caso" ocupa sala física na
// unidade, então pra decidir se um paciente já frequenta a unidade naquele
// dia — e pra passar as sessões dele pra slotValidoParaPaciente checar
// sequenciamento sem buraco — ele TEM que contar, senão a linha nunca chega
// na checagem de sequenciamento e o paciente fica sem sugestão nenhuma
// naquele dia (confirmado com o time clínico). "Supervisão ABA" e os ABA
// externos (casa/escola) continuam de fora: não representam presença física
// na unidade nesse horário.
const EXCLUIR_ATENDIMENTO = new Set(
  [...EXCLUIR_GAPS].filter(t => t !== "Coordenador de Caso"),
)

export interface GapItem { pac: string; esp: string; aut: number; of: number; gap: number }

export interface CandidatoSlot {
  pac: string
  gap: number
  aut: number
  of: number
  sessoesNoDia: string[]
}

export interface SlotSimulado {
  dia: string
  turno: Turno
  unidade: string
  hora: string
  candidatos: CandidatoSlot[]
}

export interface PeriodoSimulado {
  dia: string
  turno: Turno
  unidade: string
  nPacientes: number
  totalSessoes: number
  slots: SlotSimulado[]
}

export interface UnidadeRanqueada {
  unidade: string
  nPacientes: number
  totalSessoes: number
  periodos: PeriodoSimulado[]
}

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }
function rowUnidade(r: CsvRow): string { return String(r.Unidade || "Desconhecida") }

/** Calcula, por paciente+especialidade, quantas sessões faltam (autorizado − ofertado). */
export function calcularGaps(lRows: LaudoRow[], cRows: CsvRow[]): GapItem[] {
  if (!cRows.length || !lRows.length) return []

  const qtdOfertada: Record<string, number> = {}
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Agendado") continue
    const pac = r["Nome Favorecido"]
    if (!pac || PACS_ADMIN.has(pac)) continue
    const esp = TERAPIA_TO_ESP[r.Terapia]
    if (!esp || EXCLUIR_GAPS.has(r.Terapia)) continue
    const k = `${pac}|||${esp}`
    qtdOfertada[k] = (qtdOfertada[k] || 0) + 1
  }

  const qtdAutorizada: Record<string, number> = {}
  const comAlta = new Set<string>()
  for (const l of lRows) {
    const pac = String(l["Paciente"] || "").trim()
    const esp = String(l["Especialidade"] || "").trim()
    if (!pac || PACS_ADMIN.has(pac) || !esp) continue
    const alta = String(l["Alta"] ?? l["ALTA"] ?? l["Data alta"] ?? l["Data Alta"] ?? "").trim()
    if (alta && !["nao", "não", "n", "no", "false", "falso", "0", "-"].includes(alta.toLowerCase())) {
      comAlta.add(`${pac}|||${esp}`)
      continue
    }
    const situacao = String(l["Situação"] || "").trim()
    if (situacao && situacao.toLowerCase() !== "vigente") continue
    const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
    if (aut <= 0) continue
    const k = `${pac}|||${esp}`
    if (!qtdAutorizada[k] || aut > qtdAutorizada[k]) qtdAutorizada[k] = aut
  }
  for (const k of comAlta) delete qtdAutorizada[k]

  const gaps: GapItem[] = []
  for (const [k, aut] of Object.entries(qtdAutorizada)) {
    const of_ = qtdOfertada[k] || 0
    const gap = Math.round((aut - of_) * 10) / 10
    if (gap > 0) {
      const [pac, esp] = k.split("|||")
      gaps.push({ pac, esp, aut, of: of_, gap })
    }
  }
  return gaps
}

export function gapsParaMapa(gaps: GapItem[]): Record<string, GapItem> {
  const m: Record<string, GapItem> = {}
  for (const g of gaps) m[`${g.pac}|||${g.esp}`] = g
  return m
}

/** Avalia um dia+turno+unidade específico: quais pacientes com gap na
 *  especialidade simulada já frequentam essa unidade nesse dia, estão livres
 *  no horário e podem receber a sessão sem violar o sequenciamento clínico. */
export function avaliarPeriodo(
  dia: string,
  turno: Turno,
  unidade: string,
  especialidade: string,
  cRows: CsvRow[],
  gapMap: Record<string, GapItem>,
): PeriodoSimulado {
  const slots: SlotSimulado[] = []
  const pacientesValidos = new Set<string>()
  let totalSessoes = 0

  const agendClinico = cRows.filter(r =>
    r["Status do Agendamento"] === "Agendado" &&
    !EXCLUIR_ATENDIMENTO.has(r.Terapia) &&
    r["Nome Favorecido"] && !PACS_ADMIN.has(r["Nome Favorecido"]),
  )
  const pacientesDaUnidadeNoDia = new Set(
    agendClinico.filter(r => r["Dia da Semana"] === dia && rowUnidade(r) === unidade).map(r => r["Nome Favorecido"]),
  )

  for (const hora of HORAS_GRID.filter(h => turnoFromHora(h) === turno)) {
    const pacientesJaConfirmados = new Set(
      cRows
        .filter(r => r["Status do Agendamento"] === "Agendado" && r["Dia da Semana"] === dia && hiStr(r) === hora)
        .map(r => r["Nome Favorecido"])
        .filter(p => p && p !== "Ainda não selecionado"),
    )

    const candidatos: CandidatoSlot[] = [...pacientesDaUnidadeNoDia]
      .filter(pac => {
        const g = gapMap[`${pac}|||${especialidade}`]
        if (!g || pacientesJaConfirmados.has(pac)) return false
        return slotValidoParaPaciente(pac, dia, hora, agendClinico, unidade)
      })
      .map(pac => {
        const g = gapMap[`${pac}|||${especialidade}`]
        const sessoesNoDia = agendClinico
          .filter(r => r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia && rowUnidade(r) === unidade)
          .map(hiStr)
          .sort()
        return { pac, gap: g.gap, aut: g.aut, of: g.of, sessoesNoDia }
      })
      .sort((a, b) => b.gap - a.gap || a.pac.localeCompare(b.pac))

    if (candidatos.length) {
      slots.push({ dia, turno, unidade, hora, candidatos })
      totalSessoes += candidatos.length
      candidatos.forEach(c => pacientesValidos.add(c.pac))
    }
  }

  return { dia, turno, unidade, nPacientes: pacientesValidos.size, totalSessoes, slots }
}

export interface PeriodoAlvo { dia: string; turno: Turno }

/** Ranqueia cada unidade candidata pela ocupação total que geraria, somando
 *  todos os períodos (dia+turno) selecionados pelo usuário. */
export function ranquearUnidades(
  periodosAlvo: PeriodoAlvo[],
  especialidade: string,
  cRows: CsvRow[],
  gapMap: Record<string, GapItem>,
): UnidadeRanqueada[] {
  return UNIDADES_SIMULACAO.map(unidade => {
    const periodos = periodosAlvo.map(p => avaliarPeriodo(p.dia, p.turno, unidade, especialidade, cRows, gapMap))
    const pacientes = new Set<string>()
    let totalSessoes = 0
    for (const periodo of periodos) {
      totalSessoes += periodo.totalSessoes
      periodo.slots.forEach(s => s.candidatos.forEach(c => pacientes.add(c.pac)))
    }
    return { unidade, nPacientes: pacientes.size, totalSessoes, periodos }
  }).sort((a, b) => b.totalSessoes - a.totalSessoes || b.nPacientes - a.nPacientes || a.unidade.localeCompare(b.unidade))
}

/** Monta o plano recomendado: escolhe a melhor unidade para cada período
 *  isoladamente, depois aplica a restrição geográfica de Padre Miguel (não
 *  mistura unidades no mesmo dia se Padre Miguel for uma das escolhidas). */
export function montarPlanoRecomendado(
  periodosAlvo: PeriodoAlvo[],
  especialidade: string,
  cRows: CsvRow[],
  gapMap: Record<string, GapItem>,
): PeriodoSimulado[] {
  if (!periodosAlvo.length) return []

  const escolhas: PeriodoSimulado[] = periodosAlvo.map(p =>
    UNIDADES_SIMULACAO
      .map(unidade => avaliarPeriodo(p.dia, p.turno, unidade, especialidade, cRows, gapMap))
      .sort((a, b) => b.totalSessoes - a.totalSessoes || b.nPacientes - a.nPacientes || a.unidade.localeCompare(b.unidade))[0],
  )

  for (const dia of DIAS_UTIL) {
    const idxsNoDia = escolhas.map((e, i) => (e.dia === dia ? i : -1)).filter(i => i >= 0)
    if (idxsNoDia.length < 2) continue
    const unidadesEscolhidas = new Set(idxsNoDia.map(i => escolhas[i].unidade))
    if (!unidadesEscolhidas.has(UNIDADE_COM_RESTRICAO_GEOGRAFICA) || unidadesEscolhidas.size <= 1) continue

    const melhorUnidadeFixa = UNIDADES_SIMULACAO
      .map(unidade => {
        const periodos = idxsNoDia.map(i => avaliarPeriodo(escolhas[i].dia, escolhas[i].turno, unidade, especialidade, cRows, gapMap))
        const pacientes = new Set(periodos.flatMap(p => p.slots.flatMap(s => s.candidatos.map(c => c.pac))))
        const totalSessoes = periodos.reduce((soma, p) => soma + p.totalSessoes, 0)
        return { unidade, totalSessoes, nPacientes: pacientes.size, periodos }
      })
      .sort((a, b) => b.totalSessoes - a.totalSessoes || b.nPacientes - a.nPacientes || a.unidade.localeCompare(b.unidade))[0]

    idxsNoDia.forEach((i, j) => { escolhas[i] = melhorUnidadeFixa.periodos[j] })
  }

  return escolhas
}

// ─── Hipótese: como ficaria a agenda do novo profissional ──────────────────
export interface CelulaAgenda { unidade: string; candidatos: CandidatoSlot[] }

export interface OcupacaoDia { dia: string; unidades: string; sessoes: number; totalSlots: number; pct: number }

export interface PacienteAtendido { pac: string; sessoes: number; dias: string[] }

export interface AgendaNovoProfissional {
  dias: string[]
  horasGrid: string[]
  grade: Record<string, CelulaAgenda>
  totalSlots: number
  slotsComCandidato: number
  slotsLivres: number
  chTotalMin: number
  chOcupMin: number
  chLivreMin: number
  porDia: OcupacaoDia[]
  pacientes: PacienteAtendido[]
}

/** Projeta a agenda semanal completa (todo o horário de trabalho dos
 *  dias/turnos selecionados, não só os slots com candidato) do profissional
 *  hipotético: quais horas ficariam cobertas por um paciente candidato e
 *  quais ficariam livres/ociosas, além da carga horária e da lista de
 *  pacientes que essa contratação atenderia. */
export function construirAgendaNovoProfissional(periodos: PeriodoSimulado[]): AgendaNovoProfissional {
  const dias = DIAS_UTIL.filter(d => periodos.some(p => p.dia === d))
  const grade: Record<string, CelulaAgenda> = {}
  const porDia: OcupacaoDia[] = []
  const pacientesMap: Record<string, { sessoes: number; dias: Set<string> }> = {}
  const horasSet = new Set<string>()
  let totalSlots = 0
  let slotsComCandidato = 0

  for (const dia of dias) {
    const unidadesDia = new Set<string>()
    let horasNoDia = 0
    let sessoesDia = 0
    for (const periodo of periodos.filter(p => p.dia === dia)) {
      unidadesDia.add(periodo.unidade)
      for (const hora of HORAS_GRID.filter(h => turnoFromHora(h) === periodo.turno)) {
        horasSet.add(hora)
        horasNoDia++
        totalSlots++
        const slot = periodo.slots.find(s => s.hora === hora)
        const key = `${dia}|||${hora}`
        if (slot) {
          slotsComCandidato++
          sessoesDia++
          grade[key] = { unidade: periodo.unidade, candidatos: slot.candidatos }
          for (const c of slot.candidatos) {
            const entry = pacientesMap[c.pac] ?? { sessoes: 0, dias: new Set<string>() }
            entry.sessoes++
            entry.dias.add(dia)
            pacientesMap[c.pac] = entry
          }
        } else {
          grade[key] = { unidade: periodo.unidade, candidatos: [] }
        }
      }
    }
    porDia.push({
      dia, unidades: [...unidadesDia].join(" / "),
      sessoes: sessoesDia, totalSlots: horasNoDia,
      pct: horasNoDia ? (sessoesDia / horasNoDia) * 100 : 0,
    })
  }

  const horasGrid = [...horasSet].sort((a, b) => (pm(a) ?? 0) - (pm(b) ?? 0))
  const pacientes = Object.entries(pacientesMap)
    .map(([pac, v]) => ({
      pac, sessoes: v.sessoes,
      dias: [...v.dias].sort((a, b) => DIAS_UTIL.indexOf(a as typeof DIAS_UTIL[number]) - DIAS_UTIL.indexOf(b as typeof DIAS_UTIL[number])),
    }))
    .sort((a, b) => b.sessoes - a.sessoes || a.pac.localeCompare(b.pac))

  return {
    dias, horasGrid, grade, totalSlots, slotsComCandidato,
    slotsLivres: totalSlots - slotsComCandidato,
    chTotalMin: totalSlots * 40, chOcupMin: slotsComCandidato * 40, chLivreMin: (totalSlots - slotsComCandidato) * 40,
    porDia, pacientes,
  }
}
