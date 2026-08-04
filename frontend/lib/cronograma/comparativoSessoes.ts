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
  /** Hora inicial no formato "HH:MM" — usada só pra identificar sessões duplicadas do Assim Saúde (ver dedupAssimSaude). */
  hora: string
  idTerapia: number | null
  terapia: string
  idProfissional: number | null
  profissional: string
  /**
   * Índice do dia da semana (0 = domingo, ver DIAS_SEMANA_LABEL), de
   * preferência lido do texto "Dia da Semana"/dia_semana que a própria
   * fonte (API ou relatório) já traz — NÃO recalculado a partir de `data` via
   * `Date`, que é frágil a fuso horário (ver diaSemanaIndexDeTexto). Só cai
   * pro cálculo via data quando a fonte não informa o dia da semana.
   */
  diaSemanaIndice: number | null
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

/**
 * Normaliza um valor de horário cru (texto "HH:MM[:SS]" ou serial numérico de
 * XLSX — a leitura com `raw:true` traz células de hora como fração do dia) pro
 * formato "HH:MM" — usado só como parte da chave de dedup do Assim Saúde.
 */
function parseHoraAgendamento(raw: string): string {
  const s = raw.trim()
  if (!s) return ""
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`
  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = Number(s)
    const fracDia = num - Math.floor(num)
    const totalMin = Math.round(fracDia * 24 * 60)
    return `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`
  }
  return s
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
    const data = normalizarDataAgendamento(pick(row, ["Data do Agendamento", "Data", "data"]))
    const diaSemanaTexto = pick(row, ["Dia da Semana", "Dia Semana", "dia_semana"])
    out.push({
      idFavorecido: idFavorecido !== null && !isNaN(idFavorecido) ? idFavorecido : null,
      paciente: pick(row, ["Favorecido", "Nome Favorecido", "Paciente", "paciente"]),
      sala,
      unidade: mapearUnidade(sala),
      convenio: pick(row, ["Convênio", "Convenio", "convenio"]),
      data,
      hora: parseHoraAgendamento(pick(row, ["Hora Inicial", "Hora", "hora"])),
      idTerapia: (() => {
        const s = pick(row, ["Id Especialidade", "IdEspecialidade", "Id_Especialidade", "Id Terapia", "IdTerapia", "Id_Terapia"])
        const n = s ? Number(s.replace(/\D/g, "")) : NaN
        return isNaN(n) ? null : n
      })(),
      terapia: pick(row, ["Especialidade", "especialidade", "Terapia", "terapia"]),
      idProfissional: (() => {
        const s = pick(row, ["Id Profissional", "IdProfissional", "Id_Profissional"])
        const n = s ? Number(s.replace(/\D/g, "")) : NaN
        return isNaN(n) ? null : n
      })(),
      profissional: pick(row, ["Profissional", "profissional"]),
      diaSemanaIndice: diaSemanaIndiceDe(diaSemanaTexto, data),
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
  hora_inicial: string | null
  terapia_id: number | null
  terapia_nome: string | null
  dia_semana: string | null
  profissional_id: number | null
  profissional_nome: string | null
}

/** Normaliza linhas vindas da API (csv_grade_profissionais), aplicando os mesmos filtros. */
export function normalizarLinhasApi(raw: GradeComparativoRaw[]): SessaoComparativo[] {
  const out: SessaoComparativo[] = []
  for (const row of raw) {
    if (!isAgendado(row.status_agendamento)) continue
    if (row.paciente_id !== null && PACIENTES_FICTICIOS_IDS.has(row.paciente_id)) continue
    const data = normalizarDataAgendamento(row.data ?? "")
    out.push({
      idFavorecido: row.paciente_id,
      paciente: row.paciente_nome ?? "",
      sala: row.sala_nome ?? "",
      unidade: mapearUnidade(row.sala_nome),
      convenio: row.convenio_nome ?? "",
      data,
      hora: (row.hora_inicial ?? "").slice(0, 5),
      idTerapia: row.terapia_id,
      terapia: row.terapia_nome ?? "",
      idProfissional: row.profissional_id,
      profissional: row.profissional_nome ?? "",
      diaSemanaIndice: diaSemanaIndiceDe(row.dia_semana, data),
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
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    // new Date("aaaa-mm-dd") sem hora é interpretado como UTC — em fuso
    // negativo (Brasil, UTC-3) .getDay() then volta pro dia anterior. Construir
    // a partir dos componentes evita isso: fica sempre meia-noite local.
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return isNaN(d.getTime()) ? null : d
  }
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
    return isNaN(d.getTime()) ? null : d
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    // Serial do Excel é só uma contagem de dias (sem fuso) — a aritmética do
    // epoch é inerentemente UTC, então extrai ano/mês/dia via getUTC* e
    // reconstrói em hora LOCAL. Só usar Date.UTC(...) direto (sem esse passo)
    // reproduz o mesmo bug da branch ISO: .getDay() convertendo pro fuso do
    // navegador e voltando um dia (Brasil, UTC-3).
    const serial = Math.floor(Number(s))
    const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    const d = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Normaliza a data de agendamento pro formato canônico ISO "aaaa-mm-dd",
 * independente do formato de origem (ISO, brasileiro ou serial do Excel) —
 * garante comparação estável de data entre linhas (ex.: dedupAssimSaude),
 * mesmo quando duas linhas da mesma sessão (dois profissionais, mesmo
 * horário) saem do XLSX com formatos de data diferentes (célula mesclada
 * formatada como texto numa linha e como serial na outra, por exemplo).
 */
function normalizarDataAgendamento(raw: string): string {
  const d = parseDataAgendamento(raw)
  if (!d) return raw.trim()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmtDataCurta(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Formata a data de uma sessão (qualquer formato aceito por parseDataAgendamento) como "dd/mm/aaaa" pra exibição — usado no drill-down "Por Paciente". Retorna o valor cru se não for parseável. */
export function formatarDataSessao(raw: string): string {
  const d = parseDataAgendamento(raw)
  if (!d) return raw
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

/**
 * A partir de 18/01/2026 o relatório "agendamentos_profissionais" passou a
 * separar corretamente as duas clínicas que antes vinham misturadas no mesmo
 * arquivo (bug de origem só do início de janeiro/2026) — datas anteriores a
 * essa não são confiáveis pra este comparativo. Bloqueia o upload de qualquer
 * arquivo que contenha sessão anterior a essa data (ver validarDataMinimaUpload).
 */
export const DATA_MINIMA_UPLOAD = "2026-01-18"

/** Rejeita o upload (lançando erro) se alguma linha tiver data anterior a DATA_MINIMA_UPLOAD — ver o motivo lá. */
export function validarDataMinimaUpload(rows: SessaoComparativo[]): void {
  let maisAntiga: string | null = null
  for (const r of rows) {
    if (r.data && r.data < DATA_MINIMA_UPLOAD && (!maisAntiga || r.data < maisAntiga)) maisAntiga = r.data
  }
  if (maisAntiga) {
    throw new Error(
      `Arquivo contém sessão em ${formatarDataSessao(maisAntiga)} — datas anteriores a 18/01/2026 não são permitidas (relatório misturava duas clínicas antes dessa data).`,
    )
  }
}

/** Nomes dos dias da semana, indexados como Date.getDay() (0 = domingo). */
export const DIAS_SEMANA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

/** Índice do dia da semana (0 = domingo, ver DIAS_SEMANA_LABEL) de uma data de sessão. Usado pra montar a visão em formato de agenda no drill-down "Por Paciente". */
export function diaSemanaIndex(raw: string): number | null {
  const d = parseDataAgendamento(raw)
  return d ? d.getDay() : null
}

const DIA_SEMANA_TEXTO_PARA_INDICE: Record<string, number> = {
  domingo: 0, "segunda-feira": 1, segunda: 1, "terca-feira": 2, terca: 2,
  "quarta-feira": 3, quarta: 3, "quinta-feira": 4, quinta: 4, "sexta-feira": 5, sexta: 5, sabado: 6,
}

/**
 * Índice do dia da semana a partir do texto que a própria fonte já informa
 * ("Dia da Semana" do relatório, `dia_semana` da API) — evita recalcular via
 * `Date`, que se mostrou frágil a fuso horário mesmo depois de corrigido em
 * duas frentes (ISO e serial do Excel, ver parseDataAgendamento). Só cai pro
 * cálculo via data (`diaSemanaIndex`) quando a fonte não informa o dia.
 */
export function diaSemanaIndiceDe(diaSemanaTexto: string | null | undefined, data: string): number | null {
  if (diaSemanaTexto) {
    const idx = DIA_SEMANA_TEXTO_PARA_INDICE[normTxt(diaSemanaTexto)]
    if (idx !== undefined) return idx
  }
  return diaSemanaIndex(data)
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
function chaveDe(s: Pick<SessaoComparativo, "idFavorecido" | "paciente">): string {
  return s.idFavorecido !== null ? `id:${s.idFavorecido}` : `nome:${normTxt(s.paciente)}`
}

const CONVENIO_ASSIM_SAUDE = normTxt("Assim Saúde")

function isAssimSaude(convenio: string): boolean {
  return normTxt(convenio) === CONVENIO_ASSIM_SAUDE
}

/**
 * Mudança de regra de negócio (início de 2026): pacientes do convênio Assim
 * Saúde podem ter, na mesma Data & Hora, dois agendamentos com
 * profissionais/terapias diferentes — isso é 1 sessão só pro paciente, não 2.
 * Sem esse dedup, uma queda causada só por essa duplicidade sumindo (ex.: 11
 * pra 10) apareceria como redução real de atendimento.
 *
 * O convênio é decidido pelo PACIENTE, não linha a linha, e olhando os DOIS
 * períodos — não só o array que está sendo deduplicado. No relatório é comum
 * o campo Convênio só vir preenchido em algumas linhas (ex.: falta nas linhas
 * "Coordenador de Caso", ou até em todo um período do upload) mesmo quando o
 * paciente inteiro é Assim Saúde. Se a detecção olhasse só o array de um
 * período isolado (P1 sozinho, ou P2 sozinho) e esse período específico não
 * tivesse NENHUMA linha com o convênio marcado, o paciente nunca seria
 * reconhecido ali, mesmo aparecendo como Assim Saúde no outro período — por
 * isso o parâmetro `contexto` (a união de P1+P2) deve ser sempre passado
 * quando disponível; sem ele, cai no próprio array recebido.
 */
export function dedupAssimSaude(sessoes: SessaoComparativo[], contexto: SessaoComparativo[] = sessoes): SessaoComparativo[] {
  const pacientesAssimSaude = new Set<string>()
  for (const s of contexto) {
    if (isAssimSaude(s.convenio)) pacientesAssimSaude.add(chaveDe(s))
  }

  const grupos = new Map<string, SessaoComparativo[]>()
  for (const s of sessoes) {
    const chave = `${chaveDe(s)}|||${s.data}|||${s.hora}`
    const grupo = grupos.get(chave) ?? []
    grupo.push(s)
    grupos.set(chave, grupo)
  }
  const out: SessaoComparativo[] = []
  for (const grupo of grupos.values()) {
    if (grupo.length > 1 && pacientesAssimSaude.has(chaveDe(grupo[0]))) {
      // Conta como 1 sessão, mas sem esconder qual terapia/profissional
      // estava junto — junta os nomes na mesma linha (ex.: "Coordenador de
      // Caso + Aplicador ABA (AV)") em vez de descartar uma delas.
      const base = grupo.find(s => isAssimSaude(s.convenio)) ?? grupo[0]
      const terapias = [...new Set(grupo.map(s => s.terapia).filter(Boolean))]
      out.push({ ...base, terapia: terapias.join(" + ") || base.terapia })
    } else {
      out.push(...grupo)
    }
  }
  return out
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
  const contexto = [...sessoesP1, ...sessoesP2]
  return agregarPorPaciente(
    dedupAssimSaude(sessoesP1.filter(s => s.unidade === unidade), contexto),
    dedupAssimSaude(sessoesP2.filter(s => s.unidade === unidade), contexto),
  )
}

/**
 * Drill-down do indicativo "Por Paciente": lista as sessões individuais
 * (id terapia, terapia, data, hora) daquele paciente num período, aplicando o
 * mesmo dedup do Assim Saúde pra ficar consistente com o total exibido na
 * linha. `contexto` deve ser a união de P1+P2 desse paciente, pra detectar o
 * convênio Assim Saúde mesmo se o período sendo listado não tiver nenhuma
 * linha com o campo preenchido (ver dedupAssimSaude). Ordenado por data+hora.
 */
export function sessoesDoPaciente(
  sessoes: SessaoComparativo[], paciente: Pick<SessaoComparativo, "idFavorecido" | "paciente">, contexto: SessaoComparativo[] = sessoes,
): SessaoComparativo[] {
  const chave = chaveDe(paciente)
  const filtradas = dedupAssimSaude(sessoes.filter(s => chaveDe(s) === chave), contexto.filter(s => chaveDe(s) === chave))
  return [...filtradas].sort((a, b) => {
    const da = parseDataAgendamento(a.data)?.getTime() ?? 0
    const db = parseDataAgendamento(b.data)?.getTime() ?? 0
    if (da !== db) return da - db
    return a.hora.localeCompare(b.hora)
  })
}

/**
 * "Psicologia ABA": conjunto de Id Terapia que o toggle "Agrupar Psicologia
 * ABA" combina numa linha só, nos indicativos por especialidade e no
 * turnover de profissionais. Fixo por Id (não por nome) — texto de terapia
 * pode ser renomeado, o Id não.
 */
export const ROTULO_PSICOLOGIA_ABA = "Psicologia ABA"
export const IDS_PSICOLOGIA_ABA = new Set([2261, 2317, 2283, 2260, 2353, 2248, 2263, 2269, 2262, 2264, 2252])

/** Chave estável de profissional: Id Profissional quando disponível, senão nome normalizado — mesmo padrão de chaveDe (pacientes). */
function chaveProfissional(s: Pick<SessaoComparativo, "idProfissional" | "profissional">): string {
  return s.idProfissional !== null ? `id:${s.idProfissional}` : `nome:${normTxt(s.profissional)}`
}

/** Chave de agrupamento por terapia pro turnover — por Id Terapia (nunca por nome, que pode ser renomeado), com o bucket sintético de Psicologia ABA quando `agrupar` está ativo. */
function chaveGrupoTerapia(s: Pick<SessaoComparativo, "idTerapia" | "terapia">, agrupar: boolean): string {
  if (agrupar && s.idTerapia !== null && IDS_PSICOLOGIA_ABA.has(s.idTerapia)) return "grupo:psicologia-aba"
  return s.idTerapia !== null ? `terapia-id:${s.idTerapia}` : `terapia-nome:${normTxt(s.terapia)}`
}

export interface ProfissionalTurnover {
  chave: string
  idProfissional: number | null
  profissional: string
  sessoes: number
}

/** Movimento de um profissional dentro de um grupo de terapia — p1/p2/diferença, mesma ideia de PacienteComparativo. Base pra saida/entrada e pro resumo geral (aumento/redução/etc.). */
export interface ProfissionalMovimentoTerapia {
  chave: string
  idProfissional: number | null
  profissional: string
  p1: number
  p2: number
  diferenca: number
}

export interface TurnoverTerapia {
  /** Chave de agrupamento (ver chaveGrupoTerapia) — usar como key de lista/lookup, não pra exibir. */
  chave: string
  idTerapia: number | null
  terapia: string
  profissionaisP1: number
  profissionaisP2: number
  /** Todos os profissionais (união P1+P2) dessa terapia, com p1/p2/diferença — base do resumo geral. */
  movimento: ProfissionalMovimentoTerapia[]
  /** Profissionais com sessão dessa terapia em P1 e nenhuma em P2 (saíram DESSA terapia — podem continuar noutra). */
  saida: ProfissionalTurnover[]
  /** Profissionais com sessão dessa terapia em P2 sem nenhuma em P1 (novos nessa terapia). */
  entrada: ProfissionalTurnover[]
}

/**
 * Turnover de profissionais por terapia: pra cada Id Terapia (ou o bucket
 * "Psicologia ABA", se `agruparPsicologiaAba`), quais profissionais atendiam
 * em P1 e não atendem mais em P2 (e o inverso), com o total de sessões que
 * cada um tinha/passou a ter. Sempre por Id Terapia/Id Profissional — nomes
 * podem ser renomeados sem quebrar a identidade.
 */
export function calcularTurnoverProfissionais(
  sessoesP1: SessaoComparativo[], sessoesP2: SessaoComparativo[], agruparPsicologiaAba = false,
): TurnoverTerapia[] {
  interface GrupoAcc { idTerapia: number | null; terapiaP1: string; terapiaP2: string; p1: Map<string, ProfissionalTurnover>; p2: Map<string, ProfissionalTurnover> }
  const grupos = new Map<string, GrupoAcc>()

  function acc(chave: string, idTerapia: number | null): GrupoAcc {
    let g = grupos.get(chave)
    if (!g) { g = { idTerapia, terapiaP1: "", terapiaP2: "", p1: new Map(), p2: new Map() }; grupos.set(chave, g) }
    return g
  }

  function registrar(sessoes: SessaoComparativo[], lado: "p1" | "p2") {
    for (const s of sessoes) {
      if (s.idTerapia === null && !s.terapia) continue
      const chaveG = chaveGrupoTerapia(s, agruparPsicologiaAba)
      const g = acc(chaveG, chaveG === "grupo:psicologia-aba" ? null : s.idTerapia)
      if (lado === "p1") g.terapiaP1 = s.terapia || g.terapiaP1
      else g.terapiaP2 = s.terapia || g.terapiaP2
      const cp = chaveProfissional(s)
      const mapa = g[lado]
      const prof = mapa.get(cp) ?? { chave: cp, idProfissional: s.idProfissional, profissional: s.profissional || "—", sessoes: 0 }
      prof.sessoes += 1
      mapa.set(cp, prof)
    }
  }
  registrar(sessoesP1, "p1")
  registrar(sessoesP2, "p2")

  const out: TurnoverTerapia[] = []
  for (const [chave, g] of grupos) {
    const terapia = chave === "grupo:psicologia-aba" ? ROTULO_PSICOLOGIA_ABA : (g.terapiaP2 || g.terapiaP1 || "—")
    const chavesProfissionais = new Set([...g.p1.keys(), ...g.p2.keys()])
    const movimento: ProfissionalMovimentoTerapia[] = [...chavesProfissionais].map(cp => {
      const em1 = g.p1.get(cp)
      const em2 = g.p2.get(cp)
      const base = em1 ?? em2!
      const p1 = em1?.sessoes ?? 0
      const p2 = em2?.sessoes ?? 0
      return { chave: cp, idProfissional: base.idProfissional, profissional: base.profissional, p1, p2, diferenca: p2 - p1 }
    })
    const saida = movimento
      .filter(m => m.p1 > 0 && m.p2 === 0)
      .map(m => ({ chave: m.chave, idProfissional: m.idProfissional, profissional: m.profissional, sessoes: m.p1 }))
      .sort((a, b) => b.sessoes - a.sessoes)
    const entrada = movimento
      .filter(m => m.p1 === 0 && m.p2 > 0)
      .map(m => ({ chave: m.chave, idProfissional: m.idProfissional, profissional: m.profissional, sessoes: m.p2 }))
      .sort((a, b) => b.sessoes - a.sessoes)
    out.push({ chave, idTerapia: g.idTerapia, terapia, profissionaisP1: g.p1.size, profissionaisP2: g.p2.size, movimento, saida, entrada })
  }
  return out.sort((a, b) => a.terapia.localeCompare(b.terapia, "pt-BR"))
}

export interface ResumoTurnoverGeral {
  totalP1: number
  totalP2: number
  diferenca: number
  variacaoPct: number | null
  profissionaisAumentaram: number
  sessoesAumentadas: number
  profissionaisNovosCaptados: number
  sessoesNovosCaptados: number
  profissionaisReduziram: number
  sessoesReduzidas: number
  profissionaisDesligados: number
  sessoesDesligados: number
  profissionaisSemAlteracao: number
}

/**
 * Resumo geral do turnover — análogo ao resumo de aumento/redução de
 * pacientes (ComparativoResultado.resumo), mas a unidade aqui é o par
 * profissional×terapia (o mesmo profissional em 2 terapias conta 2 vezes,
 * cada vínculo avaliado separadamente). Alimenta os cards "Ganhos/Perdas de
 * profissionais" no topo da seção de turnover.
 */
export function calcularResumoTurnoverGeral(turnover: TurnoverTerapia[]): ResumoTurnoverGeral {
  let totalP1 = 0, totalP2 = 0
  let profissionaisAumentaram = 0, sessoesAumentadas = 0
  let profissionaisNovosCaptados = 0, sessoesNovosCaptados = 0
  let profissionaisReduziram = 0, sessoesReduzidas = 0
  let profissionaisDesligados = 0, sessoesDesligados = 0
  let profissionaisSemAlteracao = 0

  for (const t of turnover) {
    totalP1 += t.profissionaisP1
    totalP2 += t.profissionaisP2
    for (const m of t.movimento) {
      if (m.diferenca > 0) {
        if (m.p1 === 0) { profissionaisNovosCaptados++; sessoesNovosCaptados += m.diferenca }
        else { profissionaisAumentaram++; sessoesAumentadas += m.diferenca }
      } else if (m.diferenca < 0) {
        if (m.p2 === 0) { profissionaisDesligados++; sessoesDesligados += -m.diferenca }
        else { profissionaisReduziram++; sessoesReduzidas += -m.diferenca }
      } else {
        profissionaisSemAlteracao++
      }
    }
  }

  return {
    totalP1, totalP2, diferenca: totalP2 - totalP1, variacaoPct: totalP1 > 0 ? (totalP2 - totalP1) / totalP1 : null,
    profissionaisAumentaram, sessoesAumentadas, profissionaisNovosCaptados, sessoesNovosCaptados,
    profissionaisReduziram, sessoesReduzidas, profissionaisDesligados, sessoesDesligados, profissionaisSemAlteracao,
  }
}

/**
 * Drill-down do turnover: sessões de um profissional específico dentro de um
 * grupo de terapia específico (mesma chave de calcularTurnoverProfissionais),
 * num período — pra mostrar a agenda de quem saiu/entrou (reaproveita
 * AgendaGrid). Ordenado por data+hora.
 */
export function sessoesDoProfissionalNoGrupo(
  sessoes: SessaoComparativo[], profissional: Pick<SessaoComparativo, "idProfissional" | "profissional">,
  chaveGrupo: string, agruparPsicologiaAba: boolean,
): SessaoComparativo[] {
  const cp = chaveProfissional(profissional)
  const filtradas = sessoes.filter(s => chaveProfissional(s) === cp && chaveGrupoTerapia(s, agruparPsicologiaAba) === chaveGrupo)
  return [...filtradas].sort((a, b) => {
    const da = parseDataAgendamento(a.data)?.getTime() ?? 0
    const db = parseDataAgendamento(b.data)?.getTime() ?? 0
    if (da !== db) return da - db
    return a.hora.localeCompare(b.hora)
  })
}

/** Calcula os 4 indicativos comparando as sessões normalizadas de dois períodos. */
export function calcularComparativo(sessoesP1Raw: SessaoComparativo[], sessoesP2Raw: SessaoComparativo[]): ComparativoResultado {
  const contexto = [...sessoesP1Raw, ...sessoesP2Raw]
  const sessoesP1 = dedupAssimSaude(sessoesP1Raw, contexto)
  const sessoesP2 = dedupAssimSaude(sessoesP2Raw, contexto)
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
