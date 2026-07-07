// Migrado de calculadora-remuneracao/src/utils/ocupacao.js e constants/capacidades.js
// Porte PARCIAL, apenas o necessário para calcularAnaliseFutura (Passo 4):
// calcularOcupacaoSemanal, parseUnidadeSala, resumirJornadaAgenda e suas
// dependências diretas. A aba "Ocupação de Salas" (UI completa) NÃO é portada
// — decisão confirmada com o usuário no Passo 4.

import { normKey } from "./constants"
import { cleanTxt, fmtNumBR, fmtPctOcup, fmtH, hhmm } from "./formatacao"

export const DOW_PT_LONG: Record<number, string> = {
  1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira",
}

// ─── Capacidade por profissional/especialidade (constants/capacidades.js) ─────

const SLOT_CAP_ESP: Record<string, number> = {
  "terapia ocupacional": 1,
  "musicoterapia": 2,
  "aplicador aba (ef)": 1,
  "aplicador aba ef": 1,
}

export function capacidadePadraoProfissional(terapia = ""): number {
  return SLOT_CAP_ESP[normKey(terapia)] ?? 1
}

export type CapacidadeOverride = { dias?: Record<string, number>; padrao?: number }

export function resolverCapacidadeProfissional(
  profissional: string,
  terapia = "",
  dia = "",
  capacidadesProfissionais: Record<string, CapacidadeOverride> = {}
): number {
  const base = capacidadePadraoProfissional(terapia)
  const key = normKey(profissional)
  const cfg = capacidadesProfissionais?.[key] || capacidadesProfissionais?.[profissional] || null
  if (!cfg) return base
  const diaValor = dia ? Number(cfg.dias?.[dia]) : NaN
  if (Number.isFinite(diaValor) && diaValor > 0) return diaValor
  const padrao = Number(cfg.padrao)
  return Number.isFinite(padrao) && padrao > 0 ? padrao : base
}

function getSlotCap(prof: string, esp: string, capacidadesProfissionais: Record<string, CapacidadeOverride> = {}): number {
  return resolverCapacidadeProfissional(prof, esp, "", capacidadesProfissionais)
}

// ─── Unidade ────────────────────────────────────────────────────────────────

export function normalizarUnidadeOcupacao(unidade: string | null | undefined): string {
  const raw = cleanTxt(unidade)
  const n = normKey(raw)
  if (!n) return "Consertar Unidade no sistema"
  if (n.includes("ambiente natural") || n.includes("casa") || n.includes("escola") || n.includes("externo")) return "Ambiente Natural"
  if (n.includes("fazendinha")) return "Fazendinha"
  if (n.includes("padre miguel")) return "Padre Miguel"
  if (n.includes("realengo")) return "Realengo"
  return "Consertar Unidade no sistema"
}

export function parseUnidadeSala(sala: string | null | undefined): string {
  const raw = cleanTxt(sala)
  if (!raw) return "Consertar Unidade no sistema"
  const n = normKey(raw)
  const mUnid = raw.match(/^Unid\.\s*([^-–—]+)\s*[-–—]?/i)
  if (mUnid?.[1]) return normalizarUnidadeOcupacao(mUnid[1])
  if (n.includes("ambiente natural") || n.includes("casa") || n.includes("escola") || n.includes("externo")) return "Ambiente Natural"
  if (n.includes("fazendinha")) return "Fazendinha"
  if (n.includes("padre miguel")) return "Padre Miguel"
  if (n.includes("realengo")) return "Realengo"
  return normalizarUnidadeOcupacao(raw.split(/[-–—]/)[0].trim())
}

export function turnoDoHorario(min: number | null): string {
  return min !== null && min < 12 * 60 ? "Manhã" : "Tarde"
}

// ─── Base de agregação de ocupação ────────────────────────────────────────────

export type BaseOcup = {
  slotsTotal: number; slotsOcupados: number; slotsLivres: number
  horariosTotal: number; horariosOcupados: number; horariosLivres: number
  horasTotal: number; horasOcupadas: number; horasLivres: number
  horasTecnicas: number; horasAssistenciais: number
  unidades?: string[]
  _unidades?: Set<string>
}

export function novaBaseOcup(): BaseOcup {
  return {
    slotsTotal: 0, slotsOcupados: 0, slotsLivres: 0,
    horariosTotal: 0, horariosOcupados: 0, horariosLivres: 0,
    horasTotal: 0, horasOcupadas: 0, horasLivres: 0,
    horasTecnicas: 0, horasAssistenciais: 0,
  }
}

