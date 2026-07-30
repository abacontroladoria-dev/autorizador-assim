# Plano: reestruturação da Reposição de Faltas

## Contexto

Ao longo da sessão de debug anterior, corrigimos vários sintomas pontuais na tela
`/cronograma/reposicao/` (conflito de sugestão, RLS bloqueando `controle_terapeutico`,
enriquecimento de nome de profissional). Esses fixes resolveram casos individuais, mas
expuseram três problemas estruturais que precisam de uma solução de arquitetura, não de
mais um patch local:

1. Divergência entre o que investigamos localmente (mirror Docker) e o que a aplicação
   realmente mostra.
2. Sessões que existem em `csv_grades_profissionais` mas não aparecem na grade (caso
   real: Theo Rezende Leal).
3. Nomes de profissional que continuam em branco mesmo depois dos fixes.

Este documento descreve a causa raiz de cada um (com evidência coletada nesta sessão) e
propõe um plano de reestruturação, incorporando a sugestão do usuário: tornar
`csv_grades_profissionais` a fonte principal da grade, usando `fila_autorizacoes` apenas
como checagem de status (falta/concluído/outro) por célula.

---

## Problema 1 — Docker local desatualizado em relação à nuvem

### Diagnóstico (corrigido nesta sessão, mas é preciso entender o que é e o que não é)

Confirmei via investigação de código: **o app (`npm run dev` em localhost:3000, e a
produção) sempre lê direto da nuvem** — `frontend/.env.local` aponta
`NEXT_PUBLIC_SUPABASE_URL` para o projeto cloud, sem nenhum branch condicional por
ambiente em `lib/supabase/client.ts`. Não existe roteamento pro Docker local em nenhum
lugar do código do front-end.

**Ou seja: o problema não é a aplicação mostrar dado desatualizado.** O que ficou
desatualizado foi o **mirror Docker local** (`supabase_db_sistema-pulsar`, porta 54322)
que usamos nesta sessão para rodar SQL de diagnóstico via `psql`/`docker exec` — ele só
reflete a nuvem no momento em que alguém roda `frontend/scripts/sync-cloud-to-local.mjs`
manualmente. Isso gerou confusão real na sessão: eu vi um dado no mirror que não batia
com o que a tela mostrava, porque o mirror estava horas/dias atrasado.

### Risco adicional descoberto

O Postgres local também tem os `cron.job` das migrations aplicados (incluindo
`sync-grade-csv-daily`, que faz `net.http_post` para a **URL de produção** com a
**service-role key de produção** no header). Se o `pg_cron` da instância Docker estiver
de fato ativo e rodando, ele pode disparar chamadas reais contra a Edge Function de
produção a partir do ambiente de dev — o que é um risco operacional, não só um problema
de dado desatualizado.

### Ação recomendada

- **Não precisa de mudança na ferramenta de reposição.** É um problema de processo de
  debug/dev, não do produto.
- Consolidar o fluxo de sync em um único comando (`npm run sync:local` ou similar) que:
  1. Roda `sync-cloud-to-local.mjs`.
  2. Aplica o SQL gerado already isolando as tabelas problemáticas (lembrar do bug de
     chave duplicada em `grade_profissionais_tita` — ver abaixo).
  3. Imprime um resumo (linhas por tabela) pra confirmar visualmente que sincronizou.
- Documentar (README ou CLAUDE.md do frontend) que **qualquer** investigação via SQL
  local deve começar rodando esse comando primeiro — nunca assumir que o mirror está
  atual.
- Separadamente, verificar com o time de infra se o `pg_cron` do Docker local deveria
  estar desabilitado por padrão (evitar side-effects em produção a partir do ambiente
  de dev).

---

## Problema 2 — Sessões de `csv_grades_profissionais` não aparecem na grade

Esse problema tem **duas causas independentes**, uma na origem do dado e outra no
front-end. As duas precisam ser corrigidas.

### Causa raiz A (origem do dado, já corrigida): o sync da grade estava quebrado

Encontrei a migration `supabase/migrations/20260701000050_fix_sync_grade_csv_cron.sql`
(aplicada hoje, 01/07). O comentário da própria migration documenta o bug:

> Existiam DOIS cron jobs diários que deveriam popular `csv_grades_profissionais`
> chamando a Edge Function `sync-grade-csv`, mas **ambos estavam quebrados e nunca
> gravaram nada** — um usava uma URL placeholder (`SEU-PROJETO.supabase.co`, falha de
> DNS), o outro não enviava o header `Authorization` (401). Os dois apareciam como
> "succeeded" no pg_cron porque `net.http_post` é assíncrono — o erro real só ocorre
> depois, silenciosamente. **Resultado: a grade só era populada por rodadas manuais.**

