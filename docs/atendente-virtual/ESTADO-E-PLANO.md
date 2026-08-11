# Atendente virtual — estado e plano

Última atualização: 2026-08-11 (schema `central` em produção).

**O schema `central` está em produção.** Em 2026-08-11 foram aplicadas à mão no
SQL Editor, nesta ordem:

1. `20260810130000` e `20260810130100` — admin do Pulsar = admin da Central e
   permissão de rota `connect`. Os dois admins (Caio, Sanderson) estão com
   `central_role = 'admin'` e o gatilho instalado.
2. O schema `central` foi adicionado em **Exposed schemas** (Project Settings →
   Data API), o que encerrou o `PGRST106`. Feito pelo Dashboard, não por
   `alter role authenticator`.
3. O bloco Nina (`20260701010000`–`010500`) e os Blocos A e B
   (`20260810100000`–`120400`) — 14 migrations, num único `begin;…commit;`.
4. `20260811100000` — `ai_mode` + `ai_scheduling_enabled`. Ficou de fora do
   bundle e por isso as abas Agente e API das Configurações respondiam 500;
   detalhe em "Configurações 500" mais abaixo.

O SQL exato de (3) e (4) está versionado em [`supabase/snippets/`](../../supabase/snippets/)
— é o registro do que entrou. **Continua fora de produção**: o bloco CRM
(`20260701020000`–`020400`), por decisão, e o canal do WhatsApp (Bloco C), que
ainda não existe.

Nada disso foi aplicado com `supabase db push`, de propósito: o `push` não
seleciona arquivo, empurra o conjunto pendente inteiro — e ali dentro está o
bloco CRM. Com a numeração fora de ordem o CLI ainda pede `--include-all`, que é
justamente "aplique tudo". Voltar a usar `db push` exige antes alinhar o
livro-caixa com `supabase migration repair`.

Decisões que orientam o desenho (definidas em 2026-08-10):

- **Escopo**: atendente autônoma no WhatsApp, atendendo responsáveis.
- **Agenda**: consulta a grade real da clínica; grava em `central.appointments`.
- **LLM**: OpenAI gpt-4o.
- **Produção**: nada é aplicado antes de validar local.

---

## O que a página era antes

`/connect/analytics` renderizava `components/nina/Scheduling.tsx`, herdado de um
CRM comercial. A casca visual funcionava; nada atrás dela existia:

| Sintoma | Causa |
|---|---|
| Calendário sempre vazio | `services/api.ts` era stub: `fetchAppointments()` devolvia `[]` |
| "Salvar" dava sucesso e não gravava | `createAppointment()` devolvia `{id:'1'}` falso |
| Tabela inexistente | migrations 20260701010000–010500 (bloco Nina) nunca aplicadas |
| `/api/central/*` todo morto | schema `central` não exposto ao PostgREST (`PGRST106`) |
| 401 em toda rota | os 28 usuários tinham `central_role = NULL` |
| Sem fallback | o projeto Supabase do Nina (`mlttucjfmqnzbctwysks`) **não resolve mais — NXDOMAIN** |
| Sem IA e sem canal | orquestrador e webhook só existem em `nina-api-oficial/`; `central.channel_connections` vazia |
| 2× 404 por carga | hooks lendo `nina_settings_public` e `user_roles`, que não existem |
| Horário inventável | `<input type="time">` livre permitia gravar 03:17 de domingo |
| Botão quebrado | "Entrar na Sala de Reunião" → `/meeting/{id}`, rota inexistente |

---

## Bugs de fundo encontrados e corrigidos

1. **Seed do bloco Nina não aplicava.** `20260701010500` usava
   `ON CONFLICT ON CONSTRAINT uq_agent_settings_org_default`, mas aquilo é
   índice único **parcial**, não constraint — o Postgres recusa. A migration
   morria na última instrução. Corrigido para inferência com o mesmo predicado.
   Como nunca havia sido aplicada em lugar nenhum, o arquivo foi corrigido no
   lugar.

2. **CSP bloqueava qualquer Supabase que não fosse o de produção.**
   `next.config.ts` tinha `connect-src` com hosts fixos. Apontar o app para a
   stack local resultava em "Failed to fetch" no login **sem nenhuma requisição
   aparecer no devtools** — o CSP corta antes da rede. Agora a lista é derivada
   de `NEXT_PUBLIC_SUPABASE_URL` (em produção resolve para o mesmo host) e
   inclui a stack local só em desenvolvimento.

