import type { Turno } from "./simulacaoNovoPrestador"

export type ModalidadeSugestao = "adjacente" | "remanejamento"

export interface RemanejamentoDetalhe {
  pacienteRemanejado: string
  terapiaRemanejada: string
  profissionalMantido: string
  unidade: string
  de: { dia: string; hora: string }
  para: { dia: string; hora: string }
}

export interface CandidatoNaSugestao {
  paciente: string
  gap: number
  aut: number
  of: number
  turno: Turno
  hora: string
  modalidade: ModalidadeSugestao
  /** Só presente quando modalidade === "remanejamento". */
  remanejamento?: RemanejamentoDetalhe
  /** Valor dessa sessão específica (cadastro de valores), null até anexarRemuneracaoEOrdenar rodar ou se não houver regra cadastrada. */
  valorSessaoProjetado: number | null
  /** Posição de prioridade entre candidatos que disputam a MESMA vaga (turno+hora),
   *  ordenado por valorSessaoProjetado desc — 1 = deveria ser ofertado primeiro
   *  (mais rentável). Só o de ordem 1 entra na receita projetada da sugestão,
   *  já que a vaga só pode ser ocupada por um paciente por vez. */
  ordemNaVaga: number
}

export interface ProjecaoRemuneracaoSugestao {
  receitaSemanalProjetada: number
  receitaMensalProjetada: number
  porConvenio: { convenio: string; receitaMensalProjetada: number }[]
  sessoesSemValor: number
}

export interface SalaVinculada {
  salaId: string
  nomeExibicao: string
  numeroSala: string
  unidade: string
  pctOcupacaoSemanalAtual: number | null
}

export interface SugestaoContratacao {
  id: string
  unidade: string
  especialidade: string
  dia: string
  turnos: Turno[]
  pctOcupacaoPrevista: number
  faixaCascata: 70 | 60 | 50
  candidatos: CandidatoNaSugestao[]
  /** Verde se a maioria dos candidatos é por adjacência; azul se por remanejamento. */
  modalidadeDominante: ModalidadeSugestao
  /** null = nenhuma sala livre encontrada para o dia/turno(s) — não bloqueia a sugestão. */
  salaVinculada: SalaVinculada | null
  /** null = ainda não enriquecida por anexarRemuneracaoEOrdenar. */
  projecaoRemuneracao: ProjecaoRemuneracaoSugestao | null
}