type BaseOcupNumericKey = Exclude<keyof BaseOcup, "unidades" | "_unidades">
const BASE_KEYS = Object.keys(novaBaseOcup()) as BaseOcupNumericKey[]

export function somaBaseOcup(dest: BaseOcup, src: Partial<BaseOcup> & { unidade?: string }): BaseOcup {
  BASE_KEYS.forEach(k => {
    dest[k] = (dest[k] || 0) + (src[k] || 0)
  })
  const unidades: string[] = []
  if (src.unidade) unidades.push(src.unidade)
  if (Array.isArray(src.unidades)) unidades.push(...src.unidades)
  if (src._unidades instanceof Set) unidades.push(...src._unidades)
  if (unidades.length) {
    if (!(dest._unidades instanceof Set)) dest._unidades = new Set(Array.isArray(dest.unidades) ? dest.unidades : [])
    unidades.map(cleanTxt).filter(Boolean).forEach(u => dest._unidades!.add(u))
  }
  return dest
}

function baseCompactaOcup(b: BaseOcup, capacidadeMultipla = (b.slotsTotal || 0) > (b.horariosTotal || 0) + 0.0001): string {
  if (!(b.slotsTotal > 0)) return ""
  const num = capacidadeMultipla ? b.slotsOcupados : b.horariosOcupados
  const den = capacidadeMultipla ? b.slotsTotal : b.horariosTotal
  const casasNum = num % 1 ? 1 : 0
  const casasDen = den % 1 ? 1 : 0
  return `${fmtNumBR(num, casasNum)}/${fmtNumBR(den, casasDen)}${capacidadeMultipla ? " vagas" : ""}`
}

export type OcupacaoFinalizada = BaseOcup & {
  pct: number | null
  ociosidade: number | null
  capacidadeMultipla: boolean
  baseCompacta: string
  baseTexto: string
  baseHorasTexto: string
  unidades: string[]
  unidadeTexto: string
}

export function finalizarBaseOcup(b: BaseOcup): OcupacaoFinalizada {
  const pct = b.slotsTotal > 0 ? b.slotsOcupados / b.slotsTotal : null
  const capacidadeMultipla = (b.slotsTotal || 0) > (b.horariosTotal || 0) + 0.0001
  const baseCompacta = baseCompactaOcup(b, capacidadeMultipla)
  const baseTexto = b.slotsTotal > 0
    ? capacidadeMultipla
      ? `${fmtNumBR(b.slotsOcupados, b.slotsOcupados % 1 ? 1 : 0)} de ${fmtNumBR(b.slotsTotal, b.slotsTotal % 1 ? 1 : 0)} vagas preenchidas = ${fmtPctOcup(pct)}`
      : `${fmtNumBR(b.horariosOcupados, b.horariosOcupados % 1 ? 1 : 0)} de ${fmtNumBR(b.horariosTotal, b.horariosTotal % 1 ? 1 : 0)} horários ocupados = ${fmtPctOcup(pct)}`
    : "Sem base de agenda para calcular ocupação"
  const baseHorasTexto = b.horasTotal > 0
    ? capacidadeMultipla
      ? `Agenda do profissional: ${fmtNumBR(b.horariosOcupados, 0)} de ${fmtNumBR(b.horariosTotal, 0)} horários com paciente · ${fmtH(b.horasOcupadas)} de ${fmtH(b.horasTotal)}`
      : `${fmtH(b.horasOcupadas)} ocupadas de ${fmtH(b.horasTotal)} disponíveis`
    : "Sem carga semanal calculada"
  const unidades = [...(b._unidades instanceof Set ? b._unidades : new Set(Array.isArray(b.unidades) ? b.unidades : []))].sort((a, b2) => a.localeCompare(b2))
  const { _unidades, ...limpo } = b
  void _unidades
  return {
    ...limpo,
    pct,
    ociosidade: pct === null ? null : 1 - pct,
    capacidadeMultipla,
    baseCompacta,
    baseTexto,
    baseHorasTexto,
    unidades,
    unidadeTexto: unidades.join(", "),
  }
}

type SlotDetalhe = {
  date?: string; dow?: number; terp?: string; unidade?: string; sala?: string
  ini: number; fim: number; ag: number; liv: number; realAg?: number; technicalAg?: number
  patients?: string[]
}

