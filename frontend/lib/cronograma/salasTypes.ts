// ─── TIPOS: MÓDULO OCUPAÇÃO DE SALAS ──────────────────────────────────────────
// Cadastro estrutural de salas (tabela cronograma_salas) cruzado com dados de
// agendamento já existentes em csv_grades_profissionais. Ver plano em
// docs internos: "Portar Ocupação de Salas + Dashboards".

export type SalaCapacidade = "unico" | "duplo" | "multiplo"
export type SalaStatus = "operacional" | "bloqueada" | "adm"

/** Rótulo curto de capacidade — usado em badges/filtros (formulário de cadastro usa uma versão mais descritiva). */
export const CAPACIDADE_LABEL_CURTO: Record<SalaCapacidade, string> = {
  unico: "Único",
  duplo: "Duplo",
  multiplo: "Múltiplo",
}

/** Rótulo curto de status — usado em filtros (formulário de cadastro usa uma versão mais descritiva). */
export const STATUS_LABEL_CURTO: Record<SalaStatus, string> = {
  operacional: "Operacional",
  bloqueada: "Bloqueada",
  adm: "Adm",
}

/** Linha de `cronograma_salas` */
export interface Sala {
  id: string
  unidade_nome: string
  nucleo: string | null
  andar: string | null
  numero_sala: string
  nome_exibicao: string
  capacidade: SalaCapacidade
  status: SalaStatus
  sala_nome_referencia: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** Payload de criação/edição de sala (sem campos gerados pelo banco) */
export interface SalaInput {
  unidade_nome: string
  nucleo?: string | null
  andar?: string | null
  numero_sala: string
  nome_exibicao: string
  capacidade: SalaCapacidade
  status?: SalaStatus
  sala_nome_referencia?: string | null
  observacoes?: string | null
}

/** Capacidade projetada (nº de profissionais/pacientes simultâneos esperados) */
export function capacidadeProjetadaSala(capacidade: SalaCapacidade, status: SalaStatus): number {
  if (status !== "operacional") return 0
  if (capacidade === "multiplo") return 3
  if (capacidade === "duplo") return 2
  return 1
}

/** Linha de `cronograma_salas_alocacoes` — quem é o "dono" recorrente de uma sala/dia/turno (planejamento, não agendamento real) */
export interface AlocacaoSala {
  id: string
  sala_id: string
  dow: number
  turno: "Manhã" | "Tarde"
  profissional_nome: string
  terapia_nome: string | null
  created_at: string
  updated_at: string
}

/** Payload de criação/edição de alocação */
export interface AlocacaoInput {
  sala_id: string
  dow: number
  turno: "Manhã" | "Tarde"
  profissional_nome: string
  terapia_nome?: string | null
}

export type StatusOcupacaoSlot = "livre" | "ocupado" | "parcial" | "bloqueado" | "adm"

/** Uma alocação (profissional/terapia) dentro de um slot, cruzada com sessões reais para exibição informativa */
export interface AlocacaoCardSlot {
  alocacaoId: string
  profissionalNome: string
  terapiaNome: string | null
  /** nº de sessões reais (csv_grades_profissionais) desse profissional nesse sala/dia/turno */
  sessoesReais: number
  /** capacidade em nº de blocos de 40min do turno (6 manhã / 7 tarde) — janela pessoal do profissional alocado */
  sessoesCapacidadeTurno: number
  pctOcupacao: number | null
  /** true se não há nenhuma sessão real batendo (alocação puramente planejada, sem cruzamento no CSV) */
  semCruzamentoCsv: boolean
}

/** Ocupação de uma sala em um dia da semana × turno específico, guiada pelas alocações (planejamento), não pelos dados brutos da agenda */
export interface SlotOcupacaoSala {
  salaId: string
  dow: number
  turno: "Manhã" | "Tarde"
  /** Capacidade projetada (nº máximo de alocações simultâneas: 1/2/3, 0 se adm/bloqueada) */
  capacidadeProjetada: number
  /** Alocações (profissional/terapia) planejadas para este sala/dia/turno */
  alocacoes: AlocacaoCardSlot[]
  status: StatusOcupacaoSlot
  /** nº de alocações simultâneas ultrapassa a capacidadeProjetada da sala (conflito de planejamento) */
  inconsistente: boolean
}

/** Sala com seus slots calculados e um resumo semanal agregado */
export interface SalaComOcupacao {
  sala: Sala
  slots: SlotOcupacaoSala[]
  pctOcupacaoSemanal: number | null
}

export interface ResumoTurnoUnidadeSalas {
  turno: "Manhã" | "Tarde"
  slotsTotal: number
  slotsOcupados: number
  slotsLivres: number
  slotsBloqueados: number
  pct: number | null
}

/** Resumo agregado por unidade — adaptado de calcularResumoSalas */
export interface ResumoUnidadeSalas {
  unidade: string
  salasTotal: number
  salasAtivas: number
  salasBloqueadas: number
  salasAdm: number
  salasPorCapacidade: Record<SalaCapacidade, number>
  capacidadeSimultanea: number
  slotsTotal: number
  slotsOcupados: number
  slotsLivres: number
  slotsBloqueados: number
  pct: number | null
  porTurno: ResumoTurnoUnidadeSalas[]
  porTerapia: { terapia: string; sessoes: number }[]
  inconsistencias: number
}

/** Linha bruta de agendamento usada para cruzar com salas (subconjunto de CsvRow) */
export interface AgendaSalaRow {
  paciente_id: number | null
  paciente_nome: string | null
  convenio_nome: string | null
  unidade_nome: string | null
  sala_nome: string | null
  profissional_nome: string | null
  terapia_id: number | null
  terapia_nome: string | null
  terapia_exibicao_id: number | null
  terapia_exibicao_nome: string | null
  dia_semana: string | null
  hora_inicial: string | null
  hora_final: string | null
  status_agendamento: string | null
  data: string | null
}

// ─── DASHBOARD DE PACIENTES ────────────────────────────────────────────────────

export interface ResumoPacientesSalas {
  pacientesUnicos: number
  sessoesTotal: number
  chSemanalTotal: number
  chMediaMensalTotal: number
  mediaSessoesPorPaciente: number
  porConvenio: ResumoPacientesGrupo[]
  porUnidade: ResumoPacientesGrupo[]
}

export interface ResumoPacientesGrupo {
  chave: string
  pacientesUnicos: number
  sessoesTotal: number
  chSemanalTotal: number
  chMediaMensalTotal: number
  mediaSessoesPorPaciente: number
}

/**
 * Os dois dashboards de indicadores/pacientes, separados POR SESSÃO (não por
 * paciente): "Tratamento Multidisciplinar" (dashboard geral — toda sessão que
 * não é do grupo "Processo Diagnóstico", ver PROCESSO_DIAGNOSTICO_NAMES em
 * constants.ts) e "Processo Diagnóstico" (só as sessões de Avaliação
 * Neuropsicológica / Psiquiatra-Neurologista). Uma sessão dessas duas terapias
 * nunca soma nos números do multidisciplinar, mesmo que o paciente também
 * tenha outras sessões contadas lá.
 */
export interface DashboardPacientesGeral {
  multidisciplinar: ResumoPacientesSalas
  processoDiagnostico: ResumoPacientesSalas
}