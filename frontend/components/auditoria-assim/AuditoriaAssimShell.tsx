'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useHeader } from '@/contexts/HeaderContext'
import AuditoriaTab from './tabs/AuditoriaTab'
import PendenciasTab from './tabs/PendenciasTab'

const TABS = ['pendencias', 'auditoria'] as const
type TabKey = (typeof TABS)[number]

const TAB_META: Record<TabKey, { titulo: string; subtitulo: string }> = {
  pendencias: {
    titulo: 'Pendências ASSIM',
    subtitulo: 'Atendimentos que precisam de ação — o sistema detecta e encerra sozinho',
  },
  auditoria: {
    titulo: 'Conferência ASSIM',
    subtitulo: 'Controle operacional de autorizações e pendências',
  },
}

/**
 * Casca de abas do módulo ASSIM.
 *
 * Mesmo padrão de components/cronograma/ocupacao/OcupacaoShell.tsx: o Shell lê o
 * `?tab=` e cada aba é um componente em ./tabs/. A page.tsx só envolve num
 * <Suspense> — obrigatório, porque useSearchParams em componente cliente quebra o
 * build de produção sem boundary (em dev funciona, o que esconde o problema).
 *
 * Aba default = pendencias: é o novo ponto de entrada operacional. A aba auditoria
 * preserva integralmente a tela anterior.
 *
 * Permissões: NÃO há código novo. `auditoria_assim` em lib/permissions/routes.ts é
 * bare path ('/auditoria-assim'), e routeMatches sem '?' compara só o pathname —
 * então já cobre as duas abas para todos os roles que hoje têm acesso (recepcao,
 * autorizacao, admin, diretoria). Trocar para '?tab=auditoria' faria quem abrisse
 * /auditoria-assim puro cair em /sem-permissao.
 */
export default function AuditoriaAssimShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setHeader } = useHeader()

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'pendencias'

  useEffect(() => {
    if (!rawTab) router.replace('/auditoria-assim?tab=pendencias')
  }, [rawTab, router])

  useEffect(() => {
    const meta = TAB_META[activeTab]
    setHeader(meta.titulo, meta.subtitulo)
  }, [activeTab, setHeader])

  return (
    <div className="flex flex-col gap-4">
      {activeTab === 'pendencias' && <PendenciasTab />}
      {activeTab === 'auditoria' && <AuditoriaTab />}
    </div>
  )
}