3. **Next 16 bloqueia recursos de dev vindos de `127.0.0.1`.** A página servia
   HTML mas nunca hidratava: o `<form>` caía para submit nativo (`GET /login?`)
   e o handler React nunca rodava. Resolvido com `allowedDevOrigins`.

4. **`components/ui/tabs.tsx` era um stub.** Os quatro componentes eram `<div>`
   sem estado. O efeito não era só visual: as três abas de Configurações
   renderizavam empilhadas, e como `onValueChange` nunca disparava, o
   `activeTab` do `Settings` ficava travado em `'agent'` — o botão "Salvar
   Alterações" do cabeçalho só chamava `agentRef.save()`. Ou seja, mesmo que a
   tela de APIs apontasse para o lugar certo, salvar por ali não faria nada.
   Implementado com o contrato do Radix (`data-state`, `value`/`defaultValue`,
   painel inativo desmontado), que é o que `CreateDealModal` já assumia.

5. **A vaga livre não é endereçável no TiTa.** Medido sobre 97.048 linhas:
   `Agendado` = 96.427 (todas com `paciente_id`), `Livre` = 619 com **zero**
   `paciente_id` e **zero** `tita_agendamento_id`. A vaga só é identificada
   pela tupla `(profissional_id, data, hora_inicial)` — que é única nos 619
   casos. `tita_session_id` serve para reconciliar depois, nunca para reservar.

6. **Configurações 500: código escrito contra migration nunca aplicada.**
   Depois de o schema `central` entrar em produção, as abas Agente e API
   responderam `Internal server error`. Duas causas somadas:

   - `AgentSettingsRepository.COLUNAS_SEGURAS` pede `ai_mode` e
     `ai_scheduling_enabled`. Elas nascem na `20260811100000`, que não estava
     aplicada **nem no local** — a tabela ainda tinha `ai_model_mode` e
     `auto_response_enabled`. Ou seja: aquele caminho de leitura nunca havia
     rodado em lugar nenhum. O PostgREST devolve 42703 (coluna inexistente).
   - `mapCentralError` não conhece 42703 e cai no `serverError()` de
     `lib/central/response.ts:65`, que responde `Internal server error` sem
     código nem detalhe. Um erro de *schema* chegou à tela vestido de erro de
     *servidor*, o que aponta o diagnóstico para o lado errado.

   A migration foi aplicada no local e em produção. Fica a lição de método: uma
   migration que não está no livro-caixa de nenhum ambiente significa que o
   código que depende dela é código não executado — `ai_mode` estava nos tipos,
   no DTO e na tela, e nada disso prova que a coluna existe.

   Pendência que sobrou disso: o `serverError()` genérico deveria registrar o
   código e a mensagem originais do Postgres no log do servidor (sem devolvê-los
   ao browser). Ver pendência 12.

---

## Arquitetura

```
grade real do TiTa                  o que este canal prometeu
public.vw_grade_base                central.appointments
(status_agendamento = 'Livre')      (status scheduled/confirmed ocupa vaga)
         │                                   │
         └────────────► subtração ◄──────────┘
                            │
            central.listar_vagas_disponiveis
                            │
              ┌─────────────┴─────────────┐
     AvailabilityRepository         (mesma função)
              │                            │
      AppointmentService ◄─────────────────┘
        (única porta de reserva)
         │                     │
  /api/central/appointments   FerramentasAgente
         │                     │
   AgendaCentral (página)   orquestrador OpenAI (a fazer)
```

O ponto do desenho: **uma única porta de reserva**. Página e agente passam pelo
mesmo `AppointmentService`, então não existe regra que valha para um e não para
o outro.

### Garantia contra reserva dupla

Duas camadas, de propósito:

- `central.vaga_esta_disponivel()` — checagem prévia que separa os três motivos
  de recusa (não existe na grade / já reservada / no passado), porque o agente
  responde diferente em cada caso.
- `uq_appointments_slot_ocupada` — índice único parcial em
  `(profissional_id, date, time)` com predicado `status in ('scheduled','confirmed')`.
  É a garantia real quando duas requisições passam pela checagem ao mesmo tempo.
  O predicado é o que faz cancelamento e falta **devolverem** a vaga.

---

## Estado por bloco