Isso explica por que, ao consultarmos `csv_grades_profissionais`, a menor data
encontrada era `2026-07-06` — não é um floor esperado do design, é o resíduo da última
rodada manual antes do conserto. Sessões de pacientes como o Theo Rezende Leal que
deveriam estar visíveis simplesmente nunca foram sincronizadas corretamente até hoje.

O cron novo (`sync-grade-csv-daily`, job 15, `0 5 * * *` = 02:00 BRT) chama a function
sem parâmetros → usa `getDefaultRange()` na Edge Function
(`supabase/functions/sync-grade-csv/index.ts`), que sempre parte de **hoje** até o fim
do mês seguinte. A função só faz `DELETE` no range `[dataInicio, dataFim]` de cada
rodada — então, a partir de agora, os dias já inseridos não são apagados por rodadas
futuras (cada rodada só toca "hoje em diante"). **Conclusão prática: de hoje em diante,
a cobertura de `csv_grades_profissionais` deve se manter consistente e crescente,
sem intervenção manual.** Datas anteriores a hoje continuam sem cobertura (a TITA
provavelmente não expõe mais o passado) — isso é uma limitação aceitável, não um bug a
perseguir.

**Ação:** confirmar em produção, nos próximos dias, que o job 15 está de fato rodando
com sucesso (`select * from cron.job_run_details where jobid = 15 order by start_time desc`)
e que `min(data)` em `csv_grades_profissionais` está andando junto com o calendário.
Isso não depende de mudança de código — é validação de operação.

### Causa raiz B (bug de front-end, ainda não corrigido): grade só renderiza se houver falta

