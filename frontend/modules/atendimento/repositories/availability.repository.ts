import type { SupabaseClient } from '@supabase/supabase-js'
import type { DiagnosticoVaga, VagaDisponivel } from '../types/central.types'

// ============================================================================
// AvailabilityRepository
//
// Disponibilidade NÃO é uma tabela. É a subtração:
//   public.vw_grade_base (status_agendamento = 'Livre')
//     menos central.appointments com status que ocupa vaga
//     menos o passado
//
// Essa subtração vive em central.listar_vagas_disponiveis (20260810100100),
// não aqui, por dois motivos:
//   1. PostgREST não faz join entre schemas — no cliente seriam duas
//      requisições e a subtração em memória.
//   2. O agente de WhatsApp precisa da mesma regra. Duplicá-la em TypeScript
//      é como as duas superfícies passam a oferecer horários diferentes.
//
// Este repository é só o adaptador de chamada da RPC.
// ============================================================================

export interface ListarVagasInput {
  // Default no banco: hoje (São Paulo) até hoje + 30 dias.
  dataInicio?:     string | null
  dataFim?:        string | null
  terapiaId?:      number | null
  profissionalId?: number | null
  unidadeId?:      number | null
  limite?:         number | null
}

export class AvailabilityRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listarVagas(input: ListarVagasInput = {}): Promise<VagaDisponivel[]> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .rpc('listar_vagas_disponiveis', {
        p_data_inicio:     input.dataInicio     ?? null,
        p_data_fim:        input.dataFim        ?? null,
        p_terapia_id:      input.terapiaId      ?? null,
        p_profissional_id: input.profissionalId ?? null,
        p_unidade_id:      input.unidadeId      ?? null,
        p_limite:          input.limite         ?? null,
      })

    if (error) throw error
    return (data ?? []) as VagaDisponivel[]
  }

  // Diagnóstico de uma vaga específica no instante da reserva.
  // Separa os três motivos de recusa (não existe / já reservada / passado)
  // porque a resposta ao paciente é diferente em cada caso.
  async diagnosticarVaga(
    profissionalId: number,
    data: string,
    hora: string,
  ): Promise<DiagnosticoVaga> {
    const { data: rows, error } = await (this.supabase as any)
      .schema('central')
      .rpc('vaga_esta_disponivel', {
        p_profissional_id: profissionalId,
        p_data:            data,
        p_hora:            hora,
      })

    if (error) throw error

    // A função retorna TABLE com uma linha; o supabase-js entrega array.
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row) {
      // Sem linha significa que a própria função não avaliou — tratar como
      // indisponível é a leitura segura (nunca reservar no escuro).
      return { existe_na_grade: false, ja_reservada: false, no_passado: false }
    }
    return row as DiagnosticoVaga
  }

  // Terapias que têm ao menos uma vaga ofertável na janela.
  // É o que o agente usa para responder "quais especialidades vocês têm
  // disponíveis?" sem despejar 500 horários.
  async listarTerapiasComVaga(
    dataInicio?: string | null,
    dataFim?: string | null,
  ): Promise<{ terapiaId: number; terapiaNome: string | null; vagas: number }[]> {
    // Limite alto de propósito: aqui queremos o agregado da janela inteira,
    // não uma página. O teto de 500 da RPC continua valendo como proteção.
    const vagas = await this.listarVagas({ dataInicio, dataFim, limite: 500 })

    const porTerapia = new Map<number, { terapiaNome: string | null; vagas: number }>()
    for (const vaga of vagas) {
      if (vaga.terapia_id == null) continue
      const atual = porTerapia.get(vaga.terapia_id)
      if (atual) atual.vagas += 1
      else porTerapia.set(vaga.terapia_id, { terapiaNome: vaga.terapia_nome, vagas: 1 })
    }

    return [...porTerapia.entries()]
      .map(([terapiaId, v]) => ({ terapiaId, ...v }))
      .sort((a, b) => b.vagas - a.vagas)
  }
}
