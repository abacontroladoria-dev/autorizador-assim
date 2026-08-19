-- Popula o "modelo de permissões" inicial de cada grupo com o conjunto
-- efetivo de permissões de um usuário indicado como referência — só nesta
-- etapa inicial. Depois disso o usuário deixa de ter qualquer relação
-- especial com o grupo: modelo e membros evoluem de forma independente.
--
-- "Conjunto efetivo" replica a mesma regra do frontend (ver
-- frontend/lib/permissions/resolver.ts / routes.ts): defaults do role, mais
-- os overrides individuais de usuarios_permissoes (liberação soma, revogação
-- vence sobre o default).

do $$
declare
  role_defaults jsonb := '{
    "admin": ["dashboard","atendimentos","gestao","escala_terapeutica","auditoria_assim","usuarios","permissoes","cco","autorizacoes","preauditoria","outros_convenios","cronograma_solicitacoes","cronograma_saida_profissional","cronograma_ocupacao_paciente","cronograma_disponibilidade_interna","ocupacao_clinica","ocupacao_clinica_gaps","ocupacao_clinica_inconsistencias","ocupacao_profissionais","indicadores_ocupacao_unidades","indicadores_pacientes","indicadores_previsao_receitas","indicadores_historico_receitas","indicadores_comparativo_sessoes","reposicao_faltas","cronograma_ocupacao_salas","cronograma_valores_convenio","cadastros_feriados","cadastros_contratos","cadastros_taxas","analise_tratativas","relacionamento_prestador_analise","relacionamento_prestador_rp","relacionamento_prestador_individual","cadastros_pacientes","cadastros_profissionais","cronograma_por_paciente","cronograma_por_profissional","insumos"],
    "diretoria": ["dashboard","atendimentos","gestao","escala_terapeutica","auditoria_assim","preauditoria","outros_convenios","cronograma_solicitacoes","cronograma_saida_profissional","cronograma_ocupacao_paciente","cronograma_disponibilidade_interna","ocupacao_clinica","ocupacao_clinica_gaps","ocupacao_clinica_inconsistencias","ocupacao_profissionais","indicadores_ocupacao_unidades","indicadores_pacientes","indicadores_previsao_receitas","indicadores_historico_receitas","indicadores_comparativo_sessoes","reposicao_faltas","cronograma_ocupacao_salas","cronograma_valores_convenio","cadastros_feriados","cadastros_contratos","cadastros_taxas","analise_tratativas","relacionamento_prestador_analise","relacionamento_prestador_rp","relacionamento_prestador_individual","cadastros_pacientes","cadastros_profissionais","cronograma_por_paciente","cronograma_por_profissional","insumos"],
    "recepcao": ["dashboard","atendimentos","gestao","auditoria_assim","autorizacoes","outros_convenios"],
    "autorizacao": ["dashboard","auditoria_assim","autorizacoes","preauditoria"],
    "terapeutico": ["dashboard","escala_terapeutica","analise_tratativas"],
    "faturamento": ["dashboard","insumos"],
    "rp": ["dashboard","escala_terapeutica","cadastros_feriados","cadastros_contratos","cadastros_taxas","relacionamento_prestador_analise","relacionamento_prestador_rp","relacionamento_prestador_individual"],
    "cronograma": ["dashboard","cronograma_solicitacoes","cronograma_saida_profissional","cronograma_ocupacao_paciente","cronograma_disponibilidade_interna","ocupacao_clinica","ocupacao_clinica_gaps","ocupacao_clinica_inconsistencias","cadastros_pacientes","cadastros_profissionais","cronograma_por_paciente","cronograma_por_profissional"]
  }'::jsonb;

  -- Usuário de referência por grupo, indicado pelo solicitante — só usado
  -- para montar o modelo inicial, sem vínculo permanente com o grupo.
  modelos jsonb := '{
    "Administrador": "Caio Vinicius",
    "Diretoria": "Ana Carolina",
    "Recepção": "Aline Notes",
    "Autorização": "Pâmela",
    "Terapêutico": "Juliana",
    "Faturamento": "Pâmela",
    "RP": "Alex Sobrinho",
    "Cronograma": "Victoria França"
  }'::jsonb;

  r record;
  v_usuario_id uuid;
  v_role text;
  v_defaults text[];
  v_codigos text[];
  v_modelo jsonb;
begin
  for r in select key as grupo_nome, value #>> '{}' as usuario_nome from jsonb_each(modelos)
  loop
    select id, role into v_usuario_id, v_role
    from public.usuarios
    where nome ilike r.usuario_nome || '%'
    order by created_at
    limit 1;

    if v_usuario_id is null then
      raise notice 'Usuário não encontrado para o grupo % (buscado: %) — modelo não preenchido', r.grupo_nome, r.usuario_nome;
      continue;
    end if;

    select coalesce(array(select jsonb_array_elements_text(role_defaults -> v_role)), array[]::text[])
    into v_defaults;

    select array(
      select unnest(v_defaults)
      union
      select permissao_codigo from public.usuarios_permissoes where usuario_id = v_usuario_id and permitido = true
      except
      select permissao_codigo from public.usuarios_permissoes where usuario_id = v_usuario_id and permitido = false
    ) into v_codigos;

    select coalesce(jsonb_object_agg(c, true), '{}'::jsonb) into v_modelo from unnest(v_codigos) as c;

    update public.grupos_permissoes
    set modelo_permissoes = v_modelo, updated_at = now()
    where nome = r.grupo_nome;

    raise notice 'Grupo % <- % (role %): % módulos no modelo', r.grupo_nome, r.usuario_nome, v_role, coalesce(array_length(v_codigos, 1), 0);
  end loop;
end;
$$;
