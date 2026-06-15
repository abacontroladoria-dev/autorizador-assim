// ─── BRAND ───────────────────────────────────────────────────────────────────
export const B = {
  blue: "#2A92C0",
  purple: "#8F6AA8",
  orange: "#E3734F",
  lime: "#CFDE9C",
  pink: "#DD8CB8",
  navy: "#222847",
  blueLt: "#eaf5fb",
  purpleLt: "#f3eef8",
  orangeLt: "#fdf0eb",
  limeLt: "#f3f8e6",
  pinkLt: "#fdf0f6",
  navyLt: "#e8e9f0",
} as const

// ─── MAPEAMENTOS DE TERAPIA ───────────────────────────────────────────────────
export const TERAPIA_TO_ESP: Record<string, string> = {
  "Aplicador ABA (PS)": "Psicologia ABA",
  "Aplicador ABA (AV)": "Psicologia ABA",
  "Aplicador ABA (EF)": "Psicologia ABA",
  "Aplicador ABA (HS)": "Habilidades Sociais",
  "Fonoaudiologia": "Fonoaudiologia",
  "Psicopedagogia": "Psicopedagogia",
  "Terapia Ocupacional": "Terapia Ocupacional",
  "Psicomotricidade": "Psicomotricidade",
  "Musicoterapia": "Musicoterapia",
  "Terapia Alimentar": "Terapia Alimentar",
  "Psicologia": "Psicologia",
  "Fisioterapia Aquática": "Fisioterapia Aquática",
  "Fisioterapia": "Fisioterapia Motora",
  "Equoterapia": "Equoterapia",
  "Arteterapia": "Arteterapia",
}

export const ESP_CLINICO: Record<string, string[]> = {
  "Psicologia ABA": ["Aplicador ABA (PS)", "Aplicador ABA (SF)", "Aplicador ABA (AV)", "Aplicador ABA (AE)", "Aplicador ABA (EF)", "Supervisão ABA", "Coordenador de Caso"],
  "Habilidades Sociais": ["Aplicador ABA (HS)"],
  "Fonoaudiologia": ["Fonoaudiologia"],
  "Psicopedagogia": ["Psicopedagogia"],
  "Terapia Ocupacional": ["Terapia Ocupacional"],
  "Psicomotricidade": ["Psicomotricidade"],
  "Musicoterapia": ["Musicoterapia"],
  "Terapia Alimentar": ["Terapia Alimentar"],
  "Psicologia": ["Psicologia"],
  "Fisioterapia Aquática": ["Fisioterapia Aquática"],
  "Fisioterapia Motora": ["Fisioterapia"],
  "Equoterapia": ["Equoterapia"],
  "Arteterapia": ["Arteterapia"],
}

export const ESP_EXTERNO: Record<string, string[]> = {
  "Psicologia ABA": ["Aplicador ABA Casa", "Aplicador ABA Escola"],
}

// ─── EXCLUSÕES E FILTROS ──────────────────────────────────────────────────────
export const EXCLUIR_OCUP = new Set([
  "Aplicador ABA (SF)", "Aplicador ABA (AE)", "Coordenador de Caso",
  "Supervisão ABA", "Visita Guiada", "Triagem",
  "Avaliação Neuropsicológica", "Avaliação de Repertório",
])

export const ABA_CLI_EXCL = new Set([
  "Aplicador ABA (PS)", "Aplicador ABA (SF)", "Aplicador ABA (AV)",
  "Aplicador ABA (AE)", "Aplicador ABA (EF)", "Aplicador ABA (HS)",
  "Coordenador de Caso",
])

export const ABA_EXT = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola"])

export const PACS_ADMIN = new Set([
  "Ainda não selecionado", "Notificação Prévia", "Horário Administrativo",
  "Horário Bloqueado", "Alinhamento Gracielle", "Supervisora Fernanda Lima",
  "Supervisora Susane Vitória", "Supervisora Michelle Brasil",
  "Supervisor Severino Junior", "Supervisora Beatriz Paiva",
])

