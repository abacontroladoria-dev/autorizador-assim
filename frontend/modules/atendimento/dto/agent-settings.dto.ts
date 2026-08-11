import { AI_MODES, isAIMode, type AIMode } from '../types/central.types'

type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }

// ID de modelo da ElevenLabs: 'eleven_multilingual_v2', 'eleven_turbo_v2_5'…
// Validado por forma, não por lista fechada — a ElevenLabs publica modelos
// novos e uma allowlist no código vira bloqueio arbitrário na próxima.
const MODELO_RE = /^[a-z0-9_]{3,64}$/

// voice_id é alfanumérico de 20 caracteres, mas o formato já mudou antes.
// Tamanho e alfabeto bastam para barrar lixo sem apostar no formato exato.
const VOZ_RE = /^[A-Za-z0-9]{8,64}$/

const TEXTO_MAX = 1000

// ----------------------------------------------------------------------------
// PATCH /api/central/agent-settings
// ----------------------------------------------------------------------------

export interface SalvarConfiguracaoBody {
  chaveApi?:           string
  removerChave?:       boolean
  vozId?:              string | null
  modeloVoz?:          string | null
  stability?:          number
  similarityBoost?:    number
  style?:              number
  speed?:              number
  speakerBoost?:       boolean
  ttsAtivo?:           boolean
  systemPrompt?:       string | null
  aiMode?:             AIMode
  agendamentoPorIa?:   boolean
}

export function parseSalvarConfiguracaoBody(raw: unknown): ParseResult<SalvarConfiguracaoBody> {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['corpo deve ser um objeto JSON'] }
  }
  const b = raw as Record<string, unknown>
  const data: SalvarConfiguracaoBody = {}

  // --- credencial ---
  if (b.chaveApi !== undefined && b.chaveApi !== null && b.chaveApi !== '') {
    if (typeof b.chaveApi !== 'string') {
      errors.push('chaveApi deve ser string')
    } else {
      const chave = b.chaveApi.trim()
      // Espaço no meio é quase sempre cópia truncada com quebra de linha —
      // e a ElevenLabs devolveria só um 401 opaco.
      if (/\s/.test(chave))    errors.push('chaveApi contém espaços — verifique se a cópia veio completa')
      else if (chave.length < 20) errors.push('chaveApi curta demais para ser uma chave da ElevenLabs')
      else data.chaveApi = chave
    }
  }

  if (b.removerChave !== undefined) {
    if (typeof b.removerChave !== 'boolean') errors.push('removerChave deve ser booleano')
    else data.removerChave = b.removerChave
  }

  // --- voz ---
  if (b.vozId !== undefined) {
    if (b.vozId === null || b.vozId === '') {
      data.vozId = null
    } else if (typeof b.vozId !== 'string' || !VOZ_RE.test(b.vozId)) {
      errors.push('vozId inválido')
    } else {
      data.vozId = b.vozId
    }
  }

  if (b.modeloVoz !== undefined) {
    if (b.modeloVoz === null || b.modeloVoz === '') {
      data.modeloVoz = null
    } else if (typeof b.modeloVoz !== 'string' || !MODELO_RE.test(b.modeloVoz)) {
      errors.push('modeloVoz inválido')
    } else {
      data.modeloVoz = b.modeloVoz
    }
  }

  // --- parâmetros numéricos ---
  // Faixas idênticas às da API da ElevenLabs. Validar aqui evita gastar uma
  // chamada (e cota) para receber 422 do outro lado.
  lerNumero(b, 'stability',       0,   1,   errors, v => (data.stability = v))
  lerNumero(b, 'similarityBoost', 0,   1,   errors, v => (data.similarityBoost = v))
  lerNumero(b, 'style',           0,   1,   errors, v => (data.style = v))
  lerNumero(b, 'speed',           0.5, 2,   errors, v => (data.speed = v))

  // --- booleanos ---
  lerBooleano(b, 'speakerBoost',     errors, v => (data.speakerBoost = v))
  lerBooleano(b, 'ttsAtivo',         errors, v => (data.ttsAtivo = v))
  lerBooleano(b, 'agendamentoPorIa', errors, v => (data.agendamentoPorIa = v))

  // --- autonomia ---
  // Allowlist fechada, e é de propósito que não haja fallback: um modo
  // desconhecido chegando como 'off' silenciosamente esconderia um bug de
  // cliente, e chegando como 'autonomous' faria o agente falar com gente sem
  // ninguém ter pedido. Valor fora da lista é recusado com a lista na mensagem.
  if (b.aiMode !== undefined) {
    if (!isAIMode(b.aiMode)) {
      errors.push(`aiMode deve ser um de: ${AI_MODES.join(', ')}`)
    } else {
      data.aiMode = b.aiMode
    }
  }

  // --- prompt ---
  if (b.systemPrompt !== undefined) {
    if (b.systemPrompt === null) data.systemPrompt = null
    else if (typeof b.systemPrompt !== 'string') errors.push('systemPrompt deve ser string ou null')
    else data.systemPrompt = b.systemPrompt
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, data }
}

// ----------------------------------------------------------------------------
// POST /api/central/voz/testar
// ----------------------------------------------------------------------------

export interface TestarVozBody {
  texto: string
}

export function parseTestarVozBody(raw: unknown): ParseResult<TestarVozBody> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['corpo deve ser um objeto JSON'] }
  }
  const texto = (raw as Record<string, unknown>).texto

  if (typeof texto !== 'string' || !texto.trim()) {
    return { ok: false, errors: ['texto é obrigatório'] }
  }
  // O teto protege a cota da conta: são caracteres cobrados por chamada, e um
  // paste acidental de página inteira consumiria milhares deles num clique.
  if (texto.length > TEXTO_MAX) {
    return { ok: false, errors: [`texto tem ${texto.length} caracteres; o limite do teste é ${TEXTO_MAX}`] }
  }

  return { ok: true, data: { texto: texto.trim() } }
}

// ----------------------------------------------------------------------------

function lerNumero(
  b: Record<string, unknown>,
  campo: string,
  min: number,
  max: number,
  errors: string[],
  set: (v: number) => void,
): void {
  const valor = b[campo]
  if (valor === undefined) return

  // Slider de HTML manda número; JSON de terceiro manda string com frequência.
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n))       errors.push(`${campo} deve ser numérico`)
  else if (n < min || n > max)   errors.push(`${campo} deve estar entre ${min} e ${max}`)
  else                           set(n)
}

function lerBooleano(
  b: Record<string, unknown>,
  campo: string,
  errors: string[],
  set: (v: boolean) => void,
): void {
  const valor = b[campo]
  if (valor === undefined) return
  if (typeof valor !== 'boolean') errors.push(`${campo} deve ser booleano`)
  else set(valor)
}
