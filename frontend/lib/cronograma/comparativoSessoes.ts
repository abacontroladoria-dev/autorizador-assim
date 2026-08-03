// Comparativo de Sessões Agendadas — compara duas bases de agendamentos (ex.:
// mês anterior x mês atual) e produz os indicativos: total geral, por unidade,
// por paciente e resumo de aumento/redução. Ver planilha de referência
// "comparativo_julho_agosto_2026.xlsx" — este módulo reproduz a mesma lógica
// pra alimentar dashboards dentro do sistema (Indicadores > Comparativo de Sessões).

import { normTxt } from "@/lib/cronograma/constants"

/** Pacientes fictícios/administrativos — nunca contam em nenhum indicativo. */
export const PACIENTES_FICTICIOS_IDS = new Set<number>([
  17795, 18565, 19196, 20471, 20472, 20473, 20475, 20476, 20477, 20478, 20479,
  20725, // Paciente Teste Sanderson
])

export const UNIDADE_CONSERTAR = "Consertar Unidade no Sistema"
export const UNIDADE_AMBIENTE_NATURAL = "Ambiente Natural - Casa ou Escola"

/** Infere a Unidade a partir do texto da Sala, seguindo o mapeamento definido. */
export function mapearUnidade(sala: string | null | undefined): string {
  const s = String(sala ?? "").trim()
  if (!s) return UNIDADE_CONSERTAR
  if (/^Unid\.?\s*Realengo/i.test(s)) return "Realengo"
  if (/^Unid\.?\s*Fazendinha/i.test(s)) return "Fazendinha"
  if (/^Unid\.?\s*Padre Miguel/i.test(s)) return "Padre Miguel"
  if (normTxt(s) === normTxt("AT Externo Casa") || normTxt(s) === normTxt("AT Externo Escola")) return UNIDADE_AMBIENTE_NATURAL
  return UNIDADE_CONSERTAR
}

/** Linha normalizada de sessão, já filtrada e pronta pra comparação. */
export interface SessaoComparativo {
  idFavorecido: number | null
  paciente: string
  sala: string
  unidade: string
  convenio: string
  data: string
}

/**
 * Filtra sessões por trecho do nome do paciente (case/acento-insensitive) e/ou
 * por um conjunto de convênios selecionados (checkbox — "ou": basta bater com
 * um deles). Usado pra recalcular Por Unidade e Por Paciente com o mesmo
 * recorte de dados. `convenios` vazio = sem filtro de convênio.
 */
export function filtrarSessoesPorTexto(sessoes: SessaoComparativo[], paciente: string, convenios: string[]): SessaoComparativo[] {
  const p = normTxt(paciente)
  if (!p && convenios.length === 0) return sessoes
  const setConvenios = new Set(convenios.map(normTxt))
  return sessoes.filter(s => (!p || normTxt(s.paciente).includes(p)) && (setConvenios.size === 0 || setConvenios.has(normTxt(s.convenio))))
}

/**
 * Filtro numérico aplicável a qualquer linha com p1/p2/diferenca (paciente ou
 * unidade). P1/P2 são "≥ X" (null = sem filtro). Diferença é um intervalo
 * [mín, máx] — como diferença é um valor com sinal, "≥ X" sozinho não deixa
 * isolar quedas (ex.: "≥ -1" também inclui 0 e positivos); com mín/máx dá pra
 * pedir só quedas (ex.: mín=-9, máx=-1) ou só ganhos (mín=1).
 */
export function passaFiltroNumerico(
  row: { p1: number; p2: number; diferenca: number },
  p1Min: number | null, p2Min: number | null, diferencaMin: number | null, diferencaMax: number | null,
): boolean {
  if (p1Min !== null && row.p1 < p1Min) return false
  if (p2Min !== null && row.p2 < p2Min) return false
  if (diferencaMin !== null && row.diferenca < diferencaMin) return false
  if (diferencaMax !== null && row.diferenca > diferencaMax) return false
  return true
}

function isAgendado(status: string | null | undefined): boolean {
  const n = normTxt(status)
  return !n || n === "agendado"
}

/** Extrai o primeiro valor não-vazio dentre possíveis nomes de coluna (tolerante a variações de export). */
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim()
  }
  return ""
}

