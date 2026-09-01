/**
 * Placeholder types para componentes Nina
 * TODO: Refatorar componentes para usar tipos Pulsar reais
 */

export interface Deal {
  id: string
  title: string
  value: number
  priority: 'low' | 'medium' | 'high'
  status?: string
  [key: string]: any
}

export interface DealActivity {
  id: string
  deal_id: string
  type: string
  description: string
  [key: string]: any
}

export interface TeamMember {
  id: string
  name: string
  email: string
  [key: string]: any
}

export interface KanbanColumn {
  id: string
  name: string
  deals: Deal[]
  [key: string]: any
}

export interface Appointment {
  id: string
  title: string
  date: string
  time: string
  contact_id: string
  [key: string]: any
}

export interface Contact {
  id: string
  name: string
  phone_number: string
  email?: string
  [key: string]: any
}

export interface TagDefinition {
  key: string
  label: string
  color: string
  category: string
  [key: string]: any
}

export interface UIConversation {
  id: string
  contact_id: string
  status: string
  [key: string]: any
}

export interface UIMessage {
  id: string
  content: string
  timestamp: string
  sender_id: string
  [key: string]: any
}

export interface DBMessage {
  id: string
  content: string
  [key: string]: any
}

export interface DBConversation {
  id: string
  contact_id: string
  [key: string]: any
}

export interface MessageDirection {
  inbound: 'inbound'
  outbound: 'outbound'
}

export interface MessageType {
  text: 'text'
  image: 'image'
  audio: 'audio'
}

// transformDBToUIMessage e transformDBToUIConversation viviam aqui e não existem
// mais. Eram stubs (`{ ...conv } as UIConversation`) escritos para o
// hooks/nina/useConversations.ts, que lia de public.conversations — tabela que
// nunca existiu neste banco — e foi removido junto com a ligação da
// /connect/inbox no schema `central`.
//
// O cast do stub não compilava: o objeto de partida não tem `status`, exigido
// por UIConversation. `npx tsc --noEmit` reportava e seguia; `next build` PARA,
// e foi o que derrubou o deploy de 01/09.
//
// Quem precisa converter central → UI usa components/nina/adapters/centralToNina.ts,
// que tem os campos completos e testes.
