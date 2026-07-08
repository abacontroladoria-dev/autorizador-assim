// Migrado de calculadora-remuneracao/src/App.jsx (useMemo `dadosPorProf`, ~linhas 652-867).
// Extraído como função pura: recebe dados + config por parâmetro, sem
// useState/useMemo/localStorage — permite teste de paridade contra a calc original.

import * as XLSX from "xlsx"
import type { CsvRow } from "@/types/cronograma"
import type { FeriadoInfo } from "@/types/remuneracao"
import { cleanTxt, timeToMin, isSim, isCancelado } from "./formatacao"
import { getCalendario, parseDateBR, type Feriado } from "./datas"
import { isFakePatient, isEtaAdminPatient } from "./pacientes"
import { normKey, PROFS_IGNORAR } from "./constants"
import { getCol, type SessaoReal, type CsvGradeRow } from "./relatorio"
import {
  calcularOcupacaoSemanal, parseUnidadeSala, resumirJornadaAgenda,
  type SlotData, type DiaInfo, type OcupacaoAgregada, type CapacidadeOverride,
} from "./ocupacao"

// ─── Especialidades / contrato (App.jsx linhas 34-46, 153-252) ───────────────

const FUNCAO_AC = "AC"
const FUNCAO_PS = "PS"
const PA_TRATADO_OUTRO_CONTRATO = "Tratado em outro contrato"
const ESPECIALIDADES_SEM_PA = [
  "Técnico Terapêutico Particular",
  "Aplicador ABA Casa",
  "Aplicador ABA Escola",
  "Aplicador ABA Casa/Escola",
]

function isEspecialidadeSemPA(esp: string): boolean {
  const n = normKey(esp)
  return ESPECIALIDADES_SEM_PA.some(x => normKey(x) === n)
}

export type PAInfo = {
  valor: number
  valorTexto?: string
  funcao: string
  label: string
  contratoAtual?: string
  cadastroContratoPendente: boolean
  semPA?: boolean
  explicacao: string
}

function paTratadoOutroContratoInfo(esp: string): PAInfo {
  return {
    valor: 0,
    valorTexto: PA_TRATADO_OUTRO_CONTRATO,
    funcao: "",
    label: esp || PA_TRATADO_OUTRO_CONTRATO,
    contratoAtual: "",
    cadastroContratoPendente: false,
    semPA: true,
    explicacao: `${esp || "Esta especialidade"} não gera PA na calculadora hoje. O valor será tratado em outro contrato de horas, fora deste sistema.`,
  }
}

function funcaoContratoPorEspecialidade(esp: string): string | null {
  const n = normKey(esp)
  if (n === "coordenador de caso" || n.includes("analista do comportamento")) return FUNCAO_AC
  if (n === "aplicador aba (ps)" || n === "aplicador aba ps") return FUNCAO_PS
  return null
}

function labelFuncaoContrato(funcao: string): string {
  if (funcao === FUNCAO_AC) return "AC"
  if (funcao === FUNCAO_PS) return "PS"
  return ""
}

function taxaPorFuncao(funcao: string, { ccPA, taxasPA }: { ccPA: number; taxasPA: Record<string, number> }): number {
  if (funcao === FUNCAO_AC) return ccPA
  if (funcao === FUNCAO_PS) return taxasPA["Aplicador ABA (PS)"] ?? 30
  return 0
}

function normalizarFuncaoContrato(v: string): string {
  const n = normKey(v)
  if (n === "ac" || n === "cc" || n.includes("coordenador de caso") || n.includes("analista do comportamento")) return FUNCAO_AC
  if (n === "ps" || n.includes("aplicador aba")) return FUNCAO_PS
  return cleanTxt(v)
}

export type ContratoAtualItem = { numero?: string; funcao: string; valorPA?: number; vigente?: boolean }
export type CadastroContratual = { nome?: string; contratosAtuais?: ContratoAtualItem[] }

function contratosAtuaisDoCadastro(cadastro: CadastroContratual | null): ContratoAtualItem[] {
  return (cadastro?.contratosAtuais || [])
    .filter(c => c && c.vigente !== false)
    .map(c => ({
      ...c,
      funcao: normalizarFuncaoContrato(c.funcao),
      // valorPA pode ser 0 de propósito ("sem PA por sessão, tratado em outro
      // contrato") — preserva a distinção entre "0 explícito" e "não informado".
      valorPA: c.valorPA != null ? Number(c.valorPA) : undefined,
    }))
    .filter(c => c.funcao || c.valorPA != null || c.numero)
}

function buscarCadastroContratual(cadastros: Record<string, CadastroContratual>, prof: string): CadastroContratual | null {
  const alvo = normKey(prof)
  if (!alvo) return null
  const entry = Object.entries(cadastros || {}).find(([nome, c]) =>
    normKey(nome) === alvo || normKey(c?.nome) === alvo
  )
  return entry ? { nome: entry[0], ...entry[1] } : null
}

function contratoLabel(c: ContratoAtualItem): string {
  const fn = labelFuncaoContrato(c.funcao) || c.funcao || "contrato"
  return c.numero ? `${fn} (${c.numero})` : fn
}

export function resolverPARow(
  r: { especialidade: string; profAgenda?: string; profCsv?: string },
  contratoFuncoes: Set<string> | undefined,
  { ccPA, taxasPA, cadastroContratual = null }: { ccPA: number; taxasPA: Record<string, number>; cadastroContratual?: CadastroContratual | null }
): PAInfo {
  if (isEspecialidadeSemPA(r.especialidade)) return paTratadoOutroContratoInfo(r.especialidade)
  const funcaoLinha = funcaoContratoPorEspecialidade(r.especialidade)
  const contratosAtuais = contratosAtuaisDoCadastro(cadastroContratual)
  if (contratosAtuais.length === 1) {
    const c = contratosAtuais[0]
    const valor = c.valorPA != null ? c.valorPA : taxaPorFuncao(c.funcao, { ccPA, taxasPA })
    return {
      valor, funcao: c.funcao, label: labelFuncaoContrato(c.funcao), contratoAtual: contratoLabel(c),
      cadastroContratoPendente: false,
      explicacao: `Contrato atual unico ${contratoLabel(c)}: o PA contratado prevalece mesmo em substituicoes.`,
    }
  }
  if (contratosAtuais.length > 1) {
    const c = contratosAtuais.find(x => x.funcao === funcaoLinha) || contratosAtuais.find(x => !x.funcao)
    if (c) {
      const valor = c.valorPA != null ? c.valorPA : taxaPorFuncao(c.funcao, { ccPA, taxasPA })
      const substituicao = !!(r.profAgenda && r.profCsv && normKey(r.profAgenda) !== normKey(r.profCsv))
      return {
        valor, funcao: c.funcao, label: labelFuncaoContrato(c.funcao), contratoAtual: contratoLabel(c),
        cadastroContratoPendente: false,
        explicacao: substituicao
          ? `Contrato atual multiplo: na substituicao predomina quem foi substituido na agenda (${labelFuncaoContrato(funcaoLinha || "") || r.especialidade}). Como o profissional tem contrato ${contratoLabel(c)}, recebe esse PA.`
          : `Contrato atual multiplo: PA aplicado pelo contrato ${contratoLabel(c)} conforme a funcao registrada na agenda.`,
      }
    }
  }
  if (!funcaoLinha) {
    const pa = r.especialidade === "Coordenador de Caso" ? ccPA : (taxasPA[r.especialidade] ?? 0)
    return { valor: pa, funcao: "", label: r.especialidade || "PA", cadastroContratoPendente: !contratosAtuais.length, explicacao: "PA conforme especialidade registrada. Cadastro de contrato atual ainda nao localizado na base." }
  }
  const funcoes = [...(contratoFuncoes || new Set())].filter(Boolean)
  const temDuploAcPs = funcoes.includes(FUNCAO_AC) && funcoes.includes(FUNCAO_PS)
  const funcaoAplicada = temDuploAcPs ? funcaoLinha : (funcoes[0] || funcaoLinha)
  const valor = taxaPorFuncao(funcaoAplicada, { ccPA, taxasPA })
  const substituicao = !!(r.profAgenda && r.profCsv && normKey(r.profAgenda) !== normKey(r.profCsv))
  const explicacao = temDuploAcPs && substituicao
    ? `Contrato duplo AC+PS: na substituição predomina a função do profissional substituído na agenda (${labelFuncaoContrato(funcaoLinha)}).`
    : temDuploAcPs
      ? `Contrato duplo AC+PS: PA aplicado conforme a função registrada na agenda (${labelFuncaoContrato(funcaoLinha)}).`
      : `Contrato único ${labelFuncaoContrato(funcaoAplicada)}: o PA do profissional prevalece mesmo em substituições.`
  return { valor, funcao: funcaoAplicada, label: labelFuncaoContrato(funcaoAplicada), cadastroContratoPendente: true, explicacao: `${explicacao} Cadastro de contrato atual pendente: regra aplicada por inferencia do relatorio ate a base ser preenchida.` }
}

