-- Permissão da tela Acompanhamento de Laudos (/acompanhamento/laudos).
--
-- CÓDIGO PRÓPRIO, e não uma segunda rota dentro de `cadastros_pacientes`: quem
-- opera esta tela é a RECEPÇÃO, e a recepção não tem `cadastros_pacientes` (ver
-- roleDefaults em frontend/lib/permissions/routes.ts). Reaproveitar aquele
-- código daria a tela a quem mantém o cadastro e a negaria a quem faz a
-- cobrança do laudo vencido — o inverso do necessário.
--
-- Grupo 'Pacientes' porque é onde o item entra no Sidebar (decisão do usuário em
-- 28/08/2026), junto de Atendimentos / Gestão Recepção / Autorizações Avulsas.
--
-- ⚠️ Os grupos de permissão são ADITIVOS e a união dos modelos só é
-- materializada no "Aplicar" de /admin/permissoes. Inserir o código aqui NÃO
-- concede acesso a ninguém: quem entra por papel entra pelos roleDefaults do
-- frontend + o ramo por papel das policies (20260828150000/150100), e quem tem
-- override explícito em usuarios_permissoes precisa receber o código lá.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('acompanhamento_laudos', 'Acompanhamento de Laudos', '/acompanhamento/laudos', 'Pacientes',
   'Fila de laudos vencidos do Órbita e registro de quando a recepção avisou o responsável')
ON CONFLICT (codigo) DO NOTHING;