// ─── PROFISSIONAIS ────────────────────────────────────────────────────────────
export const PROFISSIONAIS_BLOQUEADOS_TEMPORARIAMENTE = [
  "Djinane Ferreira Da Silva",
  "Ana Carolina Mendes França",
]

export const PROFS_PRIO_DEF = ["Juliana Soares", "Mariana Defante", "Yasmin Meirelles"]
export const FOCO_CAMILA_PROF = "Camila Ferreira Rios Gomes"
export const FOCO_CAMILA_ESP = "Terapia Alimentar"

export const MJULIANA = new Set([
  "Nathan Machado Grossi",
  "Fernando Gael Farias Soares",
  "Kaleb Agamémnon Soares Pinto Da Silva",
  "Davi Lucas Mello Dias",
  "Theo Meneses Da Silva",
])

export const DEFAULT_MCAP: Record<string, Record<string, number>> = {
  "Thiago Henrique": { "Segunda-feira": 3, "Terça-feira": 3 },
  "Rachel Silva": { "Segunda-feira": 1, "Quarta-feira": 2, "Quinta-feira": 2 },
  "Luiz Gustavo": { "Quarta-feira": 1, "Quinta-feira": 1, "Sexta-feira": 2 },
  "Ianca Aparecida": { "Sexta-feira": 2 },
  "Rosenilza Abreu": { "Quarta-feira": 2 },
}

export const MEXCL = [
  { prof: "Rosenilza", dia: "Quarta-feira", hora: "15:00", unidade: "Realengo", pac: "John Lucas Borges De Araujo" },
]

// ─── GRADE DE HORÁRIOS ────────────────────────────────────────────────────────
export const HORAS_GRID = [
  "08:00", "08:40", "09:20", "10:00", "10:40", "11:20",
  "13:00", "13:40", "14:20", "15:00", "15:40", "16:20", "17:00",
]

export const DIAS_LIST = [
  "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
]

export const DIAS_ORD: Record<string, number> = {
  "Segunda-feira": 0, "Terça-feira": 1, "Quarta-feira": 2,
  "Quinta-feira": 3, "Sexta-feira": 4, "Sábado": 5,
}

export const DIA_COLS_DISP: Record<string, [string, string]> = {
  "Segunda-feira": ["Seg Início", "Seg Fim"],
  "Terça-feira": ["Ter Início", "Ter Fim"],
  "Quarta-feira": ["Qua Início", "Qua Fim"],
  "Quinta-feira": ["Qui Início", "Qui Fim"],
  "Sexta-feira": ["Sex Início", "Sex Fim"],
  "Sábado": ["Sab Início", "Sab Fim"],
}

// ─── CORES DE TERAPIA ─────────────────────────────────────────────────────────
export const TERAPIA_CORES: Record<string, string> = {
  "Aplicador ABA (AE)": "#E89D9D",
  "Aplicador ABA (AV)": "#f0f0f0",
  "Aplicador ABA (EF)": "#57E6D6",
  "Aplicador ABA (HS)": "#f0f0f0",
  "Aplicador ABA (PS)": "#D4A9F5",
  "Aplicador ABA (SF)": "#BDB8BF",
  "Aplicador ABA Casa": "#BDB8BF",
  "Aplicador ABA Escola": "#A9A2A2",
  "Aplicador Suporte": "#E9FECE",
  "Arteterapia": "#E89D9D",
  "Coordenador de Caso": "#A560E5",
  "Equoterapia": "#946D05",
  "Fisioterapia": "#54E8E3",
  "Fisioterapia Aquática": "#9DD0FD",
  "Fonoaudiologia": "#E0B00F",
  "Musicoterapia": "#FFAD98",
  "Nutrição": "#BCF47C",
  "Psicoeducação": "#E996F1",
  "Psicologia": "#C81ED5",
  "Psicomotricidade": "#39A8F9",
  "Psicopedagogia": "#FFFB73",
  "Supervisão ABA": "#888888",
  "Terapia Alimentar": "#95EF9C",
  "Terapia Ocupacional": "#0B13CA",
  "Triagem": "#EE8F00",
  "Visita Guiada": "#EC62E5",
}

