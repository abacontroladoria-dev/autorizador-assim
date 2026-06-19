-- Central de Atendimento — Messages
-- M-006 | Block 3
-- Depends on:
--   20260701000000_create_ca_schema.sql          (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql   (public.usuarios)
--   20260701000100_create_ca_enums.sql           (central.provider_type)
--   20260701000500_create_ca_conversations.sql   (central.conversations)

-- ============================================================================
-- TABLE: central.messages
--
-- Modelagem:
--   Tabela append-mostly: o CONTEÚDO de uma mensagem é imutável após criação.
--   O ESTADO de entrega (status) é mutável — providers enviam atualizações
--   sequenciais (pending → sent → delivered → read).
--   Por isso updated_at é necessário: o Supabase Realtime emite eventos de
--   Postgres Changes apenas em UPDATE — sem updated_at, a UI nunca saberia que
--   uma mensagem foi lida pelo contato.
--
--   direction valid values:
--     'inbound'  — mensagem enviada pelo contato para a clínica
--     'outbound' — mensagem enviada pela clínica (operador ou IA) para o contato
--
--   message_type valid values:
--     'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' |
--     'location' | 'template' | 'reaction' | 'system'
--
--   status valid values:
--     'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted'
--
--   external_message_id:
--     ID atribuído pelo provider no momento do envio/recebimento.
--     Evolution retorna messageId; Meta WABA retorna wamid.
--     Protegido contra duplicação por índice único parcial uq_messages_ext_id
--     (scoped em organization_id + provider, apenas quando NOT NULL).
--     Usado também para delivery status updates: quando o provider envia
--     "mensagem X foi entregue", o worker busca por external_message_id para
--     fazer UPDATE do status.
--
--   reply_to_message_id:
--     Mensagem citada (WhatsApp quotedMsg / Instagram replied_to).
--     Nullable — nem toda mensagem é uma resposta.
--     Self-reference: se a mensagem original for deletada (soft delete),
--     reply_to_message_id permanece válido — a UI deve checar deleted_at.
--
--   deleted_at:
--     WhatsApp e Instagram permitem deleção de mensagem pelo remetente.
--     O provider envia evento de deleção; soft delete preserva rastreabilidade
--     de auditoria. A UI deve exibir "Mensagem apagada" quando deleted_at IS NOT NULL.
--
--   sent_by_user_id / sent_by_ai:
--     Mutuamente exclusivos na prática. Mensagens inbound (contato → clínica)
--     têm ambos como null/false. Mensagens outbound têm um dos dois preenchido.
-- ============================================================================
create table central.messages (
  id                  uuid                   primary key default gen_random_uuid(),
  organization_id     uuid                   not null references central.organizations(id),
  conversation_id     uuid                   not null references central.conversations(id),
  external_message_id text,
  direction           text                   not null,
  message_type        text                   not null default 'text',
  body                text,
  provider            central.provider_type,
  sent_by_user_id     uuid                   references public.usuarios(id) on delete set null,
  sent_by_ai          boolean                not null default false,
  reply_to_message_id uuid                   references central.messages(id),
  status              text                   not null default 'pending',
  sent_at             timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz            default now(),
  updated_at          timestamptz            default now()
);

drop trigger if exists set_updated_at on central.messages;
create trigger set_updated_at
  before update on central.messages
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.message_attachments
--
-- Modelagem:
--   Mídia associada a mensagens: imagens, áudios, vídeos, documentos, stickers.
--   Uma mensagem pode ter múltiplos anexos (ex: galeria de fotos).
--
--   Pipeline de armazenamento (dois estágios):
--     Estágio 1 — Recebimento:
--       Webhook recebido → attachment criado com:
--         external_url  = URL temporária do provider
--         storage_status = 'pending'
--         storage_path  = null
--     Estágio 2 — Download assíncrono pelo worker:
--       Worker busca WHERE storage_status = 'pending'
--       Worker baixa de external_url, faz upload para Supabase Storage
--       Worker executa: UPDATE SET storage_path = '...', storage_status = 'stored'
--
--   external_url:
--     URL temporária do provider. WhatsApp Media API e Meta Cloud API expiram
--     em 24 horas. Se o worker não processar dentro deste prazo, o arquivo
--     é irrecuperável. Alerta operacional obrigatório:
--       storage_status = 'pending' AND created_at < now() - interval '12 hours'
--
--   storage_path:
--     Caminho no Supabase Storage após download bem-sucedido.
--     Convenção recomendada: {org_id}/{conversation_id}/{message_id}/{file_name}
--     Esta convenção permite que a Storage RLS policy use
--     (storage.foldername(name))[1] = current_organization_id()::text.
--
--   duration_secs:
--     Duração em segundos para áudio e vídeo.
--     Necessário para o módulo de transcrição exibir a duração antes
--     de carregar o texto transcrito.
--
--   thumbnail_path:
--     Caminho da miniatura gerada pelo worker para imagens e vídeos.
--     Habilita preview rápido sem carregar o arquivo completo.
--
--   storage_status valid values: 'pending' | 'stored' | 'failed'
--   file_type: MIME type (ex: 'audio/ogg; codecs=opus', 'image/jpeg', 'video/mp4')
-- ============================================================================
create table central.message_attachments (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  message_id      uuid        not null references central.messages(id) on delete cascade,
  file_name       text,
  file_type       text,
  file_size       bigint,
  storage_path    text,
  external_url    text,
  storage_status  text        not null default 'pending',
  duration_secs   integer,
  thumbnail_path  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists set_updated_at on central.message_attachments;
create trigger set_updated_at
  before update on central.message_attachments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TRIGGER FUNCTION: central.update_conversation_last_message_at
--
-- Atualiza conversations.last_message_at após INSERT em messages.
--
-- Design:
--   AFTER INSERT (não BEFORE) para que new.created_at já esteja persistido.
--   coalesce(sent_at, created_at, now()) como fallback triplo: sent_at pode
--   ser null em mensagens outbound antes da confirmação do provider.
--   A condição (last_message_at is null OR v_msg_time > last_message_at)
--   evita regressão em re-processamentos ou inserções fora de ordem (ex:
--   worker reprocessando webhooks antigos não deve sobrescrever timestamp
--   de uma mensagem mais recente).
--   O trigger set_updated_at de conversations dispara automaticamente no
--   UPDATE — não é necessário definir updated_at explicitamente aqui.
-- ============================================================================
create or replace function central.update_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = central
as $$
declare
  v_msg_time timestamptz;
begin
  v_msg_time := coalesce(new.sent_at, new.created_at, now());

  update central.conversations
  set last_message_at = v_msg_time
  where
    id = new.conversation_id
    and (last_message_at is null or v_msg_time > last_message_at);

  return new;
end;
$$;

drop trigger if exists update_last_message_at on central.messages;
create trigger update_last_message_at
  after insert on central.messages
  for each row execute function central.update_conversation_last_message_at();

-- ============================================================================
-- INDEXES — central.messages
-- ============================================================================

-- Deduplicação de webhooks: "já recebi esta mensagem deste provider?"
-- ÍNDICE ÚNICO PARCIAL:
--   Unicidade aplicada apenas quando external_message_id IS NOT NULL.
--   NULL não viola UNIQUE no PostgreSQL — mensagens sem external_message_id
--   (drafts, notas internas, mensagens system) coexistem sem conflito.
--   Scoped em (org, provider) porque providers distintos podem ter namespaces
--   de IDs sobrepostos.
create unique index uq_messages_ext_id
  on central.messages(organization_id, provider, external_message_id)
  where external_message_id is not null;

-- Hot path: carregar mensagens de uma conversa em ordem cronológica
-- conversation_id como leading column (não organization_id): mensagens são
-- sempre carregadas no contexto de uma conversa já validada — o filtro por
-- org é feito na camada de conversas, não repetido em cada query de mensagens.
create index idx_messages_conversation_sent
  on central.messages(conversation_id, sent_at desc);

-- Queries org-level e RLS: listar mensagens com filtro de organização
create index idx_messages_org_conversation
  on central.messages(organization_id, conversation_id, sent_at desc);

-- Thread de respostas: "quais mensagens respondem a esta mensagem?"
create index idx_messages_reply_to
  on central.messages(reply_to_message_id)
  where reply_to_message_id is not null;

-- ============================================================================
-- INDEXES — central.message_attachments
-- ============================================================================

-- Listar anexos de uma mensagem (painel de visualização de mídia)
create index idx_attachments_org_message
  on central.message_attachments(organization_id, message_id);

-- Fila do worker de download: anexos aguardando armazenamento no Storage
-- Índice parcial: exclui 'stored' e 'failed' da varredura — apenas os
-- que demandam ação do worker aparecem neste índice.
-- Ordenado por created_at ASC para processar os mais antigos primeiro
-- (FIFO — diminui risco de expiração de external_url).
create index idx_attachments_pending
  on central.message_attachments(organization_id, created_at asc)
  where storage_status = 'pending';

-- ============================================================================
-- NOTE: Supabase Realtime
--
-- Para habilitar Realtime nestas tabelas, executar após o deploy desta migration
-- (SQL Editor no Dashboard ou migration separada):
--
--   alter publication supabase_realtime add table central.messages;
--   alter publication supabase_realtime add table central.message_attachments;
--   alter publication supabase_realtime add table central.conversations;
--
-- Não incluído aqui por dois motivos:
--   1. ALTER PUBLICATION não pode ser executado dentro de bloco de transação.
--   2. Habilitar prematuramente gera tráfego WAL desnecessário — ativar apenas
--      quando a UI estiver pronta para consumir os eventos.
-- ============================================================================
