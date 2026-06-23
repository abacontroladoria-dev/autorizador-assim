// ============= Legacy Types (for backward compatibility) =============
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio'
}

export enum MessageDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: 'agent' | 'admin';
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
  status: 'active' | 'invited' | 'disabled';
  avatar: string;
  lastActive?: string;
  team_id?: string | null;
  function_id?: string | null;
  weight?: number;
  team?: Team;
  function?: TeamFunction;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamFunction {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: string;
  direction: MessageDirection;
  type: MessageType;
  status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  tags: string[];
  messages: Message[];
}

export interface AppointmentMetadata {
  source?: 'nina_ai' | 'manual';
  conversation_id?: string;
  created_at_conversation?: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'lead' | 'customer' | 'churned';
  lastContact: string;
}

export interface StatMetric {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
}

export interface Appointment {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  type: 'demo' | 'meeting' | 'support' | 'followup';
  description?: string;
  attendees?: string[];
  contact_id?: string;
  contact?: {
    id: string;
    name: string | null;
    phone_number: string;
  };
  metadata?: AppointmentMetadata;
}

export interface Deal {
  id: string;
  title: string;
  company: string;
  value: number;
  stage: string;
  stageId?: string;
  ownerAvatar: string;
  ownerId?: string;
  ownerName?: string;
  tags: string[];
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  clientMemory?: ClientMemory;
  conversationId?: string;
}

export interface DealActivity {
  id: string;
  dealId: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'task';
  title: string;
  description?: string;
  scheduledAt?: string;
  completedAt?: string;
  isCompleted: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  isSystem: boolean;
  isActive: boolean;
  isAiManaged: boolean;
  aiTriggerCriteria: string | null;
}

export interface TagDefinition {
  id: string;
  key: string;
  label: string;
  color: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = 'nina' | 'human' | 'paused';
export type MessageFromType = 'user' | 'nina' | 'human';
export type DBMessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'processing';
export type DBMessageType = 'text' | 'audio' | 'image' | 'document' | 'video';

export interface ClientMemory {
  last_updated: string | null;
  lead_profile: {
    interests: string[];
    lead_stage: string;
    objections: string[];
    products_discussed: string[];
    communication_style: string;
    qualification_score: number;
  };
  sales_intelligence: {
    pain_points: string[];
    next_best_action: string;
    budget_indication: string;
    decision_timeline: string;
  };
  interaction_summary: {
    response_pattern: string;
    last_contact_reason: string;
    total_conversations: number;
    preferred_contact_time: string;
  };
  conversation_history: Array<{
    timestamp: string;
    user_summary: string;
    ai_action: string;
  }>;
}

export interface DBContact {
  id: string;
  phone_number: string;
  whatsapp_id: string | null;
  name: string | null;
  call_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
  tags: string[];
  notes: string | null;
  is_business: boolean;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  client_memory: ClientMemory;
  first_contact_date: string;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface DBConversation {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  is_active: boolean;
  assigned_user_id: string | null;
  assigned_team: string | null;
  tags: string[];
  metadata: Record<string, any>;
  nina_context: Record<string, any>;
  started_at: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  contact?: DBContact;
  messages?: DBMessage[];
}

export interface DBMessage {
  id: string;
  conversation_id: string;
  from_type: MessageFromType;
  direction: MessageDirection;
  type: DBMessageType;
  content: string;
  media_url: string | null;
  status: DBMessageStatus;
  nina_response_time: number | null;
  error_message: string | null;
  sent_at: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UIMessage {
  id: string;
  content: string;
  timestamp: string;
  direction: MessageDirection;
  type: MessageType;
  fromType: MessageFromType;
  mediaUrl?: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface UIConversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  contactAvatar: string;
  status: ConversationStatus;
  unreadCount: number;
  tags: string[];
  notes?: string;
  messages: UIMessage[];
  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string;
  assignedUserId: string | null;
  clientMemory: ClientMemory;
}

export function transformDBToUIMessage(msg: DBMessage): UIMessage {
  return {
    id: msg.id,
    content: msg.content,
    timestamp: new Date(msg.sent_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }),
    direction: msg.direction,
    type: msg.type as MessageType,
    fromType: msg.from_type,
    mediaUrl: msg.media_url || undefined,
    status: msg.status as 'sent' | 'delivered' | 'read'
  };
}

export function transformDBToUIConversation(conv: DBConversation, messages: DBMessage[]): UIConversation {
  const uiMessages = messages.map(transformDBToUIMessage);
  const lastMessage = uiMessages[uiMessages.length - 1];

  return {
    id: conv.id,
    contactId: conv.contact_id,
    contactName: conv.contact?.name || 'Unknown',
    contactPhone: conv.contact?.phone_number || '',
    contactEmail: conv.contact?.email || undefined,
    contactAvatar: conv.contact?.profile_picture_url || '/assets/default-avatar.png',
    status: conv.status,
    unreadCount: 0,
    tags: conv.tags || [],
    notes: conv.contact?.notes || undefined,
    messages: uiMessages,
    lastMessage: lastMessage?.content || 'No messages',
    lastMessageTime: lastMessage?.timestamp || '',
    lastMessageAt: conv.last_message_at,
    assignedUserId: conv.assigned_user_id,
    clientMemory: conv.contact?.client_memory || {
      last_updated: null,
      lead_profile: {
        interests: [],
        lead_stage: '',
        objections: [],
        products_discussed: [],
        communication_style: '',
        qualification_score: 0
      },
      sales_intelligence: {
        pain_points: [],
        next_best_action: '',
        budget_indication: '',
        decision_timeline: ''
      },
      interaction_summary: {
        response_pattern: '',
        last_contact_reason: '',
        total_conversations: 0,
        preferred_contact_time: ''
      },
      conversation_history: []
    }
  };
}