### Bloco 0 — base local · concluído
- Bloco Nina aplicado local (`appointments`, `agent_settings`,
  `conversation_states`, `message_grouping_queue`, `send_queue`, `teams`,
  `tag_definitions` + 3 views + 6 funções).
- `central` exposto ao PostgREST local via `config.toml`.
- Usuário de teste `atendente.local@universoaba.test` com `central_role = admin`.
- Base local tem 97.048 linhas de grade real, 619 vagas `Livre`, 489 ofertáveis
  (as outras 130 são passado, corretamente excluídas).

### Bloco 2 — banco · concluído
- `20260810100000_central_appointments_slot_identity.sql` — identidade da vaga
  (`profissional_id`, `profissional_nome`, `terapia_id`, `terapia_nome`,
  `unidade_id`, `sala_nome`, `tita_paciente_id`), CHECK em `status`, índice
  anti-reserva-dupla, índice de ocupação por profissional.
- `20260810100100_central_vagas_disponiveis.sql` — `listar_vagas_disponiveis()`
  e `vaga_esta_disponivel()`.

### Bloco 1 — backend · concluído
- `appointment.repository.ts`, `availability.repository.ts`
- `appointment.service.ts` — reservar, administrativo, reagendar (valida destino
  antes de liberar a origem), atualizar, cancelar, remover
- `appointment.dto.ts` — validação de entrada
- Erros: `SlotNotInGradeError` (422), `SlotAlreadyBookedError` (409),
  `SlotInPastError` (422), `AppointmentNotFoundError` (404)
- Rotas: `appointments/`, `appointments/[id]/`, `appointments/availability/`,
  `organization/`

### Bloco 1b — página · concluído
- `components/connect/agenda/` — `AgendaCentral`, `ReservarVagaModal`,
  `DetalheAgendamento`, `tipos.ts`
- Reserva escolhe **vaga existente**, não horário digitado
- Vocabulário clínico (triagem/retorno/reunião/followup) no lugar do comercial
- Datas como `'YYYY-MM-DD'`; `toISOString()` eliminado (em GMT-3 devolvia o dia
  anterior antes das 21h)
- Detalhe mostra profissional/terapia/sala e avisa quando não está no TiTa
- `Scheduling.tsx` removido; `useCompanySettings` agora lê
  `/api/central/organization/`

Verificado no navegador contra o banco local: reservar → a vaga sai da oferta
(26→25) → detalhe correto → cancelar → a vaga volta (25→26). Zero 404, zero
erro de console.

### Bloco 3 — ferramentas do agente · concluído
- `modules/atendimento/agente/ferramentas.ts` — 6 ferramentas no formato de
  function calling: consultar especialidades, consultar horários, agendar,
  consultar agendamentos do contato, reagendar, cancelar.
- Nenhuma ferramenta lança: falha vira `{ ok:false, motivo, mensagem }`, porque
  exceção que sobe até o orquestrador é turno perdido — o paciente fica sem
  resposta no WhatsApp.
- `ferramentas.test.mts` — 20 asserções, todas passando, incluindo reserva
  dupla, horário fora da grade, data passada, ferramenta inexistente e
  argumentos faltando.

### Bloco 3b — voz (ElevenLabs) · concluído

O que estava errado na tela de Configurações → APIs:

| Sintoma | Causa |
|---|---|
| Salvar a chave exibia sucesso e não gravava | escrevia em `nina_settings`, tabela do projeto Supabase morto |
| "Gerar e Ouvir" nunca produzia áudio | invocava a Edge Function `test-elevenlabs-tts`, que só existe em `nina-api-oficial/` e nunca foi implantada |
| "Salvar Alterações" não alcançava a aba | `ui/tabs.tsx` era stub — ver bug 4 acima |
| Voz podia não existir na conta | 21 `voice_id` fixos no código; a lista real é por conta |
| Erro sempre igual | tudo virava "Erro ao gerar áudio", sem a mensagem da ElevenLabs |
| Chave no browser | a tela carregava a chave para o estado do React e a reenviava a cada teste |

O que existe agora:

- `20260810110000_central_agent_settings_tts.sql` — colunas `elevenlabs_style` e
  `elevenlabs_speaker_boost` (a tela editava sete parâmetros; a tabela tinha
  cinco) e `agent_settings_public` recriada. `audio_response_enabled` **não** foi
  criada: é o mesmo conceito de `tts_enabled`, e duas colunas para a mesma
  decisão viram divergência silenciosa.
