# Resumo Técnico — Sistema ASSIM Autorizador

## Stack Principal

| Camada | Tecnologia |
|--------|-----------|
| Framework | **Next.js 16** (App Router, React 19, TypeScript 5) |
| Estilo | **Tailwind CSS 4** + Shadcn UI + Radix UI |
| Backend/DB | **Supabase** (Postgres, Auth, Realtime, Edge Functions) |
| Ícones | Lucide React |
| Calendário | FullCalendar 6 |
| Gráficos | Recharts 3 |
| Exports | pdf-lib, xlsx, jszip, PapaParse |
| Notificações | React Hot Toast |

---

## Estrutura de Pastas

```
frontend-autorizador/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Layout protegido (sidebar + auth check)
│   │   ├── solicitar/      # Solicitar autorização
│   │   ├── central-pacientes/
│   │   ├── central-terapeutas/
│   │   ├── agenda/pacientes|terapeutas|salas
│   │   ├── autorizacoes/
│   │   ├── guias-digitais/
│   │   ├── auditoria-assim/
│   │   └── admin/
│   ├── login/
│   └── auth/callback/
├── components/             # Componentes por feature
├── services/               # Camada de acesso ao Supabase
├── hooks/                  # Custom hooks (useAgenda, useAuditoriaAssim, etc.)
├── lib/supabase/           # Client, server, service e helpers
├── types/                  # TypeScript types
└── contexts/               # HeaderContext (título da página)
```

---

## Autenticação e Papéis

- Login via **e-mail + senha** (`supabase.auth.signInWithPassword`)
- JWT armazenado via `persistSession: true`
- Papéis (`role`) definidos na tabela `usuarios`:

| Papel | Acesso |
|-------|--------|
| `admin` | Tudo |
| `diretoria` | Tudo exceto gerenciar permissões |
| `recepcao` | Solicitar, central-pacientes, agenda, auditoria |
| `autorizacao` | Agenda e auditoria |
| `terapeutico` | Central-terapeutas + agenda |
| `faturamento` | Guias-digitais + agenda |
| `rp` | Somente central-terapeutas |
| `disponibilidade_terapeuta` | Redireciona para rota própria |

---

## Entidades Principais do Banco

### `fila_autorizacoes` — fila de autorizações

| Campo | Descrição |
|-------|-----------|
| `id` | UUID único |
| `status` | `pendente` \| `executando` \| `concluido` \| `erro` \| `cancelado` |
| `status_assim` | `autorizado` \| `pendencia_adm` \| `estornado` |
| `paciente_nome` | Nome completo do paciente |
| `cpf` | CPF do paciente |
| `data_nascimento` | Data de nascimento |
| `data_atendimento` | Data da sessão |
| `horario` | Horário da sessão |
| `terapia_nome` | Tipo de terapia |
| `empresa` | Convênio/seguradora |
| `crm` | CRM do médico |
| `numero_autorizacao` | Número retornado pelo ASSIM |
| `is_manual` | Boolean — manual vs automatizado |
| `usuario_id` | Quem solicitou |
| `machine_id` | Qual máquina processou |
| `atendente_nome` | Nome do atendente |

---

### `controle_terapeutico` — presença e status do terapeuta

| Campo | Descrição |
|-------|-----------|
| `tita_agendamento_id` | FK para o agendamento |
| `status` | Ver valores abaixo |
| `profissional_substituto_id` | ID do substituto |
| `profissional_substituto_nome` | Nome do substituto |
| `confirmado_em` | Timestamp de confirmação |
| `confirmado_por_nome` | Quem confirmou |

**Valores de `status`:**
`presente` | `faltou` | `disponivel` | `indisponivel` | `cobertura_planejada` | `cobertura_confirmada` | `substituido`

---

### `agenda_tita` / `agenda_tita_autorizacao` — agendamentos

