import 'server-only'

import type {
  AgentSettingsRepository,
  AgentSettingsRow,
  UpdateAgentSettingsInput,
} from '../repositories/agent-settings.repository'
import type { AgentCredentialsRepository } from '../repositories/agent-credentials.repository'
import type { AuditRepository } from '../repositories/audit.repository'
import { type AIMode, isAIMode } from '../types/central.types'
import { TtsNotConfiguredError } from '../types/errors.types'
import {
  listarVozes,
  consultarConta,
  sintetizar,
  type ParametrosVoz,
  type VozDaConta,
  type ContaElevenLabs,
} from '../voz/elevenlabs'

// ============================================================================
// AgentSettingsService
//
// Porta única para a configuração do agente e da voz. Duas responsabilidades
// que andam juntas por um motivo prático: a chave da ElevenLabs mora nesta
// tabela, e é este serviço que decide o que sai dela para o cliente.
//
// Invariante do arquivo: nenhum método público devolve `elevenlabs_api_key`.
// O que sai é `chaveMascarada` (quatro últimos caracteres). A chave completa só
// circula dentro deste módulo, no caminho servidor → ElevenLabs.
//
// Dois repositórios, não um: `repo` usa o cliente do usuário (RLS de admin
// aplicada, é ele que grava o que a tela manda) e `creds` usa service role,
// porque desde a migration 20260810120300 o role `authenticated` perdeu o
// privilégio de LER a coluna da chave — mantendo o de gravá-la. A separação em
// duas classes é o que impede trocar um pelo outro sem o TypeScript reclamar.
// ============================================================================

export interface ConfiguracaoAgente {
  id:                   string
  // Comportamento
  //
  // `aiMode` é o único eixo de autonomia. Não existe mais `modeloIa` aqui: o
  // modelo do LLM é OPENAI_MODEL, variável de runtime, e nunca foi configuração
  // por organização. `respostaAutomatica` também saiu — era a versão de dois
  // estados de `aiMode`, e duas colunas decidindo a mesma coisa divergem.
  aiMode:               AIMode
  agendamentoPorIa:     boolean
  systemPrompt:         string | null
  // Voz
  ttsAtivo:             boolean
  vozId:                string | null
  modeloVoz:            string
  stability:            number
  similarityBoost:      number
  style:                number
  speed:                number
  speakerBoost:         boolean
  // Credencial — presença e sufixo, nunca o valor
  chaveConfigurada:     boolean
  chaveMascarada:       string | null
  atualizadoEm:         string | null
}

export interface ResultadoTeste {
  audioBase64: string
  contentType: string
  tamanhoKb:   number
  // Tempo que a ElevenLabs levou para sintetizar — não é a duração do áudio.
  geracaoMs:   number
  caracteres:  number
}

export interface VozesDisponiveis {
  vozes: VozDaConta[]
  conta: ContaElevenLabs
}

// Modelo padrão quando a linha nunca foi configurada. Multilingual v2 é o que
// lê português com acentuação correta; turbo é mais rápido e mais duro na
// prosódia. Para falar com responsável de paciente, a naturalidade ganha.
const MODELO_PADRAO = 'eleven_multilingual_v2'

// numeric do Postgres pode chegar como string dependendo do driver. Coerção
// centralizada aqui para nenhum caller precisar lembrar disso.
function num(valor: number | string | null | undefined, padrao: number): number {
  if (valor === null || valor === undefined) return padrao
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : padrao
}

// Mostra só o suficiente para o usuário reconhecer QUAL chave está gravada.
// Quatro caracteres não permitem reconstruir nada.
function mascarar(chave: string): string {
  const limpa = chave.trim()
  if (limpa.length <= 4) return '••••'
  return `••••${limpa.slice(-4)}`
}

export class AgentSettingsService {
  constructor(
    private readonly repo:  AgentSettingsRepository,
    private readonly creds: AgentCredentialsRepository,
    private readonly audit: AuditRepository,
  ) {}

