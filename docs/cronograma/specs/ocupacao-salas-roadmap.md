# Roadmap — Ocupação de Salas + Dashboards (Unidade / Pacientes)

## Contexto

Pedido original (retomado aqui porque a primeira tentativa de implementação foi rápida demais e não foi validada em produção):

1. Trazer a feature **"🏢 Ocupação de Salas"** do `calculadora-remuneracao` (projeto antigo, JS/Vite, a ser eliminado) para dentro do `sistema-pulsar` (produção real, TypeScript).
2. Trazer **"▶ Dashboard por unidade"** e **"▶ Dashboard de pacientes"** para dentro de `frontend/app/(dashboard)/cronograma/indicadores`, com entrada no Sidebar em "Indicadores".
3. A dinâmica de Ocupação de Salas deve ficar no Sidebar junto de "Cronograma", acima de `/cronograma/saida-profissional`.
4. Todos os dados devem ser persistidos numa tabela do Supabase dedicada à gestão de salas — nada de `localStorage`/CSV manual, para o sistema ser sustentável no longo prazo.
5. Autonomia para adaptar ao design do sistema-pulsar. O objetivo final é depender só do `sistema-pulsar` e poder apagar o `calculadora-remuneracao`.

## O que já foi descoberto (vale para todas as fases abaixo)

- `csv_grades_profissionais` e `agenda_tita_autorizacao_v2` já têm, prontos e atualizados automaticamente (sem upload manual): paciente, convênio, unidade/clínica, sala (texto livre `sala_nome`), profissional, terapia, dia da semana, hora inicial/final, status.
- **Não existia** nenhum cadastro estruturado de salas (unidade/núcleo/andar/capacidade/status) — só a string livre `sala_nome`. É exatamente isso que a nova tabela `cronograma_salas` resolve.
- Design system reaproveitável em `frontend/components/cronograma/ui/` (StatCard, StatusPill, SegmentedTabs, ScheduleModal, TerapiaChip, tones.ts).

## Lição da primeira tentativa (por que este roadmap existe)

O código foi todo escrito (migração SQL, camada de dados TS, páginas, Sidebar) em uma única passada, sem validar em produção a cada etapa. Resultado: o Sidebar ficou perfeito, mas a tela quebra com `Could not find the table 'public.cronograma_salas' in the schema cache` — a migração nunca foi aplicada no Supabase real, só existe como arquivo local em `supabase/migrations/`.

**A partir de agora, o trabalho é feito um passo por vez.** Cada passo só é considerado concluído depois que você confirma, olhando o sistema rodando, que ele funciona com dados reais — não quando o código "parece certo" ou o typecheck passa.

## Regras de trabalho para este roadmap

- Um passo de cada vez. Não avanço para o próximo sem sua confirmação de que o atual está funcionando de verdade.
- **Migrações Supabase são aplicadas por você** (SQL Editor do painel ou `supabase db push` na sua máquina) — combinado nesta conversa. Eu preparo o SQL pronto para colar/rodar e aviso exatamente o que validar depois.
- Nenhum dado local (localStorage, CSV, estado em memória) — tudo que a feature precisa lembrar vive em tabela do Supabase. Isso já está garantido pelo desenho atual (tabela `cronograma_salas` + tabelas de agendamento já existentes), só falta a tabela existir de fato no banco.
- Este arquivo é atualizado a cada passo concluído (checklist abaixo), para servir de registro do que já foi validado.

## Checklist faseado

### Fase 1 — Existência real da tabela no Supabase ✅ CONCLUÍDA
- [x] Você roda a migração `supabase/migrations/20260716150000_create_cronograma_salas.sql` (cria a tabela `cronograma_salas`) e `20260716150001_add_permissao_ocupacao_salas.sql` (registra a permissão) no Supabase real.
- **Validação**: `select * from public.cronograma_salas;` rodado com sucesso (0 linhas, sem erro). Confirmado.

### Fase 2 — Inventário real de salas 🔶 EM ANDAMENTO
- [x] Decidido: gerar seed automático a partir dos dados reais (opção b).
- [x] **Bug encontrado e corrigido durante a revisão**: o cruzamento sala × agenda (`frontend/lib/cronograma/salas.ts`) comparava texto por substring bidirecional (`includes`), o que faria "Sala 1" casar erroneamente com "Sala 10", "Sala 11"…"Sala 19" (substring "sala 1" está contida em "sala 10"). Corrigido para comparação estrutural: parse de `{unidade, número}` do texto da agenda (`parseSalaAgenda`) comparado com os campos `unidade_nome`/`numero_sala` já normalizados da sala cadastrada. O campo `sala_nome_referencia` virou só informativo (não é mais usado no cruzamento).
- [x] Consultei `agenda_tita_autorizacao_v2` real: 54 salas físicas distintas (Realengo, Fazendinha, Padre Miguel), mais 5 designações não-físicas que ficaram de fora do inventário (`AT Externo Escola`, `AT Externo Casa`, `Sala Teste`, `Especialista Técnico de Área`, `Consulta 4/6 - Nutrição`).
- [x] Migração de seed preparada: `supabase/migrations/20260716160000_seed_cronograma_salas_reais.sql` — insere as 54 salas com `capacidade='unico'`/`status='ativa'` como chute seguro padrão (ver avisos no cabeçalho do arquivo sobre o que revisar: capacidade real de cada sala, núcleo/andar, salas que são na prática administrativas).
- [x] **Ação sua**: migração rodada no Supabase. `select count(*) from public.cronograma_salas;` retornou **54**. ✅ Confirmado.