export type ContratoAntigoInfo = { salario: number; chSemanal: number; contrato?: string | null }

export type AnaliseFuturaConfig = {
  taxasPA: Record<string, number>
  diarias: Record<string, number>
  etaBonus: number
  ccPA: number
  ccPE: number
  ccLimDefault: number
  presenca: number // 0-100
  feriados: Record<string, FeriadoInfo>
  extraHols?: Feriado[]
  limites?: Record<string, number> // profissional -> override do limite de pacientes CC
  antigos?: Record<string, ContratoAntigoInfo> // profissional -> contrato antigo (Passo 9; vazio até lá)
  capacidadesProfissionais?: Record<string, CapacidadeOverride>
}

export type DowBreakItem = { dow: number; cnt: number; occ: number; mensal: number; feriados: Feriado[] }
export type DiariaDetalheItem = { dow: number; occ: number; valor: number; feriados: Feriado[] }

export type TerapiaDetalhe = {
  terp: string
  sessoes: number
  pacientes: number
  pacientesList: string[]
  pa: number
  diar: number
  isCC: boolean
  isETA: boolean
  mensalDiaria: number
  mensalPA100: number
  mensalPAX: number
  mensalETA100: number
  etaSessoesSemana: number
  etaWeeks: number
  monthly100: number
  monthlyX: number
  sessoesMes100: number
  sessoesMesX: number
  dowBreak: DowBreakItem[]
  diariasDetalhe: DiariaDetalheItem[]
}

export type ProfissionalAnalise = {
  prof: string
  terapiaDetails: TerapiaDetalhe[]
  hasCC: boolean
  pacCC: number
  pe: number
  total100: number
  totalX: number
  salAntigo: number | null
  contrato: string | null
  chSemanal: number | null
  valorHoraSemAntigo: number | null
  salAntigoProporcional: number | null
  temAntigo: boolean
  delta100: number | null
  deltaX: number | null
  deltaProp100: number | null
  deltaPropX: number | null
  limiteCC: number
  alertaCC: boolean
  hasAE: boolean
  hasTA: boolean
  allPacs: string[]
  horasSemanaTotal: number
  horasAbertas: number
  horasComPac: number
  taxaOcupacao: number | null
  ocupacao: OcupacaoAgregada
  jornadaResumo: string
}

export type AnaliseFuturaResult = {
  dadosPorProf: ProfissionalAnalise[]
  feriadosMes: Feriado[]
  allTerps: string[]
  allUnits: string[]
}

type AllSlotsEntry = { diasInfo: Record<string, DiaInfo>; terpDays: Record<string, Record<string, number>> }
type MapaTerapia = {
  terp: string; sessoes: number; sessByDow: Record<number, number>; pacsSet: Set<string>
  etaSessoes: number; etaSessByDow: Record<number, number>
}
type MapaProf = { prof: string; terapias: Record<string, MapaTerapia>; pacCC: Set<string> }