  // --------------------------------------------------------------------------
  // Leitura
  // --------------------------------------------------------------------------

  async obter(orgId: string): Promise<ConfiguracaoAgente> {
    const row   = await this.repo.garantirPadrao(orgId)
    const chave = await this.creds.buscarChaveElevenLabs(orgId)
    return this.paraDto(row, chave)
  }

  // --------------------------------------------------------------------------
  // Escrita
  //
  // `chaveApi` só é gravada quando vem preenchida. Campo vazio significa
  // "não mexi nisso", não "apague a chave" — a tela mostra a máscara, não o
  // valor, então um submit normal chega sem a chave e não pode apagá-la.
  // Para remover de fato, o caller passa `removerChave`.
  // --------------------------------------------------------------------------

  async salvar(
    orgId: string,
    patch: {
      chaveApi?:      string
      removerChave?:  boolean
      vozId?:         string | null
      modeloVoz?:     string | null
      stability?:     number
      similarityBoost?: number
      style?:         number
      speed?:         number
      speakerBoost?:  boolean
      ttsAtivo?:      boolean
      systemPrompt?:  string | null
      aiMode?:           AIMode
      agendamentoPorIa?: boolean
    },
    actorId: string | null,
  ): Promise<ConfiguracaoAgente> {
    const row = await this.repo.garantirPadrao(orgId)

    const update: UpdateAgentSettingsInput = {}
    if (patch.vozId              !== undefined) update.elevenlabs_voice_id         = patch.vozId
    if (patch.modeloVoz          !== undefined) update.elevenlabs_model            = patch.modeloVoz
    if (patch.stability          !== undefined) update.elevenlabs_stability        = patch.stability
    if (patch.similarityBoost    !== undefined) update.elevenlabs_similarity_boost = patch.similarityBoost
    if (patch.style              !== undefined) update.elevenlabs_style            = patch.style
    if (patch.speed              !== undefined) update.elevenlabs_speed            = patch.speed
    if (patch.speakerBoost       !== undefined) update.elevenlabs_speaker_boost    = patch.speakerBoost
    if (patch.ttsAtivo           !== undefined) update.tts_enabled                 = patch.ttsAtivo
    if (patch.systemPrompt       !== undefined) update.system_prompt               = patch.systemPrompt
    if (patch.agendamentoPorIa   !== undefined) update.ai_scheduling_enabled        = patch.agendamentoPorIa

    // Segunda barreira de validação do modo. O DTO já rejeita valor fora da
    // allowlist na borda HTTP; esta existe porque `salvar()` também é chamável
    // de dentro do servidor, e um modo inválido aqui vira violação do CHECK no
    // banco — erro 500 opaco em vez de recusa explicável.
    if (patch.aiMode !== undefined) {
      if (!isAIMode(patch.aiMode)) {
        throw new Error(`aiMode inválido: ${String(patch.aiMode)}`)
      }
      update.ai_mode = patch.aiMode
    }

    const trocouChave = typeof patch.chaveApi === 'string' && patch.chaveApi.trim().length > 0
    if (trocouChave)              update.elevenlabs_api_key = patch.chaveApi!.trim()
    else if (patch.removerChave)  update.elevenlabs_api_key = null

    // Sem nada a mudar, devolve o estado atual em vez de fazer um UPDATE vazio
    // (que o PostgREST rejeita).
    if (Object.keys(update).length === 0) {
      return this.paraDto(row, await this.creds.buscarChaveElevenLabs(orgId))
    }

    const atualizado = await this.repo.atualizar(row.id, update)

    // Auditoria lista os campos tocados. `elevenlabs_api_key` aparece como nome
    // de campo; o valor nunca entra no payload.
    await this.audit.insert({
      organization_id: orgId,
      event_type:      'agent_settings.updated',
      performed_by:    actorId ?? undefined,
      payload: {
        campos:        Object.keys(update),
        chaveAlterada: trocouChave,
        chaveRemovida: !trocouChave && !!patch.removerChave,
      },
    })

    return this.paraDto(atualizado, await this.creds.buscarChaveElevenLabs(orgId))
  }