### Fase 3 — Ocupação de Salas funcionando com dados reais 🔶 EM ANDAMENTO
- [x] Primeiro teste real: `/cronograma/ocupacao-salas` carregou as 54 salas sem erro, mas "Ocupação da semana" ficou em 0% e a grade toda "Livre".
- [x] **Segundo bug encontrado e corrigido**: `csv_grades_profissionais` não é sincronizado de forma contínua — só tem dados de 06–10/07 e depois um salto direto para 03/08 em diante (gap de 13/07 a 01/08). O hook novo (`useOcupacaoSalas`) usava uma "semana-calendário corrente" ingênua (13–17/07 = janela vazia), enquanto o resto do módulo Cronograma já usa `getRefWeek()` (`frontend/lib/cronograma/helpers.ts`, primeira segunda-feira do mês seguinte) como "semana de referência" — que é justamente a que tem dados sincronizados de verdade (bate com a badge "Período 03/08 a 07/08" que já aparecia no topo da página, vinda do contexto global do Cronograma). Corrigido para reaproveitar `getRefWeek()` em vez de uma conta própria.
- [x] Segundo teste real: dados apareceram (65% de ocupação, grid com "Ocupado"/"Livre" reais), mas com dois problemas visíveis:
  - Mapa de calor mostrando percentuais **acima de 100%** (300%, 400%) — impossível.
  - "Inconsistências" = 108 — número absurdamente alto.
- [x] **Terceiro bug encontrado e corrigido (erro de modelagem, não só de exibição)**: o cálculo tratava o TURNO INTEIRO (manhã/tarde) como um único slot e comparava "quantos profissionais diferentes passaram pela sala no turno todo" contra a capacidade pensada para atendimento SIMULTÂNEO (1 para sala única). Isso é errado: uma sala única atende vários pacientes diferentes em sequência ao longo da manhã (blocos de 40min) — isso é normal, não é conflito. Corrigido em `frontend/lib/cronograma/salas.ts`:
  - Ocupação do turno agora é `sessões agendadas / (nº de blocos de 40min do turno × capacidade simultânea da sala)` — nº de blocos fixo (6 manhã / 7 tarde), mesma convenção já usada no resto do módulo Cronograma. Percentual sempre ≤ 100%.
  - "Inconsistência" agora só é marcada quando há mais de 1 profissional distinto no MESMO horário exato (conflito real de agenda), não mais "mais de 1 profissional distinto ao longo do turno todo".
- [x] Terceiro teste real: mapa de calor agora só mostra 0–100% (bug de percentual acima de 100% resolvido). "Inconsistências" caiu de 108 para 100 — ainda alto, mas **confirmado que agora é dado, não bug de código**: consultei `csv_grades_profissionais` diretamente e existem, de fato, salas com >1 profissional distinto agendado no MESMO horário exato (ex.: "Unid. Realengo - Sala 18 (Coordenação de caso)" tem até 4 profissionais simultâneos; "Sala 26" tem 2). São salas de uso compartilhado/administrativo na prática, cadastradas como `capacidade='unico'` pelo seed (chute seguro, avisado desde a Fase 2). O código está correto: está sinalizando de verdade que a capacidade cadastrada não bate com o uso real.
- [x] Em vez de pedir para você ajustar sala por sala na UI, analisei programaticamente TODA a base sincronizada de `csv_grades_profissionais` (17.156 agendamentos "Agendado", 26 datas distintas) e calculei, por sala física, o número máximo de profissionais distintos observado no MESMO instante exato (data+hora). Também auditei a lista de salas: encontrei 2 salas físicas que existem na agenda mas não tinham entrado no seed (Fazendinha Sala 6, Padre Miguel Sala 21).
- [x] Migração pronta: `supabase/migrations/20260716170000_ajustar_capacidade_real_salas.sql` — cadastra as 2 salas faltando e ajusta a capacidade de 22 salas (de `unico` para `duplo`/`multiplo`) conforme o pico real observado.
- [x] **Ação sua**: migração rodada. `select count(*) from public.cronograma_salas;` retornou **56**. ✅ Confirmado.
- [ ] Ainda falta conferir visualmente se "Inconsistências" caiu na tela `/cronograma/ocupacao-salas` — retomar depois que a Fase 4 (editor de alocação) estiver desenhada, já que o foco mudou de escopo nesse meio tempo.
- ⚠️ Nota registrada: `multiplo` no sistema representa capacidade 3. Algumas salas têm picos observados maiores (Realengo Sala 18 chegou a 7 profissionais simultâneos, Sala 5 a 6, Sala 21/22 a 5) — ficam sub-representadas nesse bucket. Não é bug (o % de ocupação nunca passa de 100%), mas se isso importar operacionalmente, precisaria de um bucket de capacidade maior no futuro.

### Fase 4 — Dashboard por Unidade funcionando com dados reais
- **Validação**: `/cronograma/indicadores?tab=unidades` mostra números batendo com uma contagem manual simples (ex.: número de salas de uma unidade, % de ocupação aproximado).

### Fase 5 — Dashboard de Pacientes funcionando com dados reais
- **Validação**: `/cronograma/indicadores?tab=pacientes` mostra pacientes ativos, CH e agrupamento por convênio/unidade condizentes com a realidade.