- `modules/atendimento/voz/elevenlabs.ts` — cliente HTTP `server-only`.
- `AgentSettingsRepository` / `AgentSettingsService` — leitura dividida em
  "tudo menos a credencial" e "só a credencial", para a chave não vazar num
  `select('*')` por descuido. Nenhum método público devolve a chave.
- Rotas `GET|PATCH /api/central/agent-settings`, `GET /api/central/voz/vozes`,
  `POST /api/central/voz/testar` — todas restritas a `central_role = 'admin'`.
- `components/nina/settings/ApiSettings.tsx` reescrito; `components/ui/tabs.tsx`
  implementado.

Duas decisões que valem registro:

**A classificação do erro não pode vir do status HTTP.** A ElevenLabs devolve
**400** para chave inválida e **401** para cota esgotada. Classificar pelo status
faria "acabaram os caracteres" aparecer como "sua chave está errada" — e o admin
trocaria uma chave que estava correta. A classificação usa
`detail.status`/`code`/`type`, com cota verificada antes de credencial.

**A chave tem exatamente 51 caracteres.** Quando é colada truncada, a própria
ElevenLabs responde `API key must be exactly 51 characters, got 43.`. Essa
mensagem é repassada intacta à tela em vez de virar erro genérico — é a hipótese
mais provável para uma chave recém-criada que "não funciona".

Verificado: 38 asserções passando (`node_modules/.cache/e2e/testa_voz.mjs`),
incluindo chave truncada, chave inválida, cota, falta de voz, teto de 1000
caracteres, troca de aba e a garantia de que a chave completa não aparece nem no
corpo da resposta nem na tela. O caminho até a síntese de áudio real depende de
uma chave válida, que não está no ambiente.

### Bloco A — integridade das filas · concluído

Ao mapear o módulo para planejar o canal de WhatsApp, três defeitos apareceram na
base que já existia. Nenhum era visível, porque a fila estava vazia — todos se
manifestariam na primeira conversa real.

| Defeito | Efeito com paciente do outro lado |
|---|---|
| `claim_*_batch` só pegava `status = 'pending'` | Worker que morre deixa a linha em `processing` **para sempre**: ninguém a alcança, o cleanup não a toca, o responsável nunca recebe resposta e nada avisa |
| `cleanup_processed_queues` apagava `failed` | Passados 7 dias, destruía o único registro de que havia resposta a dar, junto com o `error_message` |
| `message_grouping_queue` sem índice único | A Meta reentrega webhook em timeout/5xx → o mesmo recado era agrupado duas vezes → resposta dobrada no WhatsApp do responsável |
| `send_queue` sem `external_message_id` | Crash entre "a Meta aceitou" e "gravei" fazia o retry **reenviar** a mesma mensagem |
| `send()` persistia **depois** do provider | Falha no INSERT deixava a mensagem no WhatsApp e fora do histórico da clínica — sem rastro nenhum |
| `receive()` não tratava 23505 | Duas entregas simultâneas → 500 → a Meta reentrega porque viu 5xx → laço que se alimenta do próprio erro |
| `createWithAttachments` sem transação | Áudio: `body` vazio e anexo faltando são indistinguíveis de mensagem sem conteúdo |
| `send_queue` FK com `ON DELETE CASCADE` | Apagar contato removia, em silêncio, mensagens que ainda não saíram |

Correções (migrations `20260810120000`–`20260810120400`):

- **Lease de reivindicação.** `claimed_at`, `attempts`, `max_attempts`. O claim
  passa a alcançar `processing` com lease vencido, e sepulta em `failed` — com o
  motivo escrito — o que estourou o teto. Nem item esquecido, nem giro infinito.
- **`failed` nunca é apagado** pela limpeza automática, e ganhou visibilidade em
  `central.queue_dead_letter_overview`.
- **`uq_grouping_wa_msg`** absorve a reentrega da Meta. O webhook enfileira com
  `ignoreDuplicates`: sem erro e sem duplicar.
- **`send_queue.external_message_id`** gravado antes de persistir a mensagem —
  presente significa "já enviado", e o reclaim não reenvia.
- **`send()` inverteu a ordem**: persiste `pending`, envia, confirma `sent` com o
  id do provider (num só UPDATE, senão o webhook de entrega não encontra a
  mensagem). Falha do provider deixa `failed` visível em vez de nada. Não é
  coincidência que `messages.status` já tenha default `'pending'`: o schema
  sempre assumiu esta ordem, era o código que divergia.
