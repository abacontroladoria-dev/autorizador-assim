import { extractUser }      from '@/lib/central/auth'
import { mapCentralError }  from '@/lib/central/errors'
import { ok }               from '@/lib/central/response'

// GET /api/central/organization
//
// Identidade e configuração operacional da organização do usuário logado.
//
// Substitui a leitura direta de nina_settings_public e user_roles que o
// componente herdado do Nina fazia no browser — nenhuma das duas existe neste
// banco (404 em toda montagem da Central). A fonte real é
// central.organizations, que a migration 20260701010000 estendeu com timezone,
// horário comercial e agent_name.
//
// Precisa ser rota de servidor, não query direta: o schema central não é
// exposto ao PostgREST em produção.
export async function GET() {
  try {
    const { user, supabase } = await extractUser()

    const { data, error } = await (supabase as any)
      .schema('central')
      .from('organizations')
      .select('id, name, slug, timezone, business_hours_start, business_hours_end, business_days, agent_name')
      .eq('id', user.orgId)
      .maybeSingle()

    if (error) throw error

    return ok({
      id:       data?.id       ?? user.orgId,
      // Nome da clínica. Sem fallback genérico do tipo "Sua Empresa": se o dado
      // não vier, é melhor a UI mostrar vazio do que afirmar algo errado.
      nome:     data?.name     ?? null,
      slug:     data?.slug     ?? null,
      timezone: data?.timezone ?? 'America/Sao_Paulo',
      // Nome do agente de IA exibido nas mensagens ao paciente.
      agentName: data?.agent_name ?? null,
      horarioComercial: {
        inicio: data?.business_hours_start ?? null,
        fim:    data?.business_hours_end   ?? null,
        // ISO: 1 = segunda … 7 = domingo
        dias:   data?.business_days        ?? null,
      },
      // central_role vem de fonte confiável (JWT ou banco) via extractUser
      centralRole: user.centralRole,
      isAdmin:     user.centralRole === 'admin',
    })
  } catch (err) {
    return mapCentralError(err)
  }
}
