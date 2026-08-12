CRON-008 — Fluxo de Reservas Pendentes
Objetivo

Implementar um fluxo de implantação de sessões que elimine conflitos entre o aceite do coordenador e a atualização diária da API/CSV.

Após uma alteração ser confirmada, a sessão deve ficar imediatamente reservada dentro do sistema, mesmo antes da sincronização da grade oficial.

Regras de negócio
1. Confirmação das alterações

Ao clicar em:

Aceitar alterações

não aplicar imediatamente.

Abrir um modal premium de confirmação.

O modal deve apresentar:

Paciente
Sessões atuais
Sessões após implantação
Quantidade adicionada
Lista das sessões selecionadas
Aviso de que as sessões serão reservadas imediatamente e aguardam sincronização da API

Botões:

Cancelar

Confirmar implantação
2. Após confirmar

Executar nesta ordem:

registrar as sessões confirmadas
criar Reservas Pendentes
atualizar o contexto
limpar seleção
fechar modal
retornar para a tela inicial da Ocupação
3. Reservas Pendentes

Criar um novo estado intermediário:

Sugestão

↓

Reserva Pendente

↓

Implantada (quando existir no CSV)

As Reservas Pendentes representam sessões já aprovadas pelo coordenador, porém ainda não refletidas na grade oficial.

4. Cronograma do paciente

Ao abrir novamente o mesmo paciente:

essas sessões não devem mais aparecer como sugestões.

Devem aparecer diretamente na grade.

Estado visual:

Reservado

Não permitir:

alterar terapia
selecionar novamente
remover da implantação
5. Cor diferenciada

As Reservas Pendentes devem possuir identidade visual própria.

Sugestão:

fundo verde claro
borda verde tracejada
badge
Reservado

ou

Aguardando sincronização

Objetivo:

permitir que qualquer usuário identifique rapidamente que aquela vaga já possui um paciente aguardando implantação.

6. Bloqueio para outros pacientes

O algoritmo não pode considerar apenas o CSV.

Antes de executar:

runAlgorithm(...)

montar:

Grade Final

CSV
+
Reservas Pendentes

Todas as Reservas Pendentes devem ser consideradas ocupadas.

Consequência:

essas vagas deixam de ser sugeridas para qualquer outro paciente.

7. Aba Acompanhamento

Arquivo:

app/(dashboard)/cronograma/ocupacao/tabs/AcompanhamentoTab.tsx

As Reservas Pendentes devem aparecer imediatamente na aba:

Confirmados

Exibir badge:

Reservado

ou

Aguardando sincronização

Sem depender da atualização do CSV.

8. Painel lateral

No resumo das sessões, informar também que existem sessões aguardando sincronização.

Exemplo:

10 → 13

⏳ +3 aguardando sincronização

ou outra apresentação equivalente.

9. Sincronização futura

Quando a atualização diária do CSV passar a conter a sessão reservada:

marcar a reserva como implantada
ou remover da lista de Reservas Pendentes

Preparar a arquitetura para esse comportamento.

Não implementar sincronização automática complexa nesta Sprint.

Arquivos que deverão sofrer alterações
Fluxo principal
app/(dashboard)/cronograma/ocupacao/OcupacaoShell.tsx

Adicionar o novo fluxo de confirmação.

Botão

Localizar o componente responsável por:

Aceitar alterações

Substituir a confirmação direta pelo modal.

Modal

Criar um novo componente premium para confirmação da implantação.

Não alterar o comportamento atual do:

CronModal
Acompanhamento
app/(dashboard)/cronograma/ocupacao/tabs/AcompanhamentoTab.tsx

Exibir imediatamente as Reservas Pendentes.

Algoritmo

Localizar:

runAlgorithm(...)

Executar utilizando:

Grade Oficial
+
Reservas Pendentes
Contexto

Localizar a estrutura que mantém:

conf

Adicionar suporte às Reservas Pendentes.

Diretrizes
Reutilizar ao máximo a arquitetura existente.
Evitar refatorações desnecessárias.
Não alterar componentes fora deste fluxo.
Manter compatibilidade com o comportamento atual.
Implementar a menor quantidade possível de mudanças para atender aos requisitos.
