-- Seed de "Exclusividade de salas com terapias" — dados confirmados pelo
-- usuário em 2026-08-11 (Realengo sem ambiguidade; Fazendinha reconciliada
-- após conflito entre duas listas — ver conversa: Terapia Ocupacional e
-- Fisioterapia → Sala 7 [não a 14], Terapia Alimentar → Sala 5 [não a 8],
-- Fonoaudiologia → Salas 8 E 12 [ambas], Fisioterapia Aquática → Sala 9
-- [não a 10 — bate com a observação "Piscina" já cadastrada nessa sala],
-- Psicomotricidade → Sala 15, Musicoterapia → SEM sala exclusiva na
-- Fazendinha [só existe em Realengo, Sala 17]).
--
-- modo:
--   'obrigatoria'  → a terapia só pode ser agendada nas salas listadas.
--   'preferencial' → a terapia prioriza as salas listadas, mas pode cair em
--                    qualquer sala não-reservada se elas estiverem ocupadas.
--
-- `on conflict do update` torna a migration idempotente/segura de re-rodar.

insert into public.cronograma_salas_terapias_exclusivas (sala_id, terapia_id, terapia_nome, modo)
select cs.id, v.terapia_id, v.terapia_nome, v.modo
from (values
  -- ===== UNIDADE REALENGO =====
  ('Realengo', '5',  2255, 'Terapia Ocupacional',   'obrigatoria'),
  ('Realengo', '5',  2258, 'Fisioterapia',          'obrigatoria'),
  ('Realengo', '21', 2255, 'Terapia Ocupacional',   'obrigatoria'),
  ('Realengo', '21', 2258, 'Fisioterapia',          'obrigatoria'),
  ('Realengo', '13', 2253, 'Psicomotricidade',      'obrigatoria'),
  ('Realengo', '41', 2253, 'Psicomotricidade',      'obrigatoria'),
  ('Realengo', '8',  2274, 'Terapia Alimentar',     'obrigatoria'),
  ('Realengo', '9',  2274, 'Terapia Alimentar',     'obrigatoria'),
  ('Realengo', '17', 2251, 'Musicoterapia',         'preferencial'),
  ('Realengo', '15', 2250, 'Fonoaudiologia',        'preferencial'),
  ('Realengo', '12', 2249, 'Fisioterapia Aquática', 'obrigatoria'),
  -- ===== UNIDADE FAZENDINHA =====
  ('Fazendinha', '7',  2255, 'Terapia Ocupacional',   'obrigatoria'),
  ('Fazendinha', '7',  2258, 'Fisioterapia',          'obrigatoria'),
  ('Fazendinha', '5',  2274, 'Terapia Alimentar',     'obrigatoria'),
  ('Fazendinha', '8',  2250, 'Fonoaudiologia',        'preferencial'),
  ('Fazendinha', '12', 2250, 'Fonoaudiologia',        'preferencial'),
  ('Fazendinha', '9',  2249, 'Fisioterapia Aquática', 'obrigatoria'),
  ('Fazendinha', '15', 2253, 'Psicomotricidade',      'obrigatoria')
) as v(unidade_nome, numero_sala, terapia_id, terapia_nome, modo)
join public.cronograma_salas cs
  on cs.unidade_nome = v.unidade_nome and cs.numero_sala = v.numero_sala
on conflict (sala_id, terapia_id) do update set
  terapia_nome = excluded.terapia_nome,
  modo = excluded.modo;

-- Confere se todas as 18 linhas acharam sala correspondente em cronograma_salas
-- (se numero_sala/unidade_nome não bater exatamente, a linha é silenciosamente
-- descartada pelo JOIN — este bloco avisa em vez de falhar quieto).
DO $$
DECLARE
  qtd int;
BEGIN
  SELECT count(*) INTO qtd FROM public.cronograma_salas_terapias_exclusivas;
  IF qtd < 18 THEN
    RAISE WARNING 'cronograma_salas_terapias_exclusivas: esperado >= 18 linhas, encontrado %. Alguma sala do seed pode não existir em cronograma_salas (unidade_nome/numero_sala não bateu).', qtd;
  END IF;
END $$;
