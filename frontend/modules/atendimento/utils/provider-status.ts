import type { MessageStatus } from '../types/central.types'

// ----------------------------------------------------------------------------
// Mapeia status raw do provider para o MessageStatus interno.
//
// Evolution API (MESSAGE_UPDATE webhook):
//   PENDING      → mensagem na fila local do cliente
//   SERVER_ACK   → servidor do WhatsApp recebeu (um tick)
//   DELIVERY_ACK → dispositivo do destinatário recebeu (dois ticks)
//   READ         → destinatário leu (dois ticks azuis)
//   PLAYED       → áudio/vídeo reproduzido (dois ticks azuis com play)
//   ERROR        → falha de entrega
//
// Meta WABA (Cloud API):
//   sent      → servidor Meta processou
//   delivered → dispositivo recebeu
//   read      → lido
//   failed    → falha
//
// Fallback: status desconhecido → 'failed' (estado seguro para UI).
// ----------------------------------------------------------------------------

const EVOLUTION_MAP: Readonly<Record<string, MessageStatus>> = {
  PENDING:      'pending',
  SERVER_ACK:   'sent',
  DELIVERY_ACK: 'delivered',
  READ:         'read',
  PLAYED:       'read',
  ERROR:        'failed',
}

const META_WABA_MAP: Readonly<Record<string, MessageStatus>> = {
  sent:      'sent',
  delivered: 'delivered',
  read:      'read',
  failed:    'failed',
}

export function mapProviderStatus(rawStatus: string, provider: string): MessageStatus {
  if (provider === 'evolution') {
    return EVOLUTION_MAP[rawStatus.toUpperCase()] ?? 'failed'
  }

  if (provider === 'meta_waba') {
    return META_WABA_MAP[rawStatus.toLowerCase()] ?? 'failed'
  }

  // Provider desconhecido — tenta os dois mapas antes de usar fallback
  return (
    EVOLUTION_MAP[rawStatus.toUpperCase()]      ??
    META_WABA_MAP[rawStatus.toLowerCase()]      ??
    'failed'
  )
}
