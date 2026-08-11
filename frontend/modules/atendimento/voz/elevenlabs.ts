import 'server-only'

import { TtsProviderError } from '../types/errors.types'

// ============================================================================
// Cliente HTTP da ElevenLabs.
//
// Roda somente no servidor ('server-only'). A chave nunca chega ao browser:
// quem digita na tela manda a chave uma vez para gravar, e a partir daí é o
// servidor que fala com a ElevenLabs. A tela antiga fazia o contrário —
// carregava a chave para o estado do React e a reenviava no corpo de cada
// chamada de teste.
//
// Toda falha vira TtsProviderError com o status e a mensagem que a ElevenLabs
// devolveu. Isso é deliberado: "chave inválida" (401), "essa voz não é da sua
// conta" (400/404) e "cota estourada" (401 com detail quota_exceeded) pedem
// três ações diferentes do usuário, e a tela só consegue orientar se a
// mensagem original sobreviver.
// ============================================================================

const BASE = 'https://api.elevenlabs.io/v1'

// A síntese de um parágrafo leva ~1–3 s; 30 s é folga para cota lenta sem
// deixar a rota do Next presa indefinidamente.
const TIMEOUT_MS = 30_000

export interface ParametrosVoz {
  voiceId:         string
  modelId:         string
  stability:       number
  similarityBoost: number
  style:           number
  speakerBoost:    boolean
  speed:           number
}

export interface VozDaConta {
  voiceId:  string
  nome:     string
  // 'premade' = catálogo público da ElevenLabs; 'cloned'/'professional' = da conta.
  categoria: string | null
  idioma:    string | null
  descricao: string | null
  previewUrl: string | null
}

export interface ContaElevenLabs {
  tier:               string | null
  caracteresUsados:   number | null
  caracteresLimite:   number | null
}

export interface AudioSintetizado {
  audio:       Buffer
  contentType: string
}

// ----------------------------------------------------------------------------
// A ElevenLabs devolve erro em dois formatos:
//   { detail: { status, code, type, message } }   — o comum
//   { detail: "texto" }                           — em alguns 4xx de validação
//
// O código importa tanto quanto a mensagem, porque o status HTTP não classifica
// nada aqui: chave inválida vem como 400 e cota esgotada vem como 401. Quem
// decidir "é problema de credencial?" olhando só o status erra nos dois casos.
// ----------------------------------------------------------------------------
function extrairErro(corpo: string, status: number): { mensagem: string; codigo: string | null } {
  try {
    const json = JSON.parse(corpo) as { detail?: unknown; message?: unknown }
    const detail = json.detail

    if (typeof detail === 'string' && detail.trim()) {
      return { mensagem: detail, codigo: null }
    }

    if (detail && typeof detail === 'object') {
      const d = detail as { message?: unknown; status?: unknown; code?: unknown; type?: unknown }
      const codigo =
        [d.status, d.code, d.type].find((v): v is string => typeof v === 'string' && !!v.trim()) ?? null
      const mensagem =
        (typeof d.message === 'string' && d.message.trim() && d.message) || codigo

      if (mensagem) return { mensagem, codigo }
    }

    if (typeof json.message === 'string' && json.message.trim()) {
      return { mensagem: json.message, codigo: null }
    }
  } catch {
    // corpo não-JSON: cai no fallback abaixo
  }

  const recorte = corpo.trim().slice(0, 300)
  return {
    mensagem: recorte || `A ElevenLabs respondeu HTTP ${status} sem detalhes.`,
    codigo: null,
  }
}

async function chamar(
  caminho: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  let resp: Response
  try {
    resp = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        'xi-api-key': apiKey,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    // Timeout, DNS, TLS — nada disso tem status HTTP. 0 marca "não chegou lá".
    const causa = err instanceof Error ? err.message : String(err)
    throw new TtsProviderError(0, `Não foi possível falar com a ElevenLabs: ${causa}`)
  }

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '')
    const { mensagem, codigo } = extrairErro(corpo, resp.status)
    throw new TtsProviderError(resp.status, mensagem, codigo)
  }

  return resp
}