export function calcularAnaliseFutura(rows: CsvRow[], config: AnaliseFuturaConfig): AnaliseFuturaResult {
  if (!rows.length) return { dadosPorProf: [], feriadosMes: [], allTerps: [], allUnits: [] }

  const {
    taxasPA, diarias, etaBonus, ccPA, ccPE, ccLimDefault, presenca, feriados,
    extraHols = [], limites = {}, antigos = {}, capacidadesProfissionais = {},
  } = config

  const datas = rows.map(r => r["Data"]).filter(Boolean).sort() as string[]
  const [yr, mo] = (datas[0] || "2026-06-01").split("-").map(Number)
  const cal = getCalendario(yr, mo, feriados, extraHols)
  const pct = presenca / 100

  const allSlots: Record<string, AllSlotsEntry> = {}
  rows.forEach(r => {
    const prof = r["Profissional"]?.trim()
    const terp = r["Terapia"]?.trim()
    const date = r["Data"]?.trim()
    const status = r["Status do Agendamento"]
    const hIni = r["Hora Inicial"]?.trim()
    const hFim = (r["Hora Final"] as string | undefined)?.trim()
    const pac = r["Nome Favorecido"]?.trim()
    const sala = cleanTxt(r["Sala"] || "")
    const unidade = parseUnidadeSala(sala)
    if (!prof || !terp || !date) return
    if (PROFS_IGNORAR.some(f => prof.includes(f))) return
    const dow = new Date(date + "T12:00:00").getDay()
    if (dow < 1 || dow > 5) return
    if (!allSlots[prof]) allSlots[prof] = { diasInfo: {}, terpDays: {} }
    if (!allSlots[prof].diasInfo[date]) {
      allSlots[prof].diasInfo[date] = { dow, inicioMin: 9999, fimMin: 0, ag: 0, liv: 0, pacIvs: [], slotMap: {}, slotDetails: {} }
    }
    const di = allSlots[prof].diasInfo[date]
    const ini = timeToMin(hIni), fim = timeToMin(hFim)
    if (ini !== null && ini < di.inicioMin) di.inicioMin = ini
    if (fim !== null && fim > di.fimMin) di.fimMin = fim
    let sd = null as DiaInfo["slotDetails"][string] | null
    if (ini !== null && fim !== null) {
      const sk = `${terp || ""}|${unidade}|${ini}|${fim}`
      if (!di.slotDetails[sk]) di.slotDetails[sk] = { date, dow, terp, unidade, sala, ini, fim, ag: 0, liv: 0, realAg: 0, technicalAg: 0, patients: [] }
      sd = di.slotDetails[sk]
    }
    const idFavorecido = r["Id Favorecido"] as string | undefined
    if (status === "Agendado") {
      const isEtaAdminSlot = terp === "Especialista Técnico de Área" && isEtaAdminPatient(pac, idFavorecido)
      const fake = isFakePatient(pac, idFavorecido)
      const contarComoOcupacao = !fake
      if (contarComoOcupacao) di.ag++
      if (ini !== null && fim !== null && contarComoOcupacao) {
        di.pacIvs.push([ini, fim])
        const sk = `${terp || ""}:${ini}`
        di.slotMap[sk] = (di.slotMap[sk] || 0) + 1
      }
      if (sd) {
        if (contarComoOcupacao) {
          sd.ag++
          sd.patients!.push(pac || "")
          sd.realAg = (sd.realAg || 0) + 1
        } else if (isEtaAdminSlot) {
          sd.technicalAg = (sd.technicalAg || 0) + 1
          sd.patients!.push(pac || "")
        }
      }
    } else {
      di.liv++
      if (sd) sd.liv++
    }
    if (!allSlots[prof].terpDays[terp]) allSlots[prof].terpDays[terp] = {}
    allSlots[prof].terpDays[terp][date] = dow
  })

  const mapa: Record<string, MapaProf> = {}
  rows.filter(r => r["Status do Agendamento"] === "Agendado" && !PROFS_IGNORAR.some(f => (r["Profissional"] || "").includes(f)))
    .forEach(r => {
      const prof = r["Profissional"]?.trim(), terp = r["Terapia"]?.trim()
      const date = r["Data"]?.trim(), pac = r["Nome Favorecido"]?.trim()
      if (!prof || !terp || !date) return
      const dow = new Date(date + "T12:00:00").getDay()
      if (dow < 1 || dow > 5) return
      const idFavorecido = r["Id Favorecido"] as string | undefined
      const isEtaAdminSlot = terp === "Especialista Técnico de Área" && isEtaAdminPatient(pac, idFavorecido)
      const fake = isFakePatient(pac, idFavorecido)
      const isNonEtaFake = fake && !isEtaAdminSlot
      if (isNonEtaFake) return
      if (!mapa[prof]) mapa[prof] = { prof, terapias: {}, pacCC: new Set() }
      if (!mapa[prof].terapias[terp]) {
        mapa[prof].terapias[terp] = { terp, sessoes: 0, sessByDow: {}, pacsSet: new Set(), etaSessoes: 0, etaSessByDow: {} }
      }
      const td = mapa[prof].terapias[terp]
      if (isEtaAdminSlot) {
        td.etaSessoes++
        td.etaSessByDow[dow] = (td.etaSessByDow[dow] || 0) + 1
      } else if (!isNonEtaFake) {
        td.sessoes++
        td.sessByDow[dow] = (td.sessByDow[dow] || 0) + 1
      }
      if (pac && !fake) {
        td.pacsSet.add(pac)
        if (terp === "Coordenador de Caso") mapa[prof].pacCC.add(pac)
      }
    })

  const profs: ProfissionalAnalise[] = Object.values(mapa).map(d => {
    const slotData: SlotData = allSlots[d.prof] || { diasInfo: {}, terpDays: {} }
    let horasSemanaTotal = 0, horasAbertas = 0, horasComPac = 0
    Object.values(slotData.diasInfo).forEach(di => {
      let fim = di.fimMin
      if (fim >= 17 * 60 + 40 && fim < 18 * 60) fim = 18 * 60
      let span = fim > di.inicioMin ? (fim - di.inicioMin) / 60 : 0
      if (di.inicioMin < 12 * 60 && fim > 13 * 60) span -= 1
      if (span < 0) span = 0
      horasSemanaTotal += span
      horasAbertas += di.liv * 40 / 60
      horasComPac += di.ag * 40 / 60
    })

    const ocupacao = calcularOcupacaoSemanal(slotData, d.prof, capacidadesProfissionais)
    const taxaOcupacao = ocupacao.pct
    const pacCC = d.pacCC.size, hasCC = "Coordenador de Caso" in d.terapias
    const limCC = limites[d.prof] ?? ccLimDefault
    const alertCC = hasCC && pacCC > limCC
    let total100 = 0, totalX = 0

    const terapiaDetails: TerapiaDetalhe[] = Object.values(d.terapias).map(td => {
      const isCC = td.terp === "Coordenador de Caso"
      const isETA = td.terp === "Especialista Técnico de Área"
      const pa = isCC ? ccPA : (taxasPA[td.terp] || 0)
      const diar = isCC ? 0 : (diarias[td.terp] || 0)
      const tDays = slotData.terpDays[td.terp] || {}
      const dowsPresent = new Set(Object.values(tDays))
      let mensalDiaria = 0
      dowsPresent.forEach(dow => { mensalDiaria += diar * (cal.counts[dow as 1 | 2 | 3 | 4 | 5] || 0) })
      let mensalPA100 = 0
      const dowBreak: DowBreakItem[] = []
      Object.entries(td.sessByDow).forEach(([dow, cnt]) => {
        const dowNum = parseInt(dow)
        const occ = cal.counts[dowNum as 1 | 2 | 3 | 4 | 5] || 0
        const mensal = cnt * occ
        mensalPA100 += mensal * pa
        const feriados = cal.feriadosAtivos.filter(f => f.dow === dowNum)
        dowBreak.push({ dow: dowNum, cnt, occ, mensal, feriados })
      })
      const mensalPAX = mensalPA100 * pct

      const diariasDetalhe: DiariaDetalheItem[] = []
      dowsPresent.forEach(dow => {
        const occ = cal.counts[dow as 1 | 2 | 3 | 4 | 5] || 0
        const feriados = cal.feriadosAtivos.filter(f => f.dow === dow)
        diariasDetalhe.push({ dow, occ, valor: diar * occ, feriados })
      })

      let mensalETA100 = 0
      let etaWeeks = 0
      if (isETA) {
        const adminDOWs = Object.keys(td.etaSessByDow || {}).map(Number)
        etaWeeks = adminDOWs.length > 0
          ? Math.max(...adminDOWs.map(dw => cal.counts[dw as 1 | 2 | 3 | 4 | 5] || 0))
          : 0
        mensalETA100 = etaWeeks * etaBonus
      }

      const monthly100 = isCC ? td.sessoes * ccPA : mensalDiaria + mensalPA100 + mensalETA100
      const monthlyX = isCC ? td.sessoes * pct * ccPA : mensalDiaria + mensalPAX + mensalETA100

      if (!isCC) {
        total100 += monthly100; totalX += monthlyX
        const sessoesMes100 = Object.entries(td.sessByDow).reduce((s, [dow, cnt]) => s + cnt * (cal.counts[parseInt(dow) as 1 | 2 | 3 | 4 | 5] || 0), 0)
        return {
          terp: td.terp, sessoes: td.sessoes, pacientes: td.pacsSet.size, pacientesList: [...td.pacsSet].sort(),
          pa, diar, isCC, isETA, mensalDiaria, mensalPA100, mensalPAX, mensalETA100,
          etaSessoesSemana: td.etaSessoes, etaWeeks, monthly100, monthlyX, sessoesMes100, sessoesMesX: 0,
          dowBreak, diariasDetalhe,
        }
      }
      const ccSess100 = Object.entries(td.sessByDow).reduce((s, [dow, cnt]) => s + cnt * (cal.counts[parseInt(dow) as 1 | 2 | 3 | 4 | 5] || 0), 0)
      const ccSessX = ccSess100 * pct
      const m100cc = ccSess100 * ccPA, mXcc = ccSessX * ccPA
      total100 += m100cc; totalX += mXcc
      return {
        terp: td.terp, sessoes: td.sessoes, pacientes: td.pacsSet.size, pacientesList: [...td.pacsSet].sort(),
        pa, diar, isCC, isETA: false, mensalDiaria: 0, mensalPA100: m100cc, mensalPAX: mXcc, mensalETA100: 0,
        etaSessoesSemana: 0, etaWeeks: 0, monthly100: m100cc, monthlyX: mXcc, sessoesMes100: ccSess100, sessoesMesX: Math.round(ccSessX),
        dowBreak, diariasDetalhe,
      }
    }).sort((a, b) => a.isCC ? -1 : b.isCC ? 1 : a.terp.localeCompare(b.terp))

    const pe = hasCC ? pacCC * ccPE : 0
    total100 += pe; totalX += pe

    const cF = antigos[d.prof] || null
    const salA = cF?.salario ?? null, temA = salA !== null && salA > 0
    const chAntiga = Number(cF?.chSemanal || 0)
    const chAtual = Number(horasSemanaTotal || 0)
    const jornadaResumo = resumirJornadaAgenda(slotData)
    const valorHoraSemAntigo = temA && chAntiga > 0 ? salA! / chAntiga : null
    const salAntigoProporcional = valorHoraSemAntigo !== null && chAtual > 0 ? valorHoraSemAntigo * chAtual : salA
    const d100 = temA ? ((total100 - salA!) / salA!) * 100 : null
    const dX = temA ? ((totalX - salA!) / salA!) * 100 : null
    const dProp100 = temA && salAntigoProporcional! > 0 ? ((total100 - salAntigoProporcional!) / salAntigoProporcional!) * 100 : null
    const dPropX = temA && salAntigoProporcional! > 0 ? ((totalX - salAntigoProporcional!) / salAntigoProporcional!) * 100 : null
    const terpN = terapiaDetails.map(t => t.terp)

    return {
      prof: d.prof, terapiaDetails, hasCC, pacCC, pe,
      total100, totalX,
      salAntigo: salA, contrato: cF?.contrato ?? null, chSemanal: chAntiga || null,
      valorHoraSemAntigo, salAntigoProporcional,
      temAntigo: temA, delta100: d100, deltaX: dX, deltaProp100: dProp100, deltaPropX: dPropX,
      limiteCC: limCC, alertaCC: alertCC,
      hasAE: terpN.some(t => t.includes("Aplicador ABA")),
      hasTA: terpN.includes("Terapia Alimentar"),
      allPacs: [...new Set(terapiaDetails.flatMap(t => t.pacientesList))].sort(),
      horasSemanaTotal, horasAbertas, horasComPac, taxaOcupacao, ocupacao, jornadaResumo,
    }
  }).sort((a, b) => a.prof.localeCompare(b.prof))

  const allTerps = [...new Set(profs.flatMap(d => d.terapiaDetails.map(t => t.terp)))].sort()
  const allUnits = [...new Set(profs.flatMap(d => d.ocupacao?.unidades || []))].filter(Boolean).sort((a, b) => a.localeCompare(b))

  return { dadosPorProf: profs, feriadosMes: cal.feriadosAtivos, allTerps, allUnits }
}