/** Normaliza linhas cruas de um XLSX/CSV importado (ex.: relatório "agendamentos_profissionais"). */
export function normalizarLinhasUpload(raw: Record<string, unknown>[]): SessaoComparativo[] {
  const out: SessaoComparativo[] = []
  for (const row of raw) {
    const statusTxt = pick(row, ["Status do Agendamento", "Status", "status"])
    if (statusTxt && !isAgendado(statusTxt)) continue

    const idStr = pick(row, ["Id Favorecido", "IdFavorecido", "Id_Favorecido", "ID Favorecido"])
    const idFavorecido = idStr ? Number(idStr.replace(/\D/g, "")) : null
    if (idFavorecido !== null && PACIENTES_FICTICIOS_IDS.has(idFavorecido)) continue

    const sala = pick(row, ["Sala", "sala"])
    out.push({
      idFavorecido: idFavorecido !== null && !isNaN(idFavorecido) ? idFavorecido : null,
      paciente: pick(row, ["Favorecido", "Nome Favorecido", "Paciente", "paciente"]),
      sala,
      unidade: mapearUnidade(sala),
      convenio: pick(row, ["Convênio", "Convenio", "convenio"]),
      data: pick(row, ["Data do Agendamento", "Data", "data"]),
    })
  }
  return out
}

/** Linha crua vinda de csv_grades_profissionais (via gradeService.buscarGradeComparativo). */
export interface GradeComparativoRaw {
  paciente_id: number | null
  paciente_nome: string | null
  sala_nome: string | null
  convenio_nome: string | null
  status_agendamento: string | null
  data: string | null
}

/** Normaliza linhas vindas da API (csv_grade_profissionais), aplicando os mesmos filtros. */
export function normalizarLinhasApi(raw: GradeComparativoRaw[]): SessaoComparativo[] {
  const out: SessaoComparativo[] = []
  for (const row of raw) {
    if (!isAgendado(row.status_agendamento)) continue
    if (row.paciente_id !== null && PACIENTES_FICTICIOS_IDS.has(row.paciente_id)) continue
    out.push({
      idFavorecido: row.paciente_id,
      paciente: row.paciente_nome ?? "",
      sala: row.sala_nome ?? "",
      unidade: mapearUnidade(row.sala_nome),
      convenio: row.convenio_nome ?? "",
      data: row.data ?? "",
    })
  }
  return out
}

export interface UnidadeComparativo {
  unidade: string
  p1: number
  p2: number
  diferenca: number
  variacaoPct: number | null
  /** Nº de pacientes distintos com ao menos uma sessão nessa unidade, em qualquer um dos dois períodos. */
  qtdPacientes: number
  /** Soma das sessões ganhas pelos pacientes que aumentaram nessa unidade (só a parte positiva) — explica quando a diferença líquida (ex.: +10) esconde movimentos maiores em direções opostas (ex.: +30 de uns, -20 de outros). */
  sessoesAumentadas: number
  /** Nº de pacientes dessa unidade cujas sessões aumentaram de P1 pra P2. */
  pacientesComAumento: number
  /** Soma das sessões perdidas pelos pacientes que reduziram nessa unidade (só a parte negativa, em módulo). */
  sessoesReduzidas: number
  /** Nº de pacientes dessa unidade cujas sessões reduziram de P1 pra P2. */
  pacientesComReducao: number
}

export interface PacienteComparativo {
  idFavorecido: number | null
  paciente: string
  convenio: string
  p1: number
  p2: number
  diferenca: number
}

export interface ResumoAumentoReducao {
  /** Pacientes que já tinham sessão em P1 e aumentaram (não inclui novos captados). */
  pacientesAumentaram: number
  sessoesAumentadas: number
  /** Pacientes que já tinham sessão em P1 e reduziram sem zerar (não inclui desligados). */
  pacientesReduziram: number
  sessoesReduzidas: number
  pacientesSemAlteracao: number
  /** Pacientes com 0 sessões em P1 e ≥1 em P2. */
  pacientesNovosCaptados: number
  sessoesNovosCaptados: number
  /** Pacientes com ≥1 sessão em P1 e 0 em P2. */
  pacientesDesligados: number
  sessoesDesligados: number
}

/**
 * Parseia a data de um agendamento em qualquer um dos formatos que a coluna
 * "Data do Agendamento" pode assumir: ISO ("2026-09-07", vindo da API),
 * brasileiro ("07/09/2026", texto no XLSX) ou serial do Excel (número de dias
 * desde 1899-12-30, quando a célula não vem formatada como texto/data no XLSX).
 */