- **`central.criar_mensagem_com_anexos`** — mensagem e anexos numa transação.
- **FK `RESTRICT`** no `send_queue`: apagar contato com envio pendente falha de
  forma explícita.

### Bloco B — segredos · concluído

`authenticated` tinha SELECT+INSERT+UPDATE+DELETE nas 22 tabelas e views de
`central`. A RLS segurava, mas era defesa única — e em várias tabelas os grants
de escrita existiam sem nenhuma policy que os autorizasse: privilégio sem uso,
que só serve para o dia em que uma policy for afrouxada por engano.

Migration `20260810120300`:

- Filas e `conversation_events`: só leitura. Auditoria que o próprio usuário
  altera não é auditoria.
- Views: só leitura (tinham INSERT/UPDATE/DELETE sem motivo).
- **Credencial gravável e não legível.** `agent_settings.elevenlabs_api_key` e
  `channel_connections.provider_metadata` saíram do SELECT de `authenticated` e
  ficaram no INSERT/UPDATE. É o formato exato do que se quer: o admin cola a
  chave pela tela e nunca a lê de volta; quem lê é service role.
- `central.channel_connections_public` (sem `provider_metadata`), par de
  `agent_settings_public`.

No código, `AgentCredentialsRepository` passou a ser o único lugar que lê coluna
de credencial, como **classe separada** de `AgentSettingsRepository`. As duas leem
a mesma tabela com privilégios diferentes; sendo classes distintas, o TypeScript
recusa passar o cliente do usuário onde é preciso service role — o erro deixaria
de ser um 403 descoberto em produção.

Consequência deliberada a lembrar: sob privilégio por coluna, **coluna nova nasce
sem grant de leitura** e `select('*')` responde 403. Falha fechada — credencial
futura não vaza por esquecimento —, mas coluna nova e inofensiva precisa ser
concedida explicitamente na migration.

**A chave da OpenAI não tem campo na tela, e a tela agora diz isso** (2026-08-11).
`OPENAI_API_KEY` é variável de runtime no Coolify: fora do banco, porque lá quem
tem acesso direto a leria; e nunca `ARG` do Dockerfile, porque `ARG` fica gravado
na imagem e no log de build — foi assim que o `TITA_TOKEN` vazou uma vez.

O problema é que ausência sem explicação parece defeito. Quem procurava o campo e
não o encontrava tinha como caminho natural concluir que faltava implementar e ir
criar uma coluna no banco — exatamente o que a decisão evitou. Então:

- `GET /api/central/llm/status` (admin), sobre `openAiEstaConfigurada()`. Devolve
  `configurada`, o id do modelo ativo, a allowlist e o motivo do negativo. **Não**
  devolve a chave, nem mascarada: máscara serve para o admin reconhecer a
  credencial que ele mesmo colou (ElevenLabs); aqui ele não a colou por ali, então
  mostrar pedaço dela seria expor sem ganho. Rota própria e não um campo em
  `/api/central/health`, que responde sem autenticação — estado da instalação não
  é informação pública.
- Bloco na aba APIs com o estado, o modelo ativo, os nomes das duas variáveis e a
  frase de que configurá-las hoje ainda não liga a atendente, porque quem as
  consome é o orquestrador.

**Verificado no browser**, contra o Supabase local: os dois estados. Sem as
variáveis → "Não configurada" com o motivo; com elas → "Configurada" e
`gpt-4o-mini`. Rota 200 autenticada, 401 sem sessão, nenhum erro de console.

**Verificado.** `modules/atendimento/filas.test.mts`, 26 asserções passando:
worker morto tendo o item devolvido com `attempts = 2`, esgotamento virando
`failed`, `cleanup` preservando `failed` e apagando `completed`, reentrega não
duplicando, duas `receive()` simultâneas resultando em uma linha sem exceção,
`DELETE` de contato recusado por FK, e anexo inválido derrubando a mensagem
inteira em vez de deixá-la órfã. Mais seis negativas de privilégio em psql com
`set role authenticated`: ler a chave, `select *`, ler `provider_metadata`,
escrever na fila e apagar auditoria — todas negadas.

