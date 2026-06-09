# Regras Gerais da Cobertura

## Interface

- Nunca utilizar modal dentro de modal.
- Sempre abrir o processo de cobertura com o estado inicial "Sem substituição".
- Mostrar apenas sessões existentes.
- Exibir inicialmente apenas os 3 primeiros candidatos compatíveis.
- Os demais candidatos devem ficar disponíveis através da opção "Ver mais".

## Exibição dos Candidatos

- Todos os candidatos compatíveis devem ser carregados.
- Nenhum candidato compatível deve ser ocultado do sistema.
- A visualização inicial deve apresentar apenas os 3 primeiros candidatos da ordenação.
- Os demais candidatos devem permanecer acessíveis através da expansão da lista.

## Ordenação

A ordenação deverá seguir:

1. Livres
2. Ocupados
3. Não trabalha hoje

## Recomendação

- Priorizar profissionais livres.
- Somente profissionais livres podem receber recomendação automática.
- Profissionais ocupados nunca devem ser recomendados automaticamente.
- Profissionais classificados como "Não trabalha hoje" nunca devem ser recomendados automaticamente.

## Exclusão de Profissionais

Um profissional não deve aparecer na cobertura quando:

- estiver inativo;
- estiver desligado da clínica;
- não possuir compatibilidade terapêutica;
- não possuir permissão para atuar na unidade analisada.