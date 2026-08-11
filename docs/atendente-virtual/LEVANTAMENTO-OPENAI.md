# Levantamento — integração de IA com a OpenAI

Data: 2026-08-11. Levantamento somente de leitura: nenhum arquivo alterado,
nenhuma dependência instalada, nenhum commit.

Objetivo: decidir o que precisa ser implementado **antes** de colocar crédito na
API da OpenAI.

Documento irmão: [ESTADO-E-PLANO.md](ESTADO-E-PLANO.md) (plano do atendente
virtual). O que está aqui é a verificação do plano contra o código.

---

## A. O que já está pronto

**Nenhuma integração com a OpenAI existe no Pulsar.** Confirmado por três vias
independentes:

- `openai` não aparece em nenhum `package.json` nem nos lockfiles
  (`grep -c '"openai"'` → **0** em `frontend/package-lock.json` e
  `package-lock.json`);
- `OPENAI_API_KEY` não existe em nenhum dos 5 arquivos `.env` do repositório;
- nenhum arquivo em `frontend/` faz chamada a API de LLM.

O que **está** pronto e é diretamente reaproveitável:

| Peça | Arquivo | Estado |
|---|---|---|
| **6 ferramentas em formato function-calling** | `frontend/modules/atendimento/agente/ferramentas.ts` | Completo, 444 linhas, 20 asserções passando |
| Executor que nunca lança (`{ok:false, motivo}`) | `ferramentas.ts:185-410` | Completo |
| Porta única de reserva | `frontend/modules/atendimento/services/appointment.service.ts` | Completo |
| Motor de vagas reais (grade TiTa − reservas) | `supabase/migrations/20260810100100_central_vagas_disponiveis.sql` | Completo (local) |
| Anti-reserva-dupla (índice único parcial) | `supabase/migrations/20260810100000_central_appointments_slot_identity.sql` | Completo (local) |
| Filas com lease + idempotência | migrations `20260810120000`–`120400` | Completo (local) |
| Cliente TTS ElevenLabs | `frontend/modules/atendimento/voz/elevenlabs.ts` | Completo (não é OpenAI) |
| Marcação de procedência da IA | `created_by_ai` + `criadoPorIa` | Completo |

As ferramentas estão escritas no formato exato de `tools[]` da OpenAI
(`{type:'function', function:{name, description, parameters}}`) — passam direto
para a API sem tradução.

---

## B. O que está parcialmente pronto

### 1. Configuração de modelo — existe a coluna, não existe o consumidor

`central.agent_settings.ai_model_mode` tem default `'gpt-4o'` em
`20260701010000_central_nina_tables.sql:144` e o seed grava `'gpt-4o'` em
`20260701010500_central_nina_seed.sql:71`. Mas:

- nenhum código vivo lê esse valor para escolher modelo;
- a UI em `frontend/components/nina/settings/AgentSettings.tsx:21` tipa o campo
  como `'flash'|'pro'|'pro3'|'adaptive'` com rótulos **Gemini**, e coage
  qualquer outro valor para `'flash'` (linhas 109-110);
- `PATCH /api/central/agent-settings` **não aceita** `ai_model_mode` — o
  `salvar()` em `agent-settings.service.ts:120-151` só tem campos de TTS,
  `systemPrompt` e `respostaAutomatica`.

Ou seja: `'gpt-4o'` é uma string órfã. Não há validação de model id em lugar
nenhum.

### 2. Camada de canal — interface declarada, registry vazio

`MessagingProvider` está definido com 4 métodos em `central.types.ts:264-269`.
O `ProviderFactory` em `services/index.ts:37-49` tem `registry` vazio e lança
`ProviderNotImplementedError` em qualquer `get()`. Nenhum provider foi
registrado.

### 3. Histórico de mensagens — leitura existe, montagem não

`MessageRepository.listByConversation()` existe (`message.repository.ts:99`) e é
indexada. Não há nada que transforme isso em array de `messages` para o LLM.

### 4. Estado de conversa — tabela existe, código não toca