### Fase 6 — Decisões de design em aberto (confirmar com você)
- Ícone `DoorOpen` para "Ocupação de Salas" no Sidebar — ok?
- Permissão `cronograma_ocupacao_salas` liberada por padrão para os perfis admin/diretoria/cronograma — ok, ou restringe mais?
- Período padrão das telas novas = semana corrente, sem seletor de data ainda — precisa de seletor já nesta fase ou pode esperar?
- Políticas de escrita (`insert`/`update`/`delete`) na tabela `cronograma_salas` abertas para qualquer usuário autenticado — mantém assim ou restringe por perfil (ex.: só quem tem a permissão de cronograma)?

### Fase 7 — Fora de escopo por enquanto
- Descontinuar `calculadora-remuneracao` — só depois de todas as fases acima validadas em uso real.
- Migração de dados históricos do `localStorage` do sistema antigo (não recuperável automaticamente).
- Undo/redo e backup manual em `.json` do sistema antigo — substituídos por persistência real em Supabase; histórico de alterações (auditoria) fica para uma fase futura, se for necessário.

## Correção de escopo importante (achada durante a Fase 3)

O usuário esclareceu que a ferramenta antiga (`calculadora-remuneracao`) **não era só um relatório de leitura** — era um editor real: no "modo de edição ativa" dava para:
- Alocar um profissional num horário livre ("Alocar sessão livre": escolher profissional + terapia, salvar).
- Excluir uma alocação existente (com confirmação).
- Mover um profissional de um horário/sala para outro (o sistema detecta que ele já está alocado em outro lugar e avisa "Esse profissional já está alocado em X. Deseja movê-lo? A alocação anterior será removida.", com aviso extra se isso configurar troca de unidade).

O que foi construído até a Fase 3 (`/cronograma/ocupacao-salas`) é **só leitura** — mostra a ocupação cruzando `cronograma_salas` com a agenda real, mas não permite alocar/mover/excluir uma sessão. Isso precisa ser adicionado — é o uso operacional real da ferramenta, não um extra.

**Problema em aberto antes de implementar**: `csv_grades_profissionais`/`agenda_tita`/`grade_profissionais_tita` são sincronizadas automaticamente do TITA (edge function `sync-grade-csv` e outras). Uma edição manual direta nessas tabelas pode ser sobrescrita no próximo sync. O sistema-pulsar já tem um mecanismo estabelecido pra isso — "Confirmar implantação" / Reservas Pendentes (ver `docs/cronograma/specs/reservas-pendentes.md`, CRON-008) — que precisa ser entendido e reaproveitado (não reinventado) antes de desenhar a escrita do editor de Ocupação de Salas. Investigação em andamento.

### Fase 4 (nova) — Editor de alocação (alocar/mover/excluir sessão em sala)
- [x] Investigado o mecanismo de Reservas Pendentes já existente (`acomp_pac_bundles`, rota `/api/tita/confirmar-agendamento`, reconciliação de 24h) — ver achado abaixo.
- [x] **Decisão do usuário**: o editor de Ocupação de Salas é **só planejamento interno** — não cria/altera nenhum agendamento real na TiTa (diferente do padrão usado em "Ocupação de Paciente"). Mais simples e mais seguro.
- [x] Nova tabela `cronograma_salas_alocacoes` (migração `20260716180000_create_cronograma_salas_alocacoes.sql`): quem é o profissional/terapia "dono" recorrente de uma sala/dia da semana/turno. Sem UNIQUE em (sala, dow, turno) — salas duplo/múltiplo comportam mais de uma alocação simultânea; validação de capacidade é feita na aplicação.
- [x] Modelo de ocupação totalmente reescrito (`frontend/lib/cronograma/salas.ts`) para ser guiado pelas alocações: cada alocação é cruzada com `csv_grades_profissionais` (mesmo profissional + sala + dia + turno) só para exibir "X/Y com paciente" — informativo, não valida nada.
- [x] `AlocarSessaoModal.tsx`: aloca sessão livre, edita/move (detecta se o profissional já está alocado em outro sala/dia/turno igual, avisa troca de unidade, remove a alocação anterior), exclui com confirmação — reproduzindo o fluxo exato da ferramenta antiga.
- [x] `SalasGridView.tsx` reescrito: cada slot mostra os cards de alocação (clicáveis para editar/mover), "Livre" clicável quando vazio, "+ Alocar" quando a sala comporta mais de uma alocação simultânea (duplo/múltiplo) e ainda há vaga.
- [x] **Ação sua**: migração rodada. `select count(*) from public.cronograma_salas_alocacoes;` retornou **0**. ✅ Confirmado.
- [x] Primeiro teste real: modal abriu, mas aceitou salvar "marce" (nome incompleto/inválido) sem nenhuma validação — bug real, corrigido.
- [x] **Correção**: campo Profissional agora usa autocomplete real (reaproveita `buscarSugestoesTerapeutas` de `agenda.service.ts`, mesma fonte já usada na Agenda), com busca a cada digitação (debounce 250ms) e "Salvar" só habilita quando o texto bate exatamente com um profissional real da lista. Campo Terapia ganhou autocomplete equivalente (lista completa via `buscarOpcoesFiltro().terapias`, filtrada localmente).
- [x] Segundo teste real: a validação funcionou (bloqueou "marcel" com aviso vermelho), mas a lista de sugestões mostrou um nome ("Aline De Miranda Costa") que não batia com o texto digitado — condição de corrida: uma busca antiga (de um texto anterior) respondeu depois da busca mais nova e sobrescreveu a lista errada.
- [x] **Correção**: adicionado um número de sequência por busca — qualquer resposta que chegue fora de ordem é descartada. Também adicionado estado "Buscando..." e "Nenhum profissional encontrado" no dropdown, pra ficar claro o que está acontecendo enquanto a busca roda.
- [x] Terceiro teste real: um profissional real ("Marcelle Cabral Volpasso", já visto antes cruzando a Fazendinha Sala 11) não aparecia buscando "marcel" — e a busca pareceu lenta.
- [x] **Correção**: a sugestão de profissional buscava em `agenda_tita_autorizacao_v2` (mesma função já usada na Agenda) — só que essa tabela tem um universo de profissionais diferente/mais restrito do que `csv_grades_profissionais` (a fonte real usada pelo cruzamento de ocupação de salas). Criada `buscarSugestoesProfissionaisSalas()` em `salas.service.ts`, buscando direto em `csv_grades_profissionais`, com nomes que COMEÇAM com o texto digitado priorizados no topo da lista (antes só ordenava alfabeticamente, então nomes "no meio do alfabeto" podiam ficar de fora do corte de 10 resultados).
- [x] Quarto teste real: busca por "marcel" já encontra "Marcelle Cabral Volpasso" corretamente; alocação criada com sucesso (Fazendinha Sala 8, "Aplicador ABA (AE)", card mostrando "Sem cruzamento no CSV" — correto). ✅ Criar alocação confirmado.
- [x] Quinto teste real: mover e excluir funcionaram, mas o aviso de confirmação usava `window.confirm()` — diálogo nativo do navegador, destoando visualmente do resto do sistema.
- [x] **Correção**: trocado `window.confirm()` por `ConfirmDialog` (componente já existente no design system, `frontend/components/cronograma/ui/ConfirmDialog.tsx`, ampliado para aceitar descrição multi-linha) — usado tanto no aviso de mover alocação (com o aviso de troca de unidade) quanto no de excluir (alocação e sala).
- [x] Testado: mover/excluir com o diálogo novo funcionaram (o teste de excluir removeu as alocações de teste, por isso a tabela voltou a ficar vazia — confirmado via `select count(*) from public.cronograma_salas_alocacoes;` = 0. Não é bug.). ✅ **Fase 4 completa**: criar, mover (com aviso de troca de unidade) e excluir funcionando, com UI consistente.