// ═══════════════════════════════════════════════════════════════════════════
// calcularRemuneracaoReal — migrado de App.jsx (useMemo `remuneracaoReal`,
// ~linhas 894-1057). Porte SEM PE (Passo 5) — os campos de PE ficam com os
// defaults de "bloqueado/inativo"; o Passo 6 preenche a partir do relatório 2.
// ═══════════════════════════════════════════════════════════════════════════

const PE_INFO_TEXTO = `Regras de PE:
1 a 7 dias com evolução válida: PE proporcional arredondado para 7 dias.
8 a 20 dias com evolução válida: PE proporcional pelos dias do mês.
21 dias ou mais com evolução válida: PE integral.
8 dias ou mais sem evolução válida: aguarda Diretoria Terapêutica, pois pode envolver paciente faltoso/desligado.
Troca de coordenador: se ninguém recebeu integral, cada coordenador com evolução recebe proporcional pelos seus dias; se alguém já recebeu integral, o outro coordenador fica para decisão da Diretoria.
Conflito na mesma semana com dois coordenadores evoluindo: aguarda Diretoria Terapêutica.`

export type PaBreakdownItem = { label: string; count: number; rate: number; total: number; explicacao?: string }
export type SessaoComPapel = SessaoReal & {
  papel: string
  valorPA?: number; valorPATexto?: string; semPA?: boolean
  funcaoPA?: string; contratoAtualPA?: string; cadastroContratoPendente?: boolean; explicacaoPA?: string
}

export type PEDetalheItem = {
  paciente: string; situacao: string; valor: number | null | undefined
  idFavorecido?: string
  inicio?: Date | null; fim?: Date | null; fimUsado?: Date | null
  dias?: number; diasEfetivos?: number; diasMes?: number
  temEvolucao?: boolean; nSessoesEvoluidas?: number
  arredondouFimMes?: boolean; trocaCoordenador?: boolean; conflitoSemana?: boolean
  observacao?: string
}

export type PEProporcionalResultado = {
  ativo: boolean
  motivo?: string
  bloqueado?: boolean
  porProf: Record<string, { total: number; pacientes: Set<string>; detalhe: PEDetalheItem[]; emAberto?: number; aguardaDiretoria?: number }>
  inicio?: string
  fim?: string
  diasMes?: number
}

export const PE_INATIVO: PEProporcionalResultado = { ativo: false, motivo: "aguardando_relatorios_2_3", porProf: {}, bloqueado: true }

export type RemuneracaoRealConfig = {
  taxasPA: Record<string, number>
  diarias: Record<string, number>
  etaBonus: number
  ccPA: number
  ccPE: number
  antigos?: Record<string, ContratoAntigoInfo>
  cadastroPrestadores?: Record<string, CadastroContratual>
  // PE (Passo 6) — omitidos = PE bloqueado/inativo, igual à calc antes do upload do relatório 2.
  peAnaliseCompleta?: boolean
  peProporcional?: PEProporcionalResultado
  peStatusMensagem?: string
}