`central.conversation_states` tem `current_state`, `last_action`,
`scheduling_context jsonb` (`20260701010000_central_nina_tables.sql:276-287`).
Busca por `conversation_states` em todo `frontend/`: **zero ocorrências**.

---

## C. O que ainda falta

| Item | Estado |
|---|---|
| chat/completion | **não existe** |
| streaming | **não existe** |
| loop de tool calling | definições prontas, **loop não existe** |
| structured outputs | **não existe** |
| gerenciamento de contexto | tabela pronta, **código zero** |
| montagem de histórico p/ LLM | **não existe** |
| tratamento de erro/retry de LLM | **não existe** (o `retry_count` da fila é transporte, não LLM) |
| **controle de custo/uso** | **não existe nada** — nenhuma coluna de token, nenhum teto de gasto, nenhum rate limit |
| Provider WhatsApp (Meta ou Evolution) | **não existe** |
| Webhook de WhatsApp | **rota não existe** |
| Workers de agrupamento/envio | **não existem** |
| Tique (`pg_cron`/`pg_net` p/ as filas do central) | **não existe** migration |
| `ai_scheduling_enabled` (interruptor das ferramentas) | **coluna não existe** — grep em todo o repo: 0 ocorrências |
| Defesa contra prompt injection | **não existe** |
| `.env.example` | **não existe no repositório** |

---

## D. Arquivos relevantes

### Vivos, no Pulsar

```
frontend/modules/atendimento/agente/ferramentas.ts          ← 6 tools + executor
frontend/modules/atendimento/agente/ferramentas.test.mts
frontend/modules/atendimento/agente/formato.ts
frontend/modules/atendimento/voz/elevenlabs.ts              ← TTS (ElevenLabs)
frontend/modules/atendimento/services/appointment.service.ts
frontend/modules/atendimento/services/agent-settings.service.ts
frontend/modules/atendimento/services/index.ts              ← ProviderFactory vazio
frontend/modules/atendimento/repositories/agent-settings.repository.ts
frontend/modules/atendimento/repositories/agent-credentials.repository.ts
frontend/modules/atendimento/repositories/message.repository.ts
frontend/modules/atendimento/types/central.types.ts         ← MessagingProvider:264
frontend/components/nina/settings/ApiSettings.tsx           ← :639 menciona a chave da OpenAI como pendência
frontend/components/nina/settings/AgentSettings.tsx         ← aponta p/ projeto morto (nina_settings)
frontend/app/api/central/**                                 ← 17 rotas, nenhuma de IA
docs/atendente-virtual/ESTADO-E-PLANO.md                    ← plano; confere com o código
```

### Migrations (todas ainda não commitadas — ver riscos)

```
supabase/migrations/20260701010000_central_nina_tables.sql   ← agent_settings, conversation_states, filas
supabase/migrations/20260701010300_central_nina_views.sql
supabase/migrations/20260701010500_central_nina_seed.sql     ← grava 'gpt-4o'
supabase/migrations/20260810100000..120400                   ← 8 migrations, todas ?? no git
```

### Mortos / referência (não são o Pulsar)

```
nina-api-oficial/supabase/functions/nina-orchestrator/index.ts    ← 1348 linhas, Lovable+Gemini
nina-api-oficial/supabase/functions/whatsapp-sender/index.ts      ← 340 linhas, Meta Cloud
nina-api-oficial/supabase/functions/whatsapp-webhook/index.ts     ← 351 linhas
nina-api-oficial/supabase/functions/message-grouper/index.ts      ← transcrição via Lovable
nina-api-oficial/supabase/functions/{analyze-conversation,generate-prompt}
references/plataforma-de-atendimento-multi-agentes-com-ai/        ← outro projeto Lovable, Evolution API
```

Os 34 edge functions do repo principal (`supabase/functions/`) **não têm
nenhuma de IA**.

---

## E. Fluxo atual da IA

Não existe fluxo. Traçando o caminho de uma mensagem hoje:

