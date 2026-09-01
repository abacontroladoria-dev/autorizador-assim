-- ============================================================================
-- Configurar o canal meta_waba com os identificadores reais da Meta
--
-- Rodar UMA vez, no SQL Editor. Substitui os marcadores 'PREENCHER_*' que a
-- migration 20260831100000 deixou de propósito.
--
-- Valores colhidos em 01/09/2026, painel da Meta → WhatsApp → Configuração da
-- API, com o NÚMERO DE TESTE da Meta (válido por 90 dias, ~30/11/2026).
--
-- O TOKEN NÃO ENTRA AQUI. Vai em META_WABA_TOKEN, variável de runtime.
-- Ver o cabeçalho da 20260831100000 para o motivo.
--
-- Quando a clínica migrar para número dedicado, é este mesmo UPDATE que roda
-- de novo com os IDs novos — nada de código muda.
-- ============================================================================

update central.channel_connections
set provider_metadata = jsonb_build_object(
      'phone_number_id',      '1368006119723759',
      'waba_id',              '3297325240477814',
      'display_phone_number', 'numero de teste Meta (+1)',
      'e_numero_de_teste',    true
    ),
    external_id         = '1368006119723759',
    provider_account_id = '3297325240477814',
    -- 'active', não 'connected': as duas colunas usam o MESMO enum
    -- central.channel_status ('active'|'connecting'|'disconnected'|'error'|
    -- 'suspended'), e 'connected' não existe nele. O comentário da migration
    -- 20260831100000 sugere 'connected' e está errado.
    connection_status   = 'active'
where channel_id = (
  select id from central.channels
  where provider = 'meta_waba'
    and organization_id = 'a0000000-0000-0000-0000-000000000001'
);

-- O channel também sai de 'disconnected': agora existe número e token de
-- verdade atrás dele.
update central.channels
set status = 'active'
where provider = 'meta_waba'
  and organization_id = 'a0000000-0000-0000-0000-000000000001';

-- Conferência: as duas linhas devem aparecer sem nenhum 'PREENCHER_'.
select c.name, c.status, cc.connection_status, cc.provider_metadata
from central.channels c
join central.channel_connections cc on cc.channel_id = c.id
where c.provider = 'meta_waba';

-- ----------------------------------------------------------------------------
-- A atendente continua DESLIGADA (ai_mode='off'). É decisão humana, tomada
-- depois de ver a conversa chegando na Central. Ligar é:
--
--   update central.agent_settings
--   set ai_mode = 'assisted'   -- 'assisted' = responde, mas fica RASCUNHO
--   where organization_id = 'a0000000-0000-0000-0000-000000000001'
--     and inbox_id is null;
--
-- 'assisted' primeiro, 'autonomous' só depois de ler algumas respostas.
-- ----------------------------------------------------------------------------
