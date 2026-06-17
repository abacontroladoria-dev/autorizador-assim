     # Central de Atendimento Pulsar — Visão do Produto

     > **Documento:** Visão Estratégica e Arquitetural  
     > **Versão:** 1.0  
     > **Data:** 2026-06-17  
     > **Status:** Referência arquitetural oficial para desenvolvimento

     ---

     ## 1. Visão Geral

     A **Central de Atendimento do Pulsar** é um workspace omnichannel de comunicação corporativa integrado profundamente aos dados operacionais da organização.

     Ela não é um módulo de mensagens. É o ambiente onde operadores passam o dia inteiro gerenciando relacionamentos entre a organização e seus públicos — pacientes, responsáveis, terapeutas, leads, parceiros e fornecedores.

     A Central combina a fluidez de uma plataforma de mensagens moderna com a profundidade de contexto que só o Pulsar possui: agenda, autorizações, convênios, histórico clínico e indicadores operacionais disponíveis diretamente durante o atendimento.

     ### Inspirações de experiência

     | Plataforma | O que inspira |
     |---|---|
     | **Kommo** | Funil de atendimento, contexto de contato rico, integração de dados |
     | **Intercom** | Workspace premium, IA nativa, organização por inbox |
     | **WhatsApp Web** | Familiaridade de uso, velocidade, composição de mensagens |

     ---

     ## 2. Princípio Diferencial

     > **O Pulsar entende o contexto. Outros CRMs apenas armazenam mensagens.**

     Enquanto plataformas tradicionais exibem histórico de conversa e dados de contato básicos, a Central de Atendimento Pulsar exibe durante o atendimento:

     - Quais pacientes o responsável tem e qual é o status de cada um
     - As próximas sessões agendadas na agenda da clínica
     - O status das autorizações em aberto com o convênio
     - Pendências financeiras ou documentais
     - O histórico de presença e faltas
     - Indicadores operacionais relevantes para o contexto do contato

     Essa integração transforma cada conversa de uma troca de mensagens em um atendimento informado, reduz o tempo de resposta e elimina a necessidade de alternar entre sistemas.

     ---

     ## 3. Identidade Visual e Experiência

     ### 3.1 Workspace Dedicado

     Ao acessar a Central de Atendimento, o usuário entra em um ambiente operacional independente:

     - A sidebar principal do sistema Pulsar **não é exibida**
     - O header tradicional **não é exibido**
     - A navegação interna da Central é própria e autocontida
     - O retorno ao dashboard administrativo é intencional e explícito

     Essa separação é deliberada. Operadores que passam o dia na Central não precisam de distrações do módulo administrativo. O workspace deve ser limpo, focado e eficiente.

     ### 3.2 Layout Principal — Três Colunas

     ```
     ┌────────────────────────────────────────────────────────────────────────┐
     │  CONVERSAS              │  CHAT                    │  CONTEXTO          │
     │  (sidebar esquerda)     │  (área central)          │  (sidebar direita) │
     │                         │                          │                    │
     │  • Filtros e busca      │  • Histórico de msgs     │  • Perfil dinâmico │
     │  • Lista de conversas   │  • Campo de composição   │  • Dados do Pulsar │
     │  • Indicadores de fila  │  • Toolbar de IA         │  • Notas internas  │
     │  • Tags e status        │  • Cabeçalho contextual  │  • Resumos IA      │
     │                         │                          │  • Tópicos         │
     │  Resizable (300–640px)  │  flex-1                  │  350px fixo        │
     │  Colapsa para 48px      │                          │  Colapsa para 48px │
     └────────────────────────────────────────────────────────────────────────┘
     ```

     A coluna central cresce para preencher o espaço restante. As sidebars são recolhíveis. A sidebar esquerda é redimensionável por arraste. Em mobile, exibe uma coluna por vez.

     ### 3.3 Navegação Interna

     A Central possui navegação própria composta por:

     ```
     ┌─────────────────────────────────────────────────────┐
     │  [Logo Pulsar]  [Conversas] [Contatos] [Relatórios] │
     │                                   [Configurações] [Perfil] │
     └─────────────────────────────────────────────────────┘
     ```

     - **Conversas** — Workspace principal (3 colunas)
     - **Contatos** — Gestão de contatos (2 colunas)
     - **Relatórios** — Painel analítico (full-width)
     - **Configurações** — Inboxes, canais, equipe, macros, regras (tabs)

     ---

     ## 4. Arquitetura Conceitual

     ### 4.1 Hierarquia

     ```
     Organização
     └── Inbox (área operacional)
     └── Channel (canal de comunicação)
          └── Conversation (interação com um contato)
               └── Message (mensagem individual)
     ```

     ### 4.2 Inbox

     Representa uma **área operacional** da organização. Cada inbox tem uma equipe de operadores, canais conectados e regras de distribuição próprias.

     | Exemplo de Inbox | Descrição |
     |---|---|
     | Recepção Realengo | Atende responsáveis e pacientes da unidade Realengo |
     | Recepção Padre Miguel | Atende responsáveis e pacientes da unidade Padre Miguel |
     | Financeiro | Atende questões de pagamento, negociação e inadimplência |
     | Marketing | Atende leads, campanhas e comunicações institucionais |
     | RP | Atende terapeutas em questões de remuneração e contratos |

     Uma inbox pode agregar canais de diferentes provedores. O operador vê todas as conversas da sua inbox unificadas em uma única fila, independentemente do canal de origem.

     ### 4.3 Channel

     Representa um **canal de comunicação** conectado a uma inbox. A Central é desacoplada do provedor — trocar ou adicionar um canal não impacta a experiência do operador.

     | Canal | Provedor | Status |
     |---|---|---|
     | WhatsApp Evolution | Evolution API | V1 |
     | WhatsApp WABA | Meta Business API | V1 |
     | Instagram DM | Meta Graph API | Futuro |
     | E-mail | SMTP/IMAP | Futuro |

     Múltiplos canais podem coexistir em uma mesma inbox.

     ### 4.4 Conversation

     Representa uma **interação ativa ou histórica** entre a organização e um contato. Uma conversa:

     - Pertence a uma inbox
     - Foi iniciada por um canal específico
     - Pode ter um operador atribuído
     - Possui status próprio (aberta, aguardando, resolvida, arquivada)
     - Contém o histórico completo de mensagens
     - Pode ter notas internas, tags e classificações de IA

     ### 4.5 Message

     Representa uma **mensagem individual** dentro de uma conversa. Pode ser texto, mídia, áudio, documento ou nota interna. Cada mensagem registra direção (entrada/saída), horário, status de entrega e autoria.

     ---

     ## 5. Multiempresa (SaaS)

     A arquitetura nasce preparada para operação multitenant.

     **Regra fundamental:** uma organização nunca pode visualizar dados, conversas ou contatos de outra organização.

     ### Isolamento garantido por:

     - Row Level Security (RLS) em todas as tabelas com `organization_id`
     - Todos os selects, inserts e updates filtrados por `organization_id` da sessão autenticada
     - Funções RPC sempre recebem `organization_id` como parâmetro implícito via contexto de sessão
     - Edge Functions validam `organization_id` antes de qualquer operação

     ### Implicações de design:

     - Inboxes, canais, contatos, conversas e mensagens são sempre escopados por organização
     - Operadores pertencem a uma organização e só enxergam o contexto dela
     - Configurações (macros, regras de atribuição, integrações) são por organização
     - Relatórios nunca cruzam dados entre organizações

     ---

     ## 6. Abstração de Providers

     A Central de Atendimento é independente do protocolo de comunicação. O operador não sabe nem precisa saber qual provedor entregou a mensagem.

     ### Camada de abstração

     ```
     Provider Layer (Evolution API / Meta WABA / Instagram / ...)
          ↓
     Channel Adapter (normaliza eventos e ações)
          ↓
     Central de Atendimento (Conversation / Message model)
          ↓
     Operador
     ```

     ### Contratos do Channel Adapter

     Cada provider implementa os seguintes contratos:

     | Operação | Descrição |
     |---|---|
     | `receiveMessage` | Normaliza webhook de entrada para `Message` |
     | `sendMessage` | Envia texto, mídia ou template |
     | `sendAudio` | Envia áudio gravado |
     | `markAsRead` | Marca leitura |
     | `getContactInfo` | Busca dados do contato no provedor |
     | `getConnectionStatus` | Verifica status da conexão |

     A troca de provedor — ou a adição de um novo — não altera nenhum componente da camada de UI ou de regras de negócio.

     ---

     ## 7. IA como Capacidade Nativa

     A IA não é um add-on. É infraestrutura nativa da Central de Atendimento.

     ### 7.1 Capacidades do Assistente de Composição

     O operador pode, a qualquer momento durante a redação de uma mensagem:

     | Ação | Comportamento |
     |---|---|
     | Expandir | Amplia a mensagem com mais detalhes |
     | Reformular | Reescreve mantendo o sentido |
     | Tom de voz da organização | Ajusta para o padrão comunicacional institucional |
     | Mais amigável | Torna a linguagem mais próxima |
     | Mais formal | Adequa para comunicações oficiais |
     | Corrigir gramática | Revisa ortografia e concordância |
     | Traduzir | Traduz para idioma selecionado |

     A IA sugere — o operador decide. Nenhuma mensagem é enviada sem confirmação humana.

     ### 7.2 Sugestões de Resposta Inteligentes

     Com base no contexto da conversa e nos dados internos do Pulsar, a IA gera sugestões de resposta curtas e acionáveis. O operador clica para inserir no campo de composição.

     ### 7.3 Resumo Automático de Conversa

     A qualquer momento, o operador pode solicitar um resumo estruturado da conversa contendo:

     - Resumo narrativo
     - Pontos-chave discutidos
     - Próximos passos identificados
     - Sentimento predominante do contato

     ### 7.4 Classificação de Assuntos

     A IA classifica automaticamente o assunto da conversa (ex: dúvida de agenda, solicitação de autorização, reclamação, interesse em matrícula) com grau de confiança. Usado para triagem, relatórios e regras de distribuição.

     ### 7.5 Análise de Sentimento

     Detecta o estado emocional do contato em tempo real (positivo, neutro, negativo). O operador visualiza o termômetro no painel de contexto. Supervisores podem filtrar conversas por sentimento.

     ### 7.6 Transcrição Automática de Áudio

     Mensagens de voz recebidas são transcritas automaticamente. O operador lê o conteúdo sem precisar ouvir. A transcrição é indexada e pesquisável.

     ### 7.7 Consulta a Dados Internos do Pulsar

     A IA tem acesso controlado aos dados operacionais da organização para:

     - Responder perguntas sobre agendamentos
     - Verificar status de autorizações
     - Confirmar dados de pacientes vinculados
     - Informar pendências financeiras

     O operador pode invocar esta capacidade via comando no chat (ex: `@pulsar próxima sessão do paciente X`).

     ### 7.8 Macros Inteligentes

     Respostas pré-configuradas organizadas por categoria, ativadas por atalho (`/`) ou sugeridas pela IA com base no contexto da conversa.

     ---

     ## 8. Context Profiles — Painel de Contexto Dinâmico

     O painel de contexto (coluna direita) não é fixo. Ele se adapta ao **tipo do contato** identificado na conversa.

     O sistema identifica automaticamente o tipo do contato ao vincular um número ao perfil correspondente no Pulsar. O operador também pode vincular manualmente.

     ### 8.1 Tipos de Contato

     | Tipo | Descrição |
     |---|---|
     | **Responsável** | Familiar ou responsável legal de paciente em atendimento |
     | **Paciente** | Paciente adulto em atendimento direto |
     | **Terapeuta** | Profissional vinculado à organização |
     | **Colaborador** | Funcionário administrativo ou operacional |
     | **Lead** | Contato em processo de captação ou interesse |
     | **Fornecedor** | Parceiro comercial ou prestador de serviços |
     | **Outros** | Contato sem vínculo identificado |

     ### 8.2 Perfil — Responsável

     ```
     ┌──────────────────────────────────┐
     │  RESPONSÁVEL                     │
     │  Ana Lima                        │
     │  (21) 99999-9999                 │
     ├──────────────────────────────────┤
     │  PACIENTES VINCULADOS            │
     │  • João Lima — 8 anos            │
     │    Unidade: Realengo             │
     │    Status: Em atendimento        │
     ├──────────────────────────────────┤
     │  AGENDA (próximas sessões)       │
     │  • Seg 23/06 às 09:20            │
     │    Aplicador ABA (PS)            │
     │  • Seg 23/06 às 10:00            │
     │    Terapia Ocupacional           │
     ├──────────────────────────────────┤
     │  AUTORIZAÇÕES                    │
     │  • 4 ativas — ASSIM              │
     │  • 1 aguardando renovação        │
     ├──────────────────────────────────┤
     │  FINANCEIRO                      │
     │  • Situação: Em dia              │
     ├──────────────────────────────────┤
     │  NOTAS INTERNAS                  │
     │  [+ Adicionar]                   │
     ├──────────────────────────────────┤
     │  RESUMOS IA                      │
     │  [Gerar Resumo]                  │
     ├──────────────────────────────────┤
     │  TÓPICOS DA CONVERSA             │
     │  • Dúvida de agenda              │
     │  • Autorização                   │
     └──────────────────────────────────┘
     ```

     ### 8.3 Perfil — Terapeuta

     ```
     ┌──────────────────────────────────┐
     │  TERAPEUTA                       │
     │  Mariana Costa                   │
     │  Psicóloga — Realengo            │
     ├──────────────────────────────────┤
     │  AGENDA HOJE                     │
     │  • 8 sessões confirmadas         │
     │  • 1 substituição pendente       │
     ├──────────────────────────────────┤
     │  PACIENTES ATIVOS                │
     │  • 12 pacientes                  │
     ├──────────────────────────────────┤
     │  DISPONIBILIDADE                 │
     │  • Esta semana: confirmada       │
     ├──────────────────────────────────┤
     │  NOTAS INTERNAS                  │
     │  RESUMOS IA / TÓPICOS            │
     └──────────────────────────────────┘
     ```

     ### 8.4 Perfil — Lead

     ```
     ┌──────────────────────────────────┐
     │  LEAD                            │
     │  Carlos Mendes                   │
     │  Interessado em ABA              │
     ├──────────────────────────────────┤
     │  ORIGEM                          │
     │  • Instagram Ads                 │
     │  • Campanha: Junho 2026          │
     ├──────────────────────────────────┤
     │  FUNIL                           │
     │  • Etapa: Contato inicial        │
     │  • Há 2 dias em qualificação     │
     ├──────────────────────────────────┤
     │  TAGS                            │
     │  • ABA  • Realengo  • Urgente    │
     ├──────────────────────────────────┤
     │  NOTAS INTERNAS                  │
     │  RESUMOS IA / TÓPICOS            │
     └──────────────────────────────────┘
     ```

     ### 8.5 Perfil — Sem Vínculo (Outros)

     Quando o contato não é identificado no Pulsar, o painel exibe formulário de criação/vínculo com campos mínimos. O operador pode criar um novo contato ou buscar por nome/CPF para vincular ao perfil correto.

     ---

     ## 9. Fluxo de Atendimento

     ```
     NOVA CONVERSA
     │
     ├── Automática (webhook do canal)
     └── Manual (operador cria conversa)
          │
          ▼
     FILA (sem atribuição)
     ← QueueIndicator mostra contagem
          │
          ├── Atribuição automática (regras de inbox)
          └── Atribuição manual (operador/supervisor)
               │
               ▼
          EM ATENDIMENTO
          ← Operador atribuído visível no cabeçalho
               │
               ├── Transferência para outro operador
               │   (com motivo opcional)
               │
               └── Resolução
                    │
                    ▼
               RESOLVIDA
                    │
                    ▼
               ARQUIVADA (opcional)
     ```

     ### 9.1 Estados de uma Conversa

     | Status | Descrição | Quem vê |
     |---|---|---|
     | `open` | Aguardando atendimento (sem operador) | Todos da inbox |
     | `assigned` | Em atendimento com operador atribuído | Operador + supervisores |
     | `waiting` | Aguardando retorno do contato | Operador atribuído |
     | `resolved` | Atendimento concluído | Histórico |
     | `archived` | Arquivada para consulta futura | Histórico |

     ### 9.2 Quick Filters

     O operador pode filtrar a lista de conversas por:

     - **Todas** — Todas as conversas da inbox
     - **Minhas** — Apenas conversas atribuídas ao operador logado
     - **Fila** — Conversas sem operador atribuído
     - **Aguardando** — Conversas esperando retorno do contato
     - **Não lidas** — Mensagens novas não visualizadas
     - **Tags** — Filtra por tag específica

     ---

     ## 10. Personas

     ### 10.1 Recepcionista

     **Perfil:** Operadora de front office que gerencia o relacionamento diário com famílias e responsáveis. Passa 100% do tempo de trabalho na Central de Atendimento.

     **Necessidades principais:**
     - Saber imediatamente quem é o contato e quais pacientes ele representa
     - Ver a agenda do paciente sem sair da conversa
     - Confirmar sessões, reagendar e informar horários com precisão
     - Registrar notas rápidas sobre cada atendimento
     - Usar macros para respostas frequentes (boas-vindas, confirmação de sessão, endereço)
     - Transferir conversas para o financeiro ou RP quando necessário

     **Métricas que importam:**
     - Tempo médio de resposta
     - Volume de conversas resolvidas por dia
     - Taxa de conversas transferidas

     **Frustrações atuais:** Precisa alternar entre WhatsApp Web, planilhas e o sistema para juntar informações que deveriam estar no mesmo lugar.

     ---

     ### 10.2 Financeiro

     **Perfil:** Responsável pelo acompanhamento de cobranças, negociações de pagamento, emissão de recibos e tratativas de inadimplência com responsáveis.

     **Necessidades principais:**
     - Visualizar situação financeira do responsável diretamente no chat
     - Registrar acordos de pagamento como notas internas
     - Receber conversas transferidas pela recepção já com contexto preenchido
     - Enviar documentos (recibos, boletos, comprovantes) diretamente pela Central
     - Classificar conversas por tipo (cobrança, negociação, quitação)

     **Métricas que importam:**
     - Volume de pendências resolvidas
     - Tempo médio de fechamento de negociação

     **Frustrações atuais:** Recebe conversas sem contexto, precisa rever todo o histórico do responsável em outro sistema antes de responder.

     ---

     ### 10.3 RP — Remuneração e Pagamentos

     **Perfil:** Responsável pela comunicação com os terapeutas sobre contratos, remuneração, escalas e pendências de pagamento.

     **Necessidades principais:**
     - Ver a carga horária e os pacientes ativos do terapeuta durante a conversa
     - Confirmar substituições e escalas diretamente pelo chat
     - Registrar acordos e combinados como notas internas com timestamp
     - Usar a Central separadamente da recepção (inbox próprio)

     **Métricas que importam:**
     - Tempo de resposta para terapeutas
     - Pendências documentais resolvidas

     **Frustrações atuais:** Usa grupos de WhatsApp mistos sem organização, perde contexto de combinados anteriores.

     ---

     ### 10.4 Marketing

     **Perfil:** Responsável pela gestão de leads, campanhas de captação e comunicação institucional.

     **Necessidades principais:**
     - Registrar leads com origem e campanha de captação
     - Gerenciar funil de qualificação no painel de contexto
     - Criar tags para segmentação (tipo de interesse, urgência, faixa etária)
     - Disparar mensagens de acompanhamento (follow-up) sem sair da Central
     - Visualizar taxa de conversão lead → paciente matriculado

     **Métricas que importam:**
     - Leads atendidos por dia
     - Taxa de qualificação
     - Tempo de resposta ao primeiro contato

     **Frustrações atuais:** Não tem visibilidade de quais leads já foram convertidos em pacientes no sistema.

     ---

     ### 10.5 Supervisor

     **Perfil:** Coordena uma ou mais inboxes, monitora a performance da equipe em tempo real e intervém em atendimentos críticos.

     **Necessidades principais:**
     - Visualizar todas as conversas abertas da inbox independentemente do operador atribuído
     - Identificar conversas com sentimento negativo ou longa espera
     - Transferir conversas entre operadores
     - Acessar métricas em tempo real (fila, tempo médio de resposta, conversas por operador)
     - Gerar relatórios para apresentar à diretoria

     **Métricas que importam:**
     - SLA de resposta por inbox
     - Volume de conversas por operador
     - Taxa de resolução no primeiro contato
     - Conversas escaladas

     ---

     ### 10.6 Diretor

     **Perfil:** Nível estratégico. Acessa a Central esporadicamente para consumir relatórios e indicadores consolidados.

     **Necessidades principais:**
     - Painel executivo com KPIs de alto nível
     - Comparativo de performance entre inboxes e períodos
     - Identificar volumes de demanda por tipo de contato
     - Entender satisfação (sentimento) dos contatos ao longo do tempo

     **Métricas que importam:**
     - Volume total de conversas por período
     - Taxa de resolução geral
     - Tempo médio de resposta por inbox
     - Distribuição de assuntos

     ---

     ### 10.7 Administrador

     **Perfil:** Responsável técnico e operacional pela configuração e manutenção da Central de Atendimento.

     **Necessidades principais:**
     - Criar e configurar inboxes
     - Conectar e gerenciar canais (Evolution, WABA)
     - Gerenciar equipe: convidar operadores, definir papéis, controlar acesso por inbox
     - Configurar regras de atribuição automática
     - Gerenciar macros por inbox
     - Monitorar status de conexão dos canais
     - Acessar logs de auditoria e trilhas de uso

     ---

     ## 11. Organização de Papéis na Central

     | Papel | Descrição | Pode ver |
     |---|---|---|
     | `agent` | Operador padrão | Suas conversas + inbox atribuída |
     | `supervisor` | Coordenador de inbox | Todas as conversas da(s) inbox(es) |
     | `admin` | Administrador da organização | Tudo + configurações |

     Papéis são independentes dos papéis do dashboard administrativo Pulsar. Um usuário com role `recepcao` no Pulsar pode ter papel `agent` na Central. A sincronização entre os dois sistemas é configurável pelo administrador.

     ---

     ## 12. Escopo — Versão 1

     ### Incluído no V1

     | Funcionalidade | Descrição |
     |---|---|
     | Workspace dedicado | Sem sidebar/header do Pulsar. Layout 3 colunas. |
     | Inbox única por organização | Configuração inicial de 1 inbox ativa |
     | Canal Evolution API | WhatsApp via Evolution API |
     | Canal Meta WABA | WhatsApp Business API oficial |
     | Conversas individuais | 1-para-1 (sem grupos) |
     | Lista de conversas | Filtros por status, fila, tags |
     | Chat com histórico | Mensagens de texto e mídia |
     | Composição com IA | AIComposer: 7 transformações de texto |
     | Sugestões inteligentes | SmartReply baseado no contexto |
     | Macros | Respostas rápidas por atalho |
     | Transcrição de áudio | Áudios transcritos automaticamente |
     | Notas internas | Por conversa, com pin e timestamp |
     | Resumos IA | Geração sob demanda com key_points e action_items |
     | Classificação de tópicos | Automática a cada 5 mensagens |
     | Análise de sentimento | Tempo real no painel de contexto |
     | Atribuição manual | Operador seleciona responsável |
     | Transferência de conversa | Com motivo registrado |
     | Context Profile: Responsável | Pacientes, agenda, autorizações, financeiro |
     | Context Profile: Terapeuta | Agenda, disponibilidade, pacientes |
     | Context Profile: Outros | Perfil genérico + vínculo manual |
     | Integração pacientes/responsáveis | Lê `vw_central_pacientes`, agenda e autorizações |
     | Auditoria completa | Log de toda ação com operador e timestamp |
     | RLS multiempresa | Isolamento por `organization_id` |
     | Relatórios básicos | Volume, status, tempo de resposta, agente |

     ### Fora do Escopo no V1

     - Instagram DM
     - Conversas em grupo
     - Campanhas e disparos em massa
     - Atribuição automática (round-robin, regras)
     - Múltiplos agentes IA autônomos
     - Bot de fluxo (chatbot)
     - Context Profile completo para Lead (CRM básico disponível)
     - Context Profile para Fornecedor e Colaborador
     - Relatórios avançados (cohort, funil de conversão)

     ---

     ## 13. Escopo Futuro

     ### V2 — Distribuição Inteligente

     - Regras automáticas de atribuição por inbox (fixed, round-robin, por tag, por assunto)
     - Múltiplas inboxes por organização com equipes independentes
     - SLA configurável com alertas automáticos
     - Context Profile completo para Lead (funil, origem, campanha)

     ### V3 — Automação e Campanhas

     - Instagram DM como canal
     - Campanhas de mensagens em massa (WABA templates)
     - Automações baseadas em gatilhos (ex: sem resposta em 24h → reabrir)
     - Bot de fluxo para triagem inicial

     ### V4 — Omnichannel Completo

     - E-mail como canal
     - Múltiplos agentes IA autônomos configuráveis por inbox
     - Integração com calendário para agendamento direto pela conversa
     - Relatórios avançados com funil, cohort e NPS inferido

     ---

     ## 14. Critérios de Sucesso

     ### 14.1 Métricas de Adoção

     | Métrica | Meta V1 | Medição |
     |---|---|---|
     | Operadores ativos/semana | ≥ 80% da equipe operacional | Sessões únicas |
     | Sessões > 6h/dia por operador | ≥ 3 operadores | Duração de sessão |
     | Conversas gerenciadas pela Central | ≥ 90% do volume total | Comparativo WhatsApp → Central |
     | Retorno ao WhatsApp Web | < 10% dos atendimentos | Pesquisa qualitativa |

     ### 14.2 Métricas Operacionais

     | Métrica | Meta V1 | Descrição |
     |---|---|---|
     | Tempo de primeira resposta (TFR) | < 5 minutos | Desde abertura da conversa até primeira msg do operador |
     | Tempo médio de resolução (TMR) | < 30 minutos | Para conversas de informação/confirmação |
     | Taxa de resolução no primeiro contato | > 70% | Conversas fechadas sem transferência |
     | Conversas em fila > 10min | < 5% | Conversas não atribuídas por mais de 10 minutos |

     ### 14.3 Métricas de Qualidade

     | Métrica | Meta V1 | Descrição |
     |---|---|---|
     | Uso de macros | > 40% das mensagens de saída | Reduz tempo de composição |
     | Uso de IA Composer | > 20% dos operadores/semana | Adoção da ferramenta |
     | Notas internas por conversa | > 30% das conversas resolvidas | Rastreabilidade |
     | Resumos IA gerados | > 50% das conversas longas (> 20 msgs) | Transferência com contexto |

     ### 14.4 Critérios de Qualidade Técnica

     | Critério | Padrão |
     |---|---|
     | Latência de entrega de mensagem | < 2 segundos do envio ao ACK |
     | Realtime da lista de conversas | Atualização < 1 segundo via Supabase channel |
     | RLS sem vazamento entre organizações | 0 incidentes de cross-org data |
     | Auditoria de ações | 100% das ações de operador com log |
     | Disponibilidade | ≥ 99,5% em horário comercial |

     ### 14.5 Critérios de Experiência

     | Critério | Padrão |
     |---|---|
     | Tempo para identificar o contato | < 3 segundos após abrir a conversa |
     | Acesso a dados do Pulsar sem sair da conversa | 100% das informações do perfil no painel de contexto |
     | Enviar uma macro | Máximo 2 cliques ou 1 atalho de teclado |
     | Solicitar resumo IA | 1 clique |
     | Transferir uma conversa | Máximo 3 cliques |

     ---

     ## 15. Princípios de Desenvolvimento

     ### 15.1 Regras de negócio do Pulsar prevalecem

     A Central de Atendimento é um módulo do Pulsar, não um produto separado. Todas as decisões de modelagem, autenticação, autorização, permissões e integração com dados operacionais seguem as regras já estabelecidas do projeto.

     ### 15.2 Provider-agnostic por design

     Nenhuma lógica de negócio deve depender de implementação específica de provedor. Se um componente precisar saber se está lidando com Evolution ou WABA, é um sinal de design errado.

     ### 15.3 IA assistiva, não substituta

     Toda ação de IA sugere e aguarda confirmação humana. Nenhuma mensagem é enviada automaticamente sem operador presente. O operador é sempre responsável pelo que a organização comunica.

     ### 15.4 Contexto sempre disponível

     O painel de contexto deve carregar os dados do Pulsar de forma assíncrona e não-bloqueante. O chat não pode esperar o contexto para abrir. Skeleton loading em todos os painéis.

     ### 15.5 Auditabilidade total

     Toda ação de operador — abertura de conversa, envio de mensagem, transferência, criação de nota, atribuição — deve ser registrada com `operador_id`, `timestamp`, `organization_id` e dados da ação.

     ---

     ## Referências

     - [reference-analysis.md](reference-analysis.md) — Análise arquitetural da plataforma de referência
     - [02-business-rules.md](02-business-rules.md) — Regras de negócio detalhadas *(a preencher)*
     - [03-user-roles-and-permissions.md](03-user-roles-and-permissions.md) — Papéis e permissões *(a preencher)*
     - [11-ui-ux-specification.md](11-ui-ux-specification.md) — Especificação visual detalhada *(a preencher)*