export type ProfRemunReal = {
  prof: string
  agendadas: number
  evoluidasProprias: number
  substituicoesRealizadas: number
  substituidoPorOutro: number
  pendentes: number
  canceladas: number
  naoEvoluidas: number
  inconsistencias: number
  pacientesQtd: number
  pacientesCCQtd: number
  contrato: string
  salAntigo: number
  temAntigo: boolean
  pe: number
  diariaPeriodo: number
  diariaDetalhe: Array<{ esp: string; dias: number; rate: number; total: number }>
  etaWeeksPeriodo: number
  etaBonusPeriodo: number
  peProporcionalAtivo: boolean
  peBloqueado: boolean
  peStatusTexto: string
  peRelatorioPeriodo: string
  peDiasMes: number | null
  peDetalhe: PEDetalheItem[]
  peIntegralConfirmadoDetalhe: PEDetalheItem[]
  peIntegralConfirmadoQtd: number
  peIntegralConfirmadoValor: number
  peConfirmadoDetalhe: PEDetalheItem[]
  peConfirmadoQtd: number
  peConfirmadoValor: number
  peEmAberto: number
  peAguardaDiretoria: number
  peInfoTexto: string
  registrosNaoRealizados: number
  paBreakdown: PaBreakdownItem[]
  contratoFuncoes: string[]
  temContratoDuploAcPs: boolean
  valorConfirmado: number
  valorPotencial: number
  sessoes: SessaoComPapel[]
}

type ProfMapEntry = {
  prof: string
  agendadas: number; evoluidasProprias: number; substituicoesRealizadas: number
  substituidoPorOutro: number; pendentes: number; canceladas: number; naoEvoluidas: number
  inconsistencias: number
  pacientes: Set<string>; pacientesCC: Set<string>
  diasPorEsp: Record<string, Set<string>>
  etaAdminDatas: Set<string>
  sessoes: SessaoComPapel[]
  valorConfirmado: number; valorRecuperavel: number
  paBreakdown: Record<string, PaBreakdownItem>
  funcoesContrato: Set<string>
}

