-- Bug (2026-08-27): Diovanna Mendes Inácio (role 'rp') abre
-- /relacionamento-prestador/ocupacao-salas, edita uma sala, clica em Salvar e
-- recebe "Cannot coerce the result to a single JSON object" no rodapé do modal.
--
-- Não é erro de frontend nem de dado. É PGRST116, e o caminho é este:
--
--   atualizarSala() faz .update(...).eq("id", id).select("*").single()
--   → a policy de UPDATE não a autoriza
--   → RLS não levanta erro: o UPDATE simplesmente casa 0 linhas
--   → .select() devolve lista vazia
--   → .single() exige exatamente 1 objeto e estoura PGRST116
--   → o modal mostra a mensagem crua do PostgREST
--
-- Ou seja: a mensagem que ela viu descreve o formato da resposta, não a causa.
-- É a terceira ocorrência da mesma classe nesta tela (2026-07-31, 2026-08-03) e
-- a segunda vez que a leitura foi liberada sem a escrita acompanhar:
-- 20260818130000 acrescentou 'rp' às policies de SELECT justamente por causa
-- dela — mas as de escrita continuaram em
-- remuneracao_has_role(['admin','diretoria','cronograma','terapeutico']).
--
-- Correção: escrita passa a seguir a MESMA fonte de verdade que decide se a
-- página aparece no menu — usuarios_permissoes.permissao_codigo =
-- 'cronograma_ocupacao_salas' — em vez de uma lista de papéis mantida à mão.
-- Mesmo padrão já aplicado em Ocupação Paciente (20260818210000) e pelo mesmo
-- motivo: não existe tabela ligando papel a grupo de permissão, só o seed
-- roleDefaults no frontend, que pode ter sido editado depois em
-- /admin/permissoes. Enquanto a RLS tentar inferir permissão a partir do papel,
-- este bug volta a cada usuário novo cujo papel não está na lista.
--
-- PRÉ-CHECAGEM (rodada em produção antes de aplicar, 2026-08-27):
--   • 18 usuários têm 'cronograma_ocupacao_salas' com permitido = true;
--   • dos usuários ATIVOS que hoje escrevem por papel (admin, diretoria,
--     cronograma, terapeutico), TODOS têm também o override explícito em
--     usuarios_permissoes — ninguém perde acesso. Isso não era garantido: a
--     função usuario_tem_permissao() não conhece roleDefaults, então quem
--     dependesse só do papel travaria em silêncio;
--   • passam a conseguir salvar: Diovanna Mendes Inácio (rp), Alex Sobrinho
--     (rp) e Samara (disponibilidade_terapeuta) — os três já tinham a tela
--     liberada e já viam tudo, só não conseguiam gravar nada.
--
-- ESCOPO — o que esta migration deliberadamente NÃO toca:
--   • cronograma_nucleos e cronograma_status_labels ("Gerenciar categorias")
--     seguem restritas a admin/diretoria. Isso foi pedido explícito de
--     2026-08-14 (20260818140000), não é sobra de convenção;
--   • cronograma_salas_terapias_exclusivas ("Exclusividade de salas com
--     terapias") segue restrita a admin/diretoria, mesma razão
--     (20260811120000);
--   • as policies de SELECT de cronograma_salas / _alocacoes ficam como estão —
--     leitura já cobre 'rp' desde 20260818130000, e trocá-las agora mexeria em
--     acesso sem necessidade, já que o bug relatado é só de escrita.
--     A ÚNICA exceção é o SELECT da trilha de auditoria, tratado no fim deste
--     arquivo: aquela ficou de fora do 20260818130000 e continua por papel.
--
-- usuario_tem_permissao() já existe (criada em 20260818210000, com bypass
-- incondicional para admin/diretoria e o revoke de anon). Não é recriada aqui.

-- ─── Cadastro estrutural de sala (SalaEditModal — onde o bug apareceu) ────────
DROP POLICY IF EXISTS "cronograma_salas_write" ON public.cronograma_salas;
CREATE POLICY "cronograma_salas_write" ON public.cronograma_salas
  FOR ALL TO authenticated
  USING (public.usuario_tem_permissao('cronograma_ocupacao_salas'))
  WITH CHECK (public.usuario_tem_permissao('cronograma_ocupacao_salas'));

-- ─── Alocações de planejamento (AlocarSessaoModal) ───────────────────────────
-- Mesmo tratamento: é o outro write da tela, tem exatamente o mesmo .single()
-- em criarAlocacao/atualizarAlocacao e portanto o mesmo sintoma. Corrigir só o
-- cadastro de sala deixaria a metade mais usada da tela quebrada do mesmo jeito.
DROP POLICY IF EXISTS "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes;
CREATE POLICY "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes
  FOR ALL TO authenticated
  USING (public.usuario_tem_permissao('cronograma_ocupacao_salas'))
  WITH CHECK (public.usuario_tem_permissao('cronograma_ocupacao_salas'));

-- ─── Trilha de auditoria (cronograma_salas_auditoria) ────────────────────────
-- Sem isto a correção fica pela metade, e o que sobra é pior que o bug original.
-- registrarAuditoriaSala() roda DEPOIS do write e, por desenho, NÃO derruba a
-- ação principal quando falha — só faz console.error (a intenção é boa:
-- auditoria não pode impedir alguém de salvar). O efeito combinado, porém, é
-- que a Diovanna passaria a alterar salas com sucesso e nenhuma dessas
-- alterações entraria na trilha: mudança aplicada, histórico em branco, e nada
-- na tela avisando. A trilha deixaria de ser confiável exatamente para os
-- usuários que esta migration acabou de habilitar.
--
-- Vale também para a leitura: o botão "Histórico" tem que abrir para quem pode
-- alterar. A policy original (20260810161045) já dizia isso em palavras —
-- "quem pode alterar é quem pode ver e gravar a trilha dessa alteração"; só a
-- definição é que ficou atrelada a papel.
--
-- Remoção por catálogo, não por nome: a tabela nasceu como
-- cronograma_ocupacao_trilha_auditoria e foi renomeada em 20260810180000.
-- RENAME TO preserva o nome das policies, então elas ainda se chamam
-- cronograma_trilha_select / cronograma_trilha_insert — e um
-- `drop policy if exists "<nome novo>"` não acharia nada, deixando a policy
-- antiga por papel sobreviver. RLS é OR entre policies: a de papel continuaria
-- valendo e a correção passaria em silêncio.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cronograma_salas_auditoria'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.cronograma_salas_auditoria', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "cronograma_salas_auditoria_select" ON public.cronograma_salas_auditoria
  FOR SELECT TO authenticated
  USING (public.usuario_tem_permissao('cronograma_ocupacao_salas'));

CREATE POLICY "cronograma_salas_auditoria_insert" ON public.cronograma_salas_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (public.usuario_tem_permissao('cronograma_ocupacao_salas'));

-- Segue sem policy de UPDATE/DELETE: trilha é imutável, nem admin edita ou apaga.
