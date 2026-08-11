import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// AgentSettingsRepository
//
// Acesso a central.agent_settings — comportamento do agente + parâmetros de voz.
//
// Uma organização tem uma linha padrão (inbox_id IS NULL) e, opcionalmente,
// overrides por inbox. Todo este repositório trabalha com a linha padrão: a
// clínica tem um único agente. O índice parcial uq_agent_settings_org_default
// garante que ela seja única.
//
// Este repositório NÃO lê credencial. `elevenlabs_api_key` só é lida por
// AgentCredentialsRepository, que exige service role — desde a migration
// 20260810120300 o role `authenticated` pode gravar a chave e não pode lê-la.
// A escrita continua aqui porque é a tela do admin que grava.
// ============================================================================

// Colunas seguras. Escritas à mão, não '*': além de a credencial não poder
// entrar por descuido, sob privilégio por coluna um select('*') responde 403.
const COLUNAS_SEGURAS = `
  id, organization_id, inbox_id,
  ai_mode, ai_scheduling_enabled, system_prompt,
  response_delay_min, response_delay_max, message_breaking_enabled,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled, created_at, updated_at
`

export interface AgentSettingsRow {
  id:                          string
  organization_id:             string
  inbox_id:                    string | null
  // Autonomia. Vem como string do Postgres (CHECK, não enum); quem consome
  // valida com isAIMode() antes de tratar como AIMode.
  ai_mode:                     string
  ai_scheduling_enabled:       boolean
  system_prompt:               string | null
  response_delay_min:          number
  response_delay_max:          number
  message_breaking_enabled:    boolean
  elevenlabs_voice_id:         string | null
  elevenlabs_model:            string | null
  elevenlabs_stability:        number | string | null
  elevenlabs_similarity_boost: number | string | null
  elevenlabs_style:            number | string | null
  elevenlabs_speed:            number | string | null
  elevenlabs_speaker_boost:    boolean
  tts_enabled:                 boolean
  created_at:                  string | null
  updated_at:                  string | null
}

export interface UpdateAgentSettingsInput {
  elevenlabs_api_key?:          string | null
  elevenlabs_voice_id?:         string | null
  elevenlabs_model?:            string | null
  elevenlabs_stability?:        number
  elevenlabs_similarity_boost?: number
  elevenlabs_style?:            number
  elevenlabs_speed?:            number
  elevenlabs_speaker_boost?:    boolean
  tts_enabled?:                 boolean
  system_prompt?:               string | null
  ai_mode?:                     string
  ai_scheduling_enabled?:       boolean
}

export class AgentSettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // Configuração padrão da organização, sem credenciais.
  async buscarPadrao(orgId: string): Promise<AgentSettingsRow | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('agent_settings')
      .select(COLUNAS_SEGURAS)
      .eq('organization_id', orgId)
      .is('inbox_id', null)
      .maybeSingle()

    if (error) throw error
    return (data ?? null) as AgentSettingsRow | null
  }

  // Cria a linha padrão se ela não existir.
  //
  // Necessário porque a linha vem do seed (20260701010500) e, num banco onde o
  // seed não rodou, a tela de configuração não teria o que atualizar. Sem isto o
  // sintoma é o mesmo da tela antiga: salvar "dá certo" e nada é gravado, porque
  // o UPDATE atinge zero linhas.
  async garantirPadrao(orgId: string): Promise<AgentSettingsRow> {
    const existente = await this.buscarPadrao(orgId)
    if (existente) return existente

    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('agent_settings')
      .insert({ organization_id: orgId, inbox_id: null })
      .select(COLUNAS_SEGURAS)
      .single()

    if (error) throw error
    return data as AgentSettingsRow
  }

  async atualizar(
    id: string,
    patch: UpdateAgentSettingsInput,
  ): Promise<AgentSettingsRow> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('agent_settings')
      .update(patch)
      .eq('id', id)
      .select(COLUNAS_SEGURAS)
      .single()

    if (error) throw error
    return data as AgentSettingsRow
  }
}