type RawSlot = SlotDetalhe & {
  unidade: string
  turno: string
  capacidade: number
  ocupados: number
  livres: number
  horariosTotal: number
  horariosOcupados: number
  horariosLivres: number
  pct: number | null
  horasTotal: number
  horasOcupadas: number
  horasLivres: number
  horasTecnicas: number
  horasAssistenciais: number
  excluirBaseOcupacao: boolean
  horarioAdministrativoEta: boolean
}

export type OcupacaoAgregada = OcupacaoFinalizada & {
  porDia: Array<{ dow: number; dia: string } & OcupacaoFinalizada>
  porTurno: Array<{ dow: number; turno: string } & OcupacaoFinalizada>
  porEspecialidade: Array<{ terp: string } & OcupacaoFinalizada>
  porUnidade: Array<{ unidade: string } & OcupacaoFinalizada>
  slots: RawSlot[]
}

export function agregarOcupacaoDeSlots(rawSlots: RawSlot[]): OcupacaoAgregada {
  const total = novaBaseOcup()
  const porDia: Record<number, BaseOcup> = { 1: novaBaseOcup(), 2: novaBaseOcup(), 3: novaBaseOcup(), 4: novaBaseOcup(), 5: novaBaseOcup() }
  const porTurno: Record<string, BaseOcup & { dow: number; turno: string }> = {}
  const porEspecialidade: Record<string, BaseOcup & { terp: string }> = {}
  const porUnidade: Record<string, BaseOcup & { unidade: string }> = {}
  const slots: RawSlot[] = []

  ;(rawSlots || []).forEach(s => {
    const unidade = normalizarUnidadeOcupacao(s.unidade)
    const item: BaseOcup = {
      slotsTotal: s.capacidade ?? 0,
      slotsOcupados: s.ocupados ?? 0,
      slotsLivres: s.livres ?? 0,
      horariosTotal: s.horariosTotal ?? 1,
      horariosOcupados: s.horariosOcupados ?? ((s.ocupados ?? 0) > 0 ? 1 : 0),
      horariosLivres: s.horariosLivres ?? ((s.ocupados ?? 0) > 0 ? 0 : 1),
      horasTotal: s.horasTotal ?? 0,
      horasOcupadas: s.horasOcupadas ?? 0,
      horasLivres: s.horasLivres ?? 0,
      horasTecnicas: s.horasTecnicas ?? 0,
      horasAssistenciais: s.horasAssistenciais ?? 0,
    }
    const slotNormalizado: RawSlot = { ...s, unidade, turno: s.turno || turnoDoHorario(s.ini) }
    const dow = s.dow as number
    if (s.excluirBaseOcupacao) {
      total.horasTecnicas += item.horasTecnicas || 0
      if (porDia[dow]) porDia[dow].horasTecnicas += item.horasTecnicas || 0
      const turno = slotNormalizado.turno
      const tk = `${dow}-${turno}`
      if (!porTurno[tk]) porTurno[tk] = { dow, turno, ...novaBaseOcup() }
      porTurno[tk].horasTecnicas += item.horasTecnicas || 0
      const terp = s.terp || "Sem especialidade"
      if (!porEspecialidade[terp]) porEspecialidade[terp] = { terp, ...novaBaseOcup() }
      porEspecialidade[terp].horasTecnicas += item.horasTecnicas || 0
      if (!porUnidade[unidade]) porUnidade[unidade] = { unidade, ...novaBaseOcup() }
      porUnidade[unidade].horasTecnicas += item.horasTecnicas || 0
      slots.push(slotNormalizado)
      return
    }
    somaBaseOcup(total, item)
    if (porDia[dow]) somaBaseOcup(porDia[dow], item)
    const turno = s.turno || turnoDoHorario(s.ini)
    const tk = `${dow}-${turno}`
    if (!porTurno[tk]) porTurno[tk] = { dow, turno, ...novaBaseOcup() }
    somaBaseOcup(porTurno[tk], item)
    const terp = s.terp || "Sem especialidade"
    if (!porEspecialidade[terp]) porEspecialidade[terp] = { terp, ...novaBaseOcup() }
    somaBaseOcup(porEspecialidade[terp], item)
    if (!porUnidade[unidade]) porUnidade[unidade] = { unidade, ...novaBaseOcup() }
    somaBaseOcup(porUnidade[unidade], item)
    slots.push(slotNormalizado)
  })

  return {
    ...finalizarBaseOcup(total),
    porDia: Object.entries(porDia).map(([dow, b]) => ({ dow: +dow, dia: DOW_PT_LONG[+dow], ...finalizarBaseOcup(b) })),
    porTurno: Object.values(porTurno).sort((a, b) => a.dow - b.dow || a.turno.localeCompare(b.turno)).map(b => ({ ...b, ...finalizarBaseOcup(b) })),
    porEspecialidade: Object.values(porEspecialidade).sort((a, b) => a.terp.localeCompare(b.terp)).map(b => ({ ...b, ...finalizarBaseOcup(b) })),
    porUnidade: Object.values(porUnidade).sort((a, b) => a.unidade.localeCompare(b.unidade)).map(b => ({ ...b, ...finalizarBaseOcup(b) })),
    slots,
  }
}

