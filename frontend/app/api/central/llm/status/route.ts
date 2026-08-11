import { extractUser }               from '@/lib/central/auth'
import { mapCentralError }           from '@/lib/central/errors'
import { ok, forbidden }             from '@/lib/central/response'
import {
  MODELOS_PERMITIDOS,
  openAiEstaConfigurada,
  resolverConfiguracaoOpenAI,
} from '@/modules/atendimento/llm/modelo'

// ============================================================================
// GET /api/central/llm/status
//
// Responde "a integração com a OpenAI está configurada?" sem gastar uma chamada
// à OpenAI e sem revelar a credencial.
//
// Por que é rota e não campo de agent-settings: a chave e o modelo são
// variáveis de RUNTIME do servidor, não linhas de central.agent_settings. Servir
// isso junto da configuração editável daria a impressão de que dá para mudar o
// modelo pela tela — que é exatamente a confusão que a migration 20260811100000
// desfez ao remover `ai_model_mode`. Por isso é somente leitura: não existe
// PATCH correspondente, de propósito.
//
// O que sai daqui:
//   configurada        booleano
//   motivo             quando não configurada, QUAL variável falta
//   modelo             id do modelo ativo (não é segredo; a chave é)
//   modelosPermitidos  a allowlist, para a tela explicar o que é aceito
//
// O que NUNCA sai: OPENAI_API_KEY, nem mascarada. Máscara faz sentido para uma
// chave que o usuário cola pela tela e precisa reconhecer depois (ElevenLabs);
// esta ninguém cola pela tela — vem do Coolify —, então exibir qualquer pedaço
// dela seria exposição sem finalidade.
// ============================================================================

function exigirAdmin(centralRole: string): string | null {
  if (centralRole !== 'admin') {
    return 'Apenas administradores podem ver o status da integração de IA'
  }
  return null
}

export async function GET() {
  try {
    const { user } = await extractUser()

    const negado = exigirAdmin(user.centralRole)
    if (negado) return forbidden(negado)

    const { configurada, motivo } = openAiEstaConfigurada()

    return ok({
      configurada,
      motivo,
      // Só lê o modelo quando a configuração é válida — resolver() lança quando
      // não é, e aqui a ausência já foi respondida por `motivo`.
      modelo: configurada ? resolverConfiguracaoOpenAI().modelo : null,
      modelosPermitidos: [...MODELOS_PERMITIDOS],
    })
  } catch (err) {
    return mapCentralError(err)
  }
}