export function calcularRemuneracaoReal(evoRows: SessaoReal[], config: RemuneracaoRealConfig): ProfRemunReal[] {
  const {
    taxasPA, diarias, etaBonus, ccPA, ccPE, antigos = {}, cadastroPrestadores = {},
    peAnaliseCompleta = false, peProporcional = PE_INATIVO,
    peStatusMensagem = "PE bloqueado: importe csv_grade_profissionais e agendamentos_profissionais para calcular com segurança.",
  } = config

  const funcoesContratoPorProf: Record<string, Set<string>> = {}
  evoRows.forEach(r => {
    const agenda = cleanTxt(r.profAgenda)
    const csv = cleanTxt(r.profCsv)
    const same = !!(agenda && csv && normKey(agenda) === normKey(csv))
    const possui = isSim(r.possuiTratativa)
    const cancelado = isCancelado(r.statusFinal) || isCancelado(r.statusCsv)
    const isEtaAdminRow = r.especialidade === "Especialista Técnico de Área" && isEtaAdminPatient(r.paciente)
    if (!csv || !same || !possui || cancelado) return
    if (!isEtaAdminRow && isFakePatient(r.paciente)) return
    const fn = funcaoContratoPorEspecialidade(r.especialidade)
    if (!fn) return
    if (!funcoesContratoPorProf[csv]) funcoesContratoPorProf[csv] = new Set()
    funcoesContratoPorProf[csv].add(fn)
  })

  const profMap: Record<string, ProfMapEntry> = {}
  const ensure = (nome: string): ProfMapEntry => {
    const k = cleanTxt(nome) || "Sem profissional"
    if (!profMap[k]) {
      profMap[k] = {
        prof: k, agendadas: 0, evoluidasProprias: 0, substituicoesRealizadas: 0,
        substituidoPorOutro: 0, pendentes: 0, canceladas: 0, naoEvoluidas: 0,
        inconsistencias: 0,
        pacientes: new Set(), pacientesCC: new Set(),
        diasPorEsp: {}, etaAdminDatas: new Set(),
        sessoes: [], valorConfirmado: 0, valorRecuperavel: 0,
        paBreakdown: {}, funcoesContrato: funcoesContratoPorProf[k] || new Set(),
      }
    }
    return profMap[k]
  }
  const addPaBreakdown = (p: ProfMapEntry, info: PAInfo, valor: number) => {
    const key = info.label || info.funcao || "PA"
    if (!p.paBreakdown[key]) p.paBreakdown[key] = { label: key, count: 0, rate: valor, total: 0, explicacao: info.explicacao }
    p.paBreakdown[key].count++
    p.paBreakdown[key].total += valor
    p.paBreakdown[key].rate = valor
  }

  evoRows.forEach(r => {
    const agenda = cleanTxt(r.profAgenda)
    const csv = cleanTxt(r.profCsv)
    const same = !!(agenda && csv && normKey(agenda) === normKey(csv))
    const possui = isSim(r.possuiTratativa)
    const presencaRow = isSim(r.presencaOrbita)
    const cancelado = isCancelado(r.statusFinal) || isCancelado(r.statusCsv)
    const isEtaAdminRow = r.especialidade === "Especialista Técnico de Área" && isEtaAdminPatient(r.paciente)
    if (!isEtaAdminRow && isFakePatient(r.paciente)) return
    const fallbackPA = isEspecialidadeSemPA(r.especialidade)
      ? 0
      : isEtaAdminRow ? (taxasPA["Especialista Técnico de Área"] ?? 50) : (taxasPA[r.especialidade] ?? 0)
    const eInc = ["Evolução sem presença", "Cancelado evoluído"].includes(r.classificacao)
    if (agenda) {
      const a = ensure(agenda)
      a.agendadas++
      if (r.paciente && !isFakePatient(r.paciente)) {
        a.pacientes.add(r.paciente)
        if (r.especialidade === "Coordenador de Caso") a.pacientesCC.add(r.paciente)
      }
      if (r.especialidade && r.data) {
        if (!a.diasPorEsp[r.especialidade]) a.diasPorEsp[r.especialidade] = new Set()
        a.diasPorEsp[r.especialidade].add(r.data)
      }
      if (isEtaAdminRow && r.data) a.etaAdminDatas.add(r.data)
      a.sessoes.push({ ...r, papel: "Agenda" })
      if (eInc) { a.inconsistencias++ }
      else if (possui && same) {
        const paInfo = resolverPARow(r, a.funcoesContrato, {
          ccPA, taxasPA,
          cadastroContratual: buscarCadastroContratual(cadastroPrestadores, agenda),
        })
        const pa = paInfo.valor ?? fallbackPA
        a.evoluidasProprias++
        a.valorConfirmado += pa
        if (!paInfo.semPA) addPaBreakdown(a, paInfo, pa)
        a.sessoes[a.sessoes.length - 1] = { ...a.sessoes[a.sessoes.length - 1], valorPA: pa, valorPATexto: paInfo.valorTexto || "", semPA: paInfo.semPA || false, funcaoPA: paInfo.label, contratoAtualPA: paInfo.contratoAtual || "", cadastroContratoPendente: paInfo.cadastroContratoPendente, explicacaoPA: paInfo.explicacao }
      }
      else if (possui && csv && !same) { a.substituidoPorOutro++ }
      else if (presencaRow && !possui && !cancelado) { a.pendentes++; a.valorRecuperavel += fallbackPA }
      else if (cancelado && !possui) { a.canceladas++ }
      else { a.naoEvoluidas++ }
    }
    if (possui && csv && agenda && !same) {
      const s = ensure(csv)
      if (r.paciente) s.pacientes.add(r.paciente)
      s.sessoes.push({ ...r, papel: "Substituição realizada" })
      if (!eInc) {
        const paInfo = resolverPARow(r, s.funcoesContrato, {
          ccPA, taxasPA,
          cadastroContratual: buscarCadastroContratual(cadastroPrestadores, csv),
        })
        const pa = paInfo.valor ?? fallbackPA
        s.substituicoesRealizadas++
        s.valorConfirmado += pa
        if (!paInfo.semPA) addPaBreakdown(s, paInfo, pa)
        s.sessoes[s.sessoes.length - 1] = { ...s.sessoes[s.sessoes.length - 1], valorPA: pa, valorPATexto: paInfo.valorTexto || "", semPA: paInfo.semPA || false, funcaoPA: paInfo.label, contratoAtualPA: paInfo.contratoAtual || "", cadastroContratoPendente: paInfo.cadastroContratoPendente, explicacaoPA: paInfo.explicacao }
      } else {
        s.inconsistencias++
      }
    }
  })

  if (peAnaliseCompleta && peProporcional.ativo) {
    Object.keys(peProporcional.porProf || {}).forEach(prof => ensure(prof))
  }

  return Object.values(profMap).map(p => {
    const c = antigos[p.prof] || null
    const usarRelatorioPE = peAnaliseCompleta && peProporcional.ativo
    const peProp = usarRelatorioPE ? peProporcional.porProf[p.prof] : null
    const pe = usarRelatorioPE ? (peProp?.total || 0) : 0
    const pacientesCCQtd = usarRelatorioPE ? (peProp?.pacientes?.size || 0) : p.pacientesCC.size
    const peDetalhe = peProp ? [...peProp.detalhe].sort((a, b) => a.paciente.localeCompare(b.paciente)) : []
    const peIntegralConfirmadoDetalhe = peDetalhe.filter(x => x.situacao === "PE integral" && x.valor !== null && x.valor !== undefined)
    const peConfirmadoDetalhe = peDetalhe.filter(x => x.valor !== null && x.valor !== undefined && Number(x.valor || 0) > 0)

    let diariaPeriodo = 0
    const diariaDetalhe: Array<{ esp: string; dias: number; rate: number; total: number }> = []
    Object.entries(p.diasPorEsp).forEach(([esp, datas]) => {
      const rate = diarias[esp] || 0
      if (rate > 0) { const tot = datas.size * rate; diariaPeriodo += tot; diariaDetalhe.push({ esp, dias: datas.size, rate, total: tot }) }
    })

    let etaWeeksPeriodo = 0, etaBonusPeriodo = 0
    if (p.etaAdminDatas.size > 0) {
      const weekSet = new Set<string>()
      p.etaAdminDatas.forEach(dataStr => {
        const d = parseDateBR(dataStr)
        if (!d) return
        const wk = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7)
        weekSet.add(`${d.getFullYear()}-W${wk}`)
      })
      etaWeeksPeriodo = weekSet.size
      etaBonusPeriodo = etaWeeksPeriodo * etaBonus
    }

    return {
      ...p,
      pacientesQtd: p.pacientes.size,
      pacientesCCQtd,
      contrato: c?.contrato || "",
      salAntigo: c?.salario || 0,
      temAntigo: (c?.salario || 0) > 0,
      pe, diariaPeriodo, diariaDetalhe, etaWeeksPeriodo, etaBonusPeriodo,
      peProporcionalAtivo: usarRelatorioPE,
      peBloqueado: !usarRelatorioPE && p.pacientesCC.size > 0,
      peStatusTexto: peStatusMensagem,
      peRelatorioPeriodo: peProporcional.inicio ? `${peProporcional.inicio} a ${peProporcional.fim}` : "",
      peDiasMes: peProporcional.diasMes || null,
      peDetalhe,
      peIntegralConfirmadoDetalhe,
      peIntegralConfirmadoQtd: peIntegralConfirmadoDetalhe.length,
      peIntegralConfirmadoValor: peIntegralConfirmadoDetalhe.reduce((s, x) => s + Number(x.valor || 0), 0),
      peConfirmadoDetalhe,
      peConfirmadoQtd: peConfirmadoDetalhe.length,
      peConfirmadoValor: peConfirmadoDetalhe.reduce((s, x) => s + Number(x.valor || 0), 0),
      peEmAberto: peProp?.emAberto || 0,
      peAguardaDiretoria: peProp?.aguardaDiretoria || 0,
      peInfoTexto: PE_INFO_TEXTO,
      registrosNaoRealizados: p.pendentes + p.naoEvoluidas,
      paBreakdown: Object.values(p.paBreakdown),
      contratoFuncoes: [...(p.funcoesContrato || [])],
      temContratoDuploAcPs: p.funcoesContrato?.has(FUNCAO_AC) && p.funcoesContrato?.has(FUNCAO_PS),
      valorConfirmado: p.valorConfirmado + pe + diariaPeriodo + etaBonusPeriodo,
      valorPotencial: p.valorConfirmado + p.valorRecuperavel + pe + diariaPeriodo + etaBonusPeriodo,
    }
  }).sort((a, b) => b.valorConfirmado - a.valorConfirmado)
}

// ═══════════════════════════════════════════════════════════════════════════
// PE (Pagamento por Evolução) — migrado de App.jsx (~linhas 254-271, 315-544).
// Passo 6: normalizarRelatorioPE, aplicarFaixasPE, calcularPEProporcional.
// ═══════════════════════════════════════════════════════════════════════════

const PE_DIAS_ARRED_7 = 7
const PE_DIAS_INTEGRAL = 21
const PE_NOVA_REGRA_INICIO = new Date(2026, 5, 1)

function parseDateAny(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const s = cleanTxt(v)
  if (!s) return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) {
    const y = Number(br[3].length === 2 ? `20${br[3]}` : br[3])
    return new Date(y, Number(br[2]) - 1, Number(br[1]))
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const n = Number(s)
  if (Number.isFinite(n) && n > 30000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  return null
}

function fmtDateBRLocal(d: Date | null): string {
  if (!d) return ""
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

function diasCorridosLocal(inicio: Date, fim: Date): number {
  return Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1)
}

function ultimoDiaMesLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function inicioUltimaSemanaMesLocal(d: Date): Date {
  const fim = ultimoDiaMesLocal(d)
  const day = fim.getDay()
  const diasAteSegunda = day === 0 ? 6 : day - 1
  return new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - diasAteSegunda)
}

function semanaISODateLocal(d: Date): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = dt.getDay() || 7
  dt.setDate(dt.getDate() + 4 - day)
  const yearStart = new Date(dt.getFullYear(), 0, 1)
  return `${dt.getFullYear()}-W${String(Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`
}