// ----------------------------------------------------------------------------
// Vozes disponíveis PARA ESTA CHAVE.
//
// Existe porque a tela antiga trazia 21 voice_ids fixos no código. Voz do
// catálogo público some, voz clonada da clínica não aparece, e o resultado é
// um "voice_not_found" que parece problema de chave. A conta é a fonte da
// verdade sobre quais vozes podem ser usadas.
// ----------------------------------------------------------------------------
export async function listarVozes(apiKey: string): Promise<VozDaConta[]> {
  const resp = await chamar('/voices', apiKey, { method: 'GET' })
  const json = await resp.json() as {
    voices?: Array<{
      voice_id?: string
      name?: string
      category?: string
      description?: string
      preview_url?: string
      labels?: Record<string, string>
    }>
  }

  return (json.voices ?? [])
    .filter((v): v is { voice_id: string } & typeof v => typeof v.voice_id === 'string')
    .map(v => ({
      voiceId:    v.voice_id,
      nome:       v.name ?? v.voice_id,
      categoria:  v.category ?? null,
      // labels traz language/accent/gender quando a voz é do catálogo público
      idioma:     v.labels?.language ?? v.labels?.accent ?? null,
      descricao:  v.description ?? null,
      previewUrl: v.preview_url ?? null,
    }))
}

// ----------------------------------------------------------------------------
// Cota da conta. É a resposta objetiva para "minha chave funciona?": se isto
// retorna, a credencial é válida e ainda há caracteres.
// ----------------------------------------------------------------------------
export async function consultarConta(apiKey: string): Promise<ContaElevenLabs> {
  const resp = await chamar('/user/subscription', apiKey, { method: 'GET' })
  const json = await resp.json() as {
    tier?: string
    character_count?: number
    character_limit?: number
  }

  return {
    tier:             json.tier ?? null,
    caracteresUsados: typeof json.character_count === 'number' ? json.character_count : null,
    caracteresLimite: typeof json.character_limit === 'number' ? json.character_limit : null,
  }
}

// ----------------------------------------------------------------------------
// Text-to-speech.
//
// mp3_44100_128 é o formato padrão e está disponível em todos os planos —
// bitrates acima de 128 kbps exigem plano pago, e pedir um formato indisponível
// devolve 401, que parece erro de chave. Para nota de voz do WhatsApp o formato
// certo é ogg/opus, mas isso é assunto do worker de envio (Bloco 4); aqui o
// destino é o player da tela.
// ----------------------------------------------------------------------------
export async function sintetizar(
  apiKey: string,
  texto: string,
  p: ParametrosVoz,
): Promise<AudioSintetizado> {
  const voiceSettings: Record<string, unknown> = {
    stability:         p.stability,
    similarity_boost:  p.similarityBoost,
    style:             p.style,
    use_speaker_boost: p.speakerBoost,
  }

  // `speed` só viaja quando foi alterado: modelos que não suportam o campo
  // recusam a requisição inteira, e 1.0 não muda nada no áudio de qualquer forma.
  if (Math.abs(p.speed - 1) > 0.001) voiceSettings.speed = p.speed

  const resp = await chamar(
    `/text-to-speech/${encodeURIComponent(p.voiceId)}?output_format=mp3_44100_128`,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text:           texto,
        model_id:       p.modelId,
        voice_settings: voiceSettings,
      }),
    },
  )

  const buffer = Buffer.from(await resp.arrayBuffer())

  // Resposta 200 com corpo vazio já aconteceu em indisponibilidade parcial da
  // ElevenLabs. Sem esta checagem a tela recebe um <audio> mudo e o usuário
  // conclui que a voz está errada.
  if (buffer.byteLength === 0) {
    throw new TtsProviderError(502, 'A ElevenLabs respondeu com áudio vazio. Tente novamente.')
  }

  return {
    audio:       buffer,
    contentType: resp.headers.get('content-type') ?? 'audio/mpeg',
  }
}