function parseDataAgendamento(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
    return isNaN(d.getTime()) ? null : d
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function fmtDataCurta(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Intervalo (data mais antiga a mais recente) das sessões de um período, pra exibir junto ao total. Retorna null se nenhuma data for parseável. */
export function rangeDatas(sessoes: SessaoComparativo[]): string | null {
  let min: Date | null = null
  let max: Date | null = null
  for (const s of sessoes) {
    const d = parseDataAgendamento(s.data)
    if (!d) continue
    if (!min || d < min) min = d
    if (!max || d > max) max = d
  }
  if (!min || !max) return null
  if (min.getTime() === max.getTime()) return fmtDataCurta(min)
  const mesmoAno = min.getFullYear() === max.getFullYear()
  return mesmoAno ? `${fmtDataCurta(min)} a ${fmtDataCurta(max)}/${max.getFullYear()}` : `${fmtDataCurta(min)}/${min.getFullYear()} a ${fmtDataCurta(max)}/${max.getFullYear()}`
}

/** Categoria de movimento de um paciente entre P1 e P2 — usada tanto no resumo quanto no filtro da tabela "Por Paciente". */
export type CategoriaMovimento = "aumento" | "novos" | "reducao" | "desligados" | "semAlteracao"

export function classificarMovimento(p: Pick<PacienteComparativo, "p1" | "p2" | "diferenca">): CategoriaMovimento {
  if (p.diferenca > 0) return p.p1 === 0 ? "novos" : "aumento"
  if (p.diferenca < 0) return p.p2 === 0 ? "desligados" : "reducao"
  return "semAlteracao"
}

export interface ComparativoResultado {
  totalP1: number
  totalP2: number
  diferenca: number
  variacaoPct: number | null
  porUnidade: UnidadeComparativo[]
  porPaciente: PacienteComparativo[]
  resumo: ResumoAumentoReducao
}

function variacao(p1: number, p2: number): number | null {
  return p1 > 0 ? (p2 - p1) / p1 : null
}

const ORDEM_UNIDADES = ["Realengo", "Fazendinha", "Padre Miguel", UNIDADE_AMBIENTE_NATURAL, UNIDADE_CONSERTAR]

/** Chave estável de paciente: Id Favorecido quando disponível, senão nome normalizado. */
function chaveDe(s: SessaoComparativo): string {
  return s.idFavorecido !== null ? `id:${s.idFavorecido}` : `nome:${normTxt(s.paciente)}`
}

/** Agrega sessões por paciente (Id Favorecido, com fallback pro nome normalizado). Reaproveitado tanto pelo total geral quanto pelo drill-down por unidade. */
function agregarPorPaciente(sessoesP1: SessaoComparativo[], sessoesP2: SessaoComparativo[]): PacienteComparativo[] {
  interface Acc { paciente: string; convenioP1: string; convenioP2: string; p1: number; p2: number }
  const pacientes = new Map<string, Acc>()

  for (const s of sessoesP1) {
    const k = chaveDe(s)
    const acc = pacientes.get(k) ?? { paciente: s.paciente, convenioP1: "", convenioP2: "", p1: 0, p2: 0 }
    acc.p1 += 1
    acc.convenioP1 = s.convenio || acc.convenioP1
    if (s.paciente) acc.paciente = s.paciente
    pacientes.set(k, acc)
  }
  for (const s of sessoesP2) {
    const k = chaveDe(s)
    const acc = pacientes.get(k) ?? { paciente: s.paciente, convenioP1: "", convenioP2: "", p1: 0, p2: 0 }
    acc.p2 += 1
    acc.convenioP2 = s.convenio || acc.convenioP2
    if (s.paciente) acc.paciente = s.paciente
    pacientes.set(k, acc)
  }

  return [...pacientes.entries()]
    .map(([k, acc]) => ({
      idFavorecido: k.startsWith("id:") ? Number(k.slice(3)) : null,
      paciente: acc.paciente,
      // Prioriza o convênio do período mais recente (P2); cai pro de P1 se o paciente não teve sessão em P2.
      convenio: acc.convenioP2 || acc.convenioP1,
      p1: acc.p1,
      p2: acc.p2,
      diferenca: acc.p2 - acc.p1,
    }))
    .sort((a, b) => a.paciente.localeCompare(b.paciente, "pt-BR"))
}

/**
 * Drill-down do indicativo "Por Unidade": agrega por paciente só as sessões
 * daquela unidade específica — explica por que o total líquido da unidade
 * (ex.: +10) pode esconder pacientes que aumentaram bem mais e outros que
 * reduziram na mesma unidade.
 */
export function calcularPorPacienteDaUnidade(
  sessoesP1: SessaoComparativo[], sessoesP2: SessaoComparativo[], unidade: string,
): PacienteComparativo[] {
  return agregarPorPaciente(
    sessoesP1.filter(s => s.unidade === unidade),
    sessoesP2.filter(s => s.unidade === unidade),
  )
}

/** Calcula os 4 indicativos comparando as sessões normalizadas de dois períodos. */
export function calcularComparativo(sessoesP1: SessaoComparativo[], sessoesP2: SessaoComparativo[]): ComparativoResultado {
  const totalP1 = sessoesP1.length
  const totalP2 = sessoesP2.length

  // ─── Por unidade ───
  const unidades = new Map<string, { p1: number; p2: number; pacientes: Set<string> }>()
  function unidadeAcc(u: string) {
    let acc = unidades.get(u)
    if (!acc) { acc = { p1: 0, p2: 0, pacientes: new Set() }; unidades.set(u, acc) }
    return acc
  }
  for (const s of sessoesP1) { const acc = unidadeAcc(s.unidade); acc.p1 += 1; acc.pacientes.add(chaveDe(s)) }
  for (const s of sessoesP2) { const acc = unidadeAcc(s.unidade); acc.p2 += 1; acc.pacientes.add(chaveDe(s)) }

  // Agrupa as sessões por unidade pra poder contar, por paciente, quantos
  // aumentaram/reduziram dentro de cada unidade (a diferença líquida da
  // unidade sozinha pode esconder isso, ex.: +30 de uns e -20 de outros = +10).
  const sessoesP1PorUnidade = new Map<string, SessaoComparativo[]>()
  const sessoesP2PorUnidade = new Map<string, SessaoComparativo[]>()
  for (const s of sessoesP1) { const arr = sessoesP1PorUnidade.get(s.unidade) ?? []; arr.push(s); sessoesP1PorUnidade.set(s.unidade, arr) }
  for (const s of sessoesP2) { const arr = sessoesP2PorUnidade.get(s.unidade) ?? []; arr.push(s); sessoesP2PorUnidade.set(s.unidade, arr) }

  const porUnidade: UnidadeComparativo[] = [...unidades.entries()]
    .map(([unidade, v]) => {
      const pacientesDaUnidade = agregarPorPaciente(sessoesP1PorUnidade.get(unidade) ?? [], sessoesP2PorUnidade.get(unidade) ?? [])
      let sessoesAumentadas = 0, pacientesComAumento = 0
      let sessoesReduzidas = 0, pacientesComReducao = 0
      for (const p of pacientesDaUnidade) {
        if (p.diferenca > 0) { sessoesAumentadas += p.diferenca; pacientesComAumento++ }
        else if (p.diferenca < 0) { sessoesReduzidas += -p.diferenca; pacientesComReducao++ }
      }
      return {
        unidade, p1: v.p1, p2: v.p2, diferenca: v.p2 - v.p1, variacaoPct: variacao(v.p1, v.p2),
        qtdPacientes: v.pacientes.size,
        sessoesAumentadas, pacientesComAumento, sessoesReduzidas, pacientesComReducao,
      }
    })
    .sort((a, b) => {
      const ia = ORDEM_UNIDADES.indexOf(a.unidade)
      const ib = ORDEM_UNIDADES.indexOf(b.unidade)
      if (ia === -1 && ib === -1) return a.unidade.localeCompare(b.unidade)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

  // ─── Por paciente ───
  const porPaciente = agregarPorPaciente(sessoesP1, sessoesP2)

  // ─── Resumo aumento/redução ───
  // "Aumento"/"Redução" só contam pacientes que já tinham sessão no outro
  // período (senão duplicariam com Novos Captados/Desligados abaixo).
  let pacientesAumentaram = 0, sessoesAumentadas = 0
  let pacientesReduziram = 0, sessoesReduzidas = 0
  let pacientesSemAlteracao = 0
  let pacientesNovosCaptados = 0, sessoesNovosCaptados = 0
  let pacientesDesligados = 0, sessoesDesligados = 0
  for (const p of porPaciente) {
    switch (classificarMovimento(p)) {
      case "novos": pacientesNovosCaptados++; sessoesNovosCaptados += p.diferenca; break
      case "aumento": pacientesAumentaram++; sessoesAumentadas += p.diferenca; break
      case "desligados": pacientesDesligados++; sessoesDesligados += -p.diferenca; break
      case "reducao": pacientesReduziram++; sessoesReduzidas += -p.diferenca; break
      case "semAlteracao": pacientesSemAlteracao++; break
    }
  }

  return {
    totalP1,
    totalP2,
    diferenca: totalP2 - totalP1,
    variacaoPct: variacao(totalP1, totalP2),
    porUnidade,
    porPaciente,
    resumo: {
      pacientesAumentaram, sessoesAumentadas, pacientesReduziram, sessoesReduzidas, pacientesSemAlteracao,
      pacientesNovosCaptados, sessoesNovosCaptados, pacientesDesligados, sessoesDesligados,
    },
  }
}
