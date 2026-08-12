// Índice + verificação de "Exclusividade de salas com terapias" (ver
// ExclusividadeTerapiaModal.tsx) — usado tanto pela recomendação automática
// de sala em Solicitações › Simulação (sugestaoContratacao.ts) quanto pela
// alocação manual na Grade de Ocupação de Salas (AlocarSessaoModal.tsx), pra
// as duas telas aplicarem exatamente a mesma regra.
//
// A regra tem DUAS direções independentes, e `modo` só controla a segunda:
//
// 1. Sala → terapia (SEMPRE trava, em qualquer `modo`): uma sala com QUALQUER
//    linha aqui só aceita as terapias listadas — nenhuma outra terapia pode
//    ser alocada nela, nunca. Ter uma linha 'preferencial' não abre a sala
//    pra outras terapias; só diz que ESSA terapia pode sair dali (ver 2).
// 2. Terapia → sala (é isso que `modo` decide):
//    'obrigatoria'  → a terapia só pode ser alocada nas salas reservadas pra
//                     ela — não pode ir a nenhuma sala fora dessa lista.
//    'preferencial' → a terapia prioriza as salas reservadas pra ela, mas
//                     pode cair em qualquer sala que NÃO seja reservada por
//                     outra terapia (mero aviso nesse caso, nunca bloqueia).

import type { SalaTerapiaExclusiva, ModoExclusividadeTerapia } from "./salasTypes"
import { TERAPIA_ID } from "./constants"

/**
 * Regra de negócio fixa (pedido do usuário, 2026-08-11): estas terapias têm
 * modo travado — não é uma escolha livre do admin ao cadastrar a
 * exclusividade. Terapia Ocupacional/Fisioterapia/Fisioterapia
 * Aquática/Psicomotricidade/Terapia Alimentar só podem ir na sala reservada
 * (obrigatória); Musicoterapia/Fonoaudiologia priorizam a sala reservada mas
 * podem cair em qualquer sala não-reservada (preferencial). Terapias fora
 * deste mapa não têm regra fixa — o admin escolhe o modo livremente ao
 * cadastrar uma exclusividade pra elas (ver ExclusividadeTerapiaModal.tsx).
 */
export const MODO_TERAPIA_FIXO: Partial<Record<number, ModoExclusividadeTerapia>> = {
  [TERAPIA_ID["Terapia Ocupacional"]]: "obrigatoria",
  [TERAPIA_ID["Fisioterapia"]]: "obrigatoria",
  [TERAPIA_ID["Fisioterapia Aquática"]]: "obrigatoria",
  [TERAPIA_ID["Psicomotricidade"]]: "obrigatoria",
  [TERAPIA_ID["Terapia Alimentar"]]: "obrigatoria",
  [TERAPIA_ID["Musicoterapia"]]: "preferencial",
  [TERAPIA_ID["Fonoaudiologia"]]: "preferencial",
}

export interface IndiceExclusividadeTerapia {
  /** Sala com QUALQUER linha aqui só aceita as terapias deste conjunto — nunca outra. */
  salaParaTerapias: Map<string, Set<number>>
  /** Nomes de terapia (denormalizados) por sala — só pra mensagem de erro, sem precisar de outro lookup. */
  salaParaTerapiaNomes: Map<string, Set<string>>
  /** Salas onde essa terapia está cadastrada como exclusiva/preferida. */
  terapiaParaSalas: Map<number, Set<string>>
  /** Terapias com pelo menos uma linha 'obrigatoria' — só podem usar as salas de terapiaParaSalas. */
  terapiasObrigatorias: Set<number>
}

export function construirIndiceExclusividadeTerapia(exclusividades: SalaTerapiaExclusiva[]): IndiceExclusividadeTerapia {
  const salaParaTerapias = new Map<string, Set<number>>()
  const salaParaTerapiaNomes = new Map<string, Set<string>>()
  const terapiaParaSalas = new Map<number, Set<string>>()
  const terapiasObrigatorias = new Set<number>()
  for (const linha of exclusividades) {
    if (!salaParaTerapias.has(linha.sala_id)) salaParaTerapias.set(linha.sala_id, new Set())
    salaParaTerapias.get(linha.sala_id)!.add(linha.terapia_id)
    if (!salaParaTerapiaNomes.has(linha.sala_id)) salaParaTerapiaNomes.set(linha.sala_id, new Set())
    salaParaTerapiaNomes.get(linha.sala_id)!.add(linha.terapia_nome)
    if (!terapiaParaSalas.has(linha.terapia_id)) terapiaParaSalas.set(linha.terapia_id, new Set())
    terapiaParaSalas.get(linha.terapia_id)!.add(linha.sala_id)
    if (linha.modo === "obrigatoria") terapiasObrigatorias.add(linha.terapia_id)
  }
  return { salaParaTerapias, salaParaTerapiaNomes, terapiaParaSalas, terapiasObrigatorias }
}

export type VerificacaoExclusividade =
  | { status: "permitido" }
  /** `direcao` distingue qual das duas regras (ver comentário no topo do arquivo) foi ferida — usado pro badge da grade (SalasGridView) escolher o texto certo. */
  | { status: "bloqueado"; motivo: string; direcao: "sala_para_terapia" | "terapia_para_sala" }
  | { status: "aviso"; motivo: string; direcao: "terapia_para_sala" }

/** Verifica se `terapiaId` pode ser alocada em `salaId`. `nomeDaSala` resolve
 *  um sala_id em texto legível pra montar a mensagem (ex.: "Unidade · Sala 5"). */
export function verificarExclusividade(
  salaId: string, terapiaId: number | null, indice: IndiceExclusividadeTerapia,
  nomeDaSala: (salaId: string) => string,
): VerificacaoExclusividade {
  const { salaParaTerapias, salaParaTerapiaNomes, terapiaParaSalas, terapiasObrigatorias } = indice

  const terapiasDaSala = salaParaTerapias.get(salaId)
  if (terapiasDaSala && terapiasDaSala.size > 0 && (terapiaId === null || !terapiasDaSala.has(terapiaId))) {
    const nomes = [...(salaParaTerapiaNomes.get(salaId) ?? [])].sort().join(", ")
    return { status: "bloqueado", motivo: `Esta sala só comporta: ${nomes}.`, direcao: "sala_para_terapia" }
  }

  if (terapiaId !== null && terapiasObrigatorias.has(terapiaId)) {
    const salasPermitidas = terapiaParaSalas.get(terapiaId)
    if (!salasPermitidas?.has(salaId)) {
      const nomes = [...(salasPermitidas ?? [])].map(nomeDaSala).sort().join(", ") || "nenhuma sala cadastrada"
      return { status: "bloqueado", motivo: `Esta terapia só pode ser alocada em: ${nomes}.`, direcao: "terapia_para_sala" }
    }
  }

  if (terapiaId !== null) {
    const salasPreferidas = terapiaParaSalas.get(terapiaId)
    if (salasPreferidas?.size && !salasPreferidas.has(salaId) && !terapiasObrigatorias.has(terapiaId)) {
      const nomes = [...salasPreferidas].map(nomeDaSala).sort().join(", ")
      return { status: "aviso", motivo: `Esta terapia prioriza: ${nomes} — mas pode ser alocada aqui.`, direcao: "terapia_para_sala" }
    }
  }

  return { status: "permitido" }
}
