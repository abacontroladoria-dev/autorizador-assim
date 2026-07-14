"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { AlertCircle, Loader2, Save } from "lucide-react"
import { useRemuneracaoConfig, refetchRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { updateRemuneracaoConfig } from "@/services/remuneracao.service"
import { B, TERAPIA_CORES } from "@/lib/cronograma/constants"
import { useHeader } from "@/contexts/HeaderContext"
import { useUnsavedChangesGuard } from "@/contexts/UnsavedChangesContext"
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal"

function InfoTooltip({ text }: { text: string }) {
  return (
    <div tabIndex={0} aria-label={text}
         className="group relative inline-flex items-center justify-center cursor-help ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-full">
      <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
        ?
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 z-50">
        <div className="rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white shadow-xl text-center">
          {text}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
      </div>
    </div>
  )
}

function especialidadeCor(esp: string): string {
  const hex = TERAPIA_CORES[esp]
  if (!hex || hex.toLowerCase() === "#ffffff" || hex.toLowerCase() === "#f0f0f0") return B.gray
  return hex
}

import { CapacidadeConfig } from "./config/CapacidadeConfig"
import { ContratosAtuaisConfig } from "./config/ContratosAtuaisConfig"
import { FeriadosConfig } from "./config/FeriadosConfig"

type GeralValor = {
  presenca: number
  ccPA: number
  ccPE: number
  etaBonus: number
  taxas: Record<string, number>
  diarias: Record<string, number>
}

export function ConfigTab() {
  const { config, loading: configLoading, error: configError } = useRemuneracaoConfig()
  const { setHeader } = useHeader()

  const [activeTab, setActiveTab] = useState("geral")
  const [pendingTab, setPendingTab] = useState<string | null>(null)

  const saveGeral = useCallback(async (v: GeralValor) => {
    if (!config) return false
    return updateRemuneracaoConfig(config.id, {
      presenca_padrao: v.presenca,
      cc_pa_default: v.ccPA,
      cc_pe_default: v.ccPE,
      eta_bonus_default: v.etaBonus,
      taxas_pa: v.taxas,
      diarias: v.diarias,
    })
  }, [config])

  const initialGeral = useMemo<GeralValor>(() => ({
    presenca: config?.presenca_padrao ?? 80,
    ccPA: config?.cc_pa_default ?? 0,
    ccPE: config?.cc_pe_default ?? 0,
    etaBonus: config?.eta_bonus_default ?? 0,
    taxas: config?.taxas_pa || {},
    diarias: config?.diarias || {},
  }), [config])

  const [geral, setGeral] = useState<GeralValor>(initialGeral)
  const [savingGeral, setSavingGeral] = useState(false)
  const [savedGeral, setSavedGeral] = useState<GeralValor>(initialGeral)

  // Ressincroniza com "config" assíncrono quando ele chega/muda — padrão
  // recomendado do React para ajustar estado a partir de props sem efeito
  // (evita o cascading-render de setState dentro de useEffect).
  const [prevConfig, setPrevConfig] = useState(config)
  if (config && config !== prevConfig) {
    setPrevConfig(config)
    setGeral(initialGeral)
    setSavedGeral(initialGeral)
  }

  const updateGeral = useCallback((patch: Partial<GeralValor>) => {
    setGeral(prev => ({ ...prev, ...patch }))
  }, [])

  const { presenca, ccPA, ccPE, etaBonus, taxas, diarias } = geral
  const geralDirty = JSON.stringify(geral) !== JSON.stringify(savedGeral)

  const handleSalvarGeral = useCallback(async () => {
    setSavingGeral(true)
    const ok = await saveGeral(geral)
    setSavingGeral(false)
    if (ok) {
      setSavedGeral(geral)
      await refetchRemuneracaoConfig()
      toast.success("Configurações salvas.")
    } else {
      toast.error("Erro ao salvar configurações.")
    }
    return ok
  }, [saveGeral, geral])

  // Só a aba ativa fica montada por vez — "sujo" reflete sempre a aba
  // corrente. Cada tabela (Capacidade/Contratos/Feriados) reporta seu
  // próprio dirty + uma função de salvar via registerSave; a Geral já
  // mora aqui, direto.
  const [otherTabDirty, setOtherTabDirty] = useState(false)
  const otherTabSaveRef = useRef<(() => Promise<boolean>) | null>(null)
  const registerOtherTabSave = useCallback((save: (() => Promise<boolean>) | null) => {
    otherTabSaveRef.current = save
  }, [])

  const isTabDirty = activeTab === "geral" ? geralDirty : otherTabDirty

  const saveActiveTab = useCallback(async () => {
    if (activeTab === "geral") return handleSalvarGeral()
    return otherTabSaveRef.current ? otherTabSaveRef.current() : true
  }, [activeTab, handleSalvarGeral])

  // Registra esta tela no guard global (Sidebar/navegação entre páginas
  // passa por ele — D.4, item pedido pelo usuário: o aviso de "sair sem
  // salvar" precisa valer pra qualquer página do sistema, não só entre
  // as abas internas do Config).
  const { registerGuard } = useUnsavedChangesGuard()
  useEffect(() => {
    registerGuard({ isDirty: isTabDirty, save: saveActiveTab })
    return () => registerGuard(null)
  })

  const [switchingTab, setSwitchingTab] = useState(false)

  function handleTabClick(id: string) {
    if (id === activeTab) return
    if (isTabDirty) { setPendingTab(id); return }
    setActiveTab(id)
  }
  async function handleTabSwitchSaveAndGo() {
    if (!pendingTab) return
    setSwitchingTab(true)
    const ok = await saveActiveTab()
    setSwitchingTab(false)
    if (ok) {
      setActiveTab(pendingTab)
      setOtherTabDirty(false)
      setPendingTab(null)
    }
  }
  function handleTabSwitchDiscardAndGo() {
    if (pendingTab) {
      setActiveTab(pendingTab)
      setOtherTabDirty(false)
      setPendingTab(null)
    }
  }
  function cancelTabSwitch() {
    setPendingTab(null)
  }

  useEffect(() => {
    setHeader("Configurações Globais", "Relacionamento Prestador")
  }, [setHeader])

  if (configLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (configError || !config) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-red-800 dark:text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Erro ao carregar configurações</div>
            <div className="text-sm mt-1">{configError || "Configuração não encontrada"}</div>
            <button
              type="button"
              onClick={() => { void refetchRemuneracaoConfig() }}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white/60 dark:bg-transparent px-3 py-1.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-white transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  const allEspecialidades = Array.from(new Set([
    ...Object.keys(taxas),
    ...Object.keys(diarias)
  ])).sort()

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      
      {/* Cabeçalho da página de config */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Parâmetros de Cálculo
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            As alterações aqui refletem imediatamente em todas as novas análises da calculadora.
          </p>
        </div>
        
        {activeTab === "geral" && (
          <div className="flex items-center gap-3 shrink-0">
            {geralDirty && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                alterações não salvas
              </span>
            )}
            <button
              type="button"
              onClick={handleSalvarGeral}
              disabled={savingGeral || !geralDirty}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: B.blue }}
            >
              {savingGeral ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {/* Navegação de Abas Internas */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: "geral", label: "Variáveis & Taxas" },
          { id: "cadastros", label: "Contratos" },
          { id: "capacidade", label: "Capacidade" },
          { id: "feriados", label: "Feriados" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo: Geral (Taxas e Valores) */}
      {activeTab === "geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
          
          {/* Bloco 1: Globais */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-foreground">Valores Padrão</h3>
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-sm">
              
              <div>
                <label htmlFor="config-presenca" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.navy }}>
                  Taxa de Presença Projetada (%)
                  <InfoTooltip text="Usado na Análise Futura para estimar o ganho real descontando faltas. Padrão 80%." />
                </label>
                <input
                  id="config-presenca"
                  type="number" min="0" max="100"
                  value={presenca}
                  onChange={e => updateGeral({ presenca: Number(e.target.value) })}
                  className="w-full sm:w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
                />
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800" />

              <div>
                <label htmlFor="config-cc-pe" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.purple }}>
                  Coordenador de Caso — PE base
                  <InfoTooltip text="Valor por Paciente Único no mês, para a função de Coordenador." />
                </label>
                <div className="relative w-full sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input
                    id="config-cc-pe"
                    type="number" min="0" step="0.01"
                    value={ccPE}
                    onChange={e => updateGeral({ ccPE: Number(e.target.value) })}
                    className="w-full rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-shadow"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800" />

              <div>
                <label htmlFor="config-eta-bonus" className="flex items-center text-sm font-bold mb-1.5" style={{ color: B.orange }}>
                  Especialista Técnico de Área — Bônus
                  <InfoTooltip text="Valor fixo por semana trabalhada." />
                </label>
                <div className="relative w-full sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input
                    id="config-eta-bonus"
                    type="number" min="0" step="0.01"
                    value={etaBonus}
                    onChange={e => updateGeral({ etaBonus: Number(e.target.value) })}
                    className="w-full rounded-lg border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-shadow"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Bloco 2: Especialidades */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-foreground">Taxas por Especialidade</h3>
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[600px]">
              
              <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="col-span-6">Especialidade</div>
                <div className="col-span-3 text-right">PA (R$)</div>
                <div className="col-span-3 text-right">Diária (R$)</div>
              </div>

              <div className="overflow-y-auto p-2 space-y-1">
                {(() => {
                  const ccHex = especialidadeCor("Coordenador de Caso")
                  return (
                    <div
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border"
                      style={{ background: ccHex + "14", borderColor: ccHex + "55" }}
                    >
                      <div className="col-span-6 flex items-center text-sm font-bold truncate pr-2" style={{ color: ccHex }} title="Coordenador de Caso">
                        Coordenador de Caso
                      </div>
                      <div className="col-span-3">
                        <input
                          id="config-cc-pa"
                          type="number" min="0" step="0.01"
                          value={ccPA}
                          onChange={e => updateGeral({ ccPA: Number(e.target.value) })}
                          className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          style={{ borderColor: ccHex + "55" }}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          id="config-cc-diaria"
                          type="number" min="0" step="0.01"
                          value={diarias["Coordenador de Caso"] || 0}
                          onChange={e => updateGeral({ diarias: { ...diarias, "Coordenador de Caso": Number(e.target.value) } })}
                          className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          style={{ borderColor: ccHex + "55" }}
                        />
                      </div>
                    </div>
                  )
                })()}
                {allEspecialidades.map(esp => {
                  if (esp === "Coordenador de Caso") return null // Tem bloco próprio
                  const hex = especialidadeCor(esp)
                  return (
                    <div
                      key={esp}
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-transparent transition-colors"
                      style={{ background: hex + "0d" }}
                    >
                      <div className="col-span-6 text-sm font-bold truncate pr-2" style={{ color: hex }} title={esp}>
                        {esp}
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min="0" step="0.01"
                          value={taxas[esp] || 0}
                          onChange={e => updateGeral({ taxas: { ...taxas, [esp]: Number(e.target.value) } })}
                          className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          style={{ borderColor: hex + "55" }}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min="0" step="0.01"
                          value={diarias[esp] || 0}
                          onChange={e => updateGeral({ diarias: { ...diarias, [esp]: Number(e.target.value) } })}
                          className="w-full text-right rounded-md border bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          style={{ borderColor: hex + "55" }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              
            </div>
          </div>

        </div>
      )}

      {/* Conteúdo: Contratos (atuais + antigos unificados) */}
      {activeTab === "cadastros" && <ContratosAtuaisConfig onDirtyChange={setOtherTabDirty} registerSave={registerOtherTabSave} />}

      {/* Conteúdo: Capacidade */}
      {activeTab === "capacidade" && <CapacidadeConfig onDirtyChange={setOtherTabDirty} registerSave={registerOtherTabSave} />}

      {/* Conteúdo: Feriados */}
      {activeTab === "feriados" && <FeriadosConfig onDirtyChange={setOtherTabDirty} registerSave={registerOtherTabSave} />}

      <UnsavedChangesModal
        open={pendingTab !== null}
        saving={switchingTab}
        onCancel={cancelTabSwitch}
        onSaveAndLeave={handleTabSwitchSaveAndGo}
        onDiscardAndLeave={handleTabSwitchDiscardAndGo}
      />

    </div>
  )
}