| Campo | Descrição |
|-------|-----------|
| `paciente_nome` | Nome do paciente |
| `profissional_nome` | Nome do terapeuta |
| `terapia_nome` | Tipo de terapia |
| `data_atendimento` | Data (YYYY-MM-DD) |
| `hora_inicial` / `hora_final` | Intervalo da sessão |
| `sala_nome` | Sala |
| `unidade` | Unidade/clínica |
| `cpf` | CPF (adicionado em mai/2026) |
| `data_nascimento` | Data de nascimento (adicionado em mai/2026) |

---

### Views principais

| View | Finalidade |
|------|-----------|
| `vw_central_terapeutica` | Agenda com status do terapeuta em tempo real |
| `vw_central_autorizacoes` | Cruzamento entre agenda e ASSIM |
| `vw_match_autorizacoes_assim` | Ponte de matching para o sistema ASSIM |
| `vw_central_pacientes` | Visão consolidada de pacientes (inclui sessões com `ativo=false` autorizadas diretamente) |

---

## Padrão de Acesso ao Supabase

```typescript
// Client singleton — lib/supabase/client.ts
const supabase = getSupabaseClient()

// Select com filtro
const { data } = await supabase
  .from('fila_autorizacoes')
  .select('*')
  .eq('status', 'pendente')
  .order('created_at', { ascending: false })

// Insert
await supabase
  .from('fila_autorizacoes')
  .insert([payload])
  .select()
  .single()

// Update
await supabase
  .from('fila_autorizacoes')
  .update({ status: 'executando' })
  .eq('id', id)

// Realtime subscription
supabase
  .channel('canal-unico')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'controle_terapeutico',
  }, callback)
  .subscribe()
```

### Edge Functions

Chamadas via `fetch` com helper `getFunctionHeaders()` que renova automaticamente o token JWT se estiver prestes a expirar.

```typescript
const response = await fetch(getFunctionUrl('controle-terapeutico-upsert'), {
  method: 'POST',
  headers: await getFunctionHeaders(),
  body: JSON.stringify(payload),
})
```

---

## Sessões Terapêuticas

- **40 minutos** por sessão
- Manhã: **08:00–12:00**
- Tarde: **13:00–17:40**
- Códigos TUSS variam por tipo de terapia (ABA, Fonoaudiologia, Psicologia, etc.)

---

## Arquitetura Geral

- **Services** (`services/*.service.ts`) — encapsulam todas as queries ao Supabase
- **Hooks** (`hooks/*.ts`) — gerenciam estado + chamadas aos services
- **Context** — apenas `HeaderContext` para título dinâmico do header
- **Realtime** — Supabase channels com debounce de 400ms
- **PWA** — Service Worker + `manifest.json` (modo offline para terapeuta)
- Cor primária: `#3A8FB7` (azul-teal)
- Idioma: `pt-BR`

---

## Rotas Disponíveis

| Rota | Descrição | Papéis |
|------|-----------|--------|
| `/solicitar` | Solicitar autorização | admin, diretoria, recepcao |
| `/central-pacientes` | Central de recepção | admin, diretoria, recepcao |
| `/central-terapeutas` | Central operacional | admin, diretoria, terapeutico, rp |
| `/agenda/pacientes` | Agenda por paciente | admin, diretoria, recepcao, autorizacao, faturamento |
| `/agenda/terapeutas` | Agenda por terapeuta | admin, diretoria, autorizacao, terapeutico |
| `/agenda/salas` | Agenda por sala | admin, diretoria, autorizacao, terapeutico, faturamento |
| `/autorizacoes` | Histórico de autorizações | admin, diretoria |
| `/guias-digitais` | Faturamento / exportação | admin, diretoria, faturamento |
| `/auditoria-assim` | Auditoria de conformidade | admin, diretoria, recepcao, autorizacao |
| `/admin` | Painel administrativo | admin |
| `/disponibilidade-terapeuta` | Rota exclusiva do papel `disponibilidade_terapeuta` | disponibilidade_terapeuta |