Um detalhe do teste que valeu a lição: a primeira versão envelhecia `updated_at`
para cair na janela do `cleanup`, e a asserção falhou porque o trigger
`set_updated_at` reescreve o campo em todo UPDATE — o cleanup não apagava nada e
o teste teria passado por engano. Trocado por janela negativa
(`p_older_than_days: -1`), que isola o que se quer provar: o que protege o
`failed` é o filtro de status, não a idade.

### Identidade e permissão entre Pulsar e Connect · concluído (2026-08-11)

Regra dada por vocês: **todo administrador tem acesso total de configuração da
plataforma**, e o usuário mantém as mesmas permissões ao atravessar do Pulsar
para o Connect.

O que estava errado, e eram três coisas diferentes com a mesma aparência:

| Sintoma | Causa |
|---|---|
| Rodapé do Connect dizia "Usuário" e o e-mail | `components/nina/Sidebar.tsx` lia `user.user_metadata.full_name` — chave que ninguém grava. `create-user-with-password` escreve `nome`, e a fonte canônica é `public.usuarios` |
| Admin entrava em `/connect` e recebia 401 em tudo | `central_role` era `null`. Quem governa a Central é `central_role`, não `role`; ninguém havia atribuído |
| Item "Pulsar Connect" levava a `/sem-permissao` | Não existia código de permissão para `/connect`. `proxy.ts` deriva as rotas de `CODIGO_PARA_ROTAS`, `/connect` não estava lá, e o item aparecia para todos |

Correções:

- `hooks/useUsuarioAtual.ts` — hook novo, lê nome, `role` e `central_role` de
  `public.usuarios`. Lê o banco direto e **não** `/api/central/organization` de
  propósito: aquela rota exige `central_role` e responde 401 justamente para
  quem mais precisa entender o que está vendo.
- Rodapé do Connect passa a mostrar primeiro nome + papel traduzido por
  `ROLE_LABELS`, igual ao do Pulsar. O e-mail sai da linha de baixo e vira
  `title`. Quando `central_role` é null aparece "Sem acesso à Central" — dizer
  isso é mais útil que exibir um papel que ali não vale nada.
- Migration `20260810130000` — backfill `role = 'admin' ⇒ central_role = 'admin'`
  e gatilho `sync_central_role_admin` em `public.usuarios` mantendo a regra em
  INSERT e UPDATE. No banco, e não nas rotas, porque as rotas de admin gravam
  direto na tabela e o Studio também.
  A volta também vale: quem deixa de ser admin perde o `admin` herdado da
  Central. Não há como adivinhar em qual papel a pessoa deveria cair, então o
  gatilho apenas retira — falha fechada. Se o mesmo UPDATE já trouxer um
  `central_role` novo, ele vence, o que permite despromover e reclassificar de
  uma vez. O gatilho não mexe em `central_role` de quem não é admin do Pulsar:
  dar `director` ou `operator` a outro papel segue sendo decisão humana.
- Código de permissão `connect` (`lib/permissions/routes.ts` + migration
  `20260810130100` inserindo a linha em `public.permissoes`), apenas nos
  defaults do role `admin`. Ninguém ganhou nem perdeu acesso: o proxy já
  liberava admin e já barrava os outros. O que muda é que o item deixa de
  aparecer para quem não pode entrar, e conceder Connect a um não-admin passa a
  ser um clique em `/admin/permissoes`.

Verificado no stack local, atravessando os dois estados pelo navegador: como
`admin`, item visível, `/connect/analytics` abre e o rodapé lê
"Atendente / Administrador"; despromovido a `recepcao`, o gatilho zera o
`central_role`, o item desaparece do menu e a navegação direta continua caindo em
`/sem-permissao`; repromovido, o `central_role` volta sozinho. Mais seis
asserções do gatilho em transação revertida (`insert` de admin herda, despromoção
limpa, repromoção devolve, reclassificação no mesmo UPDATE vence, valor explícito
de não-admin sobrevive, e admin não consegue ficar sem acesso nem se pedirem).

Detalhe de quem for conferir por captura de tela: o indicador de dev do Next
(`<nextjs-portal>`) é um círculo com um "N" fixado no canto inferior esquerdo,
exatamente sobre o avatar do rodapé. É overlay de desenvolvimento e não existe em
produção.

### Bloco C (antigo Bloco 4) — orquestrador + WhatsApp · não iniciado, bloqueado

