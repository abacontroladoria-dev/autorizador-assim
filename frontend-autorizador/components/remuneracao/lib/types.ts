// ─── Linha do CSV de agenda ───────────────────────────────────────────────────
export interface CsvRow {
  Profissional?: string;
  Terapia?: string;
  Data?: string;
  "Hora Inicial"?: string;
  "Hora Final"?: string;
  "Status do Agendamento"?: string;
  "Nome Favorecido"?: string;
  [key: string]: string | undefined;
}

// ─── Linha normalizada do relatório de evolução ───────────────────────────────
export interface NormalizedSession {
  id: string;
  data: string;
  hora: string;
  profAgenda: string;
  paciente: string;
  convenio: string;
  unidade: string;
  especialidade: string;
  presencaOrbita: string;
  profCsv: string;
  substituicao: string;
  possuiTratativa: string;
  statusCsv: string;
  statusFinal: string;
  motivo: string;
  _idx: number;
  classificacao: string;
  papel?: "Agenda" | "Substituição realizada";
}

// ─── Feriado extra ────────────────────────────────────────────────────────────
export interface FeriadoExtra {
  date: string;
  nome: string;
}

// ─── Snapshot histórico ───────────────────────────────────────────────────────
export interface HistoricoSnapshot {
  id: number;
  mesStr: string;
  presenca: number;
  profs: Array<{ prof: string; total100: number; totalX: number; salAntigo: number | null }>;
}

// ─── Contrato antigo ──────────────────────────────────────────────────────────
export interface ContratoAntigo {
  salario: number;
  chSemanal: number;
  contrato: string;
}

// ─── Configuração da calculadora ──────────────────────────────────────────────
export interface CalculatorConfig {
  taxasPA: Record<string, number>;
  diarias: Record<string, number>;
  etaBonus: number;
  antigos: Record<string, ContratoAntigo>;
  limites: Record<string, number>;
  presenca: number;
  ccPA: number;
  ccPME: number;
  extraHols: FeriadoExtra[];
  historico: HistoricoSnapshot[];
}

// ─── Detalhamento por dia da semana ──────────────────────────────────────────
export interface DowBreakEntry {
  dow: number;
  cnt: number;
  occ: number;
  mensal: number;
  feriados: Array<{ date: string; nome: string; dow: number }>;
}

export interface DiariasDetalheEntry {
  dow: number;
  occ: number;
  valor: number;
  feriados: Array<{ date: string; nome: string; dow: number }>;
}

// ─── Detalhe por terapia (Análise Futura) ────────────────────────────────────
export interface TerapiaDetail {
  terp: string;
  sessoes: number;
  sessByDow: Record<number, number>;
  etaSessoes: number;
  etaSessByDow: Record<number, number>;
  pacsSet?: Set<string>;
  pacientes: number;
  pacientesList: string[];
  pa: number;
  diar: number;
  isCC: boolean;
  isETA: boolean;
  mensalDiaria: number;
  mensalPA100: number;
  mensalPAX: number;
  mensalETA100: number;
  etaWeeks: number;
  etaDownBreak: DowBreakEntry[];
  monthly100: number;
  monthlyX: number;
  dowBreak: DowBreakEntry[];
  diariasDetalhe: DiariasDetalheEntry[];
  sessoesMes100: number;
  sessoesMesX: number;
  etaSessoesSemana: number;
  etaSessoesMes100: number;
}

// ─── Dado calculado por profissional (Análise Futura) ────────────────────────
export interface ProfData {
  prof: string;
  terapiaDetails: TerapiaDetail[];
  hasCC: boolean;
  hasAE: boolean;
  hasTA: boolean;
  pacCC: number;
  pme: number;
  total100: number;
  totalX: number;
  salAntigo: number | null;
  contrato: string | null;
  chSemanal: number | null;
  temAntigo: boolean;
  delta100: number | null;
  deltaX: number | null;
  limiteCC: number;
  alertaCC: boolean;
  allPacs: string[];
  horasSemanaTotal: number;
  horasAbertas: number;
  horasComPac: number;
  taxaOcupacao: number | null;
}

// ─── Detalhe de diária por especialidade (Apuração Real) ─────────────────────
export interface DiariaDetalheReal {
  esp: string;
  dias: number;
  rate: number;
  total: number;
}

// ─── Dado calculado por profissional (Apuração Real) ─────────────────────────
export interface RealProfData {
  prof: string;
  agendadas: number;
  evoluidasProprias: number;
  substituicoesRealizadas: number;
  substituidoPorOutro: number;
  pendentes: number;
  canceladas: number;
  naoEvoluidas: number;
  inconsistencias: number;
  pacientes: Set<string>;
  pacientesCC: Set<string>;
  pacientesQtd: number;
  pacientesCCQtd: number;
  diasPorEsp: Record<string, Set<string>>;
  etaAdminDatas: Set<string>;
  contrato: string;
  salAntigo: number;
  temAntigo: boolean;
  pme: number;
  diariaPeriodo: number;
  diariaDetalhe: DiariaDetalheReal[];
  etaWeeksPeriodo: number;
  etaBonusPeriodo: number;
  valorConfirmado: number;
  valorPotencial: number;
  valorRecuperavel: number;
  sessoes: NormalizedSession[];
}

// ─── Resultado do cálculo de análise ─────────────────────────────────────────
export interface AnaliseResult {
  dadosPorProf: ProfData[];
  feriadosMes: Array<{ date: string; nome: string; dow: number }>;
  allTerps: string[];
}

// ─── Resumo da apuração real ──────────────────────────────────────────────────
export interface ResumoReal {
  total: number;
  evoluidos: number;
  cancelados: number;
  naoEvoluidos: number;
  presencaOrb: number;
  subs: number;
  inc: number;
  pct: number;
  totalAntigo: number;
  valorConfirmado: number;
  valorPotencial: number;
  pendContr: number;
  pendContrato: RealProfData[];
}
