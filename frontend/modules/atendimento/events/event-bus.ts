// ============================================================================
// Central de Atendimento — Event Bus
//
// IMPORTANTE — ESCOPO LOCAL AO PROCESSO
// ============================================================================
//
// Este barramento é in-process: existe apenas na instância Node.js atual.
// Garantias que NÃO são fornecidas:
//   ✗ Persistência — eventos perdidos em caso de restart ou crash
//   ✗ Entrega garantida — falha no listener não gera retry
//   ✗ Distribuição — em deploy com múltiplas réplicas cada instância tem
//     seu próprio barramento independente
//
// Usos válidos (side effects após operação principal persistida):
//   ✓ Disparar notificação após conversa ser atribuída
//   ✓ Registrar métrica de SLA após mensagem recebida
//   ✓ Log observacional de eventos
//
// Usos inválidos:
//   ✗ Orquestrar o fluxo principal de negócio
//   ✗ Substituir comunicação entre serviços distribuídos
//   ✗ Garantir execução de jobs após falha do processo
//
// Migração planejada para Sprint 2+:
//   Eventos de alta criticidade (SLA violations, notificações) serão
//   movidos para BullMQ + Redis para garantias de entrega e persistência.
// ============================================================================

import { EventEmitter } from 'events'
import type { CAEventName, CAEventPayload } from '../types/events.types'

// Wrapper tipado sobre EventEmitter nativo do Node.js.
// Garante que event names e payloads correspondam ao CAEventMap em compile time.
class TypedEventBus {
  private readonly emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    // Limite generoso: cada service registra ~2-3 listeners por evento.
    // Aumentar se novos services forem adicionados no Sprint 2+.
    this.emitter.setMaxListeners(30)
  }

  on<K extends CAEventName>(
    event: K,
    listener: (payload: CAEventPayload<K>) => void | Promise<void>
  ): this {
    this.emitter.on(event, listener)
    return this
  }

  off<K extends CAEventName>(
    event: K,
    listener: (payload: CAEventPayload<K>) => void | Promise<void>
  ): this {
    this.emitter.off(event, listener)
    return this
  }

  // Emit é síncrono — chama todos os listeners antes de retornar.
  // Listeners async recebem uma Promise que NÃO é awaited.
  // Falha em listener não propaga para o caller.
  emit<K extends CAEventName>(event: K, payload: CAEventPayload<K>): void {
    this.emitter.emit(event, payload)
  }

  listenerCount(event: CAEventName): number {
    return this.emitter.listenerCount(event)
  }
}

// Singleton da instância Node.js atual.
// Importar caEventBus, não instanciar TypedEventBus diretamente.
export const caEventBus = new TypedEventBus()

// Exportar o tipo para injeção nos services
export type { TypedEventBus }