```
WhatsApp do responsável
      ↓
   ✗ PARA AQUI — não há webhook. Nenhuma rota sob /api/central/webhooks/.
      ↓
central.message_grouping_queue     (tabela pronta, lease e idempotência OK, 0 escritores)
      ↓
   ✗ não há worker de agrupamento
      ↓
orquestrador OpenAI                ✗ NÃO EXISTE
      ↓
FerramentasAgente.executar()       ✓ pronto e testado
      ↓
AppointmentService                 ✓ pronto — grava em central.appointments
      ↓
central.send_queue                 (tabela pronta, 0 escritores)
      ↓
   ✗ não há worker de envio
      ↓
MessagingProvider.sendMessage()    ✗ ProviderFactory.get() → ProviderNotImplementedError
```

O único caminho que **funciona hoje** é o humano: página `/connect/analytics` →
`/api/central/appointments` → `AppointmentService`. A IA compartilha a metade de
baixo desse caminho, mas a metade de cima — canal, webhook, workers,
orquestrador — está inteiramente ausente.

---

## F. Modelo OpenAI atualmente configurado

**Efetivamente: nenhum.**

A string `'gpt-4o'` está gravada em `agent_settings.ai_model_mode` (default da
tabela + seed), e é a decisão registrada no plano de 2026-08-10. Mas nenhum
código a honra. O único consumidor histórico dessa coluna é `getModelSettings()`
no orquestrador morto (`nina-orchestrator/index.ts:1262-1283`), que faz `switch`
em `'flash'|'pro'|'pro3'|'adaptive'` e mapeia para **Gemini**. `'gpt-4o'` cai no
`default:` → `google/gemini-2.5-flash`.

Se o orquestrador novo for escrito reaproveitando aquele `switch`, `'gpt-4o'`
vira Gemini Flash em silêncio.

Também existe `openai_assistant_id` (coluna, sempre `null`, lida por nada) —
resquício de um desenho via Assistants API.

Antes de fixar o modelo, vale conferir o catálogo atual da OpenAI: `gpt-4o` é
escolha de 2024 e há gerações posteriores com preço e capacidade diferentes.
Nomes e preços atuais precisam ser confirmados no pricing da OpenAI — é o que
muda a conta de custo.

---

## G. Variáveis de ambiente necessárias

**Relacionadas à OpenAI, existentes hoje: nenhuma.**

Único `OPENAI_API_KEY` no repositório é `supabase/config.toml:95` —
`openai_api_key = "env(OPENAI_API_KEY)"`, linha padrão do Supabase CLI para o
assistente do Studio local. **Não tem relação com a aplicação.**

O que existe hoje em `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`SUPABASE_KEY`, `MACHINE_ID`, `NEXT_PUBLIC_MACHINE_ID`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_NINA_*` (4, projeto
morto), `TITA_TOKEN`.

Serão necessárias:

| Variável | Onde | Observação |
|---|---|---|
| `OPENAI_API_KEY` | Coolify, **runtime only** | Nunca como `ARG` no Dockerfile |
| `OPENAI_MODEL` | Coolify | Pinar o id; não deixar o banco decidir |
| `WHATSAPP_APP_SECRET` | Coolify, runtime | HMAC do webhook |
| `WHATSAPP_VERIFY_TOKEN` | Coolify, runtime | Handshake `GET` |
| `WHATSAPP_ACCESS_TOKEN` | Coolify ou `channel_connections.provider_metadata` | |
| `WHATSAPP_PHONE_NUMBER_ID` | idem | |
| `CENTRAL_WORKER_SECRET` | Coolify, runtime | Autenticar os workers |

**Deploy:** o `frontend/Dockerfile` passa apenas 5 `NEXT_PUBLIC_*` como `ARG` e
nenhum segredo é assado na imagem. Essa propriedade precisa ser mantida —
`OPENAI_API_KEY` como `ARG` vazaria no log de build e no `docker history`.

---

## H. Riscos e problemas encontrados

1. **Toda a fundação está fora do git.** As 8 migrations de agosto e as do bloco
   Nina aparecem como `??` / ` M` no `git status`. Nada disso está commitado,
   muito menos em produção. Perder a working tree perde o trabalho inteiro.

