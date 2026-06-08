-- Verificar dados de teste inseridos

SELECT 'SESSIONS' as section;
SELECT COUNT(*) as total,
       COUNT(DISTINCT session_key) as unique_keys,
       MIN(data_sessao) as earliest_date,
       MAX(data_sessao) as latest_date
FROM cco.atendimentos
WHERE session_key LIKE 'test_%';

SELECT 'Sample Sessions:' as detail;
SELECT session_key, paciente_nome, data_sessao, status_agendamento, orphaned_at
FROM cco.atendimentos
WHERE session_key LIKE 'test_%'
LIMIT 5;

SELECT 'MUTATIONS' as section;
SELECT COUNT(*) as total,
       COUNT(DISTINCT session_key_old) as unique_old_keys,
       COUNT(DISTINCT session_key_new) as unique_new_keys
FROM cco.session_mutations
WHERE session_key_old LIKE 'test_%' OR session_key_new LIKE 'test_%';

SELECT 'AUTHORIZATIONS' as section;
SELECT COUNT(*) as total,
       COUNT(DISTINCT authorization_status) as status_types,
       COUNT(DISTINCT inherited_from) as inherited_count
FROM cco.session_authorizations
WHERE session_key LIKE 'test_%';

SELECT 'Auth Status Breakdown:' as detail;
SELECT authorization_status, COUNT(*) as count
FROM cco.session_authorizations
WHERE session_key LIKE 'test_%'
GROUP BY authorization_status;

SELECT 'SUBSTITUTIONS' as section;
SELECT COUNT(*) as total,
       COUNT(DISTINCT status_ct) as status_types,
       COUNT(profissional_substituto_id) as with_substituto
FROM cco.session_substitutions
WHERE session_key LIKE 'test_%';

SELECT 'OVERALL' as section;
SELECT 'Sessions' as table_name, COUNT(*) as count FROM cco.atendimentos WHERE session_key LIKE 'test_%'
UNION ALL
SELECT 'Mutations', COUNT(*) FROM cco.session_mutations WHERE session_key_old LIKE 'test_%'
UNION ALL
SELECT 'Authorizations', COUNT(*) FROM cco.session_authorizations WHERE session_key LIKE 'test_%'
UNION ALL
SELECT 'Substitutions', COUNT(*) FROM cco.session_substitutions WHERE session_key LIKE 'test_%';
