import { Contact, StatMetric, UIConversation } from '@/types/nina'

// TODO: Implementar com chamadas reais ao Supabase

export const api = {
  fetchDashboardMetrics: async (days: number = 1): Promise<StatMetric[]> => {
    return [
      { label: 'Atendimentos', value: '24', trend: '+12%', trendUp: true },
      { label: 'Novos Leads', value: '8', trend: '+5%', trendUp: true },
      { label: 'Conversões', value: '3', trend: '+2%', trendUp: true },
      { label: 'Tempo Médio', value: '2m', trend: '-8%', trendUp: false }
    ]
  },

  fetchChartData: async (days: number = 1): Promise<any[]> => {
    return [
      { name: 'Seg', chats: 40, sales: 24 },
      { name: 'Ter', chats: 45, sales: 28 },
      { name: 'Qua', chats: 38, sales: 20 },
      { name: 'Qui', chats: 52, sales: 35 },
      { name: 'Sex', chats: 48, sales: 32 },
      { name: 'Sab', chats: 28, sales: 15 },
      { name: 'Dom', chats: 18, sales: 8 }
    ]
  },

  fetchConversations: async (): Promise<UIConversation[]> => {
    return []
  },

  fetchContacts: async (): Promise<Contact[]> => {
    return []
  },

  fetchTagDefinitions: async (): Promise<any[]> => {
    return []
  },

  fetchTeam: async (): Promise<any[]> => {
    return []
  },

  updateContactNotes: async (contactId: string, notes: string): Promise<void> => {
    // TODO: Implement
  },

  updateContactTags: async (contactId: string, tags: string[]): Promise<void> => {
    // TODO: Implement
  },

  createTagDefinition: async (tag: any): Promise<any> => {
    // TODO: Implement
    return tag
  },

  sendMessage: async (conversationId: string, content: string): Promise<void> => {
    // TODO: Implement
  },

  updateConversationStatus: async (conversationId: string, status: string): Promise<void> => {
    // TODO: Implement
  },

  markConversationAsRead: async (conversationId: string): Promise<void> => {
    // TODO: Implement
  },

  assignConversation: async (conversationId: string, userId: string | null): Promise<void> => {
    // TODO: Implement
  }
}