  // --------------------------------------------------------------------------
  // ElevenLabs
  // --------------------------------------------------------------------------

  // Vozes que ESTA chave pode usar, mais a cota da conta.
  // É também a verificação de credencial: se retorna, a chave é válida.
  async listarVozesDaConta(orgId: string): Promise<VozesDisponiveis> {
    const chave = await this.exigirChave(orgId)
    const [vozes, conta] = await Promise.all([
      listarVozes(chave),
      consultarConta(chave),
    ])
    return { vozes, conta }
  }

  async testarVoz(orgId: string, texto: string): Promise<ResultadoTeste> {
    const chave      = await this.exigirChave(orgId)
    const parametros = await this.parametrosDeVoz(orgId)

    const inicio = Date.now()
    const { audio, contentType } = await sintetizar(chave, texto, parametros)
    const geracaoMs = Date.now() - inicio

    return {
      audioBase64: audio.toString('base64'),
      contentType,
      tamanhoKb:   Math.round(audio.byteLength / 1024),
      geracaoMs,
      caracteres:  texto.length,
    }
  }

  // Parâmetros prontos para síntese. Público porque o worker de envio do
  // WhatsApp (Bloco 4) precisa exatamente disto — a voz da atendente no áudio
  // enviado tem de ser a mesma que o admin aprovou no teste.
  async parametrosDeVoz(orgId: string): Promise<ParametrosVoz> {
    const row = await this.repo.garantirPadrao(orgId)

    if (!row.elevenlabs_voice_id) {
      throw new TtsNotConfiguredError(
        orgId,
        'Nenhuma voz selecionada. Escolha uma voz da sua conta ElevenLabs antes de gerar áudio.',
      )
    }

    return {
      voiceId:         row.elevenlabs_voice_id,
      modelId:         row.elevenlabs_model ?? MODELO_PADRAO,
      stability:       num(row.elevenlabs_stability,        0.5),
      similarityBoost: num(row.elevenlabs_similarity_boost, 0.75),
      style:           num(row.elevenlabs_style,            0.3),
      speed:           num(row.elevenlabs_speed,            1.0),
      speakerBoost:    row.elevenlabs_speaker_boost ?? true,
    }
  }

  // --------------------------------------------------------------------------

  private async exigirChave(orgId: string): Promise<string> {
    const chave = await this.creds.buscarChaveElevenLabs(orgId)
    if (!chave) throw new TtsNotConfiguredError(orgId)
    return chave
  }

  private paraDto(row: AgentSettingsRow, chave: string | null): ConfiguracaoAgente {
    return {
      id:                 row.id,
      // Falha fechada: valor inesperado na coluna vira 'off', não autonomia.
      // Se um dia o CHECK for afrouxado ou a coluna vier de um banco antigo, o
      // pior caso é o agente desligado — nunca um agente respondendo por engano.
      aiMode:             isAIMode(row.ai_mode) ? row.ai_mode : 'off',
      agendamentoPorIa:   row.ai_scheduling_enabled,
      systemPrompt:       row.system_prompt,
      ttsAtivo:           row.tts_enabled,
      vozId:              row.elevenlabs_voice_id,
      modeloVoz:          row.elevenlabs_model ?? MODELO_PADRAO,
      stability:          num(row.elevenlabs_stability,        0.5),
      similarityBoost:    num(row.elevenlabs_similarity_boost, 0.75),
      style:              num(row.elevenlabs_style,            0.3),
      speed:              num(row.elevenlabs_speed,            1.0),
      speakerBoost:       row.elevenlabs_speaker_boost ?? true,
      chaveConfigurada:   !!chave,
      chaveMascarada:     chave ? mascarar(chave) : null,
      atualizadoEm:       row.updated_at,
    }
  }
}
