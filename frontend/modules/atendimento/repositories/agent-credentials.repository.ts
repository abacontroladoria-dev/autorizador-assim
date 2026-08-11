import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// AgentCredentialsRepository
//
// Único lugar que lê colunas de credencial do schema central.
//
// Existe como CLASSE SEPARADA de AgentSettingsRepository de propósito. As duas
// leem a mesma tabela, mas com privilégios diferentes: desde a migration
// 20260810120300, `authenticated` pode GRAVAR elevenlabs_api_key e não pode
// LÊ-LA — quem lê é service role. Se o método de credencial morasse no mesmo
// repositório, seria uma linha de código passar o cliente do usuário e receber
// 403 em produção, num caminho que o teste local com service role não pegaria.
//
// Sendo classes distintas, o TypeScript recusa a troca: o service pede
// AgentCredentialsRepository, e a única fábrica que o constrói usa
// supabaseService. O mesmo princípio de AuditRepository, que também é sempre
// service role.
//
// Regra do arquivo: nenhum valor lido aqui é devolvido a um caller que responda
// requisição HTTP. O destino é sempre uma chamada servidor → terceiro.
// ============================================================================

export class AgentCredentialsRepository {
  // Espera receber supabaseService (service role). Nunca o cliente do usuário —
  // com o cliente do usuário todo método aqui responde 403 por privilégio de
  // coluna, que é exatamente a proteção pretendida.
  constructor(private readonly supabase: SupabaseClient) {}

  // Chave da ElevenLabs da configuração padrão da organização.
  // null quando não há chave OU quando está gravada como string vazia — os dois
  // casos significam "não configurada" e não vale distingui-los rio acima.
  async buscarChaveElevenLabs(orgId: string): Promise<string | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('agent_settings')
      .select('elevenlabs_api_key')
      .eq('organization_id', orgId)
      .is('inbox_id', null)
      .maybeSingle()

    if (error) throw error

    const chave = (data?.elevenlabs_api_key ?? null) as string | null
    return chave && chave.trim() ? chave : null
  }

  // Credenciais do provider de mensageria de um canal.
  //
  // provider_metadata guarda access token e phone_number_id da Meta Cloud API.
  // Mesma regra da chave acima: sai daqui só para a chamada ao provider.
  async buscarMetadadosCanal(
    orgId: string,
    channelId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('channel_connections')
      .select('provider_metadata')
      .eq('organization_id', orgId)
      .eq('channel_id', channelId)
      .maybeSingle()

    if (error) throw error
    return (data?.provider_metadata ?? null) as Record<string, unknown> | null
  }
}