Em `frontend/components/cronograma/reposicao/FaltasSemanaPanel.tsx`, se
`resultados.length === 0` (ou seja, o paciente **não tem nenhuma falta** na semana
selecionada), o componente retorna um `EmptyState` ("Nenhuma falta elegível
encontrada") e **nunca renderiza `<VisaoComparativa>`** — mesmo que o hook já tenha
buscado `sessoesAgendadas`/`sessoesConcluidas` normalmente. Resultado: um paciente com
a agenda inteira preenchida em `csv_grades_profissionais`, mas sem faltas naquela
semana, aparece como se não tivesse sessão nenhuma.

Isso é meio caminho do que o usuário está sentindo com o Theo Rezende Leal: mesmo
depois de corrigida a Causa A, se a semana selecionada não tiver falta dele, a grade
inteira desaparece.

**Ação (correção pontual, pequena, independente da reestruturação maior):** trocar a
condição de empty-state para considerar também `sessoesAgendadas`/`sessoesConcluidas` —
só mostrar o estado vazio se realmente não houver nada (nem falta, nem concluído, nem
agendado) na semana.

---

## Problema 3 — Nomes de profissional em branco

Já avançamos bastante nesta sessão:
- RLS de `controle_terapeutico` ajustada para incluir `role='diretoria'`.
- Enriquecimento de CONCLUÍDO agora consulta `controle_terapeutico` independente do
  `status` (antes só aceitava `indisponivel`).

O que resta em branco é **buraco de dado real na origem**: falta de vínculo em
`controle_terapeutico` para 59 sessões concluídas naquela semana (hipótese: depende de
uma confirmação manual do terapeuta em `/disponibilidade-terapeuta`, que não aconteceu
para esses casos). Isso é tema de processo/operação com o time, não de código.

A reestruturação da Seção "Proposta" abaixo **reduz drasticamente esse problema**: se
`csv_grades_profissionais` passar a ser a fonte primária de profissional/terapia (ela
já tem esses campos direto, sem precisar de CT), o nome só fica em branco quando o
próprio `csv_grades_profissionais` não tiver a sessão — o que passa a ser raro após a
correção da Causa A do Problema 2.

---

## Proposta de reestruturação (arquitetura)

Concordo com a direção sugerida: **inverter as prioridades**. Hoje o modelo é
`fila_autorizacoes`-cêntrico (cada card nasce de uma linha de falta/concluído, e
`csv_grades_profissionais` só entra como fallback/bucket "futuro"). Isso obriga a uma
cadeia de enriquecimento frágil (CT → csv → Q2b → Q_PROF → Q_HIST) porque, pra semanas
passadas, `csv_grades_profissionais` nunca tinha dado — só existia pra reconstruir o
que já tinha sido perdido.

Com a Causa A do Problema 2 corrigida, `csv_grades_profissionais` passa a ser
confiável e completa a partir de "hoje". Isso viabiliza o modelo novo:

### Modelo novo

1. **Fonte primária da grade da semana: `csv_grades_profissionais`.**
   Uma linha ali = uma célula na grade (dia, hora, terapia, profissional, sala — tudo
   já vem junto, sem enriquecimento).

2. **`fila_autorizacoes` deixa de gerar células por si só — passa a ser um "carimbo de
   status"** aplicado por cima de cada célula, casando por `data_atendimento + horario`
   (mesma chave usada hoje):
   - Sem linha correspondente em `fila_autorizacoes` → **FUTURO** (ainda não processado).
   - `status='concluido'` → **CONCLUÍDO**.
   - `status='falta'` (não cancelada/revertida) → **FALTA**.
   - Outro status → decidir caso a caso (provavelmente tratar como FUTURO/neutro).

3. **REPOSIÇÃO continua sendo a sugestão calculada** (`calcularSugestoes`), inalterada
   na lógica — ela já usa `agendaPaciente` (que passaria a vir 100% de
   `csv_grades_profissionais`, sem precisar mesclar concluídos manualmente como fizemos
   hoje) para checar conflito.

4. **Para semanas fora da cobertura de `csv_grades_profissionais`** (antes de hoje, ou
   antes da correção do cron) — não há uma boa fonte de "grade completa" mais. Duas
   opções, a decidir com o time:
   - (a) Aceitar que semanas totalmente passadas mostram só o que existir em
     `fila_autorizacoes` (falta/concluído), sem o pano de fundo "agendado" completo —
     ou seja, um modo degradado, não o modelo novo.
   - (b) Restringir o seletor de semana da tela pra não permitir semanas totalmente
     anteriores à cobertura da grade (reposição é inerentemente sobre a semana atual/
     próximas, então pode ser aceitável).

### Por que isso resolve os 3 problemas

- **Problema 2**: toda sessão de `csv_grades_profissionais` passa a estar na grade por
  definição — não depende mais de existir uma falta pra "puxar" a semana.
- **Problema 3**: profissional/sala vêm direto da fonte primária, sem cadeia de
  fallback. Só fica em branco se `csv_grades_profissionais` genuinamente não tiver a
  sessão (cada vez mais raro).
- **Problema 1**: não resolve diretamente, mas simplifica o que precisa ser
  sincronizado pro mirror local (uma fonte primária clara, em vez de 4 tabelas
  cruzadas).

### O que muda no código (visão geral, não é o plano de implementação linha a linha)

- `useReposicaoFaltas.ts`: query principal passa a ser `csv_grades_profissionais`
  filtrado por paciente + semana. `fila_autorizacoes` é buscado só pra status, casado
  por `data+horario`. Toda a cadeia de enriquecimento (Q2b/Q_PROF/Q_HIST/profLivreMap)
  deixa de ser necessária pra profissional/terapia — só sobra o essencial pra
  `vw_reposicao_faltas` (slots livres, que continua sendo outra fonte, à parte).
- `reposicao.ts` (algoritmo de sugestão): pouca ou nenhuma mudança — `agendaPaciente`
  já é o formato que ele espera, só muda a origem (mais simples, sem merge manual de
  concluídos).
- `VisaoComparativa.tsx`: simplifica — o "tipo" de cada célula passa a ser derivado
  puramente do status casado, sem precisar de múltiplas listas (sessoesAgendadas,
  sessoesConcluidas, resultados) reconciliadas na hora de montar o grid.

---

## Sequenciamento recomendado

1. **Validar em produção que o cron do sync da grade está rodando de fato** (alguns
   dias de observação) — é a pré-condição pra tudo o resto valer a pena.
2. **Fix pontual e independente**: corrigir o empty-state do Problema 2B (rápido, baixo
   risco, já melhora a percepção "sessões que não aparecem" mesmo antes da
   reestruturação maior).
3. **Reestruturação do hook** (`csv_grades_profissionais` como fonte primária) — a
   parte grande, precisa de plano de implementação detalhado próprio (arquivos,
   assinatura de funções, testes) quando chegarmos nela.
4. **Decidir o comportamento pra semanas fora da cobertura da grade** (opção a ou b
   acima) — decisão de produto, não técnica.
5. **Consolidar o script de sync local em um comando único**, documentar o hábito de
   rodar antes de qualquer diagnóstico via SQL local.

## Perguntas abertas (dependem de gente fora do código)

- O cron de `sync-grade-csv-daily` já rodou com sucesso em produção desde o fix de
  hoje? (confirmar com quem tem acesso ao dashboard/logs)
- `controle_terapeutico` é mesmo criado só via confirmação manual do terapeuta em
  `/disponibilidade-terapeuta`? Se sim, vale um lembrete/notificação pros terapeutas
  que ainda não confirmaram.
- Para semanas fora da cobertura da grade, o time prefere o modo degradado (a) ou
  restringir o seletor de semana (b)?
