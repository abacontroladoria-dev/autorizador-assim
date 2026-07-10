// Migrado de calculadora-remuneracao/src/utils/relatorio.js

import { normKey } from "./constants"
import { cleanTxt, isSim, isCancelado } from "./formatacao"

export type CsvGradeRow = Record<string, unknown>

export type SessaoReal = {
  id: string
  data: string
  hora: string
  profAgenda: string
  paciente: string
  convenio: string
  unidade: string
  especialidade: string
  presencaOrbita: string
  presencaTita: string
  profCsv: string
  possuiTratativa: string
  statusCsv: string
  statusFinal: string
  motivo: string
  _idx: number
  classificacao: string
  // Novos campos para o Resumo
  diaSemana: string
  idFavorecido: string
  criacaoTratativa: string
}

/** SessaoReal com campos extras injetados por calculo.ts (papel, valorPA, etc.) */
export type SessaoRealEstendida = SessaoReal & {
  papel?: string
  valorPA?: number | null
  valorPATexto?: string
  semPA?: boolean
  funcaoPA?: string
  contratoAtualPA?: string
  cadastroContratoPendente?: boolean
  explicacaoPA?: string
}


export type ValidacaoModelo = {
  ok: boolean
  tipo: string
  nome: string
  faltantes: string[]
  ausentes: string[]
  extras: string[]
  headers: string[]
}

type ModeloRelatorio = {
  nome: string
  gruposObrigatorios: string[][]
  colunasEsperadas: string[]
}

export const MODELOS_RELATORIOS: Record<"grade" | "pe", ModeloRelatorio> = {
  grade: {
    nome: "CSV grade profissionais",
    gruposObrigatorios: [
      ["Id Unidade"], ["Nome Unidade"], ["Id Profissional"], ["Profissional"],
      ["CPF do Profissional"], ["Dia da Semana"], ["Data"], ["Hora Inicial"], ["Hora Final"],
      ["Status do Agendamento"], ["Id Favorecido"], ["Nome Favorecido"], ["Convênio"],
      ["Id Terapia"], ["Terapia"], ["Id Terapia Exibição"], ["Terapia Exibicao"],
      ["Id Sala"], ["Sala"], ["ID Agendamento"], ["Status"], ["Justificativa"],
      ["Possui Tratativa"], ["Id Profissional Tratativa"], ["Nome Profissional Tratativa"],
    ],
    colunasEsperadas: [
      "Id Unidade", "Nome Unidade", "Id Profissional", "Profissional", "CPF do Profissional",
      "Telefone do Profissional", "CBO do Profissional", "Registro do Profissional",
      "Tipo Registro do Profissional", "UF Registro do Profissional", "Dia da Semana",
      "Data", "Hora Inicial", "Hora Final", "Status do Agendamento", "Id Favorecido",
      "Nome Favorecido", "Convênio", "Id Terapia", "Terapia", "Id Terapia Exibição",
      "Terapia Exibição", "Id Sala", "Sala", "Observações da Sala", "ID Agendamento",
      "Status", "Justificativa", "Data Inicial PDI/ABA", "Data Final PDI/ABA",
      "Id Criador PDI/ABA", "Nome Criador PDI/ABA", "Id Terapia(Atividade) PDI/ABA",
      "Nome Terapia(Atividade) PDI/ABA", "Possui Tratativa", "Id Profissional Tratativa",
      "Nome Profissional Tratativa", "Criação Tratativa", "Origem Tratativa",
      "Vínculo da Evolução", "Agendamento Criado Em", "Agendamento Excluído Em",
    ],
  },
  pe: {
    nome: "agendamentos_profissionais",
    gruposObrigatorios: [
      ["Id Profissional"], ["Profissional"], ["Dia da Semana"],
      ["Data", "Data do Agendamento"], ["Hora Inicial"], ["Hora Final"],
      ["Status do Agendamento", "Especialidade"],
      ["Id Terapia", "Id Especialidade"], ["Terapia", "Especialidade"], ["Id Terapia Exibição", "Id Terapia Exibicao", "Id Especialidade"],
      ["Terapia Exibição", "Terapia Exibicao", "Especialidade"], ["Id Sala", "Sala"], ["Sala"],
      ["Favorecido", "Paciente", "Nome Favorecido"], ["Id Favorecido"],
      ["Convênio", "Convenio"],
    ],
    colunasEsperadas: [
      "Id Profissional", "Profissional", "Dia da Semana", "Data do Agendamento", "Data",
      "Hora Inicial", "Hora Final", "Status do Agendamento", "Id Terapia", "Terapia", "Id Especialidade", "Especialidade",
      "Id Terapia Exibição", "Terapia Exibição", "Id Sala", "Sala",
      "Data Criação do Agendamento", "NÚMERO DE CELULAR DO R.F.", "Favorecido",
      "Id Favorecido", "Id Convênio", "Convênio", "Unidade",
    ],
  },
}