### Fase 5 (nova) — Popular alocações reais a partir do histórico sincronizado
A tabela de alocações está vazia de novo (era esperado, era só teste). Em vez de cadastrar as ~56 salas × 5 dias × 2 turnos manualmente pela UI, vou gerar uma migração de seed a partir do histórico real (mesma técnica usada para a capacidade das salas): para cada sala/dia/turno, identificar o(s) profissional(is) que aparece(m) de forma recorrente nos dados sincronizados, respeitando a capacidade da sala (único=1, duplo=2, múltiplo=3).
- [x] Analisado todo o histórico sincronizado (17.156 agendamentos "Agendado"). Migração gerada: `supabase/migrations/20260716190000_seed_cronograma_salas_alocacoes.sql` — **519 alocações**.
- [x] **Bug encontrado e corrigido na primeira tentativa**: o arquivo saiu com linhas de log misturadas com SQL (erro de sintaxe) e com texto corrompido por mojibake de dupla codificação UTF-8 ("Operações Clínicas" virou "OperaÃ§Ãµes ClÃ­nicas", "Corrêa" virou "CorrÃªa") — o mesmo problema que `gradeService.ts` já trata (`fixMojibake`), que eu tinha esquecido de aplicar aqui. Corrigido: exportei `fixMojibake` de `gradeService.ts` e apliquei em `salas.service.ts` (na busca de sugestão de profissional E na leitura de linhas de agenda que alimenta toda a grade/dashboards), além de regenerar a migração com o texto correto e só SQL puro no arquivo.
- [x] **Bug extra encontrado e corrigido**: o comando `Get-Content` do PowerShell sem `-Encoding UTF8` leu o arquivo com a codificação errada do Windows, corrompendo os acentos de novo (ex.: "Manhã" virou "ManhÃ£") só na cópia pro clipboard — o arquivo em si sempre esteve correto. Corrigido passando `-Encoding UTF8` explicitamente no comando.
- [x] **Ação sua**: migração rodada com sucesso. `select count(*) from public.cronograma_salas_alocacoes;` retornou **519**. ✅ Confirmado.
- [x] Populado com sucesso (grade cheia, acentuação correta, 0 inconsistências, 64% ocupação), mas visual ficou bagunçado (cards de 3 linhas cada, sem cor por terapia) — feedback do usuário.
- [x] **Correção visual**: `SalasGridView.tsx` reescrito — cada alocação agora é uma linha compacta única (bolinha colorida da terapia + nome do profissional truncado), reaproveitando `tCor()` de `lib/cronograma/constants.ts` (mesma fonte de cor de terapia usada no resto do sistema), em vez de cards de 3 linhas com borda. Detalhe (terapia completa + proporção com paciente) continua disponível no tooltip ao passar o mouse/clicar.
- [x] Feedback: melhorou, mas ainda dava pra polir mais.
- [x] **Segunda passada de polimento**: colunas mais largas (130px → 168px, nomes cortam menos), bolinha de terapia um pouco maior com contorno sutil (mais visível), "Livre" com opacidade reduzida em repouso (menos gritante quando a sala não tem nada alocado), "+ Alocar" só aparece com opacidade ao passar o mouse na célula (`group-hover`) — em repouso a grade fica mais limpa, sem repetir "+ Alocar" embaixo de cada card o tempo todo.
- [x] Sexto teste real, feedback com 5 pontos:
  1. Sexta-feira não cabia na tela (colunas largas demais).
  2. Núcleo/andar não apareciam (a tela até mostra o campo, mas o dado nunca foi populado — os 56 seeds anteriores vieram só da agenda sincronizada, que não tem núcleo/andar).
  3. Queria terapia + proporção "X/Y com paciente" mais visíveis (não só no tooltip).
  4. Modal "Editar Sala" muito solto — antes tinha validação por unidade/núcleo pré-cadastrados.
  5. Filtro de Status não retornava nada em "adm"/"bloqueada" — nenhuma sala tinha esses status ainda (não adivinhei isso sozinho de propósito).