// ─── Slot data (estrutura intermediária vinda de calculo.ts) ─────────────────

export type DiaInfo = {
  dow: number
  inicioMin: number
  fimMin: number
  ag: number
  liv: number
  pacIvs: [number, number][]
  slotMap: Record<string, number>
  slotDetails: Record<string, SlotDetalhe>
}

export type SlotData = {
  diasInfo: Record<string, DiaInfo>
  terpDays: Record<string, Record<string, number>>
}

export function calcularOcupacaoSemanal(
  slotData: SlotData,
  prof: string,
  capacidadesProfissionais: Record<string, CapacidadeOverride> = {}
): OcupacaoAgregada {
  const rawSlots: RawSlot[] = []
  Object.values(slotData?.diasInfo || {}).forEach(di => {
    Object.values(di.slotDetails || {}).forEach(sd => {
      const dur = Math.max(((sd.fim || 0) - (sd.ini || 0)) / 60, 40 / 60)
      const capPadrao = getSlotCap(prof, sd.terp || "", capacidadesProfissionais)
      const etaAdminUnits = sd.terp === "Especialista Técnico de Área" ? (sd.technicalAg || 0) : 0
      const temPacienteReal = (sd.realAg || 0) > 0
      const temTecnico = etaAdminUnits > 0
      const totalUnits = temTecnico && !temPacienteReal
        ? Math.max(capPadrao, etaAdminUnits, 1)
        : Math.max(capPadrao, (sd.ag || 0) + (sd.liv || 0), sd.ag || 0, 1)
      const ocupUnits = Math.min((sd.ag || 0) + etaAdminUnits, totalUnits)
      const livreUnits = Math.max(totalUnits - ocupUnits, 0)
      const horarioOcupado = ocupUnits > 0 ? 1 : 0
      const horarioLivre = horarioOcupado ? 0 : 1
      const horarioAdministrativoEta = temTecnico && !temPacienteReal
      const apenasHorarioAdministrativo = false
      rawSlots.push({
        ...sd,
        unidade: normalizarUnidadeOcupacao(sd.unidade),
        turno: turnoDoHorario(sd.ini),
        capacidade: totalUnits,
        ocupados: ocupUnits,
        livres: livreUnits,
        horariosTotal: 1,
        horariosOcupados: horarioOcupado,
        horariosLivres: horarioLivre,
        pct: totalUnits > 0 ? ocupUnits / totalUnits : null,
        horasTotal: dur,
        horasOcupadas: horarioOcupado ? dur : 0,
        horasLivres: horarioLivre ? dur : 0,
        horasTecnicas: temTecnico ? dur : 0,
        horasAssistenciais: temPacienteReal ? dur : 0,
        excluirBaseOcupacao: apenasHorarioAdministrativo,
        horarioAdministrativoEta,
      })
    })
  })
  return agregarOcupacaoDeSlots(rawSlots)
}

// ─── Resumos de ocupação para a UI (Análise Futura) ──────────────────────────
// Migrado de calculadora-remuneracao/src/utils/ocupacao.js — os textos aqui não
// levam emoji (o app antigo prefixava com 🟢/🟡/📊); a UI do Pulsar usa ícones
// Lucide para o mesmo propósito, então essas funções devolvem só o texto.

export type ResumoOcupacao = {
  modo: "capacidade" | "horarios"
  linha1: string
  linha1Sub: string
  linha2: string
  linha2Sub: string
  principal: string
}

