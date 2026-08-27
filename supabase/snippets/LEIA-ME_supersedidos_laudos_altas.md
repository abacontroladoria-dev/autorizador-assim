# Scripts SUPERSEDIDO_MIGRATION_*.sql

Estes três arquivos viviam na **raiz do repositório** e foram executados à mão
pelo SQL Editor do Supabase em 26/08/2026, criando quatro tabelas que nunca
entraram em `supabase/migrations/`:

- `paciente_laudos`
- `paciente_laudo_especialidades`
- `paciente_altas_individualidades`
- `paciente_altas`

Em 26/08/2026 o schema real em produção foi inspecionado coluna a coluna e as
migrations versionadas foram escritas **a partir do banco**, não a partir destes
arquivos — que já estavam desatualizados (o `MIGRATION_LAUDOS_ALTAS.sql` não
conhecia `paciente_laudos.em_uso`, acrescentada depois pelo terceiro script).

O que substitui cada um:

| Script arquivado | Migration versionada |
|---|---|
| `MIGRATION_LAUDOS_ALTAS.sql` | `20260826140000_create_paciente_laudos.sql` |
| `MIGRATION_ALTAS_MULTIPLAS.sql` | `20260826140100_paciente_altas_multiplas.sql` |
| `MIGRATION_LAUDO_EM_USO.sql` | `20260826140200_paciente_laudos_em_uso.sql` |

As tabelas foram renomeadas para `cadastros_pacientes_*` em
`20260826140400`, então os nomes citados nestes arquivos **não existem mais**.
Eles ficam aqui só como registro de como as tabelas nasceram. **Não execute.**