export function tCor(tP: string, bright = false): string {
  const c = TERAPIA_CORES[tP]
  if (!c || c === "#FFFFFF" || c === "#f0f0f0") return bright ? "#e8e8e8" : "#f8fafc"
  return c
}

// ─── ESPECIALIDADES ───────────────────────────────────────────────────────────
export const TODAS_ESP = [
  "Arteterapia", "Equoterapia", "Fisioterapia Aquática", "Fisioterapia Motora",
  "Fonoaudiologia", "Habilidades Sociais", "Musicoterapia", "Psicologia",
  "Psicologia ABA", "Psicomotricidade", "Psicopedagogia", "Terapia Alimentar",
  "Terapia Ocupacional",
]

// ─── PRIORIDADES ──────────────────────────────────────────────────────────────
export const PL: Record<number, string> = {
  1: "P1 – Liminar+Conv",
  2: "P2 – Outro Conv",
  3: "P3 – Liminar+ASSIM",
  4: "P4 – ASSIM",
  5: "P5 – LEVE",
}

export const PBADGE: Record<number, { bg: string; color: string; border: string }> = {
  1: { bg: B.orangeLt, color: B.orange, border: B.orange },
  2: { bg: B.blueLt, color: B.blue, border: B.blue },
  3: { bg: B.pinkLt, color: "#b85a8e", border: B.pink },
  4: { bg: B.purpleLt, color: B.purple, border: B.purple },
  5: { bg: B.limeLt, color: "#7a9a3a", border: "#b8cc70" },
}

// ─── REGRAS (exibição) ────────────────────────────────────────────────────────
export const REGRAS_NOVO_CRON = [
  { icon: "🏥", title: "R1.1–1.3 — Unidade por convênio", desc: "Realengo: ASSIM, MEMORIAL, LEVE. Fazendinha: Particular, Liminar e demais convênios. Padre Miguel: Particular e Liminar." },
  { icon: "📅", title: "R2.1 — Mínimo 2 sessões clínicas por dia", desc: "Nenhum dia deve ter apenas 1 sessão clínica. Exceções exigem registro formal." },
  { icon: "⛔", title: "R5.1 — Sem intervalo entre sessões", desc: "Sessões do mesmo dia devem ser consecutivas — sem gap de horário vazio entre elas. O algoritmo rejeita slots que criariam lacunas." },
  { icon: "✅", title: "R5.2 — Não ultrapassar quantidade autorizada", desc: "Nunca agendar mais sessões do que o laudo autoriza. A meta é atingir exatamente a quantidade autorizada." },
  { icon: "🗺️", title: "R5.4 — Sem unidades diferentes no mesmo dia", desc: "Sessões consecutivas em unidades distintas não são permitidas sem consentimento documentado." },
  { icon: "👤", title: "R5.5 — Preferir profissional que já atende", desc: "Na redistribuição, manter o mesmo profissional sempre que possível." },
  { icon: "📋", title: "R7.1 — Ordem de distribuição das terapias", desc: "Fono → TO → ABA (3–5 sessões) → Musicoterapia → Psicopedagogia → Psicomotricidade → Terapia Alimentar → Fisioterapia → Equoterapia" },
  { icon: "⚖️", title: "R6 — Limites por origem judicial", desc: "Acordo: TO e Fono máx 1 sessão. Liminar sem Amb. Natural: máx 2. Liminar com Amb. Natural: máx 3. ABA: mínimo 3, máximo 5." },
  { icon: "🕐", title: "Turno — Escola × Clínica", desc: "Escola de manhã (Escola Início < 13h) → clínica à tarde. Escola de tarde → clínica de manhã. Baseado no relatório de disponibilidade do Órbita." },
]

// ─── STORAGE KEYS ────────────────────────────────────────────────────────────
export const DIAS_UTIL = [
  "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira",
] as const

export const UNID_COR: Record<string, string> = {
  Realengo: "#2A92C0",
  Fazendinha: "#8F6AA8",
  "Padre Miguel": "#E3734F",
}

export const SK = "aba_v8"
export const SK_SAIDA = "aba_saida_v1"
export const SK_PREENCHER = "aba_preencher_v1"

