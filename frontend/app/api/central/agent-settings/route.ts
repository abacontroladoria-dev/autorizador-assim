import { extractUser }                    from '@/lib/central/auth'
import { mapCentralError }                from '@/lib/central/errors'
import { ok, badRequest, forbidden }      from '@/lib/central/response'
import { createAgentSettingsService }     from '@/modules/atendimento/services'
import { parseSalvarConfiguracaoBody }    from '@/modules/atendimento/dto/agent-settings.dto'

// ============================================================================
// /api/central/agent-settings
//
// Configuração do agente e da voz da atendente virtual.
//
// Substitui a leitura e escrita diretas em `nina_settings` que a tela de
// Configurações fazia no browser. Aquela tabela pertence a outro projeto
// Supabase, que não existe mais — o host nem resolve em DNS. Por isso salvar a
// chave da ElevenLabs "funcionava" sem gravar nada: o cliente errava o alvo e o
// erro morria num console.error.
//
// A chave nunca sai por esta rota. GET devolve `chaveConfigurada` e os quatro
// últimos caracteres; a chave completa só circula servidor → ElevenLabs.
// ============================================================================

// Só admin. A RLS de central.agent_settings também exige isso, mas a checagem
// aqui devolve 403 com mensagem em vez de um "nenhuma linha encontrada" que
// pareceria banco vazio.
function exigirAdmin(centralRole: string): string | null {
  if (centralRole !== 'admin') {
    return 'Apenas administradores podem ver ou alterar a configuração do agente'
  }
  return null
}

export async function GET() {
  try {
    const { user, supabase } = await extractUser()

    const negado = exigirAdmin(user.centralRole)
    if (negado) return forbidden(negado)

    const service = createAgentSettingsService(supabase)
    return ok(await service.obter(user.orgId))
  } catch (err) {
    return mapCentralError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabase } = await extractUser()

    const negado = exigirAdmin(user.centralRole)
    if (negado) return forbidden(negado)

    const raw = await request.json().catch(() => null)
    const parsed = parseSalvarConfiguracaoBody(raw)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const service = createAgentSettingsService(supabase)
    return ok(await service.salvar(user.orgId, parsed.data, user.id))
  } catch (err) {
    return mapCentralError(err)
  }
}