2. **`/api/central/*` está morto em produção.** O schema `central` está exposto
   só no `config.toml` local (linha 13). Sem expor no Dashboard do projeto de
   produção, todas as 17 rotas respondem `PGRST106` — inclusive as que já
   existiam.

3. **Zero controle de custo — este é o risco central para a decisão.** Não há
   coluna de token, nem contabilidade de gasto, nem teto diário, nem limite por
   conversa, nem rate limit, nem `max_tokens` configurado. Colocar crédito hoje
   significa crédito sem medidor e sem freio. O único mecanismo de segurança que
   existe é `auto_response_enabled` com default `false`.

4. **O modelo não é validável nem editável.** A coluna guarda `'gpt-4o'`, a UI
   só entende nomes Gemini, a rota `PATCH` ignora o campo, e nada valida model
   id. Um valor errado ali não falha — escolhe outro modelo em silêncio.

5. **Nenhuma defesa contra prompt injection.** O corpo da mensagem do WhatsApp
   iria direto para o prompt, e as ferramentas **gravam no banco** (agendar,
   reagendar, cancelar). Como `FerramentasAgente` roda por
   `createAppointmentSystemService()` (service role, RLS desligada, `orgId` é
   responsabilidade do caller — `services/index.ts:139-145`), o orquestrador
   nunca pode aceitar `orgId`, `contactId` ou `conversationId` vindos do modelo.
   É a decisão de segurança mais importante do bloco que falta.

6. **Transcrição de áudio é uma segunda linha de custo não planejada.** No
   WhatsApp o responsável manda áudio. O único código de transcrição que existe
   é o morto, via gateway da Lovable (`message-grouper/index.ts:9`). Fazer isso
   na OpenAI adiciona custo por minuto de áudio, separado do custo de chat.

7. **Fila morta sem observador.** `queue_dead_letter_overview` existe, mas
   nenhuma rota ou alerta a consome. Item `failed` fica no banco sem ninguém
   saber — e com paciente do outro lado, isso é resposta que nunca chega.

8. **Credenciais em texto puro no Postgres.** A chave da ElevenLabs mora no
   banco. Desde a `20260810120300` ela não sai pela API, mas quem tem acesso
   direto ao banco a lê. A decisão de manter `OPENAI_API_KEY` como env de
   runtime evita repetir o problema — vale manter.

9. **`nina-api-oficial/` é armadilha, não base.** O `nina-orchestrator` (1348
   linhas) usa gateway da Lovable com Gemini, aponta para um projeto Supabase
   que dá NXDOMAIN, e suas 3 ferramentas de agendamento inventam horário sem
   consultar a grade. Copiar de lá o loop de IA reintroduz exatamente o bug que
   `ferramentas.ts` foi escrito para eliminar. O que vale reaproveitar de lá é:
   montagem de prompt com memória do contato, quebra de mensagem longa, e a
   normalização do webhook da Meta em `whatsapp-webhook`/`whatsapp-sender` (691
   linhas somadas).

10. **`references/plataforma-de-atendimento-multi-agentes-com-ai/` é outro
    projeto.** Tem 19 edge functions com Evolution API e IA (sentimento, smart
    replies, resumo), mas é uma base Lovable separada — e a decisão registrada é
    Meta Cloud API, não Evolution. Só serve como referência de shape.

---

## Conclusão para a decisão de crédito

Antes de colocar crédito na OpenAI, o mínimo é:

1. commitar e aplicar as migrations;
2. expor o schema `central` em produção;
3. implementar webhook + provider de WhatsApp;
4. implementar o orquestrador com o loop de tool calling sobre
   `DEFINICOES_FERRAMENTAS`;
5. implementar montagem de histórico e contexto;
6. **implementar contabilidade de token e teto de gasto**;
7. implementar workers + tique.

O item 6 é o que não deveria ficar para depois. Todo o resto pode ser validado
com crédito mínimo; sem medidor e sem teto, o primeiro laço de erro — um retry
que reenvia, um turno que reprocessa a mesma fila — gasta sem aviso. As filas já
têm lease e teto de tentativas, o que reduz esse risco no transporte, mas não há
nada equivalente na camada do LLM.
