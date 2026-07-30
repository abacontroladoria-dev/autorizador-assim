# Prompt para reativar a busca automática de laudos via API

> Este arquivo existe só como lembrete/rascunho do prompt. Pode ser apagado
> depois de reativar a API — não é lido por nenhum código.

Cole o texto abaixo no chat quando o problema da API `api_laudos`
(https://cronogramauniversoaba.com.br/api_laudos) estiver resolvido:

---

Em 2026-07-17 eu desativei temporariamente a busca automática de laudos via
API (cronogramauniversoaba.com.br/api_laudos) porque a API estava com
problema, e voltei o upload manual do Excel de laudos como fluxo principal.

A mudança foi só em `frontend/app/(dashboard)/cronograma/layout.tsx`, no
useEffect que antes chamava `fetch('/api/laudos?inicio=...&fim=...')`. Eu
comentei o corpo do fetch e no lugar coloquei um `setUploadError(...)` direto,
para forçar o badge "Laudos" a cair no estado de erro e mostrar o botão de
upload manual (ver `frontend/components/cronograma/CronogramaUploadBadges.tsx`,
que já tinha esse fallback pronto).

Nada mais foi alterado: `frontend/app/api/laudos/route.ts` e
`frontend/services/laudos/client.ts` continuam intactos, só não são mais
chamados automaticamente pelo layout.

Agora a API já está funcionando de novo. Por favor:

1. Abra `frontend/app/(dashboard)/cronograma/layout.tsx`.
2. Encontre o useEffect comentado que começa com
   `// DESATIVADO TEMPORARIAMENTE (2026-07-17): a API de laudos do TI`.
3. Remova a linha `setUploadError("Carregamento automático de laudos
   desativado. Selecione o arquivo manualmente.")` e descomente o bloco do
   `fetch('/api/laudos?...')` que está logo abaixo (removendo os `//` de cada
   linha, incluindo `const rw = getRefWeek()`, `setUploading(true)`,
   `setUploadError(null)` e o `.then/.catch/.finally`).
4. Remova também o comentário-bloco explicativo acima do useEffect (o texto
   "DESATIVADO TEMPORARIAMENTE...") e pode restaurar o comentário original:
   "Carrega os laudos automaticamente via API do TI (substitui o upload
   manual do Excel). Se a API falhar, o badge cai no estado de erro e o
   botão de upload manual reaparece como fallback (ver
   CronogramaUploadBadges)."
5. Apague este arquivo `REATIVAR_API_LAUDOS.md`.
6. Não mexa em mais nada — nem em outras abas, nem em
   `services/laudos/client.ts`, nem em `app/api/laudos/route.ts`. É só
   reverter esse trecho específico do layout.tsx para voltar exatamente ao
   comportamento anterior.

Depois de aplicar, rode o app localmente e confirme que a busca automática de
laudos volta a funcionar (o badge "Laudos" deve carregar sozinho, sem precisar
selecionar arquivo manualmente).
