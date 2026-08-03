'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { useAlertas } from '@/hooks/useAlertas'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import AlertaLinha from './AlertaLinha'

/**
 * Sino global da Central de Alertas.
 *
 * POSICIONAMENTO — por que é `fixed` e não vive dentro do <header>:
 * o header de app/(dashboard)/layout.tsx só é renderizado sob `{title && (…)}`,
 * e 16 das 32 páginas do dashboard nunca chamam setHeader — inclusive /solicitar,
 * que é a tela onde a recepção passa o dia. Colocar o sino ali significaria que o
 * destinatário principal dos alertas nunca o veria. Como âncora fixa, ele cai
 * visualmente na faixa do cabeçalho (h-20) nas páginas que têm header e flutua no
 * topo direito nas que não têm — sem precisar mexer no `{title &&}`, que
 * reposicionaria aquelas 16 páginas.
 */
export default function SinoAlertas() {
  const router = useRouter()
  const { isImpersonating } = useImpersonation()
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sino global: sem filtro de módulo. A RLS decide o que este usuário vê.
  const { alertas, contadores, loading } = useAlertas(null, 'abertos')

  // Fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!aberto) return

    function onClickFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', onClickFora)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickFora)
      document.removeEventListener('keydown', onEsc)
    }
  }, [aberto])

  const total = contadores.total_pendente
  const temCritico = contadores.criticos > 0

  return (
    // A ImpersonationBar é fixed no topo e tem 4rem; sem este deslocamento o sino
    // ficaria por cima dela durante uma impersonação.
    <div
      ref={containerRef}
      className={`fixed right-6 z-40 ${isImpersonating ? 'top-20' : 'top-4'}`}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Alertas${total > 0 ? ` (${total} pendentes)` : ''}`}
        aria-expanded={aberto}
        className={`
          relative flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition
          ${aberto
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-border bg-card text-foreground/70 hover:text-foreground hover:shadow-md'
          }
        `}
      >
        <Bell size={18} />
        {total > 0 && (
          <span
            className={`
              absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center
              rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-card
              ${temCritico ? 'bg-red-600' : 'bg-indigo-600'}
            `}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Alertas</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading
                  ? 'Carregando…'
                  : total === 0
                    ? 'Nada pendente para você'
                    : `${contadores.abertos} aberta(s) · ${contadores.em_andamento} em andamento`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setAberto(false); router.push('/auditoria-assim?tab=pendencias') }}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Ver todos
              <ExternalLink size={11} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading && alertas.length === 0 && (
              <div className="space-y-2 p-1">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 animate-pulse rounded-xl bg-foreground/5" />
                ))}
              </div>
            )}

            {!loading && alertas.length === 0 && (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">Nenhum alerta pendente.</p>
              </div>
            )}

            <div className="space-y-2">
              {alertas.map((a) => (
                <AlertaLinha
                  key={a.id}
                  alerta={a}
                  compacto
                  onClick={() => {
                    setAberto(false)
                    router.push(`/auditoria-assim?tab=pendencias&alerta=${a.id}`)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
