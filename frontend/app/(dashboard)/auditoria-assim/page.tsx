'use client'

import { Suspense } from 'react'
import AuditoriaAssimShell from '@/components/auditoria-assim/AuditoriaAssimShell'

/**
 * O <Suspense> é obrigatório: o Shell usa useSearchParams para resolver o ?tab=,
 * e um componente cliente que chama useSearchParams sem boundary faz o build de
 * produção falhar ("Missing Suspense boundary with useSearchParams"). Em dev as
 * rotas são renderizadas on-demand e o erro não aparece.
 * Mesmo padrão de app/(dashboard)/cronograma/ocupacao/page.tsx.
 */
export default function AuditoriaAssimPage() {
  return (
    <Suspense fallback={null}>
      <AuditoriaAssimShell />
    </Suspense>
  )
}
