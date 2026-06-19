# Central de Conciliação - Plano de Implementação

## Objetivo

Reestruturar visualmente a página inicial da Central de Conciliação para seguir o novo modelo operacional aprovado.

O foco da implementação é exclusivamente visual e de organização da informação.

---

## Escopo

### Alterar

* Layout da página
* Organização dos componentes
* Hierarquia visual
* Cards
* Tabelas
* Títulos
* Subtítulos
* Componentes de navegação
* Responsividade

---

### Não Alterar

* Banco de dados
* Estrutura das tabelas
* APIs
* RPCs
* Edge Functions
* Jobs
* Cron Jobs
* Serviços externos
* Integrações TiTa
* Regras de negócio já existentes

---

## Estratégia

### Etapa 1

Mapear a implementação atual.

Identificar:

* Componentes existentes
* Hooks utilizados
* Queries utilizadas
* Fontes de dados
* Componentes reutilizáveis

Apresentar relatório antes de qualquer alteração.

---

### Etapa 2

Criar o novo layout utilizando os mesmos dados já disponíveis.

Priorizar reaproveitamento de componentes sempre que possível.

---

### Etapa 3

Substituir componentes antigos pelos novos componentes.

Remover gradualmente:

* Barras de progresso
* Percentuais por paciente
* Elementos redundantes
* Componentes que aumentem carga cognitiva

---

## Estrutura Final da Página

### Linha 1

KPIs

1. Evoluções em Atraso
2. Substituições
3. Sessões em Dia
4. Pacientes Ativos

---

### Linha 2

1. Ação Imediata
2. Acompanhamento
3. Ações Rápidas

---

### Linha 3

Top 10 Terapeutas com Mais Pendências

---

## Ações Rápidas

Exibir exatamente:

* Buscar Paciente
* Buscar Terapeuta
* Substituições
* Relatório

---

## Critérios de Qualidade

A nova interface deve:

* Reduzir carga cognitiva
* Priorizar ação operacional
* Exibir informações relevantes sem necessidade de interpretação adicional
* Manter consistência visual com o restante do sistema
* Funcionar em desktop e tablet

---

## Critérios de Aceitação

A implementação será considerada concluída quando:

* Todos os KPIs estiverem funcionando
* Os cards Ação Imediata e Acompanhamento estiverem funcionando
* O ranking de terapeutas estiver funcionando
* Nenhuma regra de negócio existente tiver sido alterada
* Nenhuma integração tiver sido impactada
* A página estiver visualmente aderente ao mockup aprovado

---

## Importante

Antes de alterar qualquer arquivo:

1. Analisar a implementação atual.
2. Apresentar plano de execução.
3. Informar arquivos que serão modificados.
4. Aguardar aprovação.
5. Somente então iniciar a implementação.
