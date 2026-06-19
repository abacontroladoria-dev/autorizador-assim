# Handoff — Sistema Pulsar · Cronograma / Saída de Profissional

## O que é esta ferramenta

**Sistema Pulsar** é o sistema de gestão da Clínica Universo ABA (Next.js + TypeScript).
O módulo de cronograma gerencia sessões clínicas de pacientes, profissionais, convênios e autorizações de laudo.

A funcionalidade central deste handoff é a aba **"Saída de Profissional"** dentro de **Cronograma → Solicitações**.
Ela analisa o impacto da saída de um profissional e sugere três estratégias de reposição por paciente afetado.

---

## Onde está o código

Projeto ativo:
```
C:\Users\Maquina001\sistema-pulsar\frontend\
```

### Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/cronograma/saida.ts` | `buildSaidaAnalise()` — lógica E1 / E2 / E3 |
| `components/cronograma/solicitacoes/SaidaProfMode.tsx` | UI do modo "Saída de Profissional" + hipótese de novo profissional |
| `components/cronograma/solicitacoes/SaidaCronModal.tsx` | Modal por paciente — exibe estratégias, permite selecionar e registrar |
| `types/cronograma.ts` | Interfaces TypeScript (`AnaliseResult`, `Estrategia`, `SessPacItem`, etc.) |
| `lib/cronograma/runAlgorithm.ts` | Algoritmo de vagas ociosas (Musicoterapia + Ocupação) |

### Referência legada (implementação original em React puro — só para comparação)
```
C:\Users\Maquina001\jsx-cronograma\src\
  utils/runAlgorithm.js        ← versão original do algoritmo
  views/Solicitacoes/index.jsx ← buildSaidaAnalise() original
  constants/cronograma.js      ← constantes (EXCLUIR_OCUP, TERAPIA_TO_ESP, etc.)
  utils/helpers.jsx            ← pm(), fm(), getTurno()
```

---

## As três estratégias (E1 / E2 / E3)

### E1 — Mesma terapia, mesmo horário
Outro profissional assume no mesmo dia e horário.
- Sem mudança na rotina do paciente.
- Não exige validação de gap nem mínimo de sessões.

### E2 — Mesma terapia, outro horário
Move a terapia para outro slot (outro dia ou outra hora no mesmo dia).

**Validações no dia de ORIGEM** (após remoção):
- `!buracoSiRemover`: remoção não cria gap nas sessões restantes do paciente naquele dia.
- `!min2Violation`: restam ≥ 2 sessões clínicas no dia original.

**Validações no dia de DESTINO** (após inserção):
- `temSessaoNoDia(newDia)`: paciente já tem ≥ 1 sessão nesse dia (evita dia isolado).
- `semGapNoDestino(newDia, newHora)`: inserir a sessão não cria gap no destino.
- Ao checar gap no mesmo dia de origem, excluir a sessão removida da referência.

### E3 — Outra terapia, mesmo horário
Preenche o slot vago com outra especialidade que o paciente tem autorização pendente (gap ≥ 1 entre autorizado e ofertado).
- Terapia perdida fica sem reposição direta.
- Qualquer especialidade com laudo ativo pode aparecer aqui (sem exclusões por tipo).

---

## Regras de negócio críticas

### R5.1 — Nunca intervalo entre sessões clínicas
Sessões consecutivas de um paciente devem ter exatamente 40 min de diferença.
Qualquer diferença ≠ 40 min é um gap inválido.

**Slots válidos:**
- Manhã: 08:00 / 08:40 / 09:20 / 10:00 / 10:40 / 11:20
- Tarde: 13:00 / 13:40 / 14:20 / 15:00 / 15:40 / 16:20 / 17:00

Deve-se checar tanto o dia de **origem** quanto o dia de **destino**.

### R2.1 — Mínimo 2 sessões clínicas por dia
Um paciente não pode ter apenas 1 sessão clínica em um único dia.
- Checar no dia de origem (após remoção) e no dia de destino (após inserção).

### Convênios — AE/HS simultâneo com AC
| Convênio | Permite AE/HS simultâneo |
|---|---|
| ASSIM Saúde, Gratuidade, Particular | NÃO |
| SULAMERICA, BRADESCO, PORTO SEGURO, UNIMED, AMIL, LEVE SAÚDE | SIM |

---

## Como trabalhar neste chat

### Objetivo principal — testar a lógica
Quando identificar uma sugestão suspeita, descreva o caso (paciente, dia, horário, estratégia exibida).
O assistente irá:
1. Localizar a seção em `saida.ts` e comparar com o original em `jsx-cronograma`
2. Diagnosticar se é bug de port ou regra mal aplicada
3. Propor e aplicar o fix

### Objetivo secundário — melhorias visuais
Correções estéticas em `SaidaCronModal.tsx` e `SaidaProfMode.tsx` para tornar a ferramenta mais funcional ao usuário são bem-vindas a qualquer momento.

### Fluxo de teste sugerido
1. Abrir o sistema em desenvolvimento
2. Navegar em **Cronograma → Solicitações → Saída de Profissional**
3. Selecionar um profissional com afetados
4. Clicar em um paciente e observar as estratégias sugeridas
5. Descrever qualquer sugestão que pareça errada

---

## Estado atual do código (junho 2025)

- E3 aceita todas as especialidades com laudo, incluindo Terapia Alimentar (sem exclusões por tipo)
- Labels dos cards: `#1 Mesma terapia, mesmo horário` / `#2 Mesma terapia, outro horário` / `#3 Outra terapia, mesmo horário`
- Tooltips genéricos (sem referência a especialidades específicas)
- UI: grade 2×2 (Agenda / Carga semanal / Ocupação por dia / Ocupação por especialidade) com colunas alinhadas verticalmente