- [x] Usuário enviou a planilha oficial da operação ("Grade de salas 2026 - cópia 16.07.2026.xlsx", aba Planilha1: Unidade/Núcleo/Andar/Sala/Turno/Atendimento) — fonte de verdade real para essas perguntas.
- [x] **Achado importante**: a planilha tem **87 salas físicas**, não 56 — havia 31 salas reais que nunca tiveram agendamento sincronizado (por isso ficaram de fora do inventário anterior, que só olhava a agenda). Também tem a coluna "Atendimento" (ÚNICO/DUPLO/MÚLTIPLO/ADM/EXTINTA) por sala — conferido que não varia entre manhã/tarde na mesma sala (só 1 exceção, um rótulo especial de horário).
- [x] **Conflito real encontrado**: 22 das 56 salas já cadastradas tinham capacidade diferente entre a planilha oficial e o valor derivado do histórico real de agendamento (Fase 3). Perguntei ao usuário qual fonte prevalece — **decidido: a planilha oficial** (onde o uso real exceder o oficial, vira "inconsistência" visível, o que é informação útil, não bug).
- [x] Migração gerada: `supabase/migrations/20260716200000_reconciliar_salas_planilha_oficial.sql` — atualiza núcleo/andar/capacidade/status das 56 salas já cadastradas (fonte: planilha) + cadastra as 31 salas que faltavam. 5 salas passam a `status='adm'`, 1 sala nova entra como `status='bloqueada'` (era "EXTINTA" na planilha).
- [x] **Ação sua**: migração rodada. `select count(*) from public.cronograma_salas;` retornou **87**. ✅ Confirmado.
- [ ] Falta conferir visualmente: núcleo/andar aparecendo na grade, filtro de Status retornando salas em "ADM"/"Bloqueada".

### Fase 7 (nova) — Itens ainda pendentes do sexto teste
- [x] Terapia + proporção "X/Y com paciente" já tinham ficado mais visíveis no card (2ª linha: nome da terapia + proporção colorida) antes da pausa para tratar a planilha — confirmar visualmente junto com o resto.
- [x] **Modal "Editar Sala" corrigido**: campo "Unidade" agora é um `<select>` só com as 4 unidades reais (Realengo/Fazendinha/Padre Miguel/Ambiente Natural) — não aceita mais texto livre/errado. Campo "Núcleo" ganhou sugestões (`<datalist>`) dos núcleos já cadastrados no banco (populados pela planilha), reduzindo erro de digitação sem travar o campo (núcleo pode ter valores novos legítimos que a planilha não previu).
- [ ] Largura de coluna: reavaliar com os dados reais das 87 salas — pode precisar de mais um ajuste fino depois que você olhar a tela.
- [x] **Novo filtro por profissional**: campo de busca livre em `SalasFiltros.tsx` — usa `normTxt()` (remove acentos + minúsculas) para achar o nome com ou sem acento, em qualquer capitalização.
- [x] Teste real: filtro funcionou pra achar as salas certas, mas mostrava a sala inteira (com os cards de OUTROS profissionais também) — primeira correção (filtrar as alocações dentro do slot) tinha um bug pior: um horário ocupado por outra pessoa passava a aparecer como "Livre", o que é enganoso (sugere que dá pra alocar ali, mas não dá).
- [x] **Correção definitiva**: revertida a filtragem de alocações. Agora TODOS os profissionais continuam visíveis (nada de "Livre" falso) — o card que bate com a busca fica destacado (fundo âmbar + contorno), e os que não batem ficam esmaecidos (`opacity-35`), sem nunca mentir sobre o status real do horário. Também tirei o nome de pessoa real do placeholder do campo.
- [x] **Ação sua**: confirmado — "Ficou ótimo". ✅ **Fase 7 completa.**

## Status atual (nesta data)

A tela **"Ocupação de Salas"** está completa e validada de ponta a ponta: 87 salas reais cadastradas (núcleo/andar/capacidade/status vindos da planilha oficial), editor de alocação funcionando (criar/mover/excluir), populado com dados reais recorrentes, visual polido, e filtro por profissional com destaque. Essa é a parte 1 do pedido original.

## Correções pós-"completo" (usuário apontou que a conclusão foi apressada)

Feedback real: "Ocupação de Salas está completa e validada" estava errado. Três problemas concretos levantados e investigados:

