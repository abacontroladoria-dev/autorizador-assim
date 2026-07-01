Revisão de Documentação — 21 alterações identificadas
15-database-migrations.md — 10 alterações
#	Seção	Severidade	Alteração
1	§4 Schema	🔴 Crítico	Mudar de public para schema central — o projeto já tem 127 migrations no public e usa schema isolado para o CCO
2	§5–11 Enums	🔴 Crítico	Todos os enums precisam de prefixo: central.provider_type, central.conversation_status etc.
3	Ausente	🔴 Crítico	Migration 000 faltando: tabela central.organizations nunca é criada, mas todo o schema referencia organization_id
4	§12–13	🔴 Crítico	FKs faltando: organization_id sem ref para central.organizations; user_id sem ref para public.usuarios(id)
5	§17	🔴 Crítico	contact_patient_links sem DDL — e o campo deve ser tita_paciente_id BIGINT, não UUID (não existe tabela de pacientes no Pulsar)
6	§5	🟡 Importante	channel_status e notification_priority listados para criar mas sem DDL definido
7	§30–33	🟡 Importante	Todos os índices são simples; em multi-tenant o leading column deve ser organization_id — índices atuais forçam full-scan por org
8	§35	🟡 Importante	Trigger updated_at não referencia a função já existente no projeto — risco de duplicação
9	§36	🟡 Importante	Soft delete em conversation_notes sem índice parcial WHERE deleted_at IS NULL
10	§23	🟡 Importante	messages.sent_by_user_id sem references public.usuarios(id) ON DELETE SET NULL
16-supabase-rls.md — 11 alterações
#	Seção	Severidade	Alteração
11	§7	🔴 Crítico	current_role() é função built-in do PostgreSQL — não pode ser redefinida; renomear para central.ca_current_role()
12	§6–8, §15	🔴 Crítico	Todas as funções helper estão no public — conflito com is_admin() e get_user_unit() existentes; mover para schema central
13	§4	🔴 Crítico	Claim JWT "role" é reservada pelo Supabase (authenticated/anon); usar "central_role". Além disso: o mecanismo de enriquecimento (Auth Hook) não está documentado — sem ele, organization_id sempre retorna NULL
14	§16	🔴 Crítico	user_has_inbox_access() referencia inbox_members sem schema — vai falhar se tabelas estiverem em central
15	§20–38	🔴 Crítico	Todas as policies referenciam tabelas sem prefixo central. e funções sem prefixo central.
16	§6	🟡 Importante	current_organization_id() retorna NULL antes do Auth Hook existir — adicionar fallback COALESCE com lookup em public.usuarios
17	§18 + §38	🟡 Importante	Tabela permissions listada como protegida mas não existe na Central; inbox_members faltando na lista
18	§26 + §28	🟡 Importante	Director pode ser bloqueado por inbox membership na policy atual — substituir por 3 policies separadas (admin/director, supervisor, operator)
19	§34	🟡 Importante	Policy de notifications sem organization_id — viola isolamento multi-tenant
20	§42–43	🟡 Importante	Storage com policy de download mas sem policy de upload — qualquer usuário autenticado pode subir arquivos
21	Ausente	🟡 Importante	Policies de INSERT/UPDATE/DELETE completamente ausentes — sem elas, RLS bloqueia toda escrita de cliente