Decisões tomadas em 2026-08-10: **Meta Cloud API** como provider, e
**`OPENAI_API_KEY` como variável de runtime no Coolify** (não no banco — uma
chave por instalação, não configurável por tela, e assim não existe uma segunda
credencial em texto puro no Postgres). O `Dockerfile` hoje só passa as cinco
`NEXT_PUBLIC_*` como `ARG` e nenhum segredo é assado na imagem — propriedade a
manter.

As filas estão prontas e agora com lease e idempotência (Bloco A). Falta
construir:

- `MetaWabaProvider` implementando `MessagingProvider`
  (`types/central.types.ts:264`, 4 métodos), registrado no `ProviderFactory` que
  já existe em `services/index.ts` e hoje lança `ProviderNotImplementedError`.
  Portável de `nina-api-oficial/.../whatsapp-sender` (340 linhas) e da
  normalização em `whatsapp-webhook` (351). O que o Nina não tratava e a clínica
  precisa: a **janela de 24 horas** — fora dela a Meta só aceita template
  aprovado, e "recusado por janela" é decisão de negócio, não falha.
- Webhook `app/api/central/webhooks/whatsapp/` — `GET` de handshake e `POST` com
  HMAC `X-Hub-Signature-256` sobre o **corpo cru**, comparado com
  `crypto.timingSafeEqual`. Não há precedente no repositório: as 14 rotas fora de
  `/api/central` autenticam por sessão. Enfileira e responde 200 imediatamente.
- Workers de agrupamento e envio, autenticados por segredo compartilhado.
- Orquestrador OpenAI sobre `DEFINICOES_FERRAMENTAS` e `FerramentasAgente`
  (que nunca lança — devolve `{ok:false, motivo}`).
- Tique: `pg_cron` a cada 10s via `pg_net`. Verificado que o pg_cron 1.6.4 aceita
  sub-minuto: um job de 10s disparou 4 vezes em 35s.
- Coluna `agent_settings.ai_scheduling_enabled` (interruptor das ferramentas de
  agendamento). **Lembrar de conceder o grant explicitamente** — sob privilégio
  por coluna, coluna nova nasce ilegível.

Não porta o `nina-orchestrator` (1.348 linhas): chama o gateway da Lovable com
modelos Gemini, e suas 3 ferramentas inventam horário sem consultar a grade. O que
vale de lá é a montagem do prompt com memória do contato (`contacts.ai_memory` e
`central.update_contact_ai_memory` já existem) e as variáveis de template.

