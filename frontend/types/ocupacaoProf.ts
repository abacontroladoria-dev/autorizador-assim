// ─── TIPOS: MÓDULO OCUPAÇÃO DE PROFISSIONAIS ─────────────────────────────────

// ── Contadores brutos (novaBaseOcup) ─────────────────────────────────────────

export interface BaseOcup {
  slotsTotal: number
  slotsOcupados: number
  slotsLivres: number
  horariosTotal: number
  horariosOcupados: number
  horariosLivres: number
  horasTotal: number
  horasOcupadas: number
  horasLivres: number
  horasTecnicas: number
  horasAssistenciais: number
}

// ── Resultado finalizado (finalizarBaseOcup) ──────────────────────────────────

export interface OcupacaoFinalizada extends BaseOcup {
  pct: number | null
  ociosidade: number | null
  capacidadeMultipla: boolean
  baseCompacta: string
  baseTexto: string
  baseHorasTexto: string
  unidades: string[]
  unidadeTexto: string
}

// ── Cortes agregados ──────────────────────────────────────────────────────────

export interface OcupacaoPorDia extends OcupacaoFinalizada {
  dow: number
  dia: string
}

export interface OcupacaoPorTurno extends OcupacaoFinalizada {
  dow: number
  turno: string
}

export interface OcupacaoPorEspecialidade extends OcupacaoFinalizada {
  terp: string
}

export interface OcupacaoPorUnidade extends OcupacaoFinalizada {
  unidade: string
}

// ── Slot processado (saída de calcularOcupacaoSemanal/agregarOcupacaoDeSlots) ─

export interface SlotNormalizado {
  date?: string
  dow: number
  terp: string
  unidade: string
  ini: number
  fim: number
  ag: number
  liv: number
  realAg: number
  technicalAg: number
  patients?: string[]
  turno: "Manhã" | "Tarde"
  capacidade: number
  ocupados: number
  livres: number
  horariosTotal: 1
  horariosOcupados: 0 | 1
  horariosLivres: 0 | 1
  pct: number | null
  horasTotal: number
  horasOcupadas: number
  horasLivres: number
  horasTecnicas: number
  horasAssistenciais: number
  excluirBaseOcupacao: boolean
  horarioAdministrativoEta: boolean
}

// ── Resultado completo da agregação ──────────────────────────────────────────

export interface OcupacaoAgregada extends OcupacaoFinalizada {
  porDia: OcupacaoPorDia[]
  porTurno: OcupacaoPorTurno[]
  porEspecialidade: OcupacaoPorEspecialidade[]
  porUnidade: OcupacaoPorUnidade[]
  slots: SlotNormalizado[]
}

// ── Entrada de calcularOcupacaoSemanal (slotData) ─────────────────────────────

export interface SlotDetalhe {
  date?: string
  dow: number
  terp: string
  unidade: string
  ini: number
  fim: number
  ag: number
  liv: number
  realAg: number
  technicalAg: number
  patients?: string[]
}

export interface DiaInfo {
  dow: number
  inicioMin: number
  fimMin: number
  ag: number
  liv: number
  slotDetails: Record<string, SlotDetalhe>
}

export interface SlotData {
  diasInfo: Record<string, DiaInfo>
  terpDays?: Record<string, unknown>
}

// ── Dados por profissional (dadosPorProf) ─────────────────────────────────────

export interface TerapiaDetalhe {
  terp: string
}

export interface DadosProfissional {
  prof: string
  slotData: SlotData
  ocupacao: OcupacaoAgregada
  taxaOcupacao: number | null
  terapiaDetails: TerapiaDetalhe[]
  unidades?: string[]
}

// ── Constantes tipadas ────────────────────────────────────────────────────────

export interface OcupFaixa {
  k: string
  l: string
  min: number | null
  max: number | null
}

export interface OcupSort {
  k: string
  l: string
}

export interface OcupCompareSlot {
  key: string
  dow: number
  turno: string
  label: string
  row: string
}
