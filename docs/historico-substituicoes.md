# Histórico de Substituições

## Objetivo

Registrar todas as substituições realizadas no sistema, permitindo:

* auditoria operacional;
* rastreabilidade das alterações;
* cálculo dos indicadores de distribuição automática;
* acompanhamento gerencial;
* conferência de faturamento;
* análise de carga de trabalho dos profissionais.

Este documento trata exclusivamente do armazenamento, consulta e utilização do histórico de substituições.

---

## Dependências

Este documento complementa:

* `central-terapeutas-substituicao.md`
* `recomendacao-automatica-substituicoes.md`

As regras de compatibilidade e recomendação automática são definidas nos documentos próprios.

---

# O que é uma Substituição

Considera-se substituição toda alteração em que uma sessão originalmente atribuída a um profissional passa a ser executada por outro profissional.

A substituição é sempre temporária e vinculada a uma sessão específica.

---

# Momento do Registro

O registro histórico deve ser criado apenas após a confirmação da substituição pelo usuário.

Sugestões automáticas não devem gerar histórico.

Pré-seleções automáticas não devem gerar histórico.

Visualizações do modal não devem gerar histórico.

---

# Dados Obrigatórios

Cada substituição deverá armazenar, no mínimo, os seguintes dados.

## Identificação

* id
* data_criacao
* usuario_responsavel

---

## Sessão

* sessao_id
* paciente_id
* unidade_id
* terapia_real
* data_sessao
* horario_inicio
* horario_fim

---

## Profissionais

* profissional_original_id
* profissional_substituto_id

---

## Competência

* competencia_mes
* competencia_ano

ou

* competencia

Formato sugerido:

```text
2026-06
2026-07
2026-08
```

---

## Motivo

Campo livre para justificativa da substituição.

Exemplos:

* falta do profissional
* férias
* licença médica
* treinamento
* reunião interna
* remanejamento operacional

---

# Persistência Histórica

O histórico não deve ser apagado.

Mesmo que a sessão seja posteriormente alterada ou cancelada, o registro histórico deve permanecer disponível para auditoria.

---

# Cancelamento de Substituição

Quando uma substituição for revertida ou cancelada, o registro histórico não deverá ser removido.

O sistema deverá marcar o registro como cancelado.

Campos sugeridos:

* cancelada
* cancelada_por
* cancelada_em
* motivo_cancelamento

---

# Utilização na Distribuição Automática

O histórico de substituições é utilizado pela recomendação automática para cálculo de prioridade.

Somente substituições válidas e confirmadas devem participar dos cálculos.

Não devem ser consideradas:

* substituições canceladas;
* sugestões automáticas;
* pré-seleções automáticas;
* testes internos.

---

# Competência

Os indicadores de distribuição utilizam a competência da sessão.

Exemplo:

Sessão:

* Data: 15/06/2026

Competência:

* 2026-06

Mesmo que a substituição tenha sido registrada em outro mês, a contagem deverá considerar a competência da sessão.

---

# Indicadores Operacionais

O sistema deverá disponibilizar indicadores baseados no histórico.

---

## Substituições por Profissional

Exibir:

* profissional;
* quantidade de substituições realizadas;
* competência.

Objetivo:

Avaliar distribuição de carga entre a equipe.

---

## Substituições por Unidade

Exibir:

* unidade;
* quantidade de substituições;
* período.

Objetivo:

Identificar unidades com maior necessidade de cobertura.

---

## Substituições por Terapia

Exibir:

* terapia;
* quantidade de substituições.

Objetivo:

Identificar áreas com maior rotatividade operacional.

---

## Substituições por Competência

Exibir:

* competência;
* quantidade total de substituições.

Objetivo:

Analisar evolução mensal.

---

## Profissionais que Mais Substituem

Ranking ordenado por:

* quantidade de substituições realizadas.

Objetivo:

Avaliar concentração operacional.

---

## Profissionais que Menos Substituem

Ranking ordenado por:

* quantidade de substituições realizadas.

Objetivo:

Avaliar equilíbrio da distribuição.

---

# Tela de Histórico

A futura tela de histórico deverá permitir filtros por:

* período;
* competência;
* unidade;
* paciente;
* profissional original;
* profissional substituto;
* terapia;
* usuário responsável.

---

# Informações Exibidas na Tela

Cada registro deverá apresentar, no mínimo:

* data da sessão;
* horário;
* paciente;
* terapia;
* profissional original;
* profissional substituto;
* unidade;
* usuário responsável;
* data da alteração.

---

# Exportação

A tela de histórico deverá permitir exportação dos registros.

Formatos sugeridos:

* Excel (.xlsx)
* CSV

---

# Auditoria

Todo registro deve permitir identificar:

* quem realizou a substituição;
* quando a substituição foi realizada;
* qual era o profissional original;
* qual foi o profissional escolhido como substituto.

Nenhuma alteração deve ocorrer sem rastreabilidade.

---

# Objetivo do Histórico

O histórico de substituições existe para garantir:

* transparência operacional;
* rastreabilidade das decisões;
* suporte ao faturamento;
* suporte à auditoria interna;
* equilíbrio da distribuição entre profissionais;
* geração de indicadores gerenciais.

Todos os módulos relacionados à substituição deverão utilizar este histórico como fonte oficial de informação.
