'use client'

import React, { createContext, useContext, useId, useMemo, useState, useRef } from 'react'

// ============================================================================
// Tabs
//
// Antes deste arquivo ter implementação, os quatro componentes eram `<div>`
// mudos. O efeito não era só visual: com TabsContent sempre renderizado, as três
// abas de Configurações apareciam empilhadas na mesma tela, e como
// `onValueChange` nunca disparava, o `activeTab` do Settings ficava travado em
// 'agent' — o botão "Salvar Alterações" do cabeçalho só falava com a aba Agente.
// Configuração de API se perdia sem nenhum erro visível.
//
// Contrato mantido igual ao do Radix, porque é o que os consumidores já
// assumem: `data-state="active" | "inactive"` no trigger (CreateDealModal
// estiliza por `data-[state=active]:`), `value` controlado ou `defaultValue`
// não-controlado, e TabsContent que só monta a aba ativa.
// ============================================================================

type TabsCtx = {
  valor:   string
  definir: (v: string) => void
  idBase:  string
}

const Ctx = createContext<TabsCtx | null>(null)

function usarTabs(componente: string): TabsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error(`<${componente}> precisa estar dentro de <Tabs>`)
  return ctx
}

export interface TabsProps {
  children:       React.ReactNode
  className?:     string
  // Controlado: o pai manda o valor. Não-controlado: só defaultValue.
  value?:         string
  defaultValue?:  string
  onValueChange?: (valor: string) => void
}

export function Tabs({ children, className, value, defaultValue, onValueChange }: TabsProps) {
  const [interno, setInterno] = useState(defaultValue ?? '')
  const controlado = value !== undefined
  const valor = controlado ? value : interno
  const idBase = useId()

  const ctx = useMemo<TabsCtx>(() => ({
    valor,
    definir: (v: string) => {
      // Em modo controlado quem decide é o pai — mexer no estado interno aqui
      // criaria duas fontes de verdade divergentes.
      if (!controlado) setInterno(v)
      onValueChange?.(v)
    },
    idBase,
  }), [valor, controlado, onValueChange, idBase])

  return (
    <Ctx.Provider value={ctx}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  )
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // Seta esquerda/direita percorre as abas. A ordem vem do DOM, não de um
  // registro em ref: assim é a ordem que o usuário vê, mesmo que os triggers
  // sejam renderizados condicionalmente ou fora de ordem.
  const navegar = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const abas = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []
    )
    if (abas.length < 2) return

    const atual = abas.findIndex(a => a.dataset.state === 'active')
    if (atual === -1) return

    e.preventDefault()
    const passo = e.key === 'ArrowRight' ? 1 : -1
    const proxima = abas[(atual + passo + abas.length) % abas.length]
    proxima.focus()
    proxima.click()
  }

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={navegar}
      className={className ?? 'inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1'}
    >
      {children}
    </div>
  )
}

export interface TabsTriggerProps {
  value:      string
  children:   React.ReactNode
  className?: string
  disabled?:  boolean
}

export function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  const { valor, definir, idBase } = usarTabs('TabsTrigger')
  const ativo = valor === value

  // O estilo padrão vale para quem não passa className (Settings). Quem passa
  // (CreateDealModal) espera controlar cor pelo data-state — por isso as duas
  // coisas convivem: base neutra + data-state para o consumidor pintar.
  const base = 'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed'
  const padrao = ativo ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'

  return (
    <button
      type="button"
      role="tab"
      id={`${idBase}-tab-${value}`}
      aria-controls={`${idBase}-panel-${value}`}
      aria-selected={ativo}
      // tabIndex -1 nos inativos: o Tab do teclado pula para o conteúdo em vez
      // de percorrer todas as abas, e as setas navegam entre elas.
      tabIndex={ativo ? 0 : -1}
      data-state={ativo ? 'active' : 'inactive'}
      disabled={disabled}
      onClick={() => definir(value)}
      className={className ? `${base} ${padrao} ${className}` : `${base} ${padrao}`}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value, children, className,
}: { value: string; children: React.ReactNode; className?: string }) {
  const { valor, idBase } = usarTabs('TabsContent')

  // Desmonta a aba inativa em vez de esconder com CSS. Aqui isso não é detalhe:
  // as abas de Configurações carregam dados no mount, e manter as três montadas
  // dispararia todas as leituras (e todos os erros) de uma vez.
  if (valor !== value) return null

  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      className={className}
    >
      {children}
    </div>
  )
}