export function parsePeriodoArquivo(nome: string): { inicio: Date; fim: Date } | null {
  const m = String(nome || "").match(/(\d{4})(\d{2})(\d{2})[_-](\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return {
    inicio: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    fim: new Date(Number(m[4]), Number(m[5]) - 1, Number(m[6])),
  }
}

export type PERow = {
  _idx: number
  prof: string
  paciente: string
  idFavorecido: string
  especialidade: string
  status: string
  dataRaw: unknown
  dataObj: Date | null
}

export function normalizarRelatorioPE(rows: CsvGradeRow[], periodoArquivo: { inicio: Date; fim: Date } | null = null): PERow[] {
  return (rows || []).map((r, idx): PERow => {
    const prof = cleanTxt(getCol(r, ["Profissional Agenda", "Profissional", "Nome Profissional", "profissional"]))
    const paciente = cleanTxt(getCol(r, ["Paciente", "Nome Favorecido", "Favorecido", "Nome Paciente"]))
    const idFavorecido = cleanTxt(getCol(r, ["Id Favorecido", "ID Favorecido", "Id Paciente", "ID Paciente"]))
    const especialidade = cleanTxt(getCol(r, ["Especialidade", "Terapia", "Terapia Exibição", "Terapia Exibicao"]))
    const status = cleanTxt(getCol(r, ["Status do Agendamento", "Status Final", "Status"]))
    const dataRaw = getCol(r, ["Data do Agendamento", "Data", "DATA", "Dt Agenda", "Data Agenda"])
    let dataObj = parseDateAny(dataRaw)
    if (periodoArquivo && dataObj && !(dataObj >= periodoArquivo.inicio && dataObj <= periodoArquivo.fim)) dataObj = null
    return { _idx: idx + 1, prof, paciente, idFavorecido, especialidade, status, dataRaw, dataObj }
  }).filter(r => r.prof && r.paciente && r.dataObj)
}

export type FaixaPE = { situacao: string; valor: number | null; diasEfetivos: number; observacao: string }

export function aplicarFaixasPE(dias: number, diasMes: number, temEvolucao: boolean, ccPE: number): FaixaPE {
  const proporcional = (d: number) => {
    const pct = Math.round((d / diasMes) * 10000) / 10000
    return Math.round(pct * ccPE * 100) / 100
  }
  if (dias <= 7) {
    if (dias >= 1 && dias <= 7 && temEvolucao) {
      const valor = proporcional(PE_DIAS_ARRED_7)
      return {
        situacao: "PE proporcional (arredondado 7 dias)", valor, diasEfetivos: PE_DIAS_ARRED_7,
        observacao: `Dias reais (${dias}d) arredondados para ${PE_DIAS_ARRED_7}d para cálculo proporcional.`,
      }
    }
    return { situacao: "PE zero - até 7 dias sem evolução", valor: 0, diasEfetivos: dias, observacao: "Até 7 dias sem evolução válida não gera PE automático." }
  }
  if (!temEvolucao) {
    return {
      situacao: "Aguarda Diretoria Terapêutica - sem evolução", valor: null, diasEfetivos: dias,
      observacao: `${dias} dias agendados, 0 evolução válida. Diretoria deve decidir se haverá pagamento por contexto clínico/operacional.`,
    }
  }
  if (dias >= PE_DIAS_INTEGRAL) {
    return { situacao: "PE integral", valor: Math.round(ccPE * 100) / 100, diasEfetivos: dias, observacao: "21 dias ou mais com evolução gera PE integral." }
  }
  const valor = proporcional(dias)
  return {
    situacao: "PE proporcional", valor, diasEfetivos: dias,
    observacao: `${dias}d ÷ ${diasMes}d × PE = R$ ${valor.toFixed(2).replace(".", ",")}.`,
  }
}

type GrupoPE = {
  prof: string; profKey: string; paciente: string; pacienteKey: string; idFavorecido: string
  datas: Date[]; inicio: Date; fim: Date; fimUsado: Date; arredondouFimMes: boolean
}

export function calcularPEProporcional(
  peRows: PERow[], ccPE: number, evoRows: SessaoReal[] = [], coordsAtivos: string[] = []
): PEProporcionalResultado {
  const datas = peRows.map(r => r.dataObj).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())
  if (!datas.length) return { ativo: false, motivo: "sem_relatorio", porProf: {} }
  const inicio = datas[0]
  const fim = datas[datas.length - 1]
  const diasMes = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate()
  const porProf: PEProporcionalResultado["porProf"] = {}

  const ativosSet = new Set((coordsAtivos || []).map(normKey).filter(Boolean))
  const grupos: Record<string, GrupoPE> = {}
  const pacSemCoords: Record<string, Set<string>> = {}
  const coordLabel: Record<string, string> = {}

  peRows.forEach(r => {
    const fn = funcaoContratoPorEspecialidade(r.especialidade)
    const statusKey = normKey(r.status)
    if (fn !== FUNCAO_AC) return
    if (ativosSet.size && !ativosSet.has(normKey(r.prof))) return
    if (statusKey && statusKey.includes("livre")) return
    if (isFakePatient(r.paciente, r.idFavorecido)) return
    const pacienteKey = normKey(r.paciente)
    const profKey = normKey(r.prof)
    const k = `${profKey}||${pacienteKey}`
    coordLabel[profKey] = coordLabel[profKey] || r.prof
    if (!grupos[k]) grupos[k] = { prof: r.prof, profKey, paciente: r.paciente, pacienteKey, idFavorecido: r.idFavorecido, datas: [], inicio: r.dataObj!, fim: r.dataObj!, fimUsado: r.dataObj!, arredondouFimMes: false }
    grupos[k].datas.push(r.dataObj!)
    const semKey = `${pacienteKey}||${semanaISODateLocal(r.dataObj!)}`
    if (!pacSemCoords[semKey]) pacSemCoords[semKey] = new Set()
    pacSemCoords[semKey].add(profKey)
  })

  Object.values(grupos).forEach(g => {
    const ds = g.datas.sort((a, b) => a.getTime() - b.getTime())
    const min = ds[0], max = ds[ds.length - 1]
    const fimMes = ultimoDiaMesLocal(min)
    const inicioUltimaSemana = inicioUltimaSemanaMesLocal(min)
    const arredondouFimMes = max >= inicioUltimaSemana && max < fimMes
    const fimUsado = arredondouFimMes ? fimMes : max
    Object.assign(g, { inicio: min, fim: max, fimUsado, arredondouFimMes })
  })

  const paresAgendados = new Set(Object.keys(grupos))
  const paresEvolucao: Record<string, Date[]> = {}
  const pacSemEvolucao: Record<string, Set<string>> = {}
  const substituicoesPE: Array<{ paciente: string; evoluiu: string; coordenadoresAgenda: string[]; data: Date; observacao: string }> = []

  evoRows.forEach(r => {
    if (funcaoContratoPorEspecialidade(r.especialidade) !== FUNCAO_AC) return
    if (!isSim(r.possuiTratativa)) return
    if (isCancelado(r.statusFinal) || isCancelado(r.statusCsv)) return
    if (isFakePatient(r.paciente)) return
    const prof = cleanTxt(r.profCsv)
    const pacienteKey = normKey(r.paciente)
    const data = parseDateBR(r.data)
    if (!prof || !pacienteKey || !data) return
    if (ativosSet.size && !ativosSet.has(normKey(prof))) return
    const parKey = `${normKey(prof)}||${pacienteKey}`
    if (!paresAgendados.has(parKey)) {
      const coordsAgendaPaciente = Object.values(grupos)
        .filter(g => g.pacienteKey === pacienteKey)
        .map(g => g.prof)
        .filter(Boolean)
      if (coordsAgendaPaciente.length) {
        substituicoesPE.push({
          paciente: r.paciente, evoluiu: prof,
          coordenadoresAgenda: [...new Set(coordsAgendaPaciente)].sort(),
          data, observacao: "Evolução de AC sem par coordenador-paciente no relatório de agendamentos. Tratar como substituição/PA, não como PE automático.",
        })
      }
      return
    }
    if (!paresEvolucao[parKey]) paresEvolucao[parKey] = []
    paresEvolucao[parKey].push(data)
    const semKey = `${pacienteKey}||${semanaISODateLocal(data)}`
    if (!pacSemEvolucao[semKey]) pacSemEvolucao[semKey] = new Set()
    pacSemEvolucao[semKey].add(normKey(prof))
  })

  const conflitosPorPaciente: Record<string, Array<{ semKey: string; coords: Set<string> }>> = {}
  Object.entries(pacSemCoords).forEach(([semKey, coords]) => {
    if (coords.size <= 1) return
    const pacienteKey = semKey.split("||")[0]
    if (!conflitosPorPaciente[pacienteKey]) conflitosPorPaciente[pacienteKey] = []
    conflitosPorPaciente[pacienteKey].push({ semKey, coords })
  })

  const pacienteSemanaCoordUnico: Record<string, string> = {}
  Object.entries(pacSemCoords).forEach(([semKey, coords]) => {
    if (coords.size === 1) pacienteSemanaCoordUnico[semKey] = [...coords][0]
  })
  const trocasPorPaciente: Record<string, Set<string>> = {}
  Object.keys(grupos).forEach(k => {
    const pacienteKey = k.split("||")[1]
    if (trocasPorPaciente[pacienteKey]) return
    const semanas = Object.entries(pacienteSemanaCoordUnico)
      .filter(([semKey]) => semKey.startsWith(`${pacienteKey}||`))
      .sort(([a], [b]) => a.localeCompare(b))
    const periodos: string[] = []
    semanas.forEach(([, coord]) => {
      if (!periodos.length || periodos[periodos.length - 1] !== coord) periodos.push(coord)
    })
    if (new Set(periodos).size > 1) trocasPorPaciente[pacienteKey] = new Set(periodos)
  })

  const regrasBasePorPar: Record<string, FaixaPE> = {}
  const pacientesComPEIntegral = new Set<string>()
  Object.values(grupos).forEach(g => {
    const dias = diasCorridosLocal(g.inicio, g.fimUsado)
    const parKey = `${g.profKey}||${g.pacienteKey}`
    const evs = paresEvolucao[parKey] || []
    const regraBase = aplicarFaixasPE(dias, diasMes, evs.length > 0, ccPE)
    regrasBasePorPar[parKey] = regraBase
    if (regraBase.situacao === "PE integral") pacientesComPEIntegral.add(g.pacienteKey)
  })

  Object.values(grupos).forEach(g => {
    const max = g.fim
    const pacienteKey = g.pacienteKey
    const profKey = g.profKey
    const parKey = `${profKey}||${pacienteKey}`
    const arredondouFimMes = g.arredondouFimMes
    const fimUsado = g.fimUsado
    const dias = diasCorridosLocal(g.inicio, fimUsado)
    const evs = paresEvolucao[parKey] || []
    let regra = regrasBasePorPar[parKey] || aplicarFaixasPE(dias, diasMes, evs.length > 0, ccPE)
    const conflitos = conflitosPorPaciente[pacienteKey] || []
    const troca = trocasPorPaciente[pacienteKey]?.has(profKey)
    if (conflitos.length) {
      const esteEvoluiuConflito = conflitos.some(c => pacSemEvolucao[c.semKey]?.has(profKey))
      const outroEvoluiuConflito = conflitos.some(c => [...(pacSemEvolucao[c.semKey] || new Set())].some(coord => coord !== profKey))
      if (!evs.length) {
        regra = { ...regra, observacao: `Conflito semanal identificado, mas este coordenador não tem evolução válida. ${regra.observacao || ""}`.trim() }
      } else if (esteEvoluiuConflito && outroEvoluiuConflito) {
        regra = {
          situacao: "Conflito - ambos evoluíram", valor: null, diasEfetivos: dias,
          observacao: "Diretoria Terapêutica deve definir o PE: há dois coordenadores na mesma semana e ambos evoluíram.",
        }
      }
    } else if (troca && pacientesComPEIntegral.has(pacienteKey) && regra.situacao !== "PE integral") {
      regra = {
        situacao: "Aguarda Diretoria Terapêutica - troca com PE integral", valor: null, diasEfetivos: dias,
        observacao: `Paciente teve troca de coordenador no mês (${[...(trocasPorPaciente[pacienteKey] || [])].map(k => coordLabel[k] || k).join(", ")}). Outro coordenador já atingiu PE integral; Diretoria deve definir se este período também terá pagamento.`,
      }
    }
    if (arredondouFimMes) {
      regra = { ...regra, observacao: `Período estendido de ${fmtDateBRLocal(max)} para ${fmtDateBRLocal(fimUsado)} por tocar a última semana. ${regra.observacao || ""}`.trim() }
    }
    const valor = regra.valor
    if (!porProf[g.prof]) porProf[g.prof] = { total: 0, pacientes: new Set(), detalhe: [], emAberto: 0, aguardaDiretoria: 0 }
    if (valor !== null && valor !== undefined) porProf[g.prof].total += valor
    else if (regra.situacao.includes("Diretoria") || regra.situacao.includes("Conflito")) porProf[g.prof].aguardaDiretoria = (porProf[g.prof].aguardaDiretoria || 0) + 1
    else porProf[g.prof].emAberto = (porProf[g.prof].emAberto || 0) + 1
    porProf[g.prof].pacientes.add(g.idFavorecido || g.paciente)
    porProf[g.prof].detalhe.push({
      paciente: g.paciente, situacao: regra.situacao, valor,
      idFavorecido: g.idFavorecido,
      inicio: g.inicio, fim: max, fimUsado,
      dias, diasEfetivos: regra.diasEfetivos, diasMes,
      temEvolucao: evs.length > 0, nSessoesEvoluidas: evs.length,
      arredondouFimMes, trocaCoordenador: !!troca, conflitoSemana: conflitos.length > 0,
      observacao: regra.observacao,
    })
  })

  return {
    ativo: true, inicio: fmtDateBRLocal(inicio), fim: fmtDateBRLocal(fim), diasMes, porProf,
  }
}
