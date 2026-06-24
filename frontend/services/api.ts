/**
 * Placeholder API functions para componentes Nina
 * TODO: Refatorar componentes para usar APIs Pulsar reais
 */

import { Deal, Contact, Appointment, KanbanColumn } from '@/types'

const DEFAULT_STAGES: KanbanColumn[] = [
  { id: 'stage-1', title: 'Novos Leads',      name: 'Novos Leads',      color: 'border-slate-500',   isLocked: false, isAiManaged: false, order: 1, deals: [] },
  { id: 'stage-2', title: 'Em Qualificação',  name: 'Em Qualificação',  color: 'border-yellow-500',  isLocked: false, isAiManaged: false, order: 2, deals: [] },
  { id: 'stage-3', title: 'Oportunidade',     name: 'Oportunidade',     color: 'border-cyan-500',    isLocked: false, isAiManaged: false, order: 3, deals: [] },
  { id: 'stage-4', title: 'Fechamento',       name: 'Fechamento',       color: 'border-slate-500',   isLocked: false, isAiManaged: false, order: 4, deals: [] },
  { id: 'stage-5', title: 'Ganho',            name: 'Ganho',            color: 'border-emerald-500', isLocked: true,  isAiManaged: false, order: 5, deals: [] },
  { id: 'stage-6', title: 'Perdido',          name: 'Perdido',          color: 'border-red-500',     isLocked: true,  isAiManaged: false, order: 6, deals: [] },
]

export const api = {
  fetchPipeline: async (): Promise<Deal[]> => [],
  fetchPipelineStages: async (): Promise<KanbanColumn[]> => DEFAULT_STAGES,
  fetchContacts: async (): Promise<Contact[]> => [],
  fetchAppointments: async (): Promise<Appointment[]> => [],
  fetchTeamMembers: async () => [],
  fetchTeam: async () => [],
  fetchDealActivities: async (dealId: string) => [],
  createDeal: async (data: any) => ({ id: '1', ...data }),
  updateDeal: async (id: string, data: any) => ({ id, ...data }),
  deleteDeal: async (id: string) => true,
  createContact: async (data: any) => ({ id: '1', ...data }),
  updateContact: async (id: string, data: any) => ({ id, ...data }),
  deleteContact: async (id: string) => true,
  createAppointment: async (data: any) => ({ id: '1', ...data }),
  updateAppointment: async (id: string, data: any) => ({ id, ...data }),
  deleteAppointment: async (id: string) => true,
  createPipelineStage: async (data: any) => ({ id: '1', ...data }),
  updatePipelineStage: async (id: string, data: any) => ({ id, ...data }),
  deletePipelineStage: async (id: string, moveToStageId?: string) => true,
  reorderPipelineStages: async (stages: any[]) => stages,
  markDealLost: async (id: string, reason: string) => ({ id }),
  markDealWon: async (id: string) => ({ id }),
  updateDealOwner: async (id: string, ownerId: string) => ({ id, owner_id: ownerId }),
  moveDealStage: async (id: string, stageId: string) => ({ id, stage_id: stageId }),
  createDealActivity: async (data: any) => ({ id: '1', ...data }),
  updateDealActivity: async (id: string, data: any) => ({ id, ...data }),
  deleteDealActivity: async (id: string) => true,
  fetchConversations: async () => [],
  fetchConversationMessages: async (conversationId: string, limit?: number) => [],
  sendMessage: async (data: any) => ({ id: '1', ...data }),
  updateConversationStatus: async (id: string, status: string) => ({ id, status }),
  markMessagesAsRead: async (ids: string[]) => ids,
  assignConversation: async (id: string, userId: string) => ({ id, user_id: userId }),
  fetchNinaSettings: async () => ({}),
  updateNinaSettings: async (data: any) => data,
  updatePipelineSettings: async (data: any) => data,
  validateSetup: async () => ({ results: [], overallStatus: 'ok' as const }),
}
