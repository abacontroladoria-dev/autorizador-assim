-- Nova permissão "Análise de Tratativas" (escopo Terapêutico): mesma visão da
-- aba Rem. Mês - Total, porém SÓ com contagens de tratativas — todos os valores
-- em R$ ficam ocultos (nunca calculados no cliente). Ver frontend:
-- lib/remuneracao/tratativas.ts e app/(dashboard)/analise-tratativas.
--
-- O controle de acesso já funciona pelos defaults de role (lib/permissions/routes.ts:
-- admin, diretoria, terapeutico). Esta linha existe para que a permissão apareça
-- no painel Admin → Permissões e possa receber overrides por usuário.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('analise_tratativas', 'Análise de Tratativas', '/analise-tratativas', 'Terapêutico',
   'Acompanhamento de tratativas (evoluções) por profissional — sem valores de remuneração')
ON CONFLICT (codigo) DO NOTHING;