Falta de vocês: App Business aprovado na Meta com número dedicado
(`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, access token, `phone_number_id`)
e a `OPENAI_API_KEY` no Coolify.

---

## Pendências conhecidas

1. **RLS de `central.appointments` só permite `admin` e `director`.** Uma
   recepcionista com `central_role = operator` não vê nem cria agendamento.
   Não alterei por ser mudança de segurança — decisão de vocês.
2. **`authenticated` tem INSERT/UPDATE/DELETE/TRUNCATE em
   `csv_grades_profissionais`.** Pré-existente, fora do escopo desta entrega,
   mas é a grade congelada — vale revisar.
3. **`useOnboardingStatus` ainda lê `nina_settings` e `user_roles`** (404). Não
   é montado na página de Agendamentos; afeta Settings e OnboardingBanner.
4. **Sem realtime.** `central.appointments` não está na publicação de realtime.
   A tela atualiza por refetch (troca de janela, foco, após mutação).
5. **`services/api.ts` e `types/index.ts` seguem stubs** para Kanban, Contacts,
   Inbox e Pipeline — só a agenda foi migrada para dados reais.
6. **A aba "Agente" das Configurações ainda aponta para o projeto morto.**
   `components/nina/settings/AgentSettings.tsx` lê e escreve `nina_settings`
   (404 em toda montagem). É o próximo alvo natural: o prompt e o
   `auto_response_enabled` já têm rota (`PATCH /api/central/agent-settings`),
   mas nome da empresa, nome da atendente, horário comercial e dias de
   funcionamento moram em `central.organizations` e precisam de um PATCH na rota
   `/api/central/organization`, que hoje é só leitura.
7. **As credenciais ficam em texto puro no Postgres.** Desde a
   `20260810120300` elas não saem pela API — `authenticated` perdeu o SELECT das
   colunas e as views as omitem —, mas quem tem acesso direto ao banco as lê.
   Criptografia em repouso (Supabase Vault) segue pendente.
8. **O teste de voz consome cota da conta ElevenLabs.** São caracteres cobrados
   por clique. O teto de 1000 caracteres por teste limita o dano de um
   copiar-e-colar acidental, mas não há limite de quantos testes.
9. **Nada em `central` está na publicação de realtime.** A inbox de mensagens vai
   depender de refetch até isso mudar — e habilitar realtime em
   `central.messages` exige revisar a autorização, senão a subscrição vira um
   caminho de leitura paralelo à RLS.
10. **Fila morta não tem quem a observe.** `queue_dead_letter_overview` existe,
    mas ainda não há rota nem alerta consumindo — item `failed` fica no banco
    sem ninguém saber. É o Bloco D do plano, e sem ele "nenhum registro se
    perde" continua sendo intenção, não garantia.
11. **Quem receber a permissão `connect` sem ser admin entra numa tela que não
    carrega.** As duas autorizações são independentes: `proxy.ts` decide se a
    rota abre, `central_role` decide se a API responde. Conceder `connect` a uma
    recepcionista pelo `/admin/permissoes` a coloca dentro do painel com
    `central_role = null`, e todo `/api/central/*` devolve 401. O rodapé avisa
    ("Sem acesso à Central"), mas o corpo da página não explica — e a decisão de
    quais papéis da Central existem para quem não é admin (`operator`,
    `supervisor`, `director`) segue sendo de vocês.
12. **`serverError()` descarta o erro original.** `lib/central/response.ts:65`
    responde `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` e não
    registra nada. Não devolver detalhe ao browser está certo; não *logar* não —
    foi o que fez um 42703 (coluna inexistente) parecer falha de servidor no bug
    6. O ajuste é `console.error` com o código e a mensagem do Postgres antes do
    return, mantendo a resposta ao cliente como está.

---

## Para aplicar em produção quando decidirem

1. ~~Aplicar as migrations do schema `central`~~ — **feito em 2026-08-11**. Bloco
   Nina (`20260701010000`…`010500`, com a correção do seed), Blocos A e B
   (`20260810100000`…`120400`), `20260810130000`, `20260810130100` e
   `20260811100000`. SQL exato em [`supabase/snippets/`](../../supabase/snippets/).
2. ~~Expor o schema `central` na API do projeto~~ — **feito em 2026-08-11**, em
   Project Settings → **Data API** → Exposed schemas (não em API Keys, que é onde
   se procura primeiro). Vale registrar como se confere: com o schema fora da
   lista o PostgREST responde `PGRST106 Invalid schema: central`; depois de
   exposto, uma sonda com a chave **anon** passa a responder
   `42501 permission denied for schema central` — e esse 42501 é o **resultado
   certo**, porque `20260701000000` concede `usage` em `central` só a
   `authenticated` e `service_role`. Mudar de `PGRST106` para `42501` é a prova de
   que funcionou; ler o 42501 como problema novo leva a mexer em grant sem motivo.
3. ~~Definir `central_role` para os admins~~ — **feito em 2026-08-11**. Eram dois
   (Caio, Sanderson); a `20260810130000` fez o backfill e o gatilho mantém a
   regra para admins futuros. Falta apenas decidir `central_role` para quem vai
   operar **e não é admin** (`director`, `supervisor`, `operator_special`,
   `operator`) — hoje ninguém nessa faixa tem acesso.
4. Revisar a decisão de RLS da pendência 1.
5. Gravar a chave da ElevenLabs pela tela (Configurações → APIs → Gravar e
   verificar). A chave mora no banco, não em variável de ambiente, então o que
   foi configurado local **não** viaja para produção — e é isso que se quer: a
   cota de caracteres do teste não deve sair da conta de produção durante
   validação. **Este é o próximo passo em aberto.**

O bloco CRM (`20260701020000`…`020400`) segue pendente por decisão e não é
necessário para a agenda.

Nota sobre a ordem da `20260810120300` (grants por coluna), que na versão anterior
deste documento vinha com um alerta: ela retira de `authenticated` o SELECT da
coluna da chave, e num app que não tenha o `AgentCredentialsRepository` a leitura
responderia 403. O alerta não se aplicou porque
`frontend/app/api/central/agent-settings/` nunca foi commitado — nenhum build do
Coolify contém aquele caminho. Passa a valer de novo no dia em que o módulo for
commitado e deployado.