export function resumoOcupacaoProfissional(d: { ocupacao?: OcupacaoAgregada | OcupacaoFinalizada | null }): ResumoOcupacao {
  const oc = d?.ocupacao
  if (oc?.capacidadeMultipla) {
    const ocup = oc.slotsOcupados || 0
    const livres = oc.slotsLivres || 0
    return {
      modo: "capacidade",
      linha1: `${fmtH(oc.horasOcupadas || 0)} na agenda com paciente`,
      linha1Sub: `${fmtNumBR(ocup, ocup % 1 ? 1 : 0)} vagas preenchidas`,
      linha2: `${fmtNumBR(livres, livres % 1 ? 1 : 0)} vagas livres`,
      linha2Sub: `capacidade total: ${fmtNumBR(oc.slotsTotal || 0, (oc.slotsTotal || 0) % 1 ? 1 : 0)} vagas`,
      principal: oc.baseTexto || "—",
    }
  }
  const ocup = oc?.horariosOcupados || 0
  const livres = oc?.horariosLivres || 0
  return {
    modo: "horarios",
    linha1: `${fmtH(oc?.horasOcupadas || 0)} ocupadas`,
    linha1Sub: `${fmtNumBR(ocup, ocup % 1 ? 1 : 0)} sessões/horários ocupados`,
    linha2: `${fmtH(oc?.horasLivres || 0)} livres`,
    linha2Sub: `${fmtNumBR(livres, livres % 1 ? 1 : 0)} sessões/horários livres`,
    principal: oc?.baseTexto || "—",
  }
}

export function regraMusicoterapiaTexto(prof: string): string {
  const cap = getSlotCap(prof, "Musicoterapia")
  if (cap <= 1) return `Musicoterapia: capacidade de ${cap} paciente por horário.`
  const thiago = normKey(prof) === "thiago henrique brito do nascimento"
  return thiago
    ? "Musicoterapia: capacidade de até 3 pacientes simultâneos por horário, aplicada de segunda a sexta em todos os horários da agenda."
    : `Musicoterapia: capacidade de até ${cap} pacientes simultâneos por horário.`
}

export function regrasCapacidadeTexto(d: { prof: string; terapiaDetails: Array<{ terp: string }> }): string {
  const terps = d?.terapiaDetails?.map(t => t.terp) || []
  const partes: string[] = []
  if (terps.includes("Musicoterapia")) partes.push(regraMusicoterapiaTexto(d.prof))
  if (terps.some(t => normKey(t) === "aplicador aba (ef)" || normKey(t) === "aplicador aba ef")) {
    partes.push("Aplicador ABA EF: capacidade de até 2 pacientes simultâneos por horário, aplicada em todos os horários da agenda.")
  }
  return partes.join(" ")
}

export function temBaseOcupacaoLinha(x: Pick<OcupacaoFinalizada, "horasTotal" | "slotsTotal" | "pct"> | null | undefined): boolean {
  if (!x) return false
  return (x.horasTotal || 0) > 0 || (x.slotsTotal || 0) > 0 || x.pct !== null
}

export function resumirJornadaAgenda(slotData: SlotData): string {
  const dias = Object.values(slotData?.diasInfo || {})
  if (!dias.length) return ""
  const slots = dias.flatMap(di => Object.values(di.slotDetails || {}))
  if (!slots.length) return ""
  const morning = slots.filter(s => s.ini < 12 * 60)
  const afternoon = slots.filter(s => s.fim > 13 * 60 && s.ini >= 12 * 60)
  const mStart = morning.length ? Math.min(...morning.map(s => s.ini)) : null
  const mEnd = morning.length ? Math.max(...morning.map(s => s.fim)) : null
  const aStart = afternoon.length ? Math.min(...afternoon.map(s => s.ini)) : null
  const aEnd = afternoon.length ? Math.max(...afternoon.map(s => s.fim)) : null
  const parts: string[] = []
  if (mStart !== null && mEnd !== null) parts.push(`${hhmm(mStart)} às ${hhmm(mEnd)}`)
  if (aStart !== null && aEnd !== null) parts.push(`${hhmm(aStart)} às ${hhmm(aEnd)}`)
  if (parts.length === 2 && mEnd! <= 12 * 60 && aStart! >= 13 * 60) {
    return `${parts.join(" e ")} · intervalo de ${hhmm(mEnd)} às ${hhmm(aStart)}`
  }
  return parts.join(" e ")
}