1. **"De onde você tira que o profissional está em 2 salas no mesmo turno?"** — Investigado com dados reais: eram **52 casos** de mesmo profissional em salas diferentes no mesmo dia/turno (ex.: "Ana Tereza Rezende Nascimento" em Fazendinha Sala 7 E Sala 9 na segunda de manhã). Causa: o gerador da migração `20260716190000` processava cada sala de forma independente, sem checar se a pessoa já tinha sido escalada em outro lugar no mesmo bloco — defeito real do script, não do sistema (o editor manual já bloqueia isso).
2. **"O que são as 55 inconsistências?"** — Eram salas com mais alocações do que a capacidade permite. Causa: as alocações foram geradas **antes** da reconciliação com a planilha oficial (`20260716200000`), que depois mudou a capacidade de várias salas (ex.: Realengo Sala 18 era "múltiplo"=3 na hora de gerar, virou "duplo"=2 pela planilha) — sequência errada, não validação de dado ruim.
3. **Modal "Editar/mover" mostrava "Nenhum profissional encontrado" ao abrir**, mesmo com o profissional certo pré-preenchido — bug: o dropdown de sugestões abria só por causa do foco automático no campo, antes mesmo do usuário digitar algo.
4. **Terapia deveria mostrar só o que aquele profissional específico realiza**, não a lista inteira da clínica.

**Correções aplicadas:**
- Migração nova `supabase/migrations/20260716210000_corrigir_alocacoes_sem_conflito.sql` — regenera as 519 alocações do zero com algoritmo corrigido: para cada (profissional, dia, turno) escolhe-se a ÚNICA sala mais frequente no histórico (garante que ninguém aparece em 2 salas no mesmo bloco), depois agrupa por sala e aplica a capacidade ATUAL (pós-planilha), descartando o excedente. Resultado: **343 alocações finais**, zero conflito de sala dupla, zero capacidade excedida (por construção do algoritmo, não por sorte).
- `AlocarSessaoModal.tsx`: dropdown de sugestão só aparece depois que o usuário efetivamente digita algo (não mais ao simplesmente focar um campo pré-preenchido).
- Nova função `buscarTerapiasDoProfissional()` em `salas.service.ts` — quando um profissional válido é selecionado, a lista de terapias do modal passa a mostrar só as que ele de fato realiza (histórico real), com uma notinha explicando isso no rótulo do campo.
- [x] **Ação sua**: migração rodada. `select count(*) from public.cronograma_salas_alocacoes;` retornou **343**. ✅ Confirmado.
- [x] Confirmado: "Inconsistências" caiu para **0** (era 55). Grade com 87 salas, ADM aparecendo corretamente (ex.: Fazendinha Sala 11).
- [ ] Falta conferir: abrir o modal de uma alocação existente não deve mais mostrar "Nenhum profissional encontrado"; campo Terapia restrito ao profissional selecionado.

## Ajuste — dark mode em `OcupacaoProfShell.tsx` (Ocupação de Profissionais)

Feedback: a tela de Ocupação de Profissionais (componente legado, não tocado até então) estava "feia" no dark mode, com fonte/cor estranha nos botões do topo. Investigado: 37 usos de cor hex fixa no arquivo inteiro (~1000 linhas), pensados só pra fundo branco. Perguntei ao usuário se queria só o ajuste rápido (fundos de card) ou a correção completa — escolheu completa.

**Correção aplicada** (arquivo inteiro, ~40 pontos):
- `bg-white` → `bg-card`, `hover:bg-gray-50` → `hover:bg-muted/50` (10 cards/accordions)
- `text-gray-400/500/700/300` → `text-muted-foreground`/`text-foreground` (texto secundário e primário, ~20 ocorrências)
- `bg-gray-100` → `bg-muted`, `border-gray-200` → `border-border` (trilhos de barra de progresso)
- `color: B.navy` em títulos → `text-foreground` (13 ocorrências) — **bug real cometido nessa correção**: a primeira tentativa criou atributos `className` duplicados (JSX inválido) ao tentar converter `style={{color: B.navy}}` direto pra `className`; corrigido mesclando em um único `className` em cada caso.
- Bordas/fundos hex fixos (`#e8eef5`, `#e7edf5`, `#eef2f7`, `#f0f4f8`, `#d1d5db`, `#d8ecf6`, `#fbfcfe`, `#fff`) → `var(--border)`/`var(--card)`/`var(--muted)` (bordas de card, painel de filtros, pills de "Nível de ocupação"/"Agenda")
- 3 boxes de resumo (ocupadas/livres/Horário Administrativo) que usavam fundos pastéis fixos → tons com `dark:` (rose/emerald/violet), mesmo padrão do design system novo
- Removida constante `LIVRE_BG` (ficou sem uso depois da correção)
- `npx tsc --noEmit` e `npm run build` (produção completa) passaram limpos depois da correção.
- [x] **Ação sua**: print mostrando ainda problemas — correto: eu só tinha corrigido o `OcupacaoProfShell.tsx` em si, mas ele importa 3 componentes-filho (`AgendaMinimalista.tsx`, `OcupacaoDonut.tsx`, `OcupacaoAtomicos.tsx`) que eu não tinha tocado, com mais 15 ocorrências do mesmo padrão (bg-white, B.navy, text-gray-*, bordas hex fixas).
- [x] **Correção nos 3 arquivos-filho**: mesmo tratamento (bg-card/var(--border)/var(--muted)/text-foreground/text-muted-foreground); mantidos como estão os elementos onde cor sólida + texto branco é intencional (segmentos do donut, células coloridas da agenda, pills selecionados) — esses já funcionam bem nos dois temas por design.
- [x] `npx tsc --noEmit` e `npm run build` limpos depois da correção nos 4 arquivos.
- [x] Print mostrando o disco central do donut ("Carga semanal") destoando do fundo ao redor (parecia um círculo preto sobreposto), e contorno escuro feio entre os segmentos.
- [x] **Causa e correção**: o painel que envolve o donut usa `background: var(--muted)`, mas o `InteractivePieChart.tsx` tinha `fill-white dark:fill-card`/`stroke-white dark:stroke-card` fixos como default (pensados pra quando o donut fica sobre `bg-card`, não `var(--muted)`) — `--card` e `--muted` são cores diferentes no tema, daí a "sobreposição" visível. Adicionada prop `ringStrokeClassName` (nova) em `InteractivePieChart.tsx`, repassada por `OcupacaoDonut.tsx`; a chamada em `OcupacaoProfShell.tsx` agora passa `centerFillClassName="fill-muted" ringStrokeClassName="stroke-muted"`, casando com o fundo real do painel. Outro uso do mesmo `InteractivePieChart` (cards de especialidade, que ficam sobre `bg-card`) mantém o default original, sem mudança.
- [x] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] **Ação sua**: recarregar e conferir se o donut agora se funde com o fundo do painel, sem contorno destoante.

