-- Correção: o PRD (Seção 6, entidade "Evidência", e Seção 12.3) é explícito —
-- "nada é anexado nem enviado ao Pulsar". A evidência é só uma REFERÊNCIA
-- (caminho + nome do arquivo no diretório da clínica), nunca um upload real
-- para dentro do sistema. A migration 20260807120000 criou um bucket de
-- Storage com upload de arquivo de verdade, o que contraria o documento.
-- Esta migration desfaz isso: remove o bucket e renomeia as colunas para
-- deixar claro que é referência, não anexo.

DROP POLICY IF EXISTS "pep_evidencias_select" ON storage.objects;
DROP POLICY IF EXISTS "pep_evidencias_write"  ON storage.objects;

-- O bucket em si (storage.buckets) não pode ser apagado por DELETE direto —
-- o Supabase bloqueia isso com um trigger de proteção. Apague o bucket
-- 'pep-evidencias' pelo Dashboard (Storage) ou pela Storage API depois de
-- rodar esta migration; ele está vazio (nenhum objeto foi enviado).

ALTER TABLE pep_registros_entrega RENAME COLUMN anexo_path TO evidencia_caminho;
ALTER TABLE pep_registros_entrega RENAME COLUMN anexo_nome TO evidencia_nome;

COMMENT ON COLUMN pep_registros_entrega.evidencia_caminho IS
  'Referência ao caminho do arquivo no diretório da clínica (SharePoint ou equivalente). Nunca um upload — PRD Seção 6/12.3.';
COMMENT ON COLUMN pep_registros_entrega.evidencia_nome IS
  'Nome do arquivo de evidência, só para exibição/conferência — o arquivo em si não é enviado ao Pulsar.';
