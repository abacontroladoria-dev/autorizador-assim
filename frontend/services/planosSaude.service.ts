// ============================================================================
// PONTO ÚNICO DE TROCA — LIGADO
// ============================================================================
//
// O cadastro de planos de saúde (public.convenios / public.planos_saude,
// migration 20260826110000) já existe. Este arquivo continua sendo o único
// lugar que sabe de onde o dado vem — a tela de Ficha Médica
// (components/cadastros/pacientes/secoes/PlanoSaude.tsx) só conhece este
// contrato, nunca o service de Convênios diretamente.
//
// A FK de pacientes_ficha_medica.plano_saude_id -> planos_saude.id já foi
// fechada em 20260826110100.
// ============================================================================

import { getPlanosSaudeAtivos } from "@/services/convenios.service"

export type PlanoSaude = {
  id: number
  nome: string
  ativo: boolean
  /** Nome do convênio dono do plano (ex.: "Unimed"), para desambiguar planos homônimos entre convênios. */
  convenio_nome: string
}

/** Só planos ativos (e de convênios ativos), ordenados por nome. */
export async function getPlanosSaude(): Promise<{
  data: PlanoSaude[]
  error: string | null
}> {
  try {
    const planos = await getPlanosSaudeAtivos()
    return {
      data: planos.map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo, convenio_nome: p.convenio_nome })),
      error: null,
    }
  } catch (e: any) {
    return { data: [], error: String(e?.message ?? e) }
  }
}

/** `true` quando a integração real já está ligada — a tela usa para escolher a mensagem. */
export const PLANOS_SAUDE_DISPONIVEL = true