## Ajuste — alinhar badges de percentual

Feedback: os badges de "% ocup." nas tabelas "Ocupação por dia"/"Ocupação por especialidade" tinham largura variável (dependendo do texto, ex. "69,23%" vs "100,00%"), ficando desalinhados. Adicionado `min-w-[4.4rem] text-center` aos 2 badges inline em `OcupacaoProfShell.tsx` — mesmo padrão que o componente compartilhado `PercentualOcupacao` (em `OcupacaoAtomicos.tsx`) já usava.
- [x] Esclarecimento do usuário: o desalinhamento era ENTRE as duas tabelas "Ocupação por dia" e "Ocupação por especialidade" (não dentro de uma única tabela). Causa real: são duas `<table>` independentes, cada uma com a primeira coluna (Dia / Especialidade) de largura automática baseada só no próprio conteúdo — como os nomes de dia e de especialidade têm tamanhos diferentes, a coluna "% ocup." começa em posições X diferentes entre as duas tabelas.
- [x] **Correção**: adicionado `w-32` fixo ao cabeçalho da primeira coluna nas duas tabelas + `table-fixed` nas duas (força as colunas a respeitar a largura definida, em vez de só "sugerir"), com truncamento (`truncate`) no conteúdo da coluna Dia para não estourar.
- [x] Feedback: faltou a barrinha de progresso colorida em "Ocupação por especialidade" (só aparecia em "Ocupação por dia"). Causa: código original só mostrava a barra quando `temRegraEspecial` era verdadeiro nessa tabela — inconsistente com "por dia", que sempre mostra. Corrigido: barra agora sempre visível nas duas tabelas, com a mesma largura mínima (`min-w-[48px]`).
- [ ] **Ação sua**: recarregar e conferir alinhamento + barrinha em ambas as tabelas.

## Dois bugs reais encontrados testando os Dashboards

1. **Sidebar destacava "Ocupação de Profissionais" sempre, mesmo em outra aba.** Causa: o `MenuItem` de "Ocupação de Profissionais" usava `path="/cronograma/indicadores"` sem `?tab=`, e a função `isActive()` do Sidebar considera "sem query = sempre ativo quando o pathname bate" — então ficava sempre destacado junto com o item realmente ativo. Corrigido: path agora é `/cronograma/indicadores?tab=profissionais` (mesmo padrão dos outros dois itens), em `Sidebar.tsx` e no `pathIconMap`.
2. **"Dashboard de Pacientes → Por unidade" só mostrava "Consertar Unidade no sistema"** para todos os 283 pacientes. Causa: `calcularDashboardPacientes()` usava a coluna `unidade_nome` de `csv_grades_profissionais` — mas essa coluna é sempre `"CLÍNICA UNIVERSO ABA"` (nome da clínica, não da unidade física); confirmei consultando os dados reais. A unidade de verdade só existe dentro do texto livre de `sala_nome` (ex.: "Unid. Realengo - Sala 5"). Corrigido em `pacientesDashboard.ts`: agora deriva a unidade de `sala_nome` (reaproveitando `normalizarUnidadeOcupacao`, que já sabe extrair por palavra-chave), não mais de `unidade_nome`.
- [ ] **Ação sua**: recarregar e conferir — Sidebar deve destacar só a aba realmente ativa, e "Por unidade" no Dashboard de Pacientes deve mostrar Realengo/Fazendinha/Padre Miguel/Ambiente Natural de verdade.

## Ajuste — remover seletor de abas duplicado em Indicadores

Feedback: a página `/cronograma/indicadores` tinha um `SegmentedTabs` no topo ("Ocupação de Profissionais / Dashboard por Unidade / Dashboard de Pacientes") duplicando a navegação que já existe no Sidebar (3 itens de menu apontando pra essa mesma rota com `?tab=` diferente). Ficou redundante e poluído. Removido o `SegmentedTabs` de `indicadores/page.tsx` — a navegação entre as 3 visões passa a ser só pelo Sidebar; a lógica de qual conteúdo renderizar (baseada no `?tab=` da URL) continua igual.

## Próximos passos (em ordem)

