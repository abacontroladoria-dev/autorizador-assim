'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, ListChecks } from 'lucide-react'

import { useHeader } from '@/contexts/HeaderContext'
import AuditoriaTab from './tabs/AuditoriaTab'
import PendenciasTab from './tabs/PendenciasTab'

const TABS = ['pendencias', 'auditoria'] as const
type TabKey = (typeof TABS)[number]

const TAB_META: Record<TabKey, { label: string; titulo: string; subtitulo: string; icon: typeof ListChecks }> = {
  pendencias: {
    label: 'Pendências',
    titulo: 'Pendências ASSIM',
    subtitulo: 'Atendimentos que precisam de ação — o sistema detecta e encerra sozinho',
    icon: ListChecks,
  },
  auditoria: {
    label: 'Auditoria',
    titulo: 'Auditoria ASSIM',
    subtitulo: 'Controle operacional de autorizações e pendências',
    icon: ClipboardList,
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
      {/* Alternador de abas. As duas visões são do MESMO domínio (ao contrário
          das abas de /cronograma/ocupacao, que navegam só pelo Sidebar), então
          vale um switch em tela para ir de uma à outra sem passar pelo menu. */}
      <nav
        role="tablist"
        aria-label="Visões do módulo ASSIM"
        className="inline-flex w-fit gap-1 rounded-2xl border border-slate-200 bg-white p-1"
      >
        {TABS.map((tab) => {
          const meta = TAB_META[tab]
          const Icon = meta.icon
          const ativo = tab === activeTab
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={ativo}
              type="button"
              onClick={() => router.replace(`/auditoria-assim?tab=${tab}`)}
              className={`
                inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition
                ${ativo
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
                }
              `}
            >
              <Icon size={15} />
              {meta.label}
            </button>
          )
        })}
      </nav>

      {activeTab === 'pendencias' && <PendenciasTab />}
      {activeTab === 'auditoria' && <AuditoriaTab />}
    </div>
  )
}