export function parseHtmlTable(text: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(text, "text/html")
  const table = doc.querySelector("table")
  if (!table) return []
  const trs = [...table.querySelectorAll("tr")]
  if (!trs.length) return []
  const headers = [...trs[0].querySelectorAll("th,td")].map(c => cleanTxt(c.textContent))
  return trs.slice(1).map(tr => {
    const cells = [...tr.querySelectorAll("td,th")].map(c => cleanTxt(c.textContent))
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? "" })
    return obj
  }).filter(o => Object.values(o).some(Boolean))
}

export function getCol(row: CsvGradeRow, names: string[]): unknown {
  for (const n of names) { if (row[n] !== undefined) return row[n] }
  const keys = Object.keys(row)
  for (const n of names) {
    const nk = normKey(n)
    const k = keys.find(x => normKey(x) === nk)
    if (k) return row[k]
  }
  return ""
}

function normalizarCabecalho(h: string): string {
  return normKey(cleanTxt(h))
}

export function getCabecalhos(rows: CsvGradeRow[]): string[] {
  const primeiro = (rows || []).find(r => r && typeof r === "object")
  return primeiro ? Object.keys(primeiro).map(cleanTxt).filter(Boolean) : []
}

export function validarModeloRelatorio(tipo: string, rowsOrHeaders: CsvGradeRow[] | string[]): ValidacaoModelo {
  const modelo = MODELOS_RELATORIOS[tipo as "grade" | "pe"]
  if (!modelo) return { ok: true, tipo, nome: tipo, faltantes: [], ausentes: [], extras: [], headers: [] }
  const headers = Array.isArray(rowsOrHeaders) && rowsOrHeaders.every(x => typeof x === "string")
    ? (rowsOrHeaders as string[]).map(cleanTxt).filter(Boolean)
    : getCabecalhos(rowsOrHeaders as CsvGradeRow[])
  const headerKeys = headers.map(normalizarCabecalho)
  const faltantes = modelo.gruposObrigatorios
    .filter(grupo => !grupo.some(alias => headerKeys.includes(normalizarCabecalho(alias))))
    .map(grupo => grupo[0])
  const gruposPorEsperada = new Map<string, string[]>()
  modelo.gruposObrigatorios.forEach(grupo => {
    grupo.forEach(alias => gruposPorEsperada.set(normalizarCabecalho(alias), grupo))
  })
  const ausentes = modelo.colunasEsperadas.filter(col => {
    const key = normalizarCabecalho(col)
    const grupo = gruposPorEsperada.get(key)
    if (grupo) return !grupo.some(alias => headerKeys.includes(normalizarCabecalho(alias)))
    return !headerKeys.includes(key)
  })
  const aceitos = new Set([
    ...modelo.colunasEsperadas,
    ...modelo.gruposObrigatorios.flat(),
  ].map(normalizarCabecalho))
  const extras = headers.filter(h => !aceitos.has(normalizarCabecalho(h)))
  return {
    ok: faltantes.length === 0 && ausentes.length === 0 && extras.length === 0,
    tipo,
    nome: modelo.nome,
    faltantes,
    ausentes,
    extras,
    headers,
  }
}

