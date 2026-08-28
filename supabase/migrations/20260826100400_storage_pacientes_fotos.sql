-- Foto de perfil do paciente: primeiro bucket VIVO do projeto.
--
-- Houve um precedente em 20260807120000 (pep-evidencias), desfeito em
-- 20260807140000 porque o PRD da PEP proibia upload real. O padrão de DDL abaixo
-- é o daquele arquivo; a decisão de produto é que muda.
--
-- ATENÇÃO AO APLICAR: storage.objects pertence a supabase_storage_admin. Se o
-- SQL Editor recusar com "must be owner of table objects", crie as quatro
-- policies pelo Dashboard (Storage > pacientes-fotos > Policies) usando
-- EXATAMENTE as mesmas expressões. O INSERT em storage.buckets funciona normal.
--
-- CONVENÇÃO DE PATH: {id_paciente}/{arquivo}.{jpg|png|webp}
--   - primeiro segmento é o id do paciente, para a limpeza por paciente ser
--     trivial e para uma policy futura poder restringir por paciente;
--   - o nome do arquivo NUNCA é o nome do paciente: nome de arquivo vaza dado
--     pessoal em log de CDN e em URL;
--   - trocar a foto grava um objeto NOVO e atualiza pacientes.foto_path; o
--     antigo é removido em seguida pelo cliente. Nunca sobrescrever o mesmo
--     path — o cache do navegador serviria a foto velha.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pacientes-fotos',
  'pacientes-fotos',
  false,                      -- PRIVADO: foto de paciente é dado pessoal (LGPD).
  5242880,                    -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pacientes_fotos_select" on storage.objects;
drop policy if exists "pacientes_fotos_insert" on storage.objects;
drop policy if exists "pacientes_fotos_update" on storage.objects;
drop policy if exists "pacientes_fotos_delete" on storage.objects;

create policy "pacientes_fotos_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pacientes-fotos'
    and public.usuario_tem_permissao('cadastros_pacientes')
  );

-- O INSERT valida a convenção de path: primeiro segmento numérico. Impede que
-- um cliente com bug despeje arquivos na raiz do bucket, o que tornaria a
-- limpeza por paciente impossível.
create policy "pacientes_fotos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pacientes-fotos'
    and public.usuario_tem_permissao('cadastros_pacientes')
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
  );

create policy "pacientes_fotos_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pacientes-fotos'
    and public.usuario_tem_permissao('cadastros_pacientes')
  )
  with check (
    bucket_id = 'pacientes-fotos'
    and public.usuario_tem_permissao('cadastros_pacientes')
  );

create policy "pacientes_fotos_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pacientes-fotos'
    and public.usuario_tem_permissao('cadastros_pacientes')
  );
