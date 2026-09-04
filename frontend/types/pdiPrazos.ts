// Tipos da tela Controle de Prazos do PDI (fora de escopo desta etapa — ver o
// plano). Vivem AQUI, e não em services/pdi/prazos.ts, porque aquele módulo é
// `server-only` (lê o relatório Órbita com service_role) e os componentes da
// tela são cliente — importar de lá arrastaria o módulo de servidor para o
// bundle. Mesma separação de types/laudosAcompanhamento.ts em relação a
// services/laudos/acompanhamento.ts.
//
// `ItemPdi` continua declarado em lib/pdi/filtros.ts (decisão da Etapa 1: é
// `filtros.ts` quem primeiro precisa dele para operar, e o módulo é puro —
// sem nada de servidor). Reexportado aqui por conveniência de quem só quer o
// tipo, sem puxar `filtros.ts` inteiro.

export type { ItemPdi, RecortePdi, FiltrosPdi, EspecialistaPdiId } from "@/lib/pdi/filtros"
export { ESPECIALISTAS_PDI } from "@/lib/pdi/filtros"

/** Metadados da resposta de GET /api/pdi-controle-prazos. */
export interface MetaPdiPrazos {
  /** Importação do robô de laudos que originou a lista de elegíveis. */
  importacaoId: string
  arquivoNome: string
  concluidoEm: string | null
  /** Linhas do relatório lidas. */
  linhasLidas: number
  /** Itens devolvidos — todos os pacientes elegíveis, com ou sem cadastro no Pulsar (ver `semCadastroPulsar`). */
  itens: number
  /** Hoje em Brasília, base de todo o cálculo de prazo/status. */
  hoje: string
  /** Quantos dos `itens` são pacientes elegíveis (laudo de Psicologia ABA em uso) SEM cadastro em public.pacientes — continuam na lista (ver `ItemPdi.semCadastroPulsar`), só com nome/foto/ativo vindos do relatório em vez do cadastro. Esperado: baixo, mas não necessariamente 0 (ver services/laudos/acompanhamento.ts: 58/343 é o precedente medido para laudos em geral). */
  semCadastroPulsar: number
}

export interface RespostaPdiPrazos {
  ok: true
  itens: import("@/lib/pdi/filtros").ItemPdi[]
  meta: MetaPdiPrazos
}

/** O que a tela grava — os campos manuais de `pdi_controle_prazos`. */
export interface EdicaoPdiPrazos {
  especialistaTitaId: number | null
  dataAvaliacao: string | null
  dataValidade: string | null
  observacoes: string | null
}
