-- Torna impossível, por construção, um id nativo do Pulsar colidir com um id do
-- TiTa. E documenta no painel qual das três colunas de `pacientes` é "o ID".
--
-- O PROBLEMA: public.pacientes tem três colunas que qualquer pessoa lendo o
-- painel confunde com "o ID do paciente":
--   - id_paciente        PK interna, bigint identity, existe em TODA linha;
--   - tita_paciente_id   chave estável de sync com o TiTa, nula em cadastro nativo;
--   - matricula          sequência própria, exibida na tela até agora — errado.
-- As três são numéricas. Trocar uma pela outra não dá erro: dá dado errado, em
-- silêncio, apontando para OUTRO paciente.
--
-- MEDIDO EM 2026-08-26 (374 pacientes: 372 origem 'tita', 2 'pulsar'):
--   id_paciente       vai de 2 a 742
--   tita_paciente_id  vai de 11305 a 21741 (o export do TiTa já chega a 21872)
--   colisões hoje:    ZERO
-- Ou seja: o problema ainda não aconteceu. Mas a identity do Pulsar caminha
-- para 11305 — daqui a ~10.500 pacientes ela entra na faixa do TiTa, e aí um
-- id_paciente nativo passa a ser indistinguível de um id do TiTa.
--
-- POR QUE FAIXA RESERVADA E NÃO TRIGGER: a regra "id_paciente nunca vale um
-- id_paciente_tita" precisa valer nos DOIS sentidos — não basta barrar o
-- INSERT nativo, porque um paciente sincronizado depois com id do TiTa igual a
-- um id_paciente já emitido colide do mesmo jeito. Um trigger bidirecional
-- custaria em toda escrita e falharia em runtime, no pior momento possível.
-- Com as faixas separadas a colisão deixa de ser possível, sem custo nenhum, e
-- de quebra o número de dígitos passa a dizer a origem: 5 dígitos = TiTa,
-- 7 = Pulsar.

-- ===== 1. A identity passa a emitir na faixa reservada =====
-- `alter column ... restart` e não `alter sequence`: id_paciente é
-- GENERATED ... AS IDENTITY (ver 20260812140000 / 20260817190000), e a sequence
-- pertence à coluna. Vale para toda linha nova, inclusive as sincronizadas do
-- TiTa — o que é correto: id_paciente é a PK interna, independente da origem.
alter table public.pacientes
  alter column id_paciente restart with 1000000;

-- ===== 2. A rede de segurança =====
-- Sem NOT VALID de propósito: as 374 linhas existentes têm id_paciente <= 742,
-- então todas já passam e a validação é instantânea. A faixa proibida
-- (11000 … 999999) engloba com folga a faixa observada do TiTa (11305 … 21872).
alter table public.pacientes
  drop constraint if exists pacientes_id_fora_da_faixa_tita;

alter table public.pacientes
  add constraint pacientes_id_fora_da_faixa_tita
  check (id_paciente < 11000 or id_paciente >= 1000000);

comment on constraint pacientes_id_fora_da_faixa_tita on public.pacientes is
  'Reserva a faixa 11000–999999 para ids vindos do TiTa (observados: 11305–21872). Linhas legadas ficam abaixo de 11000; toda linha nova nasce em 1000000+. Se algum dia o TiTa passar de 999999, esta constraint é o lugar que avisa — falha no INSERT, não em silêncio.';

-- ===== 3. Documentação das três colunas no painel =====
comment on column public.pacientes.id_paciente is
  'PK interna do Pulsar (bigint identity). Existe em TODA linha, inclusive nas vindas do TiTa. É o alvo de todas as FKs internas (responsaveis, ficha médica, laudos, altas). Ids >= 1000000 foram emitidos depois de 20260826140500; <= 742 são legado. NÃO é o número que o TiTa conhece.';
comment on column public.pacientes.tita_paciente_id is
  'Id do paciente NO TiTa ("Id Favorecido" nos relatórios de lá). Chave estável de sincronização. NULL em paciente cadastrado nativamente no Pulsar. Faixa observada: 11305–21872 — disjunta de id_paciente por construção, ver constraint pacientes_id_fora_da_faixa_tita.';
comment on column public.pacientes.matricula is
  'Sequência própria do cadastro, gerada por trigger (20260826100100). NÃO é o identificador do paciente e deixou de aparecer na tela em 2026-08-26: a tela exibe tita_paciente_id quando origem_cadastro = ''tita'' e id_paciente quando ''pulsar'' (frontend/types/paciente.ts, idExibicao). Mantida por ora, para remoção quando não houver mais nada dependendo dela.';
comment on column public.pacientes.origem_cadastro is
  'De onde veio a linha: ''tita'' (sincronizada) ou ''pulsar'' (cadastrada na tela). É o que decide QUAL id o cadastro de pacientes exibe.';