1. **Dashboard por Unidade** (`/cronograma/indicadores?tab=unidades`) — código revisado linha por linha contra o modelo atual (guiado por alocações): `UnidadeDashboardShell.tsx` consome `resumoUnidades` de `useOcupacaoSalas()`, que já usa `calcularResumoUnidades(salas, alocacoes, linhas)` — consistente, sem bug encontrado na revisão. `npm run build` (produção) passou limpo incluindo essa rota. **Falta validação visual sua** — nunca foi aberto na tela.
2. **Dashboard de Pacientes** (`/cronograma/indicadores?tab=pacientes`) — `calcularDashboardPacientes()` não depende do modelo de alocações (usa só `linhas` cruas de `csv_grades_profissionais`), não foi afetado pelas mudanças recentes. Revisado, sem bug encontrado. **Falta validação visual sua**.
3. **Decisões de design em aberto, nunca formalmente confirmadas** (itens da antiga "Fase 6"): ícone `DoorOpen`, permissão liberada para admin/diretoria/cronograma, políticas de escrita abertas a qualquer autenticado — mantidas como estão por falta de objeção; avise se quiser mudar algo.
4. **Fora de escopo por enquanto**: descontinuar `calculadora-remuneracao`; auditoria/histórico de alterações nas alocações.

**Ação sua**: abrir `/cronograma/indicadores?tab=unidades` e `?tab=pacientes` e conferir se os números fazem sentido (contagem de salas por unidade, % de ocupação, pacientes ativos, CH). Também: confirmar o modal de alocação (item pendente da correção anterior — "Nenhum profissional encontrado" não deve mais aparecer ao abrir uma alocação existente).

### Ajuste de layout — Manhã empilhada acima de Tarde
Pedido do usuário: em vez de Manhã e Tarde lado a lado (10 colunas de dados: 5 dias × 2 turnos), cada dia agora tem 1 coluna só, e cada sala ocupa 2 linhas (Manhã em cima, Tarde embaixo) — nome da sala com `rowSpan=2`. Aplicado tanto na Grade (`SalasGridView.tsx`) quanto no Mapa de calor (`SalasHeatmapView.tsx`) para manter consistência. Colunas de dia ficaram bem mais largas (142px → 190px na Grade), o que também deve ajudar a sexta-feira caber melhor na tela.
- [x] Feedback: layout empilhado ficou bom, mas difícil ver onde a manhã termina e a tarde começa (tudo preto no dark mode).
- [x] **Correção**: linhas de Manhã e Tarde agora têm uma tinta sutil diferente (Manhã = azul, Tarde = laranja), funcionando em light e dark mode (`bg-sky-50/70 dark:bg-sky-950/25` / `bg-orange-50/70 dark:bg-orange-950/20`), aplicado em Grade e Mapa de calor.
- [x] Feedback: conceito certo, cores (azul/laranja) ruins.
- [x] **Correção**: trocado para tinta neutra usando a própria paleta cinza do sistema (`bg-muted`, a mesma variável usada no resto do design system) — Manhã sem tinta, Tarde com uma sombra sutil (`bg-muted/40`), em vez de cores novas que destoavam do resto da tela.
- [x] **Ação sua**: confirmado, visual limpo. ✅ Layout Manhã/Tarde empilhado + tinta neutra completo.

## Ajuste — remoção de "Aumentar Ocupação (Profissional)" e "Aumentar Ocupação (Clínica)"

Pedido do usuário: eliminar completamente as duas abas legadas, não relacionadas ao trabalho de Ocupação de Salas: `/cronograma/solicitacoes?tab=ocup-prof` e `/cronograma/ocupacao?tab=vagas`.

- [x] Agente `Explore` mapeou todas as referências: nenhuma dependência exclusiva de lib/service/tabela Supabase, só os dois componentes-dono e três arquivos a editar.
- [x] Removido `OcupProfMode.tsx` (863 linhas) e `VagasAgoraTab.tsx` inteiros — únicos consumidores confirmados eram `SolicitacoesShell.tsx` e `OcupacaoShell.tsx`, respectivamente.
- [x] `SolicitacoesShell.tsx`: removidos import, entrada em `TABS`, entrada em `subtitles` e bloco de renderização de `ocup-prof`.
- [x] `OcupacaoShell.tsx`: removidos import, entrada em `TABS`, entrada em `TAB_HEADERS` e bloco de renderização de `vagas`; fallback de aba padrão e redirect trocados de `"vagas"` para `"acompanhamento"`.
- [x] `Sidebar.tsx`: removidos import do ícone `Zap` (confirmado não usado em outro lugar), as duas entradas em `pathIconMap` e os dois `MenuItem`s correspondentes. `Stethoscope` mantido (ainda usado pelo ícone do grupo "Terapêutico").
- [x] Comentários em `CronogramaDataContext.tsx` que citavam "OcupProfMode" (nome do arquivo deletado) atualizados para descrever o estado compartilhado (`profMap`/`acomp_prof_map`) sem depender do nome do componente antigo — esse estado continua em uso pela seção "aguardando profissional" dentro de `AcompanhamentoTab.tsx` (não removida, é outra feature).
- [x] `npx tsc --noEmit` e `npm run build` limpos após a remoção.
- [x] Busca full-repo por `OcupProfMode|VagasAgoraTab|ocup-prof|tab=vagas` não encontrou mais nenhuma referência quebrada — as únicas ocorrências restantes são coincidência de nome (`ocupProfOpen`/`secao-ocup-prof`, um id interno de uma seção diferente dentro de `AcompanhamentoTab.tsx`) e os comentários já corrigidos acima.
- [ ] **Ação sua**: confirmar no navegador que `/cronograma/solicitacoes` (agora sem a aba `ocup-prof`) e `/cronograma/ocupacao` (agora caindo em `acompanhamento` em vez de `vagas`) funcionam normalmente, e que os dois itens somem do Sidebar.