export function classificarSessaoReal(r: Pick<SessaoReal, "id" | "profAgenda" | "profCsv" | "possuiTratativa" | "presencaOrbita" | "statusFinal" | "statusCsv">): string {
  const agenda = cleanTxt(r.profAgenda)
  const csv = cleanTxt(r.profCsv)
  const possui = isSim(r.possuiTratativa)
  const presenca = isSim(r.presencaOrbita)
  const cancelado = isCancelado(r.statusFinal) || isCancelado(r.statusCsv)
  // Evolução registrada (Possui Tratativa = Sim) sem ID Agendamento correspondente:
  // não há sessão real no sistema para essa tratativa. Precisa checagem manual
  // antes de pagar — não pode ser silenciosamente descartada nem tratada como
  // evolução normal.
  if (possui && !cleanTxt(r.id)) return "Evolução sem agendamento"
  if (cancelado && possui) return "Cancelado evoluído"
  if (!presenca && possui) return "Evolução sem presença"
  if (possui && agenda && csv && normKey(agenda) !== normKey(csv)) return "Substituição"
  if (possui) return "Evolução normal"
  if (presenca && !possui && !cancelado) return "Pendente retroativa"
  if (cancelado) return "Cancelado"
  return "Não evoluído"
}

export function normalizarGradeParaSessao(rows: CsvGradeRow[]): SessaoReal[] {
  return rows
    .filter(r => {
      const statusAgendamento = cleanTxt(getCol(r, ["Status do Agendamento"]))
      if (statusAgendamento === "Agendado") return true
      // Horário sem agendamento real (ex.: "Livre"), mas com evolução registrada
      // (Possui Tratativa = Sim) — mantém a linha para virar inconsistência
      // "Evolução sem agendamento" em vez de desaparecer silenciosamente.
      return isSim(getCol(r, ["Possui Tratativa"]))
    })
    .map((r, idx) => {
      const status = cleanTxt(getCol(r, ["Status"]))
      const justificativa = cleanTxt(getCol(r, ["Justificativa"]))
      const faltaPaciente = isCancelado(status) && normKey(justificativa).includes("falta do paciente")
      const id = cleanTxt(getCol(r, ["ID Agendamento"]))
      // Sem ID Agendamento não existe sessão real na grade — não há o que a
      // recepção/TiTa tenham confirmado presença, então não assumimos "Sim"
      // (evita sugerir que um paciente compareceu a um horário que nunca existiu).
      const obj: SessaoReal = {
        id,
        data: cleanTxt(getCol(r, ["Data"])),
        hora: cleanTxt(getCol(r, ["Hora Inicial"])),
        profAgenda: cleanTxt(getCol(r, ["Profissional"])),
        paciente: cleanTxt(getCol(r, ["Nome Favorecido"])),
        convenio: cleanTxt(getCol(r, ["Convênio", "Convenio"])),
        unidade: cleanTxt(getCol(r, ["Nome Unidade"])),
        especialidade: cleanTxt(getCol(r, ["Terapia"])),
        presencaOrbita: id ? "Sim" : "",
        presencaTita: !id ? "" : (faltaPaciente ? "Não" : "Sim"),
        profCsv: cleanTxt(getCol(r, ["Nome Profissional Tratativa"])),
        possuiTratativa: cleanTxt(getCol(r, ["Possui Tratativa"])),
        statusCsv: status,
        statusFinal: status,
        motivo: justificativa,
        _idx: idx + 1,
        classificacao: "",
        diaSemana: cleanTxt(getCol(r, ["Dia da Semana"])),
        idFavorecido: cleanTxt(getCol(r, ["Id Favorecido"])),
        criacaoTratativa: cleanTxt(getCol(r, ["Criação Tratativa"])),
      }
      obj.classificacao = classificarSessaoReal(obj)
      return obj
    }).filter(r => r.profAgenda || r.profCsv || r.paciente)
}