// ─── WA ───────────────────────────────────────────────────────────────────────
export const WA_RESERVA_ATIVA = new Set(["aguardando", "aceito", "resolvido"])

export function splitWaKey(k: string): { pac: string; prof: string; dia: string; hora: string } | null {
  const p = String(k || "").split("|||")
  if (p.length < 4) return null
  return { pac: p[0] || "", prof: p[1] || "", dia: p[p.length - 2] || "", hora: p[p.length - 1] || "" }
}

export function reservaSlotKey(prof: string, dia: string, hora: string): string {
  return `${prof || ""}|||${dia || ""}|||${hora || ""}`
}

export function reservasAtivasFromWa(waMap: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>()
  for (const [k, st] of Object.entries(waMap || {})) {
    if (!WA_RESERVA_ATIVA.has(st)) continue
    const x = splitWaKey(k)
    if (!x || !x.prof || x.prof === "sim" || x.prof.startsWith("sim:")) continue
    m.set(reservaSlotKey(x.prof, x.dia, x.hora), x.pac)
  }
  return m
}

// ─── HELPERS INTERNOS ─────────────────────────────────────────────────────────
export function normTxt(s: string | null | undefined): string {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

export function isProfBloqueadoTemp(prof: string): boolean {
  return PROFISSIONAIS_BLOQUEADOS_TEMPORARIAMENTE.some(p => normTxt(prof) === normTxt(p))
}

export const API_BASE = "https://apiv2.apptita.com.br/api"

// ─── LEGENDA DE REGRAS (fonte única — GuiaTab e ConfigTab) ────────────────────
export const REGRAS_LEGENDA: Array<{ r: string; c: string; title: string; desc: string }> = [
  { r: "R1",            c: B.purple,   title: "Completar slot existente",        desc: "O musicoterapeuta já tem 1 ou 2 pacientes naquele horário e a capacidade (Dupla ou Trio) ainda não foi atingida. O script encontrou um paciente compatível — mesma faixa etária, nenhum agressivo no grupo — para completar. Ver coluna \"Referência\" para saber quem já está no slot." },
  { r: "R2",            c: B.blue,     title: "Slot livre adjacente",            desc: "Há um horário Livre no sistema. O paciente já tem outra sessão clínica 40 minutos antes OU depois naquele mesmo dia e unidade. O paciente já está na clínica: custo logístico zero para a família. Ligar e oferecer." },
  { r: "R3",            c: "#7ab84b",  title: "Dia novo",                        desc: "O paciente NÃO frequenta aquele dia da semana ainda. O script só sugere quando: (1) o horário é compatível com o turno clínico — ABA Escola de manhã → sugestão de tarde; (2) existe pelo menos um outro slot livre no mesmo dia para outra terapia com gap, adjacente ao horário sugerido. A coluna \"Vaga Complementar\" mostra essa segunda vaga — ofertar as duas juntas para justificar o deslocamento." },
  { r: "R4",            c: B.orange,   title: "Remanejamento",                   desc: "O paciente tem outra terapia exatamente naquele slot. A sugestão é mover essa terapia para outro horário livre, liberando o slot para Musicoterapia. Ver \"Vaga Complementar\" para saber para onde mover. Aparece na aba Fila de Espera — requer coordenação antes de oferecer." },
  { r: "Ocup. R2",      c: B.blue,     title: "Ocupação — Slot livre adjacente", desc: "Igual ao R2, mas para qualquer especialidade clínica (não Musicoterapia). Slot livre 40 minutos antes ou depois de uma sessão que o paciente já tem." },
  { r: "Condicional",   c: "#9ca3af",  title: "Condicional",                     desc: "Esta vaga só deve ser oferecida se a família aceitar a vaga anterior (indicada na coluna \"Referência\"). Aparece na aba Fila de Espera. Exemplo: se família aceitar 15:00, oferecer 15:40." },
  { r: "Sup. Deslocável", c: B.orange, title: "Supervisão Deslocável",           desc: "O slot tem Supervisão ABA agendada. A supervisão pode ser realocada para outro horário, liberando o slot para o paciente. Aparece na aba Fila de Espera — requer confirmação com coordenação." },
]
